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

export function updateSoundStatusButton() {
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

    // #################### INÍCIO DA CORREÇÃO ####################
    // ARQUITETO: Movemos a inicialização dos event listeners para aqui,
    // garantindo que os elementos do modal já existem no DOM.
    setupModalEventListeners();
    // ##################### FIM DA CORREÇÃO ######################

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
                complements.forEach(sub => {
                    const combinedName = `${item.item_name} - ${sub.name}`;
                    itemsHtml += `<li><strong>${sub.quantity}x ${combinedName}</strong></li>`;
                });
            } else {
                itemsHtml += `<li><strong>${item.quantity}x ${item.item_name}</strong>`;
                if (Array.isArray(complements) && complements.length > 0) {
                    itemsHtml += '<ul class="order-details-sublist">';
                    complements.forEach(sub => {
                        const finalQuantity = isOneToOne ? sub.quantity : (sub.quantity * item.quantity);
                        itemsHtml += `<li>${finalQuantity}x ${sub.name}</li>`;
                    });
                    itemsHtml += '</ul>';
                }
                itemsHtml += '</li>';
            }
        });
    } else {
        itemsHtml += '<li>Nenhum item encontrado.</li>';
    }
    itemsHtml += '</ul>';
    
    const escapeHTML = (str) => str ? str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;',
            "'": '&#39;', '"': '&quot;'
        }[tag] || tag)
    ) : '';
    
    const observationsText = order.observations ? escapeHTML(order.observations).replace(/\n/g, '<br>') : 'Nenhuma';
    
    let financialDetailsHtml = '';
    if (order.delivery_fee && order.delivery_fee > 0) {
        financialDetailsHtml = `
            <p><strong>Subtotal:</strong> R$ ${parseFloat(order.subtotal).toFixed(2).replace('.', ',')}</p>
            <p><strong>Taxa de Entrega:</strong> R$ ${parseFloat(order.delivery_fee).toFixed(2).replace('.', ',')}</p>
            <p><strong>Total:</strong> R$ ${parseFloat(order.total_price).toFixed(2).replace('.', ',')}</p>
        `;
    } else {
        financialDetailsHtml = `<p><strong>Total:</strong> R$ ${parseFloat(order.total_price).toFixed(2).replace('.', ',')}</p>`;
    }

    const clientInfoHtml = `
        <h4>Informações do Cliente</h4>
        <p><strong>Nome:</strong> ${order.client_name}</p>
        <p><strong>Contacto:</strong> ${order.client_phone}</p>
        <p><strong>Destino:</strong> ${order.client_address}</p>
        <hr>
        <h4>Preferências e Observações</h4>
        <p><strong>Precisa de talher?</strong> ${order.needs_cutlery ? 'Sim' : 'Não'}</p>
        <p><strong>Observações:</strong></p>
        <p class="order-details-observation">${observationsText}</p>
        <hr>
        <h4>Financeiro</h4>
        ${financialDetailsHtml}
        <p><strong>Pagamento:</strong> ${order.payment_method === 'online' ? 'Pago Online' : 'Pagar na Entrega/Retirada'}</p>
    `;

    body.innerHTML = itemsHtml + clientInfoHtml;
    modal.style.display = 'flex';

    modal.querySelector('.modal-close-btn').onclick = () => modal.style.display = 'none';
    modal.onclick = (e) => {
        if (e.target.id === 'order-details-modal-overlay') {
            modal.style.display = 'none';
        }
    };
}

let driverRequestModal, driverRequestGroupsList, currentOrderForDriver;

function setupModalEventListeners() {
    driverRequestModal = document.getElementById('driver-request-modal-overlay');
    driverRequestGroupsList = document.getElementById('driver-request-groups-list');
    
    if (driverRequestModal) {
        driverRequestModal.querySelector('.modal-close-btn').addEventListener('click', closeDriverRequestModal);
        driverRequestModal.querySelector('.modal-cancel-btn').addEventListener('click', closeDriverRequestModal);
    }
}

function openDriverRequestModal(orderId) {
    currentOrderForDriver = state.allOrdersCache.find(o => o.id === orderId);
    if (!currentOrderForDriver) {
        alert('Erro: Pedido não encontrado.');
        return;
    }

    driverRequestGroupsList.innerHTML = '<p>A buscar grupos...</p>';
    driverRequestModal.style.display = 'flex';

    globalApiFetch('/bot/groups').then(groups => {
        if (groups && groups.length > 0) {
            driverRequestGroupsList.innerHTML = '';
            groups.forEach(group => {
                const groupButton = document.createElement('button');
                groupButton.className = 'btn btn-primary group-select-btn';
                groupButton.style.width = '100%';
                groupButton.style.marginBottom = '10px';
                groupButton.textContent = group.name;
                groupButton.onclick = () => sendDriverRequest(group.id);
                driverRequestGroupsList.appendChild(groupButton);
            });
        } else {
            driverRequestGroupsList.innerHTML = '<p>Nenhum grupo de WhatsApp encontrado. Verifique se o bot está em algum grupo.</p>';
        }
    }).catch(error => {
        driverRequestGroupsList.innerHTML = `<p style="color: var(--danger-color);">Erro ao buscar grupos: ${error.message}</p>`;
    });
}

async function sendDriverRequest(groupId) {
    const order = currentOrderForDriver;
    if (!order) return;

    let message = `🏍️ *SOLICITAÇÃO DE ENTREGA* 🏍️\n\n`;
    message += `*Pedido:* #${order.id}\n`;
    message += `*Cliente:* ${order.client_name}\n`;
    message += `*Endereço:* ${order.client_address}\n\n`;
    message += `*Valor Total:* R$ ${parseFloat(order.total_price).toFixed(2).replace('.', ',')}\n`;
    
    let paymentInfo = `Pagamento: *Pagar na Entrega/Retirada*`;
    if (order.payment_method === 'online') {
        paymentInfo = `Pagamento: *JÁ PAGO* (Online)`;
    }
    message += `${paymentInfo}`;

    try {
        driverRequestGroupsList.innerHTML = '<p>Enviando solicitação...</p>';
        await globalApiFetch('/bot/request-driver', {
            method: 'POST',
            body: JSON.stringify({ groupId, message })
        });
        closeDriverRequestModal();
        showCustomConfirm(
            'Solicitação enviada!', 
            () => {},
            'btn-primary', 
            'OK'
        );
    } catch (error) {
        alert(`Erro ao enviar a solicitação: ${error.message}`);
        closeDriverRequestModal();
    }
}

function closeDriverRequestModal() {
    if (driverRequestModal) {
        driverRequestModal.style.display = 'none';
    }
    currentOrderForDriver = null;
}

// Wrappers para tornar funções acessíveis a partir do HTML
window.updateOrderStatusWrapper = updateOrderStatus;
window.openDriverRequestModal = openDriverRequestModal;