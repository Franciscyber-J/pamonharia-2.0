// frontend/cardapio/js/cart.js
import { state, socket } from './main.js';
import { dom, renderCart, setupModal, showErrorModal } from './ui.js';

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
        original_id: item.id, name: item.name, price: parseFloat(item.price),
        total_value: parseFloat(item.price), image_url: item.image_url,
        quantity: 1, is_combo: false, selected_items: []
    };
    addToCartAndReserve(itemData, itemsToReserve);
}

export function openProductWithOptionsModal(productId) {
    console.log(`[UI] Abrindo modal de opções para o produto ID: ${productId}`);
    const product = state.allItems.find(item => item.id === productId && !item.is_combo);
    if (!product) return;

    let selectedItemsInModal = {};
    let bodyHtml = '';

    // Inicializa o estado do modal para todos os itens relevantes
    selectedItemsInModal[product.id] = product.sell_parent_product ? 1 : 0;
    if (product.children && product.children.length > 0) {
        product.children.forEach(child => {
            selectedItemsInModal[child.id] = 0;
        });
    }

    // Renderiza o produto pai se ele for vendável
    if (product.sell_parent_product) {
        const isParentOutOfStock = isItemEffectivelyOutOfStock(product);
        const initialQty = selectedItemsInModal[product.id] || 0;
        bodyHtml += `<div class="modal-parent-item"><span>${product.name} (Base)</span><div class="quantity-control"><button data-item-id="${product.id}" ${isParentOutOfStock ? 'disabled' : ''}>-</button><span id="quantity-${product.id}">${initialQty}</span><button data-item-id="${product.id}" ${isParentOutOfStock ? 'disabled' : ''}>+</button></div></div>`;
    }

    // Renderiza os complementos
    if (product.children && product.children.length > 0) {
        bodyHtml += `<h4>${product.sell_parent_product ? 'Adicione complementos:' : 'Escolha os sabores:'}</h4>`;
        product.children.forEach(option => {
            const fullOptionData = state.allProductsFlat.find(p => p.id === option.id);
            const isOptionOutOfStock = isItemEffectivelyOutOfStock(fullOptionData);
            bodyHtml += `<div class="modal-item-option ${isOptionOutOfStock ? 'disabled' : ''}"><label>${option.name} (+ R$ ${parseFloat(option.price).toFixed(2).replace('.', ',')})</label><div class="quantity-control"><button data-item-id="${option.id}" data-is-complement="true" ${isOptionOutOfStock ? 'disabled' : ''}>-</button><span id="quantity-${option.id}">0</span><button data-item-id="${option.id}" data-is-complement="true" ${isOptionOutOfStock ? 'disabled' : ''}>+</button></div></div>`;
        });
    }
    
    // #################### INÍCIO DA CORREÇÃO ####################
    const onSave = () => {
        let selected_items_details = [];
        let itemsToReserve = [];
        let finalPrice = 0;
        let finalQuantity = 1;
        
        // Itera sobre TODOS os itens possíveis no modal (pai e filhos)
        for (const itemIdStr in selectedItemsInModal) {
            const itemId = parseInt(itemIdStr, 10);
            const quantity = selectedItemsInModal[itemId];

            if (quantity > 0) {
                const fullProductDetails = state.allProductsFlat.find(p => p.id === itemId);
                if (!fullProductDetails) continue;

                // Se o item tem seu próprio stock, adiciona à lista de reserva.
                if (fullProductDetails.stock_enabled) {
                    itemsToReserve.push({ id: itemId, quantity: quantity });
                }

                // Adiciona ao preço total e aos detalhes do item do carrinho
                finalPrice += parseFloat(fullProductDetails.price || 0) * quantity;
                if (itemId !== product.id) { // Se não for o pai, é um complemento
                    selected_items_details.push({ ...fullProductDetails, quantity });
                }
            }
        }

        // Determina a quantidade do item principal no carrinho
        const parentQty = selectedItemsInModal[product.id] || 0;
        const totalComplementQty = selected_items_details.reduce((sum, item) => sum + item.quantity, 0);

        if (product.sell_parent_product) {
            finalQuantity = parentQty;
        } else {
            finalQuantity = totalComplementQty > 0 ? 1 : 0; // Se o pai não vende, adicionamos 1 "grupo" ao carrinho
        }
        
        if (finalQuantity === 0 && selected_items_details.length === 0) {
            dom.modalFeedback.textContent = 'Nenhum item selecionado.';
            setTimeout(() => dom.modalFeedback.textContent = '', 3000);
            return;
        }

        const itemData = {
            original_id: product.id, name: product.name,
            price: finalQuantity > 0 ? (finalPrice / finalQuantity) : 0,
            total_value: finalPrice, quantity: finalQuantity,
            is_combo: false, selected_items: selected_items_details,
            image_url: product.image_url
        };
        
        addToCartAndReserve(itemData, itemsToReserve);
    };

    const validator = () => {
        const totalSelected = Object.values(selectedItemsInModal).reduce((sum, qty) => sum + qty, 0);
        let isValid = totalSelected > 0;
        let buttonText = 'Adicionar ao Carrinho';
        dom.modalFeedback.textContent = '';

        if (product.force_one_to_one_complement) {
            const parentQty = selectedItemsInModal[product.id] || 0;
            let totalComplementsQty = 0;
            if (product.children) {
                product.children.forEach(child => {
                    totalComplementsQty += (selectedItemsInModal[child.id] || 0);
                });
            }
            
            isValid = (parentQty > 0) && (parentQty === totalComplementsQty);
            if (!isValid && parentQty > 0) {
                dom.modalFeedback.textContent = `Selecione ${parentQty - totalComplementsQty} complemento(s) restante(s).`;
            }
            if (isValid) {
                buttonText = `Adicionar ${parentQty} item(ns)`;
            }
        }
        
        dom.addToCartBtn.textContent = buttonText;
        dom.addToCartBtn.disabled = !isValid;
    };
    // ##################### FIM DA CORREÇÃO ######################

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
                    getTotalComplementsQty: () => {
                        let total = 0;
                        if (product.children) {
                            product.children.forEach(child => total += (selectedItemsInModal[child.id] || 0));
                        }
                        return total;
                    }
                };
                handleQuantityChange(e.target, selectedItemsInModal, validator, option, changeOptions);
            }
        });
    });
}

export function openComboModal(comboId) {
    console.log(`[UI] Abrindo modal de combo para o ID: ${comboId}`);
    const combo = state.allItems.find(item => item.id === comboId && item.is_combo);
    if (!combo) return;

    let selectedQuantities = {};
    let comboBodyHtml = '';

    combo.products.forEach(option => {
        const fullOptionData = state.allProductsFlat.find(p => p.id === option.id);
        const isOptionOutOfStock = isItemEffectivelyOutOfStock(fullOptionData);
        const priceModifierText = option.price_modifier > 0 ? `+ R$ ${parseFloat(option.price_modifier).toFixed(2).replace('.', ',')}` : '';
        
        comboBodyHtml += `<div class="modal-item-option ${isOptionOutOfStock ? 'disabled' : ''}"><label>${option.name} ${isOptionOutOfStock ? '<small>(Esgotado)</small>' : ''}</label><span class="price-modifier">${priceModifierText}</span><div class="quantity-control"><button data-item-id="${option.id}" ${isOptionOutOfStock ? 'disabled' : ''}>-</button><span id="quantity-${option.id}">0</span><button data-item-id="${option.id}" ${isOptionOutOfStock ? 'disabled' : ''}>+</button></div></div>`;
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
                selected_items.push({ ...product, quantity });
                if (product.stock_enabled) {
                    itemsToReserve.push({ id: product.id, quantity: quantity });
                }
            }
        }
        
        const itemData = { 
            original_id: combo.id, name: combo.name, price: finalPrice, 
            total_value: finalPrice, is_combo: true, quantity: 1, 
            selected_items, image_url: combo.image_url 
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
    if (!item.status) return true;

    const stock = getAvailableStock(item);
    if (item.children && item.children.length > 0 && !item.sell_parent_product) {
        return item.children.every(child => {
            const fullChild = state.allProductsFlat.find(p => p.id === child.id);
            return isItemEffectivelyOutOfStock(fullChild);
        });
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
    if (!item || !item.stock_enabled) return Infinity; 

    const parentId = state.productParentMap[item.id];
    if (parentId) {
        const parent = state.allProductsFlat.find(p => p.id === parentId);
        if (parent && parent.stock_sync_enabled && parent.stock_enabled) {
            return state.liveStockState[parent.id] ?? 0;
        }
    }
    return state.liveStockState[item.id] ?? 0;
}

function addToCartAndReserve(itemData, itemsToReserve) {
    console.log('[Socket.IO] 📤 Emitindo "reserve_stock" com callback para:', itemsToReserve);
    dom.addToCartBtn.disabled = true;
    dom.addToCartBtn.textContent = 'Reservando...';
    dom.modalFeedback.textContent = '';

    const reservationTimeout = setTimeout(() => {
        dom.addToCartBtn.disabled = false;
        dom.addToCartBtn.textContent = 'Adicionar ao Carrinho';
        dom.modalFeedback.textContent = 'Erro de comunicação. Tente novamente.';
    }, 10000);

    socket.emit('reserve_stock', itemsToReserve, (response) => {
        clearTimeout(reservationTimeout);
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


export function adjustItemGroupQuantity(cartIndex, amount) {
    const itemGroup = state.cart[cartIndex];
    if (!itemGroup) return;

    const newQuantity = itemGroup.quantity + amount;
    if (newQuantity <= 0) {
        removeItemGroup(cartIndex);
        return;
    }
    
    const singleItemGroup = { ...itemGroup, quantity: 1, total_value: itemGroup.price };
    const itemsToUpdate = getItemsToReleaseFromGroup(singleItemGroup);

    if (amount > 0) {
        socket.emit('reserve_stock', itemsToUpdate, (response) => {
            if (response && response.success) {
                itemGroup.quantity = newQuantity;
                itemGroup.total_value = itemGroup.price * newQuantity;
                renderCart();
            } else {
                showErrorModal('Estoque Insuficiente', `Não foi possível adicionar mais um "${itemGroup.name}".`);
            }
        });
    } else {
        socket.emit('release_stock', itemsToUpdate);
        itemGroup.quantity = newQuantity;
        itemGroup.total_value = itemGroup.price * newQuantity;
        renderCart();
    }
}

export function adjustCartItemQuantity(cartIndex, subItemIndex, amount) {
    // Esta função pode ser simplificada ou removida se a edição direta de complementos for desativada no carrinho.
}

// #################### INÍCIO DA CORREÇÃO ####################
// ARQUITETO: Função `getItemsToReleaseFromGroup` refatorada para ser o espelho exato da nova lógica de reserva.
function getItemsToReleaseFromGroup(itemGroup) {
    const itemsToRelease = [];
    
    // Devolve o stock para o item pai se ele era a autoridade
    const parentProduct = state.allProductsFlat.find(p => p.id === itemGroup.original_id);
    if (parentProduct && parentProduct.stock_enabled && parentProduct.sell_parent_product) {
        itemsToRelease.push({ id: parentProduct.id, quantity: itemGroup.quantity });
    }

    // Devolve o stock para cada complemento que tenha seu próprio controlo
    if (itemGroup.selected_items && itemGroup.selected_items.length > 0) {
        itemGroup.selected_items.forEach(subItem => {
            if (subItem.stock_enabled) {
                // Multiplica a quantidade do sub-item pela quantidade do grupo no carrinho
                itemsToRelease.push({ id: subItem.id, quantity: subItem.quantity * itemGroup.quantity });
            }
        });
    }
    
    return itemsToRelease;
}
// ##################### FIM DA CORREÇÃO ######################

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