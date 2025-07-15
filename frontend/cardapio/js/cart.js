// frontend/cardapio/js/cart.js
import { state, socket } from './main.js';
import { dom, renderCart, setupModal, showErrorModal } from './ui.js';

// Esta função é interna ao módulo do carrinho e não precisa ser exportada.
function handleQuantityChange(target, selectedState, validator, item, options = {}) {
    const itemId = parseInt(target.dataset.itemId);
    const isIncrement = target.textContent === '+';

    if (isIncrement) {
        if (options.isComplement && options.oneToOneRuleActive) {
            const parentQty = options.getParentQty();
            const totalComplements = options.getTotalComplementsQty();
            if (totalComplements >= parentQty) {
                dom.modalFeedback.textContent = `Limite de complementos atingido (${parentQty}).`;
                setTimeout(() => dom.modalFeedback.textContent = '', 3000);
                return;
            }
        }
        const availableStock = getAvailableStock(item);
        if (availableStock !== Infinity && (selectedState[itemId] || 0) >= availableStock) {
            dom.modalFeedback.textContent = `Limite de estoque para "${item.name}" atingido.`;
            setTimeout(() => dom.modalFeedback.textContent = '', 3000);
            return;
        }
        selectedState[itemId] = (selectedState[itemId] || 0) + 1;
    } else {
        selectedState[itemId] = Math.max(0, (selectedState[itemId] || 0) - 1);
    }
    document.getElementById(`quantity-${itemId}`).textContent = selectedState[itemId];
    if (validator) validator();
}

export function initializeCart() {
    console.log('[Cart] 🛒 Inicializando carrinho do localStorage.');
    const savedCart = localStorage.getItem('pamonharia-cart');
    return savedCart ? JSON.parse(savedCart) : [];
}

export function getCart() {
    return state.cart;
}

export function clearCart(releaseStock = true) {
    if (state.cart.length === 0) return;

    if (releaseStock) {
        console.log('[Cart] 🧹 Calculando itens para devolver ao estoque antes de limpar.');
        const itemsToRelease = [];
        state.cart.forEach(itemGroup => {
            const items = getItemsToReleaseFromGroup(itemGroup);
            itemsToRelease.push(...items);
        });

        if (itemsToRelease.length > 0) {
            console.log('[Socket.IO] 📤 Emitindo "release_stock" para o carrinho inteiro:', itemsToRelease);
            socket.emit('release_stock', itemsToRelease);
        }
    } else {
        console.log('[Cart] 🧹 Carrinho finalizado com sucesso. Limpando localmente sem devolver ao estoque.');
    }

    console.log('[Cart] Limpando o estado do carrinho localmente.');
    state.cart = [];
    renderCart();
}


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

export function addToCartSimple(itemId) {
    const item = state.allProductsFlat.find(p => p.id === itemId);
    if (!item || isItemEffectivelyOutOfStock(item)) {
        console.warn(`[Cart] Tentativa de adicionar item esgotado ou inválido: ID ${itemId}`);
        return;
    }
    console.log(`[Cart] Adicionando item simples: ${item.name}`);
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

export function openProductWithOptionsModal(productId) {
    console.log(`[UI] Abrindo modal de opções para o produto ID: ${productId}`);
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
    console.log(`[UI] Abrindo modal de combo para o ID: ${comboId}`);
    const combo = state.allItems.find(item => item.id === comboId);
    if (!combo) return;
    let selectedQuantities = {}, comboBodyHtml = '';

    combo.products.forEach(option => {
        const fullOptionData = state.allProductsFlat.find(p => p.id === option.id);
        const isOptionOutOfStock = isItemEffectivelyOutOfStock(fullOptionData);
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
        let finalPrice = parseFloat(combo.price);
        let selected_items = [];
        let itemsToReserve = [];

        for (const [id, quantity] of Object.entries(selectedQuantities)) {
            if (quantity > 0) {
                const product = state.allProductsFlat.find(p => p.id == id);
                const comboProductInfo = combo.products.find(p => p.id == id);
                
                finalPrice += parseFloat(comboProductInfo.price_modifier || 0) * quantity;
                
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
    
    if (item.status === false) return true;

    const stock = getAvailableStock(item);
    if (item.children && item.children.length > 0 && !item.sell_parent_product) {
        return item.children.every(child => isItemEffectivelyOutOfStock(state.allProductsFlat.find(p => p.id === child.id)));
    }
    return stock <= 0;
}

export function isComboEffectivelyOutOfStock(combo) {
    if (!combo || !combo.products) return true;
    const totalAvailableStock = combo.products.reduce((sum, product) => {
        const fullProduct = state.allProductsFlat.find(p => p.id === product.id);
        return sum + (getAvailableStock(fullProduct) || 0);
    }, 0);
    return totalAvailableStock < combo.total_items_limit;
}

export function getAvailableStock(item) {
    if (!item) return 0;
    const parentId = state.productParentMap[item.id];
    if (parentId) {
        const parent = state.allProductsFlat.find(p => p.id === parentId);
        if (parent && parent.stock_sync_enabled && parent.stock_enabled) {
            return state.liveStockState[parent.id] ?? 0;
        }
    }
    if (item.stock_enabled) {
        return state.liveStockState[item.id] ?? 0;
    }
    return Infinity;
}

// #################### INÍCIO DA CORREÇÃO ####################
// Função refatorada para usar o padrão de acknowledgement (callback)
function addToCartAndReserve(itemData, itemsToReserve) {
    console.log('[Socket.IO] 📤 Emitindo "reserve_stock" com callback para:', itemsToReserve);
    dom.addToCartBtn.disabled = true;
    dom.addToCartBtn.textContent = 'Reservando...';
    dom.modalFeedback.textContent = '';

    // Timeout para evitar que a interface fique presa indefinidamente
    const reservationTimeout = setTimeout(() => {
        dom.addToCartBtn.disabled = false;
        dom.addToCartBtn.textContent = 'Adicionar ao Carrinho';
        dom.modalFeedback.textContent = 'Erro de comunicação. Tente novamente.';
    }, 10000); // 10 segundos

    socket.emit('reserve_stock', itemsToReserve, (response) => {
        clearTimeout(reservationTimeout); // Cancela o timeout pois recebemos uma resposta
        console.log('[Socket.IO] ACK recebido para "reserve_stock":', response);
        
        dom.addToCartBtn.disabled = false;
        dom.addToCartBtn.textContent = 'Adicionar ao Carrinho';

        if (response && response.success) {
            console.log('[Cart] Reserva de estoque bem-sucedida. Adicionando ao carrinho.');
            state.cart.push({ ...itemData, cart_id: `cart_${Date.now()}` });
            renderCart();
            dom.modal.style.display = 'none';
        } else {
            const errorMessage = response?.message || 'Estoque insuficiente.';
            console.error(`[Cart] Falha na reserva de estoque: ${errorMessage}`);
            dom.modalFeedback.textContent = `Erro: ${errorMessage}`;
        }
    });
}
// ##################### FIM DA CORREÇÃO #####################


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

function getItemsToReleaseFromGroup(itemGroup) {
    const items = [];
    const parentProduct = state.allItems.find(p => p.id === itemGroup.original_id);
    const isLockedGroup = itemGroup.is_combo || (parentProduct && parentProduct.force_one_to_one_complement);
    const multiplier = isLockedGroup ? itemGroup.quantity : 1;

    if (itemGroup.selected_items && itemGroup.selected_items.length > 0) {
        itemGroup.selected_items.forEach(sub => {
            items.push({ id: sub.id, quantity: sub.quantity * multiplier });
        });
    }

    // Se o produto pai for vendido separadamente, adiciona a sua própria quantidade
    if (parentProduct && parentProduct.sell_parent_product) {
        items.push({ id: itemGroup.original_id, quantity: itemGroup.quantity });
    } 
    // Se não for um combo e não tiver complementos (item simples), adiciona a sua quantidade
    else if (!itemGroup.is_combo && (!itemGroup.selected_items || itemGroup.selected_items.length === 0)) {
        items.push({ id: itemGroup.original_id, quantity: itemGroup.quantity });
    }
    
    return items.filter(i => i.id && i.quantity > 0);
}


export function removeItemGroup(cartIndex) {
    const itemToRemove = state.cart[cartIndex];
    if (!itemToRemove) return;

    const itemsToRelease = getItemsToReleaseFromGroup(itemToRemove);

    if (itemsToRelease.length > 0) {
        console.log('[Socket.IO] 📤 Emitindo "release_stock" para o grupo removido:', itemsToRelease);
        socket.emit('release_stock', itemsToRelease);
    }

    state.cart.splice(cartIndex, 1);
    renderCart();
}