import { apiFetch, fetchAndRenderAllData } from './api.js';
import { initializeCart, getCart, clearCart } from './cart.js';
import { dom, initializeUI, updateStoreStatus, renderItems, renderCart, showErrorModal, initializeCardPaymentForm } from './ui.js';

// Inicializa o Socket.IO
const API_BASE_URL = 'https://api.render.com/deploy/srv-d1lgojmr433s73dndogg?key=LJmnkh7M4F8';
export const socket = io(API_BASE_URL);

// Estado global da aplicação
export const state = {
    cart: [],
    allItems: [],
    allProductsFlat: [],
    productParentMap: {},
    storeSettings: {},
    liveStockState: {},
    currentOrder: null,
    mp: null, // Instância do MercadoPago
    orderData: {}, // Armazena temporariamente os dados do pedido
};

// Função principal de inicialização
async function main() {
    try {
        const paymentSettings = await apiFetch('/public/payment-settings');
        state.mp = new MercadoPago(paymentSettings.mercadoPagoPublicKey, {
            locale: 'pt-BR'
        });
        
        await fetchAndRenderAllData();
        initializeUI();
        state.cart = initializeCart();
        updateStoreStatus();
        renderItems();
        renderCart();
        
    } catch (error) {
        console.error("Erro fatal ao carregar a aplicação:", error);
        document.body.innerHTML = `<h1>Erro ao carregar o cardápio.</h1><p>Não foi possível conectar ao servidor. Tente novamente mais tarde.</p><p><small>${error.message}</small></p>`;
    }
}

// Listeners do Socket.IO
socket.on('connect', () => console.log('[Cardapio] ✅ Socket.IO conectado ao servidor.'));
socket.on('stock_update', (inventory) => {
    state.liveStockState = inventory;
    renderItems();
});
socket.on('data_updated', async () => {
    await fetchAndRenderAllData();
    updateStoreStatus();
    renderItems();
    renderCart();
});

/**
 * Orquestra o fluxo de finalização de pedido.
 * @param {Event} e - O evento do formulário.
 */
async function handleOrderSubmit(e) {
    e.preventDefault();
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
    const totalPrice = parseFloat(dom.grandTotalEl.textContent.replace('R$ ', '').replace(',', '.'));

    if (paymentMethod === 'online' && totalPrice < 1.00) {
        showErrorModal('Valor Baixo Para Pagamento Online', 'O valor mínimo para pagamentos online é de R$ 1,00.');
        return;
    }

    // Guarda os dados do pedido no estado global temporariamente
    const deliveryType = document.querySelector('input[name="delivery-type"]:checked').value;
    state.orderData = {
        client_name: document.getElementById('client-name').value,
        client_phone: document.getElementById('client-phone').value,
        client_address: deliveryType === 'delivery' ? dom.clientAddressInput.value : 'Retirada no local',
        items: getCart().map(itemGroup => ({
            id: itemGroup.original_id,
            name: itemGroup.name,
            price: itemGroup.price,
            quantity: itemGroup.quantity,
            is_combo: !!itemGroup.is_combo,
            item_details: itemGroup.selected_items || []
        })),
        total_price: totalPrice,
        payment_method: paymentMethod
    };

    dom.submitOrderBtn.disabled = true;
    dom.submitOrderBtn.textContent = 'A processar...';

    if (paymentMethod === 'online') {
        dom.orderForm.style.display = 'none';
        dom.onlinePaymentMethodSelection.style.display = 'flex';
    } else {
        // Processa o pedido para "Pagar na Entrega"
        try {
            state.currentOrder = await apiFetch('/public/orders', { method: 'POST', body: JSON.stringify(state.orderData) });
            dom.cartWrapper.style.display = 'none';
            dom.successMessage.style.display = 'block';
            clearCart();
        } catch (error) {
            showErrorModal('Falha no Pedido', `Não foi possível criar seu pedido. Detalhe: ${error.message || 'Erro desconhecido'}`);
            dom.submitOrderBtn.disabled = false;
            dom.submitOrderBtn.textContent = 'Finalizar Pedido';
        }
    }
}

/**
 * Lida com a seleção do método de pagamento online (Cartão ou PIX).
 * @param {'card' | 'pix'} method - O método de pagamento selecionado.
 */
export async function handleOnlinePaymentSelection(method) {
    try {
        dom.onlinePaymentMethodSelection.style.display = 'none';
        dom.paymentProcessingOverlay.style.display = 'flex';

        state.currentOrder = await apiFetch('/public/orders', { method: 'POST', body: JSON.stringify(state.orderData) });

        if (method === 'card') {
            await initializeCardPaymentForm();
            dom.paymentProcessingOverlay.style.display = 'none';
        } else if (method === 'pix') {
            const paymentData = {
                order_id: state.currentOrder.id,
                payment_method_id: 'pix',
                payment_type: 'pix',
                payer: { email: document.getElementById('client-name').value.replace(/\s/g, '').toLowerCase() + '@email.com' }
            };
            const paymentResponse = await apiFetch('/payments/process', { method: 'POST', body: JSON.stringify(paymentData) });
            dom.paymentProcessingOverlay.style.display = 'none';
            dom.pixQrCode.src = `data:image/jpeg;base64,${paymentResponse.qr_code_base64}`;
            dom.pixCopyPaste.value = paymentResponse.qr_code;
            dom.pixPaymentContainer.style.display = 'block';
        }

    } catch (error) {
        dom.paymentProcessingOverlay.style.display = 'none';
        
        const errorMessage = (error && error[0] && error[0].description) 
            ? `Erro da API: ${error[0].description}. Verifique se a sua conta está habilitada para produção.`
            : error.message || 'Erro desconhecido ao inicializar o pagamento.';

        showErrorModal('Falha na Preparação do Pagamento', `Não foi possível iniciar o pagamento. Detalhe: ${errorMessage}`);
        
        dom.orderForm.style.display = 'block';
        dom.onlinePaymentMethodSelection.style.display = 'none';
        dom.submitOrderBtn.disabled = false;
        dom.submitOrderBtn.textContent = 'Finalizar Pedido';
    }
}

// Listener do formulário de pedido
dom.orderForm.addEventListener('submit', handleOrderSubmit);

// Inicia a aplicação
main();
