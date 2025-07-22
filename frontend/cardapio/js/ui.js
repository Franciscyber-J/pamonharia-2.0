// frontend/cardapio/js/ui.js
import { state } from './main.js';
import { openProductWithOptionsModal, openComboModal, addToCartSimple, clearCart, adjustItemGroupQuantity, removeItemGroup, calculateTotals, isComboEffectivelyOutOfStock, isItemEffectivelyOutOfStock } from './cart.js';
import { handleOnlinePaymentSelection, handleBackToCart, handleBackToPaymentSelection } from './payment.js';

export const dom = {
    productsGrid: document.getElementById('products-grid'),
    combosGrid: document.getElementById('combos-grid'),
    cartItemsContainer: document.getElementById('cart-items'),
    subtotalEl: document.getElementById('subtotal'),
    deliveryFeeEl: document.getElementById('delivery-fee'),
    grandTotalEl: document.getElementById('grand-total'),
    orderForm: document.getElementById('order-form'),
    submitOrderBtn: document.getElementById('submit-order-btn'),
    cartWrapper: document.getElementById('cart-wrapper'),
    successMessage: document.getElementById('order-success-message'),
    paymentStatusMessage: document.getElementById('payment-status-message'),
    paymentStatusText: document.getElementById('payment-status-text'),
    storeStatusBanner: document.getElementById('store-status-banner'),
    modal: document.getElementById('selection-modal'),
    modalHeader: document.getElementById('modal-header'),
    modalBody: document.getElementById('modal-body'),
    modalFeedback: document.getElementById('modal-feedback'),
    addToCartBtn: document.getElementById('add-to-cart-btn'),
    clearCartBtn: document.getElementById('clear-cart-btn'),
    addressGroup: document.getElementById('address-group'),
    clientAddressInput: document.getElementById('client-address'),
    deliveryFeeRow: document.getElementById('delivery-fee-row'),
    storeNameHeader: document.getElementById('store-name-header'),
    themeSwitcher: document.getElementById('theme-switcher'),
    errorModal: document.getElementById('error-modal'),
    errorModalTitle: document.getElementById('error-modal-title'),
    errorModalMessage: document.getElementById('error-modal-message'),
    newOrderBtn: document.getElementById('new-order-btn'),
    onlinePaymentMethodSelection: document.getElementById('online-payment-method-selection'),
    selectCardBtn: document.getElementById('select-card-btn'),
    selectPixBtn: document.getElementById('select-pix-btn'),
    customPaymentContainer: document.getElementById('custom-payment-container'),
    cardPaymentForm: document.getElementById('card-payment-form'),
    cardPaymentFeedback: document.getElementById('card-payment-feedback'),
    pixPaymentContainer: document.getElementById('pix-payment-container'),
    pixQrCode: document.getElementById('pix-qr-code'),
    pixCopyPaste: document.getElementById('pix-copy-paste'),
    pixCopyBtn: document.getElementById('pix-copy-btn'),
    paymentProcessingOverlay: document.getElementById('payment-processing-overlay'),
    footer: document.getElementById('store-footer'),
    footerAddress: document.getElementById('footer-address'),
    footerHours: document.getElementById('footer-hours'),
    footerLocationLink: document.getElementById('footer-location-link'),
    backToCartBtn: document.getElementById('back-to-cart-btn'),
    backToPaymentSelectionBtn: document.getElementById('back-to-payment-selection-btn'),
    backToPaymentSelectionFromPixBtn: document.getElementById('back-to-payment-selection-from-pix-btn'),
    floatingCartBtn: document.getElementById('floating-cart-btn'),
    floatingCartInfo: document.getElementById('floating-cart-info'),
    floatingCartTotal: document.getElementById('floating-cart-total'),
    confirmModal: document.getElementById('confirm-modal'),
    confirmModalMessage: document.getElementById('confirm-modal-message'),
    confirmModalCancel: document.getElementById('confirm-modal-cancel'),
    confirmModalConfirm: document.getElementById('confirm-modal-confirm'),
};

export function renderItems() {
    dom.productsGrid.innerHTML = '';
    dom.combosGrid.innerHTML = '';
    const activeProducts = state.allItems.filter(item => !item.is_combo && item.is_main_product);
    const activeCombos = state.allItems.filter(item => item.is_combo);

    document.getElementById('products-section').style.display = activeProducts.length > 0 ? 'block' : 'none';
    document.getElementById('combos-section').style.display = activeCombos.length > 0 ? 'block' : 'none';
    document.getElementById('section-divider').style.display = activeProducts.length > 0 && activeCombos.length > 0 ? 'block' : 'none';

    state.allItems.forEach(item => {
        if (!item.status) return;
        const grid = item.is_combo ? dom.combosGrid : dom.productsGrid;
        if (!grid || (!item.is_main_product && !item.is_combo)) return;

        let priceText;
        if (item.is_combo) {
            priceText = `A partir de R$ ${parseFloat(item.price).toFixed(2).replace('.', ',')}`;
        } else if (item.children && item.children.length > 0 && !item.sell_parent_product) {
            const availableChildren = item.children.filter(c => !isItemEffectivelyOutOfStock(state.allProductsFlat.find(p => p.id === c.id)));
            if (availableChildren.length > 0) {
                const minPrice = Math.min(...availableChildren.map(c => c.price));
                priceText = `A partir de R$ ${parseFloat(minPrice).toFixed(2).replace('.', ',')}`;
            } else {
                priceText = 'Opções esgotadas';
            }
        } else {
            priceText = `R$ ${parseFloat(item.price).toFixed(2).replace('.', ',')}`;
        }

        const hasOptions = (item.children && item.children.length > 0) || (item.is_combo);
        const isOutOfStock = item.is_combo ? isComboEffectivelyOutOfStock(item) : isItemEffectivelyOutOfStock(item);
        
        const action = item.is_combo ? 'open-combo-modal' : (hasOptions ? 'open-options-modal' : 'add-to-cart-simple');

        grid.innerHTML += `<div class="item-card ${isOutOfStock ? 'out-of-stock' : ''}" data-id="${item.id}"><div class="stock-overlay">${isOutOfStock ? 'Esgotado' : ''}</div><img src="${item.image_url || 'https://placehold.co/400x250/f59e0b/FFF?text=Pamonha'}" alt="${item.name}" class="item-image"><div class="item-info"><h3>${item.name}</h3><p class="description">${item.description || ''}</p><div class="item-price">${priceText}</div><button class="action-button" data-action="${action}" data-id="${item.id}" ${!state.storeSettings.is_open || isOutOfStock ? 'disabled' : ''}>${hasOptions ? 'Montar' : 'Adicionar'}</button></div></div>`;
    });
}

function updateFloatingCartButton() {
    if (state.cart.length > 0) {
        let totalItems = 0;
        state.cart.forEach(group => totalItems += group.quantity);
        dom.floatingCartInfo.textContent = `${totalItems} item(s)`;
        dom.floatingCartTotal.textContent = dom.grandTotalEl.textContent;
        dom.floatingCartBtn.classList.add('visible');
    } else {
        dom.floatingCartBtn.classList.remove('visible');
    }
}

export function renderCart() {
    localStorage.setItem('pamonharia-cart', JSON.stringify(state.cart));
    calculateTotals();
    
    dom.clearCartBtn.style.display = state.cart.length > 0 ? 'inline-block' : 'none';
    
    updateFloatingCartButton();

    if (state.cart.length === 0) {
        dom.cartItemsContainer.innerHTML = '<p id="empty-cart-msg">Seu carrinho está vazio.</p>';
        dom.submitOrderBtn.disabled = true;
        return;
    }

    dom.cartItemsContainer.innerHTML = '';
    state.cart.forEach((itemGroup, cartIndex) => {
        const originalProduct = state.allItems.find(p => p.id === itemGroup.original_id);
        const isLockedGroup = itemGroup.is_combo || (originalProduct && originalProduct.force_one_to_one_complement);
        
        let subItemsHtml = '';
        const detailsWrapper = itemGroup.details || {};
        const complements = detailsWrapper.complements || [];

        if (complements.length > 0) {
            subItemsHtml = '<div class="cart-sub-items">';
            const complementCounts = {};
            complements.forEach(sub => {
                complementCounts[sub.name] = (complementCounts[sub.name] || 0) + sub.quantity;
            });
            subItemsHtml += Object.entries(complementCounts).map(([name, count]) => `<div class="cart-sub-item"><span>${count}x ${name}</span></div>`).join('');
            subItemsHtml += '</div>';
        }
        
        let mainControlsHtml = isLockedGroup 
            ? `<div class="quantity-control-cart"><button data-action="adjust-group" data-cart-index="${cartIndex}" data-amount="-1">-</button><span>${itemGroup.quantity}</span><button data-action="adjust-group" data-cart-index="${cartIndex}" data-amount="1">+</button></div>`
            : `<div class="quantity-control-cart" style="visibility: hidden;"></div>`;

        dom.cartItemsContainer.innerHTML += `<div class="cart-item-group" data-cart-id="${itemGroup.cart_id}"><div class="cart-main-item"><img src="${itemGroup.image_url || 'https://placehold.co/60x60/f59e0b/FFF?text=Item'}" alt="${itemGroup.name}" class="cart-item-image"><div class="cart-item-info"><strong>${itemGroup.quantity}x ${itemGroup.name}</strong><span class="cart-item-price">R$ ${(itemGroup.total_value || 0).toFixed(2).replace('.',',')}</span></div><div class="cart-main-controls">${mainControlsHtml}<button class="remove-item-btn" data-action="remove-group" data-cart-index="${cartIndex}">&times;</button></div></div>${subItemsHtml}</div>`;
    });
    dom.submitOrderBtn.disabled = !state.storeSettings.is_open;
}

function renderFooter() {
    const { address, location_link, operating_hours } = state.storeSettings;
    if (!address && !operating_hours) {
        dom.footer.style.display = 'none';
        return;
    }
    
    dom.footerAddress.textContent = address || '';
    dom.footerLocationLink.href = location_link || '#';
    dom.footerLocationLink.style.display = location_link ? 'inline-block' : 'none';

    if (operating_hours) {
        const dayOrder = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
        const dayNames = { segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado', domingo: 'Domingo' };
        let hoursHtml = '<div style="max-width: 300px; margin: 20px auto 0 auto; text-align: left; border-top: 1px solid var(--border-color); padding-top: 20px;">';
        dayOrder.forEach(dayKey => {
            const dayInfo = operating_hours[dayKey];
            const scheduleText = (dayInfo && dayInfo.enabled) ? `${dayInfo.open} às ${dayInfo.close}` : 'Fechado';
            hoursHtml += `<div style="display: flex; justify-content: space-between; padding: 4px 0;"><span style="font-weight: 500;">${dayNames[dayKey]}:</span> <span>${scheduleText}</span></div>`;
        });
        hoursHtml += '</div>';
        dom.footerHours.innerHTML = hoursHtml;
    } else {
        dom.footerHours.innerHTML = '';
    }

    dom.footer.style.display = 'block';
}


export function updateStoreStatus() {
    const now = new Date();
    const dayOfWeek = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][now.getDay()];
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    let isOpen = false;
    
    if (state.storeSettings.is_open_manual_override !== null) {
        isOpen = state.storeSettings.is_open_manual_override;
    } else {
        const schedule = state.storeSettings.operating_hours?.[dayOfWeek];
        if (schedule && schedule.enabled) {
            isOpen = currentTime >= schedule.open && currentTime <= schedule.close;
        }
    }
    
    state.storeSettings.is_open = isOpen;
    dom.storeStatusBanner.style.display = 'block';
    if (isOpen) {
        dom.storeStatusBanner.textContent = 'Loja Aberta! Faça seu pedido.';
        dom.storeStatusBanner.className = 'open';
    } else {
        dom.storeStatusBanner.textContent = 'Loja Fechada. Não estamos a aceitar pedidos no momento.';
        dom.storeStatusBanner.className = 'closed';
    }
    
    if (state.storeSettings.store_name) {
        dom.storeNameHeader.textContent = state.storeSettings.store_name;
    }

    renderFooter();
}

export function showErrorModal(title, message) {
    dom.errorModalTitle.textContent = title;
    dom.errorModalMessage.textContent = message;
    toggleErrorModal(true);
}

export function setupModal(config) {
    dom.modalHeader.innerHTML = `<h3>${config.title}</h3><p>${config.description}</p>`;
    dom.modalBody.innerHTML = config.body || '';
    dom.modalFeedback.textContent = '';
    dom.addToCartBtn.textContent = 'Adicionar ao Carrinho';
    dom.addToCartBtn.disabled = false;
    dom.addToCartBtn.onclick = config.onSave;
    dom.modal.querySelector('.modal-close-btn').onclick = () => dom.modal.style.display = 'none';
    dom.modal.style.display = 'flex';
    if (config.onOpen) config.onOpen();
}

export function showSuccessScreen(title, message) {
    dom.cartWrapper.style.display = 'none';
    const successTitleEl = dom.successMessage.querySelector('h3');
    const successParagraphEl = dom.successMessage.querySelector('p');
    if (successTitleEl) successTitleEl.textContent = title;
    if (successParagraphEl) successParagraphEl.textContent = message;
    dom.successMessage.style.display = 'block';
}

export function resetForNewOrder() {
    console.log('[UI] Resetando a interface para um novo pedido.');
    
    dom.successMessage.style.display = 'none';
    dom.cartWrapper.style.display = 'block';
    dom.orderForm.style.display = 'block';
    dom.onlinePaymentMethodSelection.style.display = 'none';
    dom.customPaymentContainer.style.display = 'none';
    dom.pixPaymentContainer.style.display = 'none';
    dom.orderForm.reset();
    dom.submitOrderBtn.disabled = true;
    dom.submitOrderBtn.textContent = 'Finalizar Pedido';
    
    const newOrderBtn = dom.newOrderBtn;
    newOrderBtn.textContent = 'Fazer Novo Pedido';
    newOrderBtn.onclick = resetForNewOrder;
    
    const deliveryEvent = new Event('change', { bubbles: true });
    document.querySelector('input[name="delivery-type"]:checked').dispatchEvent(deliveryEvent);
    renderCart();
}

export function showWhatsAppConfirmationModal(storePhoneNumber, order) {
    const confirmModal = dom.confirmModal;
    const confirmMessage = dom.confirmModalMessage;
    const confirmBtn = dom.confirmModalConfirm;
    const cancelBtn = dom.confirmModalCancel;

    confirmMessage.textContent = 'O seu pedido foi reservado. Para o enviar para a cozinha, por favor, clique em "Confirmar" para abrir o WhatsApp e enviar a mensagem de confirmação.';
    
    const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    const confirmationCode = `P-${order.id}-${randomCode}`;

    const message = `Olá! Gostaria de confirmar o meu pedido.
Código de Confirmação: *${confirmationCode}*

_(Por favor, não edite esta mensagem.)_`;

    const whatsappUrl = `https://wa.me/${storePhoneNumber}?text=${encodeURIComponent(message)}`;

    confirmBtn.onclick = () => {
        window.open(whatsappUrl, '_blank');
        confirmModal.style.display = 'none';
        showSuccessScreen(
            'Quase lá!',
            'Aguardando a sua confirmação no WhatsApp para enviar o pedido para a cozinha. Obrigado!'
        );
        clearCart(false); 
    };

    cancelBtn.onclick = () => {
        confirmModal.style.display = 'none';
    };

    confirmModal.style.display = 'flex';
}

export function initializeUI() {
    console.log('[UI] 🎨 Inicializando a Interface do Utilizador e os listeners.');
    const savedTheme = localStorage.getItem('pamonharia-theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));

    dom.themeSwitcher.addEventListener('click', () => {
        const currentTheme = document.body.getAttribute('data-theme');
        applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });

    document.querySelectorAll('input[name="delivery-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isDelivery = e.target.value === 'delivery';
            dom.addressGroup.style.display = isDelivery ? 'block' : 'none';
            dom.clientAddressInput.required = isDelivery;
            calculateTotals();
            updateFloatingCartButton();
        });
    });

    dom.clearCartBtn.addEventListener('click', () => {
        if (state.cart.length > 0) {
            clearCart();
        }
    });

    dom.pixCopyBtn.addEventListener('click', () => {
        dom.pixCopyPaste.select();
        document.execCommand('copy');
        dom.pixCopyBtn.textContent = 'Copiado!';
        setTimeout(() => { dom.pixCopyBtn.textContent = 'Copiar Código'; }, 2000);
    });

    const mainContent = document.querySelector('main');
    mainContent.addEventListener('click', (e) => {
        const button = e.target.closest('.action-button');
        if (!button) return;

        const action = button.dataset.action;
        const id = parseInt(button.dataset.id);

        if (action === 'open-combo-modal') openComboModal(id);
        if (action === 'open-options-modal') openProductWithOptionsModal(id);
        if (action === 'add-to-cart-simple') addToCartSimple(id);
    });
    
    // #################### INÍCIO DA CORREÇÃO ####################
    // ARQUITETO: O listener de eventos agora está corretamente anexado ao
    // container do carrinho, e a lógica de delegação de eventos foi validada
    // para garantir que os botões de "-" e "x" funcionem corretamente.
    dom.cartItemsContainer.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const { action, cartIndex, amount } = button.dataset;

        if (action === 'adjust-group') {
            adjustItemGroupQuantity(parseInt(cartIndex), parseInt(amount));
        }
        if (action === 'remove-group') {
            removeItemGroup(parseInt(cartIndex));
        }
    });
    // ##################### FIM DA CORREÇÃO ######################

    dom.selectCardBtn.addEventListener('click', () => handleOnlinePaymentSelection('card'));
    dom.selectPixBtn.addEventListener('click', () => handleOnlinePaymentSelection('pix'));

    dom.backToCartBtn.addEventListener('click', handleBackToCart);
    dom.backToPaymentSelectionBtn.addEventListener('click', handleBackToPaymentSelection);
    dom.backToPaymentSelectionFromPixBtn.addEventListener('click', handleBackToPaymentSelection);

    dom.newOrderBtn.addEventListener('click', resetForNewOrder);
    
    dom.floatingCartBtn.addEventListener('click', () => {
        dom.cartWrapper.scrollIntoView({ behavior: 'smooth' });
    });
    
    document.querySelector('input[name="delivery-type"]:checked').dispatchEvent(new Event('change'));
}

function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('pamonharia-theme', theme);
}

function toggleErrorModal(show) {
    dom.errorModal.style.display = show ? 'flex' : 'none';
}