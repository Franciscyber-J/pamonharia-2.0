// frontend/dashboard/js/main.js
import { API_BASE_URL_GLOBAL, globalApiFetch } from './api.js';
import { renderPedidosPage, setupAudio, stopNotification, updateSoundStatusButton, playNotification, showHumanHandoverAlert } from './pedidos.js';
import { renderProdutosPage, fetchAllProducts, refreshCurrentProductView } from './produtos.js';
import { renderCombosPage } from './combos.js';
import { renderConfiguracoesPage } from './configuracoes.js';

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// --- ESTADO GLOBAL E VARIÁVEIS ---
export const state = {
    userRole: sessionStorage.getItem('userRole'),
    allProducts: [],
    allProductsFlat: [],
    allOrdersCache: [],
    isProgrammaticallyUpdating: false,
    notificationAudio: null,
    isSoundEnabled: true,
    isAudioUnlocked: false,
};

export function setState(newState) {
    Object.assign(state, newState);
}

// --- INICIALIZAÇÃO DO SOCKET.IO ---
export const socket = io(API_BASE_URL_GLOBAL, { transports: ['websocket'] });

function setupSocketListeners() {
    socket.on('connect', () => console.log('[Dashboard] ✅ Socket.IO conectado.'));
    socket.on('disconnect', () => console.log('[Dashboard] 🔌 Socket.IO desconectado.'));
    socket.on('connect_error', (err) => console.error('[Dashboard] ❌ Erro de conexão Socket.IO:', err.message));
    
    const isPedidosPageActive = () => document.querySelector('.orders-panel');
    
    socket.on('new_order', async (order) => {
        if (isPedidosPageActive()) {
            state.allOrdersCache.unshift(order);
            const { addOrderCard } = await import('./pedidos.js');
            addOrderCard(order, true);
        }
        playNotification(order.id);
    });
    
    socket.on('order_status_updated', async (data) => {
        if (isPedidosPageActive()) {
            const index = state.allOrdersCache.findIndex(o => o.id === data.id);
            if (index !== -1) {
                state.allOrdersCache[index] = data.order;
            } else {
                state.allOrdersCache.unshift(data.order);
            }
            const { addOrderCard } = await import('./pedidos.js');
            addOrderCard(data.order, true);
        }
    });
    
    socket.on('history_cleared', async () => {
        if (isPedidosPageActive()) {
            const { fetchAndRenderOrders } = await import('./pedidos.js');
            fetchAndRenderOrders();
        }
    });
    
    socket.on('stock_update', async () => { 
        console.log('[Dashboard] 📥 Stock update recebido. Recarregando dados dos produtos para garantir consistência.');
        await refreshCurrentProductView();
    });
    
    socket.on('data_updated', async () => { 
        if (state.isProgrammaticallyUpdating) {
            setState({ isProgrammaticallyUpdating: false });
            return;
        }
        await refreshCurrentProductView();
    });

    // ARQUITETO: Novo listener para o evento de atendimento humano.
    socket.on('human_handover_request', (data) => {
        console.log('[Dashboard] 🔔 Recebido pedido de atendimento humano:', data);
        showHumanHandoverAlert(data);
    });
}

// --- NAVEGAÇÃO E RENDERIZAÇÃO DE PÁGINAS ---
const navLinks = {
    pedidos: document.getElementById('nav-pedidos'),
    produtos: document.getElementById('nav-produtos'),
    complementos: document.getElementById('nav-complementos'),
    combos: document.getElementById('nav-combos'),
    configuracoes: document.getElementById('nav-configuracoes')
};

const pages = {
    pedidos: renderPedidosPage,
    produtos: renderProdutosPage,
    complementos: () => renderProdutosPage(true),
    combos: renderCombosPage,
    configuracoes: renderConfiguracoesPage
};

function handleNavigation(e) {
    e.preventDefault();
    const pageKey = e.currentTarget.id.split('-')[1];
    const sidebar = document.querySelector('.sidebar');

    if (sidebar.classList.contains('navigation-locked') && pageKey !== 'produtos') return;
    if (pageKey === 'produtos') {
        document.getElementById('stock-alert-banner').style.display = 'none';
        sidebar.classList.remove('navigation-locked');
    }

    document.querySelector('nav a.active')?.classList.remove('active');
    e.currentTarget.classList.add('active');
    
    if (pages[pageKey]) {
        pages[pageKey]();
    }
}

// --- FUNÇÕES GERAIS E INICIALIZAÇÃO ---
function applyRolePermissions() {
    if (state.userRole === 'operador') {
        navLinks.complementos.style.display = 'none';
        navLinks.combos.style.display = 'none';
        navLinks.configuracoes.style.display = 'none';
    }
}

async function renderHeaderControls() {
    if (state.userRole === 'admin' || state.userRole === 'operador') {
        const container = document.getElementById('store-status-override-container');
        container.innerHTML = `<div id="status-buttons" class="status-buttons"><button type="button" data-status="true">Loja Aberta</button><button type="button" data-status="false">Loja Fechada</button><button type="button" data-status="null">Seguir Horário</button></div>`;
        
        const updateButtons = (currentStatus) => {
            container.querySelectorAll('button').forEach(button => {
                button.classList.remove('selected');
                if (String(button.dataset.status) === String(currentStatus)) {
                    button.classList.add('selected');
                }
            });
        };

        try {
            const config = await globalApiFetch('/dashboard/config');
            updateButtons(config.is_open_manual_override);
        } catch (error) {
            console.error("Falha ao buscar config do dashboard:", error);
        }

        container.addEventListener('click', async (e) => {
            if (e.target.tagName === 'BUTTON') {
                const override = e.target.dataset.status === 'null' ? null : e.target.dataset.status === 'true';
                await globalApiFetch('/settings/status', {
                    method: 'PATCH',
                    body: JSON.stringify({ is_open_manual_override: override })
                });
                updateButtons(override);
            }
        });
    }
}

async function initializeApp() {
    applyRolePermissions();
    renderHeaderControls();
    setupSocketListeners();
    
    document.addEventListener('click', (event) => {
        if (!event.target.classList.contains('btn-actions-menu')) {
            document.querySelectorAll('.actions-menu.visible').forEach(openMenu => {
                openMenu.classList.remove('visible');
            });
        }
    });

    await Promise.all([
        fetchAllProducts(),
        setupAudio()
    ]);
    
    Object.values(navLinks).forEach(link => link.addEventListener('click', handleNavigation));

    document.getElementById('logout-button').addEventListener('click', () => {
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('userRole');
        window.location.href = '/dashboard/login.html';
    });
    
    const openCardapioBtn = document.getElementById('open-cardapio-btn');
    const copyCardapioLinkBtn = document.getElementById('copy-cardapio-link-btn');
    const cardapioUrl = IS_LOCAL ? 'http://localhost:10000/cardapio' : 'https://pamonhariasaborosa.expertbr.com/cardapio';

    if (openCardapioBtn) openCardapioBtn.addEventListener('click', () => window.open(cardapioUrl, '_blank'));
    if (copyCardapioLinkBtn) {
        const icon = copyCardapioLinkBtn.innerHTML;
        copyCardapioLinkBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(cardapioUrl).then(() => {
                copyCardapioLinkBtn.innerHTML = '✅';
                setTimeout(() => { copyCardapioLinkBtn.innerHTML = icon; }, 2000);
            }).catch(err => console.error('Falha ao copiar: ', err));
        });
    }

    (navLinks.pedidos).click();
}

initializeApp();