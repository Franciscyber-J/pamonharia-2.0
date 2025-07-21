// frontend/dashboard/js/pedidos.js
import { globalApiFetch } from './api.js';
import { state, setState } from './main.js';
import { showCustomConfirm } from './ui.js';

let notificationAudio, isSoundEnabled = true, isAudioUnlocked = false;

export async function setupAudio() {
    try {
        const config = await globalApiFetch('/dashboard/config');
        notificationAudio = config.notification_sound_url ? new Audio(config.notification_sound_url) : null;
        if (notificationAudio) {
            notificationAudio.loop = true;
            showAudioUnlockModal();
        }
    } catch (error) {
        console.error("Não foi possível carregar as config de som.", error);
    }
    updateSoundStatusButton();
    document.getElementById('sound-status').addEventListener('click', toggleSound);
}

function updateSoundStatusButton() {
    const btn = document.getElementById('sound-status');
    if (btn) {
        btn.textContent = isSoundEnabled ? '🔊 Som Ligado' : '🔇 Som Desligado';
        btn.classList.toggle('sound-on', isSoundEnabled);
        btn.classList.toggle('sound-off', !isSoundEnabled);
    }
}

async function unlockAudio() {
    if (isAudioUnlocked || !notificationAudio) return true;
    try {
        await notificationAudio.play();
        notificationAudio.pause();
        notificationAudio.currentTime = 0;
        isAudioUnlocked = true;
        console.log('[Dashboard] 🔊 Contexto de áudio desbloqueado!');
        return true;
    } catch (e) {
        console.warn('[Dashboard] 🔔 Falha ao desbloquear áudio. A aguardar interação do utilizador.');
        return false;
    }
}

export function playNotification(id) {
    if (isSoundEnabled && notificationAudio) {
        unlockAudio().then(unlocked => {
            if(unlocked) {
                console.log(`[Dashboard] 🎵 Tocando notificação para pedido #${id}...`);
                notificationAudio.play().catch(e => console.warn("Erro ao tocar som:", e.message));
                const card = document.getElementById(`order-${id}`);
                if (card) card.classList.add('is-playing-sound');
            }
        });
    }
}

export function stopNotification() {
    if (notificationAudio) {
        notificationAudio.pause();
        notificationAudio.currentTime = 0;
    }
    document.querySelectorAll('.order-card.is-playing-sound').forEach(c => c.classList.remove('is-playing-sound'));
}

function showAudioUnlockModal() {
    const modal = document.getElementById('audio-unlock-modal-overlay');
    const btn = document.getElementById('audio-unlock-confirm');
    if(modal) {
        modal.style.display = 'flex';
        btn.onclick = async () => {
            await unlockAudio();
            modal.style.display = 'none';
        };
    }
}

async function toggleSound() {
    if (!isAudioUnlocked && !(await unlockAudio())) {
        showAudioUnlockModal();
        return;
    }
    isSoundEnabled = !isSoundEnabled;
    updateSoundStatusButton();
    if (!isSoundEnabled) stopNotification();
}

async function updateOrderStatus(orderId, newStatus, options = {}) {
    stopNotification();
    if (newStatus === 'Cancelado' && !options.isRejectFlow) {
        openRejectModal(orderId);
    } else {
        try {
            const payload = { status: newStatus };
            if (options.reason) {
                payload.reason = options.reason;
            }
            await globalApiFetch(`/orders/${orderId}/status`, {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });
        } catch (error) {
            console.error(`Falha ao atualizar status:`, error);
        }
    }
}

export function renderPedidosPage() {
    document.getElementById('page-title').textContent = 'Painel de Pedidos';
    document.getElementById('dashboard-content').innerHTML = `
        <div class="orders-header">
            <h2>Acompanhamento de Pedidos</h2>
            <button id="clear-history-btn" class="btn btn-danger">Limpar Histórico</button>
        </div>
        <div class="orders-panel">
            <div class="order-column"><h3>Novos Pedidos</h3><div class="order-list" id="col-novo"></div></div>
            <div class="order-column"><h3>Pronto para Entrega/Retirada</h3><div class="order-list" id="col-em-preparo"></div></div>
            <div class="order-column"><h3>Em Rota de Entrega</h3><div class="order-list" id="col-pronto-para-entrega"></div></div>
            <div class="order-column"><h3>Concluídos</h3><div class="order-list" id="col-finalizado"></div></div>
            <div class="order-column"><h3>Recusados</h3><div class="order-list" id="col-cancelado"></div></div>
        </div>`;
    
    document.getElementById('clear-history-btn').addEventListener('click', () => {
        showCustomConfirm(
            'Tem a certeza de que deseja apagar permanentemente todos os pedidos concluídos, recusados e abandonados?',
            async () => {
                try {
                    await globalApiFetch('/orders/history', { method: 'DELETE' });
                } catch (error) {
                    console.error('Falha ao limpar histórico:', error);
                    alert('Não foi possível limpar o histórico.');
                }
            }
        );
    });

    fetchAndRenderOrders();
}

export async function fetchAndRenderOrders() {
    try {
        const { activeOrders, finishedOrders, rejectedOrders } = await globalApiFetch('/orders');
        setState({ allOrdersCache: [...activeOrders, ...finishedOrders, ...rejectedOrders] });
        
        document.querySelectorAll('.order-list').forEach(l => l.innerHTML = '');
        state.allOrdersCache.forEach(o => addOrderCard(o, false));
        
        if (notificationAudio && !isAudioUnlocked) {
            showAudioUnlockModal();
        }
    } catch (error) {
        console.error("Erro ao buscar pedidos:", error);
    }
}

export function addOrderCard(order, prepend = true) {
    const statusMap = {
        'Aguardando Pagamento': 'col-novo', 'Pago': 'col-novo', 'Novo': 'col-novo',
        'Em Preparo': 'col-em-preparo',
        'Pronto para Entrega': 'col-pronto-para-entrega',
        'Finalizado': 'col-finalizado',
        'Cancelado': 'col-cancelado'
    };
    const columnId = statusMap[order.status];
    if (!columnId) return;

    const column = document.getElementById(columnId);
    if (column) {
        const existingCard = document.getElementById(`order-${order.id}`);
        if (existingCard) existingCard.remove();
        const card = createOrderCard(order);
        if (prepend) column.prepend(card);
        else column.appendChild(card);
    }
}

function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';
    card.id = `order-${order.id}`;
    card.onclick = (event) => {
        if (!event.target.closest('button')) {
            openOrderDetailsModal(order);
        }
    };
    
    let paymentTag = '';
    if (order.status === 'Pago' || order.payment_status === 'approved') {
        paymentTag = `<span class="order-tag payment-paid">PAGO ONLINE</span>`;
    } else if (order.payment_method === 'on_delivery') {
        paymentTag = `<span class="order-tag payment-on-delivery">PAGAR NA ENTREGA</span>`;
    }

    const isPickup = order.client_address === 'Retirada no local';
    const deliveryTypeTag = isPickup ? `<span class="order-tag delivery-pickup">RETIRADA</span>` : `<span class="order-tag delivery-delivery">ENTREGA</span>`;
    
    const nextStatusFromPreparo = isPickup ? 'Finalizado' : 'Pronto para Entrega';
    
    let driverButton = '';
    if (order.status === 'Em Preparo' && !isPickup) {
        driverButton = `<button onclick="openDriverRequestModal(${order.id})" class="driver-request">Solicitar Entregador</button>`;
    }
    
    const actionMap = {
        'Novo': `<button onclick="updateOrderStatusWrapper(${order.id}, 'Em Preparo')">Aceitar Pedido</button><button onclick="updateOrderStatusWrapper(${order.id}, 'Cancelado')" class="cancel">Recusar</button>`,
        'Pago': `<button onclick="updateOrderStatusWrapper(${order.id}, 'Em Preparo')">Aceitar Pedido</button>`,
        'Em Preparo': `<button onclick="updateOrderStatusWrapper(${order.id}, '${nextStatusFromPreparo}')">Pronto</button>${driverButton}`,
        'Pronto para Entrega': `<button onclick="updateOrderStatusWrapper(${order.id}, 'Finalizado')">Finalizado</button>`
    };

    const actionsHtml = actionMap[order.status] || '';
    
    card.innerHTML = `
        <div class="order-card-header">
            <span>Pedido #${order.id}</span>
            <span>R$ ${parseFloat(order.total_price).toFixed(2).replace('.', ',')}</span>
        </div>
        <div class="order-tags">${paymentTag}${deliveryTypeTag}</div>
        <div class="order-card-body">
            <p><strong>Cliente:</strong> ${order.client_name}</p>
            <p><strong>Destino:</strong> ${order.client_address}</p>
        </div>
        <div class="order-card-actions">${actionsHtml}</div>`;

    return card;
}

// Wrapper to make it accessible from HTML
window.updateOrderStatusWrapper = updateOrderStatus;