// frontend/dashboard/js/produtos.js
import { globalApiFetch } from './api.js';
import { state, setState } from './main.js';
import { initSortable, showCustomConfirm, PLACEHOLDER_IMG_60, PLACEHOLDER_IMG_200 } from './ui.js';

let allProducts = [];
let allProductsFlat = [];

export async function fetchAllProducts() {
    try {
        allProducts = await globalApiFetch('/products');
        allProductsFlat = flattenProductsWithParentInfo(allProducts);
        setState({ allProducts, allProductsFlat });
    } catch (error) {
        console.error("Não foi possível carregar os produtos.", error);
    }
}

function flattenProductsWithParentInfo(products) {
    let flatList = [];
    products.forEach(p => {
        const { children, ...parent } = p;
        flatList.push(parent);
        if (children?.length > 0) {
            flatList.push(...children.map(c => ({ ...c, parent_stock_sync_enabled: parent.stock_sync_enabled })));
        }
    });
    return flatList;
}

export function renderProdutosPage(isComplementosPage = false) {
    const pageTitle = document.getElementById('page-title');
    const dashboardContent = document.getElementById('dashboard-content');
    const { userRole } = state;

    if (isComplementosPage) {
        pageTitle.textContent = 'Itens de Complemento';
        dashboardContent.innerHTML = `
            <div class="page-header">
                <h2>Banco de Itens para Complemento</h2>
                <button id="add-complemento-btn" class="btn btn-primary">Adicionar Novo Item</button>
            </div>
            <p style="opacity: 0.7; margin-bottom: 20px;">Itens criados e gerenciados aqui. Podem ser vinculados a um Produto Principal para serem vendidos como opções.</p>
            <table class="data-table product-table">
                <thead><tr><th style="width: 40px;"></th><th>Item</th><th>Preço</th><th>Status</th><th>Estoque</th><th>Ações</th></tr></thead>
                <tbody id="complementos-tbody"></tbody>
            </table>`;
        document.getElementById('add-complemento-btn').addEventListener('click', () => openProductModal(null, false));
        renderComplementosPageContent();
    } else {
        pageTitle.textContent = 'Produtos e Estoque';
        const addButtonHtml = userRole === 'admin' ? `<button id="add-product-btn" class="btn btn-primary">Adicionar Produto Principal</button>` : '';
        dashboardContent.innerHTML = `
            <div class="page-header">
                <h2>Gestão de Produtos e Estoque</h2>
                ${addButtonHtml}
            </div>
            <p style="opacity: 0.7; margin-bottom: 20px;">Arraste e solte as linhas pela alça (⠿) para reordenar a exibição no cardápio.</p>
            <table class="data-table product-table">
                <thead><tr><th style="width: 40px;"></th><th>Produto</th><th>Preço</th><th>Status</th><th>Controle de Estoque</th><th>Ações</th></tr></thead>
                <tbody id="products-tbody"></tbody>
            </table>`;
        if (userRole === 'admin') {
            document.getElementById('add-product-btn').addEventListener('click', () => openProductModal(null, true));
        }
        renderProdutosPageContent();
    }
}

function renderProdutosPageContent() {
    const tbody = document.getElementById('products-tbody');
    if (!tbody) return;

    const expanded = new Set(Array.from(tbody.querySelectorAll('.toggle-children-btn.expanded')).map(btn => btn.closest('.product-row')?.dataset.id));
    tbody.innerHTML = '';
    
    const mainProducts = state.allProducts.filter(p => p.is_main_product);
    mainProducts.forEach(p => {
        tbody.innerHTML += createProductRow(p);
        if (p.children?.length > 0) {
            p.children.forEach(c => {
                tbody.innerHTML += createProductRow(c, true, p.stock_sync_enabled);
            });
        }
    });
    
    expanded.forEach(id => {
        const row = tbody.querySelector(`.product-row[data-id='${id}']`);
        const btn = row?.querySelector('.toggle-children-btn');
        if (btn) {
            btn.classList.add('expanded');
            document.querySelectorAll(`.product-row.is-child[data-parent-id='${id}']`).forEach(child => child.style.display = 'table-row');
        }
    });
    initSortable('products-tbody', '/products/reorder', globalApiFetch);
}

function renderComplementosPageContent() {
    const tbody = document.getElementById('complementos-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    state.allProductsFlat.filter(p => !p.is_main_product).forEach(item => {
        tbody.innerHTML += createProductRow(item, false);
    });
    initSortable('complementos-tbody', '/products/reorder', globalApiFetch);
}

export async function refreshCurrentProductView() {
    await fetchAllProducts();
    const page = document.querySelector('nav a.active')?.id.split('-')[1];
    if (page === 'produtos') {
        renderProdutosPageContent();
    } else if (page === 'complementos') {
        renderComplementosPageContent();
    }
}

function createProductRow(product, isChild = false, isSynced = false) {
    const { userRole } = state;
    const stock_quantity = product.stock_quantity ?? '';
    const isActuallyDisabled = (isChild && isSynced) || (!product.stock_enabled);
    const stock_controls_disabled = isActuallyDisabled ? 'disabled' : '';
    let parentControls = '';

    if (!isChild && product.is_main_product && product.sell_parent_product) {
        parentControls = `<div class="parent-controls"><label class="toggle-switch"><input type="checkbox" class="stock-sync-toggle" ${product.stock_sync_enabled ? 'checked' : ''}><span class="slider"></span></label><span>Sincronizar estoque com complementos</span></div>`;
    }

    const hasChildren = !isChild && product.children && product.children.length > 0;
    const toggleButton = hasChildren ? `<span class="toggle-children-btn">▶</span>` : '<span style="width: 14px; display: inline-block;"></span>';
    const dragHandle = userRole === 'admin' && !isChild ? '<td><span class="drag-handle">⠿</span></td>' : '<td></td>';
    const pausePlayButton = `<button class="btn-icon btn-status-toggle ${product.status ? 'paused' : 'playing'}" title="${product.status ? 'Pausar' : 'Ativar'}">${product.status ? '||' : '▶'}</button>`;
    
    let stockControlsCell = '';
    const isParentContainerOnly = !isChild && hasChildren && !product.sell_parent_product;

    if (isParentContainerOnly) {
        stockControlsCell = `<td style="font-size: 0.8rem; color: var(--text-secondary); font-style: italic; text-align: center; vertical-align: middle;">Gerenciado pelos<br>complementos</td>`;
    } else {
        stockControlsCell = `
            <td>
                <div class="stock-controls">
                    <label class="toggle-switch"><input type="checkbox" class="stock-enabled-toggle" ${product.stock_enabled ? 'checked' : ''}><span class="slider"></span></label>
                    <button class="stock-btn stock-decrease" ${stock_controls_disabled}>-</button>
                    <input type="number" class="input-field stock-input" value="${stock_quantity}" ${stock_controls_disabled}>
                    <button class="stock-btn stock-increase" ${stock_controls_disabled}>+</button>
                    <button class="btn btn-primary stock-save-btn" ${stock_controls_disabled}>Salvar</button>
                    <span class="stock-feedback"></span>
                    ${pausePlayButton}
                </div>
            </td>`;
    }

    const actionButtons = userRole === 'admin' ? `
        <div class="actions-container">
            <button class="btn-icon btn-actions-menu">⋮</button>
            <div class="actions-menu">
                <a href="#" class="edit-product">Editar</a>
                <a href="#" class="duplicate-product">Duplicar</a>
                <a href="#" class="danger delete-product">Apagar</a>
            </div>
        </div>` : '';

    const rowHtml = `
        <tr class="product-row ${isChild ? 'is-child' : ''}" data-id="${product.id}" data-parent-id="${product.parent_product_id || ''}">
            ${dragHandle}
            <td>
                <div class="product-name-cell">
                    ${toggleButton} 
                    ${isChild ? '<span class="child-indicator">↳</span>' : ''} 
                    <img src="${product.image_url || PLACEHOLDER_IMG_60}" alt="${product.name}" class="product-image-thumbnail">
                    <span>${product.name}</span>
                </div>
                ${parentControls}
            </td>
            <td>R$ ${parseFloat(product.price).toFixed(2).replace('.', ',')}</td>
            <td><span class="status-badge ${product.status ? 'active' : 'inactive'}">${product.status ? 'Ativo' : 'Inativo'}</span></td>
            ${stockControlsCell}
            <td class="action-buttons-cell">${actionButtons}</td>
        </tr>`;
        
    return rowHtml;
}


// ... (O restante das funções e a inicialização dos eventos estarão em `main.js` ou em módulos específicos)