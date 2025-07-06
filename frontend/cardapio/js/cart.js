import { state, socket } from './main.js';
import { dom, renderCart, setupModal, handleQuantityChange, showErrorModal } from './ui.js';

/**
 * Carrega o carrinho do localStorage.
 * @returns {Array} O carrinho de compras.
 */
export function initializeCart() {
    const savedCart = localStorage.getItem('pamonharia-cart');
    return savedCart ? JSON.parse(savedCart) : [];
}

/**
 * Retorna o estado atual do carrinho.
 * @returns {Array}
 */
export function getCart() {
    return state.cart;
}

/**
 * Limpa o carrinho e devolve o estoque.
 */
export function clearCart() {
    const allItemsToRelease = state.cart.flatMap(itemGroup => {
        let items = [];
        const parentProduct = state.allItems.find(p => p.id === itemGroup.original_id);
        if (itemGroup.selected_items && itemGroup.selected_items.length > 0) {
            const multiplier = (itemGroup.is_combo || (parentProduct && parentProduct.force_one_to_one_complement)) ? itemGroup.quantity : 1;
            items = itemGroup.selected_items.map(sub => ({ id: sub.id, quantity: sub.quantity * multiplier }));
        }
        if (parentProduct && (parentProduct.sell_parent_product || (itemGroup.selected_items && itemGroup.selected_items.length === 0))) {
            items.push({ id: itemGroup.original_id, quantity: itemGroup.quantity });
        }
        return items;
    }).filter(i => i && i.id && i.quantity > 0);

    if (allItemsToRelease.length > 0) {
        socket.emit('release_stock', allItemsToRelease);
    }
    state.cart = [];
    renderCart();
}

/**
 * Calcula os totais (subtotal, entrega, total geral) e atualiza a UI.
 */
export function calculateTotals() {
    let subtotal = 0;
    state.cart.forEach(itemGroup => {
        subtotal += (itemGroup.total_value || 0);
    });

    const isDelivery = document.querySelector('input[name="delivery-type"]:checked').value === 'delivery';
    const deliveryFee = isDelivery && subtotal > 0 ? parseFloat(state.storeSettings.delivery_fee || 0) : 0;
    dom.deliveryFeeRow.style.display = isDelivery ? 'flex' : 'none';
    const grandTotal = subtotal + deliveryFee;

    dom.subtotalEl.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
    dom.deliveryFeeEl.textContent = `R$ ${deliveryFee.toFixed(2).replace('.', ',')}`;
    dom.grandTotalEl.textContent = `R$ ${grandTotal.toFixed(2).replace('.', ',')}`;
}

/**
 * Adiciona um item simples (sem opções) ao carrinho.
 * @param {number} itemId - O ID do produto.
 */
export function addToCartSimple(itemId) {
    const item = state.allProductsFlat.find(p => p.id === itemId);
    if (!item || isItemEffectivelyOutOfStock(item)) return;

    const itemsToReserve = [{ id: item.id, quantity: 1 }];
    const itemData = {
        original_id: item.id,
        name: item.name,
        price: parseFloat(item.price),
        total_value: parseFloat(item.price),
        image_url: item.image_url,
        quantity: 1,
        is_combo: false,
        selected_items: []
    };
    addToCartAndReserve(itemData, itemsToReserve);
}

/**
 * Abre o modal para produtos com complementos.
 * @param {number} productId - O ID do produto.
 */
export function openProductWithOptionsModal(productId) {
    const product = state.allItems.find(item => item.id === productId);
    if (!product) return;

    let selectedItemsInModal = {};
    let bodyHtml = '';

    if (product.sell_parent_product) {
        const isParentOutOfStock = isItemEffectivelyOutOfStock(product);
        const initialQty = product.force_one_to_one_complement ? 1 : 0;
        selectedItemsInModal[product.id] = initialQty;
        bodyHtml += `<div class="modal-parent-item"><span>${product.name} (Base)</span><div class="quantity-control"><button data-item-id="${product.id}" ${isParentOutOfStock ? 'disabled' : ''}>-</button><span id="quantity-${product.id}">${initialQty}</span><button data-item-id="${product.id}" ${isParentOutOfStock ? 'disabled' : ''}>+</button></div></div>`;
    }

    if (product.children && product.children.length > 0) {
        bodyHtml += `<h4>${product.sell_parent_product ? 'Adicione complementos:' : 'Escolha os sabores:'}</h4>`;
        product.children.forEach(option => {
            const fullOptionData = state.allProductsFlat.find(p => p.id === option.id);
            const isOptionOutOfStock = isItemEffectivelyOutOfStock(fullOptionData);
            bodyHtml += `<div class="modal-item-option ${isOptionOutOfStock ? 'disabled' : ''}"><label>${option.name} (+ R$ ${parseFloat(option.price).toFixed(2).replace('.', ',')})</label><div class="quantity-control"><button data-item-id="${option.id}" data-is-complement="true" ${isOptionOutOfStock ? 'disabled' : ''}>-</button><span id="quantity-${option.id}">0</span><button data-item-id="${option.id}" data-is-complement="true" ${isOptionOutOfStock ? 'disabled' : ''}>+</button></div></div>`;
        });
    }

    const onSave = () => {
        let selected_items_details = [];
        let itemsToReserve = [];
        let finalPrice = 0;
        let finalQuantity = 1;
        const parentQty = selectedItemsInModal[product.id] || 0;

        if (product.force_one_to_one_complement) {
            finalQuantity = parentQty;
            finalPrice += parseFloat(product.price || 0) * parentQty;
            itemsToReserve.push({ id: product.id, quantity: parentQty });
            
            for (const [id, quantity] of Object.entries(selectedItemsInModal)) {
                if (quantity > 0 && id != product.id) {
                    const selectedItem = state.allProductsFlat.find(i => i.id == id);
                    if (selectedItem) {
                        for (let i = 0; i < quantity; i++) {
                            selected_items_details.push({ id: selectedItem.id, name: selectedItem.name, quantity: 1, price: selectedItem.price });
                            finalPrice += parseFloat(selectedItem.price || 0);
                            itemsToReserve.push({ id: selectedItem.id, quantity: 1 });
                        }
                    }
                }
            }
        } else {
            if (product.sell_parent_product && parentQty > 0) {
                selected_items_details.push({ id: product.id, name: product.name, quantity: parentQty, price: product.price });
                itemsToReserve.push({ id: product.id, quantity: parentQty });
                finalPrice += parseFloat(product.price || 0) * parentQty;
            }

            for (const [id, quantity] of Object.entries(selectedItemsInModal)) {
                if (quantity > 0 && id != product.id) {
                    const selectedItem = state.allProductsFlat.find(i => i.id == id);
                    if (selectedItem) {
                        selected_items_details.push({ id: selectedItem.id, name: selectedItem.name, quantity: quantity, price: selectedItem.price });
                        finalPrice += parseFloat(selectedItem.price || 0) * quantity;
                        itemsToReserve.push({ id: selectedItem.id, quantity: quantity });
                    }
                }
            }
        }

        const itemData = {
            original_id: product.id,
            name: product.name,
            price: finalQuantity > 0 ? (finalPrice / finalQuantity) : 0,
            total_value: finalPrice,
            quantity: finalQuantity,
            is_combo: false,
            selected_items: selected_items_details,
            image_url: product.image_url
        };
        addToCartAndReserve(itemData, itemsToReserve);
    };

    const validator = () => {
        const totalSelected = Object.values(selectedItemsInModal).reduce((sum, qty) => sum + qty, 0);
        let isValid = totalSelected > 0;
        let buttonText = 'Adicionar ao Carrinho';

        if (product.force_one_to_one_complement) {
            const parentQty = selectedItemsInModal[product.id] || 0;
            const totalComplementsQty = Object.entries(selectedItemsInModal).filter(entry => entry[0] != product.id).reduce((sum, entry) => sum + entry[1], 0);
            
            isValid = (parentQty === totalComplementsQty) && parentQty > 0;
            dom.modalFeedback.textContent = !isValid && parentQty > 0 ? `Selecione ${parentQty - totalComplementsQty} complemento(s) restante(s).` : '';
            if (isValid) buttonText = `Adicionar ${parentQty} item(ns)`;
        }
        
        dom.addToCartBtn.textContent = buttonText;
        dom.addToCartBtn.disabled = !isValid;
    };

    setupModal({ title: `Montar ${product.name}`, description: 'Selecione os itens e quantidades desejadas.', body: bodyHtml, onSave, onOpen: validator });
    dom.modalBody.querySelectorAll('.quantity-control button[data-item-id]').forEach(button => {
        button.addEventListener('click', (e) => {
            const optionId = e.target.dataset.itemId;
            const option = state.allProductsFlat.find(i => i.id == optionId);
            if (option) {
                const changeOptions = {
                    isComplement: e.target.dataset.isComplement === 'true',
                    oneToOneRuleActive: product.force_one_to_one_complement,
                    getParentQty: () => selectedItemsInModal[product.id] || 0,
                    getTotalComplementsQty: () => Object.entries(selectedItemsInModal).filter(entry => entry[0] != product.id).reduce((sum, entry) => sum + entry[1], 0)
                };
                handleQuantityChange(e.target, selectedItemsInModal, validator, option, changeOptions);
            }
        });
    });
}

export function openComboModal(comboId) {
    const combo = state.allItems.find(item => item.id === comboId);
    if (!combo) return;
    let selectedQuantities = {}, comboBodyHtml = '';

    // #################### INÍCIO DA CORREÇÃO ####################
    combo.products.forEach(option => {
        const fullOptionData = state.allProductsFlat.find(p => p.id === option.id);
        const isOptionOutOfStock = isItemEffectivelyOutOfStock(fullOptionData);
        // Exibe o modificador de preço se ele for maior que zero.
        const priceModifierText = option.price_modifier > 0 ? `+ R$ ${parseFloat(option.price_modifier).toFixed(2).replace('.', ',')}` : '';
        
        comboBodyHtml += `
            <div class="modal-item-option ${isOptionOutOfStock ? 'disabled' : ''}">
                <label>${option.name} ${isOptionOutOfStock ? '<small>(Esgotado)</small>' : ''}</label>
                <span class="price-modifier">${priceModifierText}</span>
                <div class="quantity-control">
                    <button data-item-id="${option.id}" ${isOptionOutOfStock ? 'disabled' : ''}>-</button>
                    <span id="quantity-${option.id}">0</span>
                    <button data-item-id="${option.id}" ${isOptionOutOfStock ? 'disabled' : ''}>+</button>
                </div>
            </div>`;
    });

    const onSave = () => {
        // Começa com o preço base do combo.
        let finalPrice = parseFloat(combo.price);
        let selected_items = [];
        let itemsToReserve = [];

        for (const [id, quantity] of Object.entries(selectedQuantities)) {
            if (quantity > 0) {
                const product = state.allProductsFlat.find(p => p.id == id);
                const comboProductInfo = combo.products.find(p => p.id == id);
                
                // Adiciona o custo extra (modificador) ao preço final.
                finalPrice += parseFloat(comboProductInfo.price_modifier || 0) * quantity;
                
                // Guarda o item selecionado com seu preço base para exibição no carrinho.
                selected_items.push({ id: product.id, name: product.name, quantity: quantity, price: product.price });
                itemsToReserve.push({ id: product.id, quantity: quantity });
            }
        }
        
        const itemData = { 
            original_id: combo.id, 
            name: combo.name, 
            price: finalPrice, 
            total_value: finalPrice, 
            is_combo: true, 
            quantity: 1, 
            selected_items, 
            image_url: combo.image_url 
        };
        addToCartAndReserve(itemData, itemsToReserve);
    };
    // ##################### FIM DA CORREÇÃO ######################

    const validator = () => {
        const totalSelected = Object.values(selectedQuantities).reduce((sum, qty) => sum + qty, 0);
        const totalLimit = combo.total_items_limit;
        dom.addToCartBtn.disabled = totalSelected !== totalLimit;
        dom.modalFeedback.textContent = '';
        if (totalSelected > totalLimit) {
            dom.modalFeedback.textContent = `Limite de ${totalLimit} itens excedido.`;
            dom.addToCartBtn.disabled = true;
        }
        dom.addToCartBtn.textContent = `Adicionar (${totalSelected}/${totalLimit}) ao Carrinho`;
    };

    setupModal({ title: `Montar ${combo.name}`, description: `Selecione exatamente ${combo.total_items_limit} itens.`, body: comboBodyHtml, onSave, onOpen: validator });
    dom.modalBody.querySelectorAll('.quantity-control button').forEach(button => {
        button.addEventListener('click', (e) => {
            const totalLimit = combo.total_items_limit;
            const currentTotal = Object.values(selectedQuantities).reduce((s, q) => s + q, 0);
            if (e.target.textContent === '+' && currentTotal >= totalLimit) {
                dom.modalFeedback.textContent = `Você já selecionou o limite de ${totalLimit} itens.`;
                setTimeout(() => dom.modalFeedback.textContent = '', 2500);
                return;
            }
            const optionId = e.target.dataset.itemId;
            const option = state.allProductsFlat.find(p => p.id == optionId);
            if (option) handleQuantityChange(e.target, selectedQuantities, validator, option);
        });
    });
}

export function isItemEffectivelyOutOfStock(item) {
    if (!item) return true;
    const stock = getAvailableStock(item);
    if (item.children && item.children.length > 0 && !item.sell_parent_product) {
        return item.children.every(child => isItemEffectivelyOutOfStock(state.allProductsFlat.find(p => p.id === child.id)));
    }
    return stock <= 0;
}

export function isComboEffectivelyOutOfStock(combo) {
    if (!combo || !combo.products) return true;
    const totalAvailableStock = combo.products.reduce((sum, product) => sum + getAvailableStock(state.allProductsFlat.find(p => p.id === product.id)), 0);
    return totalAvailableStock < combo.total_items_limit;
}

export function getAvailableStock(item) {
    if (!item) return 0;
    const parentId = state.productParentMap[item.id];
    if (parentId) {
        const parent = state.allProductsFlat.find(p => p.id === parentId);
        if (parent && parent.stock_sync_enabled && parent.stock_enabled) {
            return state.liveStockState[parent.id] || 0;
        }
    }
    if (item.stock_enabled) {
        return state.liveStockState[item.id] || 0;
    }
    return Infinity;
}

function addToCartAndReserve(itemData, itemsToReserve) {
    dom.addToCartBtn.disabled = true;
    dom.addToCartBtn.textContent = 'Reservando...';
    dom.modalFeedback.textContent = '';

    const successHandler = () => {
        socket.off('reservation_failure', failureHandler);
        state.cart.push({ ...itemData, cart_id: `cart_${Date.now()}` });
        renderCart();
        dom.modal.style.display = 'none';
    };

    const failureHandler = ({ message }) => {
        socket.off('reservation_success', successHandler);
        dom.modalFeedback.textContent = `Erro: ${message}`;
    };
    
    const finallyHandler = () => {
        dom.addToCartBtn.disabled = false;
        dom.addToCartBtn.textContent = 'Adicionar ao Carrinho';
    };
    
    socket.once('reservation_success', () => { successHandler(); finallyHandler(); });
    socket.once('reservation_failure', (data) => { failureHandler(data); finallyHandler(); });

    socket.emit('reserve_stock', itemsToReserve);
}


// --- Funções de Manipulação do Carrinho (para delegação de eventos) ---

export function adjustItemGroupQuantity(cartIndex, amount) {
    const itemGroup = state.cart[cartIndex];
    if (!itemGroup) return;

    const newQuantity = itemGroup.quantity + amount;
    if (newQuantity <= 0) {
        removeItemGroup(cartIndex);
        return;
    }
    
    const parentProduct = state.allItems.find(p => p.id === itemGroup.original_id);
    const isOneToOne = parentProduct && parentProduct.force_one_to_one_complement;

    // Lógica de ajuste para itens "1 para 1"
    if (isOneToOne) {
        if (amount > 0) {
            showErrorModal('Ação Indisponível', 'Para adicionar mais itens com complementos obrigatórios, adicione um novo item a partir do cardápio.');
            return;
        } 
        else if (amount < 0) {
            const itemsToRelease = [{ id: itemGroup.original_id, quantity: 1 }];
            
            if (itemGroup.selected_items.length > 0) {
                const complementToRemove = itemGroup.selected_items.pop();
                itemsToRelease.push({ id: complementToRemove.id, quantity: 1 });
            }

            socket.emit('release_stock', itemsToRelease);

            itemGroup.quantity = newQuantity;
            
            let newTotalValue = parseFloat(parentProduct.price) * newQuantity;
            itemGroup.selected_items.forEach(sub => {
                newTotalValue += parseFloat(sub.price);
            });
            
            itemGroup.total_value = newTotalValue;
            itemGroup.price = newQuantity > 0 ? newTotalValue / newQuantity : 0;
            
            renderCart();
            return;
        }
    }
    
    // Lógica de ajuste para combos e itens normais
    let itemsToUpdate = [];
    if (itemGroup.is_combo) {
        if (itemGroup.selected_items && itemGroup.selected_items.length > 0) {
            itemGroup.selected_items.forEach(sub => {
                itemsToUpdate.push({ id: sub.id, quantity: sub.quantity });
            });
        }
    } else {
         itemsToUpdate.push({ id: itemGroup.original_id, quantity: 1 });
    }

    if (amount > 0) {
        for (const item of itemsToUpdate) {
            const stockCheckItem = state.allProductsFlat.find(p => p.id === item.id);
            if (getAvailableStock(stockCheckItem) < item.quantity) {
                showErrorModal('Estoque Insuficiente', `Não há estoque suficiente para adicionar mais um "${itemGroup.name}".`);
                return;
            }
        }
        socket.emit('reserve_stock', itemsToUpdate);
    } else {
        socket.emit('release_stock', itemsToUpdate);
    }

    itemGroup.quantity = newQuantity;
    itemGroup.total_value = itemGroup.price * newQuantity;
    renderCart();
}

export function adjustCartItemQuantity(cartIndex, subItemIndex, amount) {
    // Esta função é para complementos não-obrigatórios, não precisa de alteração.
    const itemGroup = state.cart[cartIndex];
    if (!itemGroup || !itemGroup.selected_items) return;

    const subItem = itemGroup.selected_items[subItemIndex];
    const stockCheckItem = state.allProductsFlat.find(p => p.id === subItem.id);
    if (!subItem || !stockCheckItem) return;

    const newQuantity = subItem.quantity + amount;

    if (amount > 0) {
        if (getAvailableStock(stockCheckItem) < 1) {
            showErrorModal('Item Esgotado', `Desculpe, ${stockCheckItem.name} está esgotado.`);
            return;
        }
        socket.emit('reserve_stock', [{ id: stockCheckItem.id, quantity: 1 }]);
    } else if (amount < 0 && subItem.quantity > 0) {
        socket.emit('release_stock', [{ id: stockCheckItem.id, quantity: 1 }]);
    }

    if (newQuantity <= 0) {
        itemGroup.selected_items.splice(subItemIndex, 1);
    } else {
        subItem.quantity = newQuantity;
    }

    let newTotalValue = 0;
    const parentProduct = state.allItems.find(p => p.id === itemGroup.original_id);
    if (parentProduct && parentProduct.sell_parent_product) {
        const parentQuantity = itemGroup.selected_items.reduce((sum, si) => sum + si.quantity, 0);
        newTotalValue += parseFloat(parentProduct.price) * parentQuantity;
    }
    itemGroup.selected_items.forEach(si => {
        newTotalValue += parseFloat(si.price) * si.quantity;
    });
    itemGroup.total_value = newTotalValue;

    if (itemGroup.selected_items.length === 0 && !(parentProduct && parentProduct.sell_parent_product)) {
        removeItemGroup(cartIndex);
    } else {
        renderCart();
    }
}

export function removeItemGroup(cartIndex) {
    const itemToRemove = state.cart[cartIndex];
    if (!itemToRemove) return;

    let itemsToRelease = [];
    const parentProduct = state.allItems.find(p => p.id === itemToRemove.original_id);
    
    const isLockedGroup = itemToRemove.is_combo || (parentProduct && parentProduct.force_one_to_one_complement);
    const multiplier = isLockedGroup ? itemToRemove.quantity : 1;

    if (itemToRemove.selected_items && itemToRemove.selected_items.length > 0) {
        itemsToRelease.push(...itemToRemove.selected_items.map(sub => ({ id: sub.id, quantity: sub.quantity * multiplier })));
    }
    
    if (parentProduct && parentProduct.sell_parent_product) {
        itemsToRelease.push({ id: itemToRemove.original_id, quantity: itemToRemove.quantity });
    }

    if (itemsToRelease.length > 0) {
        socket.emit('release_stock', itemsToRelease.filter(i => i.id && i.quantity > 0));
    }

    state.cart.splice(cartIndex, 1);
    renderCart();
}
