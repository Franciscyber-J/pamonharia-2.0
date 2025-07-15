// frontend/cardapio/js/main.js
console.log('[main.js] Módulo iniciado.');
import { apiFetch, fetchAndRenderAllData } from './api.js';
import { initializeCart, getCart, clearCart } from './cart.js';
import { dom, initializeUI, updateStoreStatus, renderItems, renderCart, showErrorModal, showSuccessScreen } from './ui.js';
import { initializeCardPaymentForm } from './payment.js';

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE_URL = IS_LOCAL ? 'http://localhost:10000' : 'https://pamonhariasaborosa.expertbr.com';

export const socket = io(API_BASE_URL, {
    transports: ['websocket']
});

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
    console.log('[main.js] Função main() iniciada.');
    try {
        const paymentSettings = await apiFetch('/public/payment-settings');
        if (paymentSettings && paymentSettings.mercadoPagoPublicKey) {
            console.log('[main.js] Chave do Mercado Pago recebida. A inicializar SDK.');
            state.mp = new MercadoPago(paymentSettings.mercadoPagoPublicKey, { locale: 'pt-BR' });
        } else {
            console.warn("[main.js] Chave pública do Mercado Pago não foi encontrada. Pagamento online estará desabilitado.");
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

socket.on('connect', () => console.log(`[Socket.IO] ✅ Conectado ao servidor em ${API_BASE_URL}.`));
socket.on('disconnect', () => console.log(`[Socket.IO] 🔌 Desconectado do servidor.`));
socket.on('connect_error', (err) => console.error('[Socket.IO] ❌ Erro de conexão:', err.message));

socket.on('stock_update', (inventory) => {
    console.log('[Socket.IO] 📥 Recebido "stock_update":', inventory);
    state.liveStockState = inventory;
    renderItems(); 
});

socket.on('data_updated', async () => {
    console.log('[Socket.IO] 🔄 Recebido "data_updated". A recarregar todos os dados.');
    await fetchAndRenderAllData();
    updateStoreStatus();
    renderItems();
    renderCart();
});

async function handleOrderSubmit(e) {
    e.preventDefault();
    console.log('[Order] ➡️ Iniciando submissão de pedido.');
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
    const deliveryFee = state.storeSettings.delivery_fee || 0;
    const isDelivery = document.querySelector('input[name="delivery-type"]:checked').value === 'delivery';
    
    let subtotal = state.cart.reduce((acc, item) => acc + (item.total_value || 0), 0);
    const finalDeliveryFee = isDelivery ? parseFloat(deliveryFee) : 0;
    const totalPrice = subtotal + finalDeliveryFee;

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
        console.log('[Order] Pagamento online selecionado. A mostrar opções de método.');
        dom.orderForm.style.display = 'none';
        dom.onlinePaymentMethodSelection.style.display = 'flex';
    } else {
        console.log('[Order] Pagamento na entrega selecionado. A enviar pedido...');
        try {
            state.currentOrder = await apiFetch('/public/orders', { method: 'POST', body: JSON.stringify(state.orderData) });
            console.log('[Order] ✅ Pedido criado com sucesso:', state.currentOrder);
            showSuccessScreen(
                'Obrigado pelo seu pedido!',
                'Ele já foi enviado para a nossa cozinha e em breve chegará até você.'
            );
            clearCart(false);
        } catch (error) {
            console.error('[Order] ❌ Falha ao criar pedido:', error);
            showErrorModal('Falha no Pedido', `Não foi possível criar seu pedido. Detalhe: ${error.message || 'Erro desconhecido'}`);
            dom.submitOrderBtn.disabled = false;
            dom.submitOrderBtn.textContent = 'Finalizar Pedido';
        }
    }
}

export async function handleOnlinePaymentSelection(method) {
    console.log(`[Payment] Método de pagamento online selecionado: ${method}`);
    try {
        dom.onlinePaymentMethodSelection.style.display = 'none';
        dom.paymentProcessingOverlay.style.display = 'flex';

        state.currentOrder = await apiFetch('/public/orders', { method: 'POST', body: JSON.stringify(state.orderData) });
        console.log(`[Payment] Pedido ${state.currentOrder.id} criado. A preparar pagamento...`);
        
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
            console.log('[Payment] Resposta do PIX recebida:', paymentResponse);
            dom.paymentProcessingOverlay.style.display = 'none';
            dom.pixQrCode.src = `data:image/jpeg;base64,${paymentResponse.qr_code_base64}`;
            dom.pixCopyPaste.value = paymentResponse.qr_code;
            dom.pixPaymentContainer.style.display = 'block';
        }

    } catch (error) {
        dom.paymentProcessingOverlay.style.display = 'none';
        const errorMessage = (error?.details) || error.message || 'Erro desconhecido ao inicializar o pagamento.';
        console.error('[Payment] ❌ Falha na preparação do pagamento:', errorMessage);
        showErrorModal('Falha na Preparação do Pagamento', `Não foi possível iniciar o pagamento. Detalhe: ${errorMessage}`);
        
        dom.orderForm.style.display = 'block';
        dom.onlinePaymentMethodSelection.style.display = 'none';
        dom.submitOrderBtn.disabled = false;
        dom.submitOrderBtn.textContent = 'Finalizar Pedido';
    }
}

dom.orderForm.addEventListener('submit', handleOrderSubmit);

main();