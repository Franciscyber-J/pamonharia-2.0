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
    cartTimeout: null,
};

export function startCartTimeout() {
    if (state.cartTimeout) clearTimeout(state.cartTimeout);
    console.log('[Timeout] Iniciando temporizador de 15 minutos para o carrinho.');
    state.cartTimeout = setTimeout(() => {
        console.log('[Timeout] Carrinho expirado! Devolvendo itens ao estoque.');
        alert('O seu carrinho expirou por inatividade e os itens foram devolvidos. Por favor, inicie um novo pedido.');
        clearCart(true);
    }, 15 * 60 * 1000);
}

export function stopCartTimeout() {
    if (state.cartTimeout) {
        console.log('[Timeout] Limpando temporizador do carrinho.');
        clearTimeout(state.cartTimeout);
        state.cartTimeout = null;
    }
}


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
    
    // Prepara os dados do pedido independentemente do método de pagamento
    const deliveryFee = state.storeSettings.delivery_fee || 0;
    const isDelivery = document.querySelector('input[name="delivery-type"]:checked').value === 'delivery';
    let subtotal = state.cart.reduce((acc, item) => acc + (item.total_value || 0), 0);
    const finalDeliveryFee = isDelivery ? parseFloat(deliveryFee) : 0;
    const totalPrice = subtotal + finalDeliveryFee;
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;

    state.orderData = {
        client_name: document.getElementById('client-name').value,
        client_phone: document.getElementById('client-phone').value,
        client_address: isDelivery ? dom.clientAddressInput.value : 'Retirada no local',
        items: getCart().map(itemGroup => ({
            id: itemGroup.original_id,
            name: itemGroup.name, price: itemGroup.price, quantity: itemGroup.quantity,
            is_combo: !!itemGroup.is_combo, selected_items: itemGroup.selected_items || []
        })),
        total_price: totalPrice, payment_method: paymentMethod
    };

    dom.submitOrderBtn.disabled = true;
    dom.submitOrderBtn.textContent = 'A processar...';

    if (paymentMethod === 'online') {
        if (!state.mp) {
            showErrorModal('Pagamento Indisponível', 'O pagamento online não está configurado. Escolha "Pagar na Entrega".');
            dom.submitOrderBtn.disabled = false;
            dom.submitOrderBtn.textContent = 'Finalizar Pedido';
            return;
        }
        if (totalPrice < 1.00) {
            showErrorModal('Valor Baixo Para Pagamento Online', 'O valor mínimo para pagamentos online é de R$ 1,00.');
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
            showSuccessScreen('Obrigado pelo seu pedido!', 'Ele já foi enviado para a nossa cozinha e em breve chegará até você.');
            clearCart(false);
        } catch (error) {
            console.error('[Order] ❌ Falha ao criar pedido:', error);
            showErrorModal('Falha no Pedido', `Não foi possível criar seu pedido. Detalhe: ${error.message || 'Erro desconhecido'}`);
            dom.submitOrderBtn.disabled = false;
            dom.submitOrderBtn.textContent = 'Finalizar Pedido';
        }
    }
}

// #################### INÍCIO DA CORREÇÃO ####################
// ARQUITETO: A função agora não cria um pedido. Ela envia os detalhes do pedido
// para o endpoint de pagamento, que inicia a transação no Mercado Pago.
export async function handleOnlinePaymentSelection(method) {
    console.log(`[Payment] Método de pagamento online selecionado: ${method}`);
    try {
        dom.onlinePaymentMethodSelection.style.display = 'none';
        
        if (method === 'card') {
            await initializeCardPaymentForm();
        } else if (method === 'pix') {
            dom.paymentProcessingOverlay.style.display = 'flex';
            const paymentData = {
                payment_method_id: 'pix',
                payment_type: 'pix',
                payer: { email: state.orderData.client_name.replace(/\s/g, '').toLowerCase() + '@email.com' },
                order_details: state.orderData // Envia todos os detalhes do pedido
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
// ##################### FIM DA CORREÇÃO ######################

dom.orderForm.addEventListener('submit', handleOrderSubmit);

window.addEventListener('beforeunload', () => {
    if (state.cart && state.cart.length > 0) {
        clearCart(true);
    }
});

main();