// frontend/dashboard/js/pedidos.js
import { globalApiFetch } from './api.js';
import { state, setState } from './main.js';
import { showCustomConfirm } from './ui.js';

let orderNotificationAudio, handoverNotificationAudio, isSoundEnabled = true, isAudioUnlocked = false;
let rejectReasonModal, rejectReasonForm, rejectReasonSelect, orderToRejectId;
let driverRequestModal, driverRequestGroupsList, currentOrderForDriver;
let handoverAlertTimeout = null;

export async function setupAudio() {
    try {
        const config = await globalApiFetch('/dashboard/config');
        orderNotificationAudio = config.notification_sound_url ? new Audio(config.notification_sound_url) : null;
        if (orderNotificationAudio) orderNotificationAudio.loop = true;

        handoverNotificationAudio = config.handover_sound_url ? new Audio(config.handover_sound_url) : null;
        if (handoverNotificationAudio) handoverNotificationAudio.loop = true;

        if (orderNotificationAudio || handoverNotificationAudio) {
            showAudioUnlockModal();
        }
    } catch (error) {
        console.error("Não foi possível carregar as config de som.", error);
    }
    updateSoundStatusButton();
    document.getElementById('sound-status').addEventListener('click', toggleSound);
}

export function updateSoundStatusButton() {
    const btn = document.getElementById('sound-status');
    if (btn) {
        btn.textContent = isSoundEnabled ? '🔊 Som Ligado' : '🔇 Som Desligado';
        btn.classList.toggle('sound-on', isSoundEnabled);
        btn.classList.toggle('sound-off', !isSoundEnabled);
    }
}

async function unlockAudio() {
    if (isAudioUnlocked) return true;
    try {
        if (orderNotificationAudio) {
            await orderNotificationAudio.play();
            orderNotificationAudio.pause();
            orderNotificationAudio.currentTime = 0;
        }
        if (handoverNotificationAudio) {
            await handoverNotificationAudio.play();
            handoverNotificationAudio.pause();
            handoverNotificationAudio.currentTime = 0;
        }
        isAudioUnlocked = true;
        console.log('[Dashboard] 🔊 Contexto de áudio desbloqueado!');
        return true;
    } catch (e) {
        console.warn('[Dashboard] 🔔 Falha ao desbloquear áudio.');
        return false;
    }
}

export function playNotification(type = 'order', id = null) {
    let audioToPlay = type === 'order' ? orderNotificationAudio : handoverNotificationAudio;
    
    if (isSoundEnabled && audioToPlay) {
        unlockAudio().then(unlocked => {
            if(unlocked) {
                console.log(`[Dashboard] 🎵 Tocando notificação do tipo '${type}'...`);
                audioToPlay.loop = true;
                audioToPlay.play().catch(e => console.warn("Erro ao tocar som:", e.message));
                if (id) {
                    const card = document.getElementById(`order-${id}`);
                    if (card) card.classList.add('is-playing-sound');
                }
            }
        });
    }
}

export function stopNotification() {
    if (orderNotificationAudio) {
        orderNotificationAudio.pause();
        orderNotificationAudio.currentTime = 0;
    }
    if (handoverNotificationAudio) {
        handoverNotificationAudio.pause();
        handoverNotificationAudio.currentTime = 0;
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
        } catch (error) { console.error(`Falha ao atualizar status:`, error); }
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

    setupModalEventListeners();
    fetchAndRenderOrders();
}

export async function fetchAndRenderOrders() {
    try {
        const { activeOrders, finishedOrders, rejectedOrders } = await globalApiFetch('/orders');
        setState({ allOrdersCache: [...activeOrders, ...finishedOrders, ...rejectedOrders] });
        document.querySelectorAll('.order-list').forEach(l => l.innerHTML = '');
        state.allOrdersCache.forEach(o => addOrderCard(o, false));
        if ((orderNotificationAudio || handoverNotificationAudio) && !isAudioUnlocked) {
            showAudioUnlockModal();
        }
    } catch (error) { console.error("Erro ao buscar pedidos:", error); }
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
        driverButton = `<button onclick="window.openDriverRequestModal(${order.id})" class="driver-request">Solicitar Entregador</button>`;
    }
    const actionMap = {
        'Novo': `<button onclick="window.updateOrderStatusWrapper(${order.id}, 'Em Preparo')">Aceitar Pedido</button><button onclick="window.updateOrderStatusWrapper(${order.id}, 'Cancelado')" class="cancel">Recusar</button>`,
        'Pago': `<button onclick="window.updateOrderStatusWrapper(${order.id}, 'Em Preparo')">Aceitar Pedido</button>`,
        'Em Preparo': `<button onclick="window.updateOrderStatusWrapper(${order.id}, '${nextStatusFromPreparo}')">Pronto</button>${driverButton}`,
        'Pronto para Entrega': `<button onclick="window.updateOrderStatusWrapper(${order.id}, 'Finalizado')">Finalizado</button>`
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

function openOrderDetailsModal(order) {
    const modal = document.getElementById('order-details-modal-overlay');
    const title = document.getElementById('order-details-title');
    const body = document.getElementById('order-details-body');
    title.textContent = `Detalhes do Pedido #${order.id}`;
    let itemsHtml = '<h4>Itens do Pedido</h4><ul class="order-details-list">';
    if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
            const detailsWrapper = item.item_details || {};
            const complements = detailsWrapper.complements || [];
            const isOneToOne = detailsWrapper.force_one_to_one === true;
            const isContainerOnly = parseFloat(item.unit_price) === 0 && Array.isArray(complements) && complements.length > 0;
            if (isContainerOnly) {
                complements.forEach(sub => itemsHtml += `<li><strong>${sub.quantity}x ${item.item_name} - ${sub.name}</strong></li>`);
            } else {
                itemsHtml += `<li><strong>${item.quantity}x ${item.item_name}</strong>`;
                if (Array.isArray(complements) && complements.length > 0) {
                    itemsHtml += '<ul class="order-details-sublist">';
                    complements.forEach(sub => itemsHtml += `<li>${isOneToOne ? sub.quantity : (sub.quantity * item.quantity)}x ${sub.name}</li>`);
                    itemsHtml += '</ul>';
                }
                itemsHtml += '</li>';
            }
        });
    } else {
        itemsHtml += '<li>Nenhum item encontrado.</li>';
    }
    itemsHtml += '</ul>';
    const escapeHTML = (str) => str ? str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)) : '';
    const observationsText = order.observations ? escapeHTML(order.observations).replace(/\n/g, '<br>') : 'Nenhuma';
    let financialDetailsHtml = order.delivery_fee > 0 ? `<p><strong>Subtotal:</strong> R$ ${parseFloat(order.subtotal).toFixed(2).replace('.', ',')}</p><p><strong>Taxa de Entrega:</strong> R$ ${parseFloat(order.delivery_fee).toFixed(2).replace('.', ',')}</p>` : '';
    financialDetailsHtml += `<p><strong>Total:</strong> R$ ${parseFloat(order.total_price).toFixed(2).replace('.', ',')}</p>`;
    body.innerHTML = `${itemsHtml}<h4>Informações do Cliente</h4><p><strong>Nome:</strong> ${order.client_name}</p><p><strong>Contacto:</strong> ${order.client_phone}</p><p><strong>Destino:</strong> ${order.client_address}</p><hr><h4>Preferências e Observações</h4><p><strong>Precisa de talher?</strong> ${order.needs_cutlery ? 'Sim' : 'Não'}</p><p><strong>Observações:</strong></p><p class="order-details-observation">${observationsText}</p><hr><h4>Financeiro</h4>${financialDetailsHtml}<p><strong>Pagamento:</strong> ${order.payment_method === 'online' ? 'Pago Online' : 'Pagar na Entrega/Retirada'}</p>`;
    modal.style.display = 'flex';
    modal.querySelector('.modal-close-btn').onclick = () => modal.style.display = 'none';
    modal.onclick = (e) => { if (e.target.id === 'order-details-modal-overlay') modal.style.display = 'none'; };
}

function setupModalEventListeners() {
    rejectReasonModal = document.getElementById('reject-reason-modal-overlay');
    rejectReasonForm = document.getElementById('reject-reason-form');
    rejectReasonSelect = document.getElementById('reject-reason-select');
    if (rejectReasonModal) {
        rejectReasonModal.querySelector('.modal-close-btn').addEventListener('click', closeRejectModal);
        rejectReasonModal.querySelector('.modal-cancel-btn').addEventListener('click', closeRejectModal);
        rejectReasonForm.addEventListener('submit', handleRejectSubmit);
    }
    driverRequestModal = document.getElementById('driver-request-modal-overlay');
    if (driverRequestModal) {
        driverRequestModal.querySelector('.modal-close-btn').addEventListener('click', closeDriverRequestModal);
        driverRequestModal.querySelector('.modal-cancel-btn').addEventListener('click', closeDriverRequestModal);
    }
}

function openRejectModal(orderId) {
    orderToRejectId = orderId;
    rejectReasonForm.reset();
    rejectReasonModal.style.display = 'flex';
}

function closeRejectModal() {
    orderToRejectId = null;
    rejectReasonModal.style.display = 'none';
}

async function handleRejectSubmit(e) {
    e.preventDefault();
    const reasonValue = rejectReasonSelect.value;
    const reasonText = rejectReasonSelect.options[rejectReasonSelect.selectedIndex].text;
    if (!reasonValue) return alert('Por favor, selecione um motivo.');
    await updateOrderStatus(orderToRejectId, 'Cancelado', { isRejectFlow: true, reason: reasonText });
    if (reasonValue === 'stock_problem') {
        document.getElementById('stock-alert-banner').style.display = 'block';
        document.querySelector('.sidebar').classList.add('navigation-locked');
    }
    closeRejectModal();
}

function openDriverRequestModal(orderId) {
    currentOrderForDriver = state.allOrdersCache.find(o => o.id === orderId);
    if (!currentOrderForDriver) return alert('Erro: Pedido não encontrado.');
    driverRequestGroupsList = document.getElementById('driver-request-groups-list');
    driverRequestGroupsList.innerHTML = '<p>A buscar grupos...</p>';
    driverRequestModal.style.display = 'flex';
    globalApiFetch('/bot/groups').then(groups => {
        driverRequestGroupsList.innerHTML = '';
        if (groups && groups.length > 0) {
            groups.forEach(group => {
                const btn = document.createElement('button');
                btn.className = 'btn btn-primary group-select-btn';
                btn.style.cssText = 'width: 100%; margin-bottom: 10px;';
                btn.textContent = group.name;
                btn.onclick = () => sendDriverRequest(group.id);
                driverRequestGroupsList.appendChild(btn);
            });
        } else {
            driverRequestGroupsList.innerHTML = '<p>Nenhum grupo de WhatsApp encontrado.</p>';
        }
    }).catch(error => driverRequestGroupsList.innerHTML = `<p style="color: var(--danger-color);">Erro: ${error.message}</p>`);
}

async function sendDriverRequest(groupId) {
    const order = currentOrderForDriver;
    if (!order) return;
    try {
        driverRequestGroupsList.innerHTML = '<p>Enviando solicitação...</p>';
        await globalApiFetch('/bot/request-driver', { method: 'POST', body: JSON.stringify({ groupId, orderId: order.id }) });
        closeDriverRequestModal();
        showCustomConfirm('Solicitação enviada com sucesso!', () => {}, 'btn-primary', 'OK');
    } catch (error) {
        alert(`Erro ao enviar a solicitação: ${error.message}`);
        closeDriverRequestModal();
    }
}

function closeDriverRequestModal() {
    if (driverRequestModal) driverRequestModal.style.display = 'none';
    currentOrderForDriver = null;
}

export function showHumanHandoverAlert({ contactId, type }) {
    if (handoverAlertTimeout) clearTimeout(handoverAlertTimeout);
    const modal = document.getElementById('handover-alert-overlay');
    const message = document.getElementById('handover-alert-message');
    const confirmBtn = document.getElementById('handover-confirm-btn');
    const phoneNumber = contactId.replace('@c.us', '');
    message.textContent = `Um ${type} (${phoneNumber}) solicitou atendimento no WhatsApp.`;
    handoverAlertTimeout = setTimeout(() => {
        modal.style.display = 'flex';
        playNotification('handover');
    }, 60 * 1000);
    confirmBtn.onclick = () => {
        clearTimeout(handoverAlertTimeout);
        handoverAlertTimeout = null;
        stopNotification();
        modal.style.display = 'none';
        window.open(`https://wa.me/${phoneNumber}`, '_blank');
    };
}

window.updateOrderStatusWrapper = updateOrderStatus;
window.openDriverRequestModal = openDriverRequestModal;