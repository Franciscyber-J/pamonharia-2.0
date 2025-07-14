// frontend/cardapio/js/main.js
import { apiFetch, fetchAndRenderAllData } from './api.js';
import { initializeCart, getCart, clearCart } from './cart.js';
import { dom, initializeUI, updateStoreStatus, renderItems, renderCart, showErrorModal } from './ui.js';
import { initializeCardPaymentForm } from './payment.js';

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE_URL = IS_LOCAL ? 'http://localhost:10000' : 'https://pamonhariasaborosa.expertbr.com';
export const socket = io(API_BASE_URL);

export const state = {
    cart: [],
    allItems: [],
    allProductsFlat: [],
    productParentMap: {},
    storeSettings: {},
    liveStockState: {},
    currentOrder: null,
    mp: null,
    orderData: {},
};

async function main() {
    try {
        const paymentSettings = await apiFetch('/public/payment-settings');
        if (paymentSettings.mercadoPagoPublicKey) {
            state.mp = new MercadoPago(paymentSettings.mercadoPagoPublicKey, { locale: 'pt-BR' });
        } else {
            console.warn("Chave pública do Mercado Pago não foi encontrada. Pagamento online estará desabilitado.");
        }
        
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

socket.on('connect', () => console.log(`[Cardapio] ✅ Socket.IO conectado ao servidor em ${API_BASE_URL}.`));
socket.on('stock_update', (inventory) => {
    state.liveStockState = inventory;
    renderItems();
});
socket.on('data_updated', async () => {
    console.log('[Cardapio] 🔄 Evento "data_updated" recebido. A recarregar dados do cardápio...');
    await fetchAndRenderAllData();
    updateStoreStatus();
    renderItems();
    renderCart();
});

async function handleOrderSubmit(e) {
    e.preventDefault();
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
    const totalPrice = state.cart.reduce((acc, item) => acc + (item.total_value || 0), 0);

    if (paymentMethod === 'online' && totalPrice < 1.00) {
        showErrorModal('Valor Baixo Para Pagamento Online', 'O valor mínimo para pagamentos online é de R$ 1,00.');
        return;
    }

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
            selected_items: itemGroup.selected_items || []
        })),
        total_price: totalPrice,
        payment_method: paymentMethod
    };

    dom.submitOrderBtn.disabled = true;
    dom.submitOrderBtn.textContent = 'A processar...';

    if (paymentMethod === 'online') {
        if (!state.mp) {
            showErrorModal('Pagamento Indisponível', 'O pagamento online não está configurado corretamente. Por favor, escolha "Pagar na Entrega".');
            dom.submitOrderBtn.disabled = false;
            dom.submitOrderBtn.textContent = 'Finalizar Pedido';
            return;
        }
        dom.orderForm.style.display = 'none';
        dom.onlinePaymentMethodSelection.style.display = 'flex';
    } else {
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
        const errorMessage = (error?.details) || error.message || 'Erro desconhecido ao inicializar o pagamento.';
        showErrorModal('Falha na Preparação do Pagamento', `Não foi possível iniciar o pagamento. Detalhe: ${errorMessage}`);
        
        dom.orderForm.style.display = 'block';
        dom.onlinePaymentMethodSelection.style.display = 'none';
        dom.submitOrderBtn.disabled = false;
        dom.submitOrderBtn.textContent = 'Finalizar Pedido';
    }
}

dom.orderForm.addEventListener('submit', handleOrderSubmit);

main();