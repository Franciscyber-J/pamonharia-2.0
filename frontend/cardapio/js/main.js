import { apiFetch, fetchAndRenderAllData } from './api.js';
import { initializeCart, getCart, clearCart } from './cart.js';
import { dom, initializeUI, updateStoreStatus, renderItems, renderCart, showErrorModal, initializePaymentBrick } from './ui.js';

// Inicializa o Socket.IO
const API_BASE_URL = 'http://localhost:10000';
const socket = io(API_BASE_URL);

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
};

// Função principal de inicialização
async function main() {
    try {
        // Carrega os dados iniciais (produtos, configurações, etc.)
        const paymentSettings = await apiFetch('/public/payment-settings');
        state.mp = new MercadoPago(paymentSettings.mercadoPagoPublicKey);
        
        await fetchAndRenderAllData();
        
        // Inicializa a UI com os dados carregados
        initializeUI();
        
        // Carrega o carrinho do localStorage
        state.cart = initializeCart();
        
        updateStoreStatus();
        renderItems();
        renderCart();
        
    } catch (error) {
        console.error("Erro fatal ao carregar a aplicação:", error);
        document.body.innerHTML = `<h1>Erro ao carregar o cardápio.</h1><p>Não foi possível conectar ao servidor. Tente novamente mais tarde.</p><p><small>${error.message}</small></p>`;
    }
}

// --- CONFIGURAÇÃO DE EVENTOS GLOBAIS ---

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

// Listener do formulário de pedido
dom.orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
    const totalPrice = parseFloat(dom.grandTotalEl.textContent.replace('R$ ', '').replace(',', '.'));

    if (paymentMethod === 'online' && totalPrice < 1.00) {
        showErrorModal('Valor Baixo Para Pagamento Online', 'O valor mínimo para pagamentos online é de R$ 1,00.');
        return;
    }

    dom.submitOrderBtn.disabled = true;
    dom.submitOrderBtn.textContent = 'A processar...';

    const deliveryType = document.querySelector('input[name="delivery-type"]:checked').value;
    const address = deliveryType === 'delivery' ? dom.clientAddressInput.value : 'Retirada no local';

    const itemsForBackend = getCart().map(itemGroup => ({
        id: itemGroup.original_id,
        name: itemGroup.name,
        price: itemGroup.price,
        quantity: itemGroup.quantity,
        is_combo: !!itemGroup.is_combo,
        item_details: itemGroup.selected_items || []
    }));

    const orderData = {
        client_name: document.getElementById('client-name').value,
        client_phone: document.getElementById('client-phone').value,
        client_address: address,
        items: itemsForBackend,
        total_price: totalPrice,
        payment_method: paymentMethod
    };

    try {
        state.currentOrder = await apiFetch('/public/orders', { method: 'POST', body: JSON.stringify(orderData) });

        if (paymentMethod === 'online') {
            dom.orderForm.style.display = 'none';
            dom.paymentProcessingOverlay.style.display = 'flex';
            await initializePaymentBrick();
        } else {
            dom.cartWrapper.style.display = 'none';
            dom.successMessage.style.display = 'block';
            clearCart();
        }
    } catch (error) {
        showErrorModal('Falha no Pedido', `Não foi possível criar seu pedido. Detalhe: ${error.message}`);
        dom.submitOrderBtn.disabled = false;
        dom.submitOrderBtn.textContent = 'Finalizar Pedido';
    }
});

// Inicia a aplicação
main();

// Exporta o socket para ser usado em outros módulos
export { socket };
