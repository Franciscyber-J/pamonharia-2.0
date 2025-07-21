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
    
    document.getElementById('product-form').addEventListener('submit', saveProduct);
    document.getElementById('product-cancel-button').addEventListener('click', closeProductModal);
    document.getElementById('product-modal-close-btn').addEventListener('click', closeProductModal);
    document.getElementById('product-modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'product-modal-overlay') closeProductModal(); });
    document.getElementById('unlink-parent-btn').addEventListener('click', () => { 
        document.getElementById('parent-product-id').value = ''; 
        document.getElementById('parent-info-section').style.display = 'none'; 
        document.getElementById('addons-management-section').style.display = 'block'; 
    });
    document.getElementById('product-image-input').addEventListener('change', (e) => {
        const preview = document.getElementById('product-image-preview');
        const prompt = document.getElementById('product-upload-prompt');
        if (e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                preview.src = ev.target.result;
                prompt.style.display = 'none';
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });
}

function renderProdutosPageContent() {
    const tbody = document.getElementById('products-tbody');
    if (!tbody) return;

    const expanded = new Set(Array.from(tbody.querySelectorAll('.toggle-children-btn.expanded')).map(btn => btn.closest('.product-row')?.dataset.id));
    tbody.innerHTML = '';
    
    const mainProducts = state.allProducts.filter(p => p.is_main_product);
    mainProducts.forEach(p => {
        tbody.insertAdjacentHTML('beforeend', createProductRow(p));
        if (p.children?.length > 0) {
            p.children.forEach(c => {
                tbody.insertAdjacentHTML('beforeend', createProductRow(c, true, p.stock_sync_enabled));
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
    
    setupProductEventListeners(tbody);
    initSortable('products-tbody', '/products/reorder', globalApiFetch);
}

function renderComplementosPageContent() {
    const tbody = document.getElementById('complementos-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    state.allProductsFlat.filter(p => !p.is_main_product).forEach(item => {
        tbody.insertAdjacentHTML('beforeend', createProductRow(item, false));
    });
    
    setupProductEventListeners(tbody);
    initSortable('complementos-tbody', '/products/reorder', globalApiFetch);
}

export async function refreshCurrentProductView() {
    await fetchAllProducts();
    const activePageLink = document.querySelector('nav a.active');
    if (!activePageLink) return;

    const pageKey = activePageLink.id.split('-')[1];
    if (pageKey === 'produtos') {
        renderProdutosPageContent();
    } else if (pageKey === 'complementos') {
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

    return `
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
}

// --- LÓGICA DE EVENTOS E MANIPULAÇÃO ---

function setupProductEventListeners(tbody) {
    if (tbody.dataset.eventsAttached) return; // Previne múltiplos listeners
    tbody.dataset.eventsAttached = 'true';

    tbody.addEventListener('click', (event) => {
        const target = event.target;
        const row = target.closest('.product-row');
        if (!row) return;
        const productId = parseInt(row.dataset.id);

        if (target.classList.contains('toggle-children-btn')) {
            target.classList.toggle('expanded');
            document.querySelectorAll(`.product-row.is-child[data-parent-id='${productId}']`).forEach(childRow => {
                childRow.style.display = childRow.style.display === 'table-row' ? 'none' : 'table-row';
            });
        }
        
        if (target.classList.contains('btn-actions-menu')) {
            event.stopPropagation();
            const menu = target.nextElementSibling;
            document.querySelectorAll('.actions-menu.visible').forEach(openMenu => {
                if (openMenu !== menu) openMenu.classList.remove('visible');
            });
            menu.classList.toggle('visible');
        }

        if (target.closest('.actions-menu a')) {
            event.preventDefault();
            if (target.classList.contains('edit-product')) openProductModal(productId);
            if (target.classList.contains('duplicate-product')) duplicateProduct(productId);
            if (target.classList.contains('delete-product')) deleteProduct(productId);
        }
        
        if (target.classList.contains('btn-status-toggle')) {
            const currentStatus = state.allProductsFlat.find(p => p.id === productId)?.status;
            toggleProductStatus(productId, !currentStatus);
        }
        if (target.classList.contains('stock-decrease')) handleStockAdjust(target, -1);
        if (target.classList.contains('stock-increase')) handleStockAdjust(target, 1);
        if (target.classList.contains('stock-save-btn')) handleStockSave(target);
    });

    tbody.addEventListener('change', (event) => {
        const target = event.target;
        if (target.classList.contains('stock-enabled-toggle')) handleStockEnableToggle(target);
        if (target.classList.contains('stock-sync-toggle')) handleStockSyncToggle(target);
    });

    tbody.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target.classList.contains('stock-input')) {
            event.preventDefault();
            handleStockSave(event.target);
            event.target.blur();
        }
    });
}

function openProductModal(id = null, isMainProduct = true) {
    const modal = document.getElementById('product-modal-overlay');
    const form = document.getElementById('product-form');
    form.reset();
    document.getElementById('product-id').value = '';
    document.getElementById('product-image-url').value = '';
    document.getElementById('parent-product-id').value = '';
    document.getElementById('is-main-product-flag').value = isMainProduct;
    document.getElementById('product-image-preview').src = PLACEHOLDER_IMG_200;
    document.getElementById('product-upload-prompt').style.display = 'block';
    
    const parentInfo = document.getElementById('parent-info-section');
    const addonsMgmt = document.getElementById('addons-management-section');
    parentInfo.style.display = 'none';

    let currentProduct = null;
    if (id) {
        currentProduct = state.allProductsFlat.find(p => p.id === id);
        if (!currentProduct) return;
        
        document.getElementById('product-modal-title').textContent = 'Editar Item';
        document.getElementById('product-id').value = currentProduct.id;
        document.getElementById('product-name').value = currentProduct.name;
        document.getElementById('product-description').value = currentProduct.description || '';
        document.getElementById('product-price').value = parseFloat(currentProduct.price).toFixed(2);
        document.getElementById('product-status').value = String(currentProduct.status);
        document.getElementById('force-one-to-one-complement').checked = currentProduct.force_one_to_one_complement;
        document.getElementById('sell-parent-product').checked = currentProduct.sell_parent_product;
        document.getElementById('is-main-product-flag').value = currentProduct.is_main_product;
        document.getElementById('parent-product-id').value = currentProduct.parent_product_id || '';
        
        if (currentProduct.image_url) {
            document.getElementById('product-image-preview').src = currentProduct.image_url;
            document.getElementById('product-image-url').value = currentProduct.image_url;
            document.getElementById('product-upload-prompt').style.display = 'none';
        }
        
        if (currentProduct.parent_product_id) {
            const parent = state.allProductsFlat.find(p => p.id === currentProduct.parent_product_id);
            document.getElementById('parent-product-name').textContent = parent?.name || 'Desconhecido';
            parentInfo.style.display = 'flex';
            addonsMgmt.style.display = 'none';
        } else {
            addonsMgmt.style.display = currentProduct.is_main_product ? 'block' : 'none';
        }
    } else {
        document.getElementById('product-modal-title').textContent = isMainProduct ? 'Adicionar Novo Produto Principal' : 'Adicionar Novo Item de Complemento';
        addonsMgmt.style.display = isMainProduct ? 'block' : 'none';
        document.getElementById('sell-parent-product').checked = true;
        document.getElementById('force-one-to-one-complement').checked = false;
    }
    
    const addonsList = document.getElementById('addons-list');
    addonsList.innerHTML = '';
    const parentWithChildren = state.allProducts.find(p => p.id === id);
    const linkedIds = new Set((parentWithChildren?.children || []).map(c => c.id));
    const potentialAddons = state.allProductsFlat.filter(p => !p.is_main_product);
    potentialAddons.forEach(p => {
        addonsList.innerHTML += `<div class="addon-item"><label class="addon-item-name"><input type="checkbox" data-addon-id="${p.id}" ${linkedIds.has(p.id) ? 'checked' : ''}><span>${p.name}</span></label></div>`;
    });
    
    const sellToggle = document.getElementById('sell-parent-product');
    const priceInput = document.getElementById('product-price');
    const handleSellChange = () => { priceInput.disabled = !sellToggle.checked; };
    sellToggle.removeEventListener('change', handleSellChange);
    sellToggle.addEventListener('change', handleSellChange);
    handleSellChange();
    
    modal.style.display = 'flex';
}

function closeProductModal() {
    document.getElementById('product-modal-overlay').style.display = 'none';
}

async function saveProduct(e) {
    e.preventDefault();
    const btn = document.getElementById('save-product-button');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    let imageUrl = document.getElementById('product-image-url').value;
    const input = document.getElementById('product-image-input');

    if (input.files[0]) {
        try {
            const { timestamp, signature } = await globalApiFetch('/cloudinary-signature');
            const fd = new FormData();
            fd.append('file', input.files[0]);
            fd.append('api_key', '351266855176353');
            fd.append('timestamp', timestamp);
            fd.append('signature', signature);
            const res = await fetch(`https://api.cloudinary.com/v1_1/dznox4s9b/image/upload`, { method: 'POST', body: fd });
            const data = await res.json();
            if (data.secure_url) {
                imageUrl = data.secure_url;
            } else {
                throw new Error(data.error?.message || 'Falha no upload');
            }
        } catch (error) {
            alert('Erro ao fazer upload da imagem.');
            btn.disabled = false;
            btn.textContent = 'Salvar';
            return;
        }
    }

    const id = document.getElementById('product-id').value;
    const children = Array.from(document.querySelectorAll('#addons-list input:checked')).map(cb => ({ id: parseInt(cb.dataset.addonId) }));
    const price = parseFloat(document.getElementById('product-price').value) || 0;
    const data = {
        name: document.getElementById('product-name').value,
        description: document.getElementById('product-description').value,
        price,
        status: document.getElementById('product-status').value === 'true',
        image_url: imageUrl,
        force_one_to_one_complement: document.getElementById('force-one-to-one-complement').checked,
        sell_parent_product: document.getElementById('sell-parent-product').checked,
        parent_product_id: document.getElementById('parent-product-id').value || null,
        is_main_product: document.getElementById('is-main-product-flag').value === 'true',
        children
    };

    try {
        await globalApiFetch(id ? `/products/${id}` : '/products', {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(data)
        });
        closeProductModal();
        await refreshCurrentProductView();
    } catch (error) {
        alert('Falha ao salvar o produto.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar';
    }
}

function deleteProduct(id) {
    showCustomConfirm('Tem a certeza de que deseja apagar este item? Esta ação não pode ser desfeita.', async () => {
        try {
            await globalApiFetch(`/products/${id}`, { method: 'DELETE' });
            await refreshCurrentProductView();
        } catch (error) {
            alert('Não foi possível apagar o item.');
        }
    });
}

function duplicateProduct(id) {
    showCustomConfirm('Tem a certeza de que deseja duplicar este item?', async () => {
        try {
            await globalApiFetch(`/products/${id}/duplicate`, { method: 'POST' });
            await refreshCurrentProductView();
        } catch (error) {
            console.error('Falha ao duplicar item:', error);
            alert('Não foi possível duplicar o item.');
        }
    }, 'btn-primary', 'Duplicar');
}

async function toggleProductStatus(productId, newStatus) {
    setState({ isProgrammaticallyUpdating: true });
    try {
        await globalApiFetch(`/products/${productId}`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        await refreshCurrentProductView();
    } catch (error) {
        console.error(`Falha ao atualizar o status do produto ${productId}:`, error);
        alert('Não foi possível atualizar o status do produto. A recarregar a lista para garantir a consistência.');
        await refreshCurrentProductView();
    } finally {
        setTimeout(() => { setState({ isProgrammaticallyUpdating: false }); }, 500);
    }
}

function handleStockAdjust(button, amount) {
    const stockInput = button.closest('.stock-controls').querySelector('.stock-input');
    if (stockInput && !stockInput.disabled) {
        let value = parseInt(stockInput.value) || 0;
        stockInput.value = Math.max(0, value + amount);
    }
}

async function handleStockSave(element) {
    const row = element.closest('.product-row');
    const stockInput = row.querySelector('.stock-input');
    const productId = parseInt(row.dataset.id);
    const feedbackSpan = row.querySelector('.stock-feedback');
    if (!stockInput || stockInput.disabled || !feedbackSpan) return;

    feedbackSpan.classList.remove('show', 'success', 'error');
    feedbackSpan.textContent = 'Salvando...';
    feedbackSpan.classList.add('show');

    try {
        await globalApiFetch(`/products/${productId}/stock`, {
            method: 'PATCH',
            body: JSON.stringify({ stock_quantity: parseInt(stockInput.value) })
        });
        feedbackSpan.textContent = 'Salvo!';
        feedbackSpan.classList.add('success');
    } catch (error) {
        feedbackSpan.textContent = 'Falhou!';
        feedbackSpan.classList.add('error');
    } finally {
        setTimeout(() => {
            feedbackSpan.classList.remove('show', 'success', 'error');
        }, 3000);
    }
}

async function handleStockEnableToggle(checkbox) {
    const row = checkbox.closest('.product-row');
    const productId = row.dataset.id;
    const isEnabled = checkbox.checked;
    row.querySelectorAll('.stock-input, .stock-btn, .stock-save-btn').forEach(el => {
        if (!el.classList.contains('stock-enabled-toggle')) {
            el.disabled = !isEnabled;
        }
    });
    await globalApiFetch(`/products/${productId}/stock`, { method: 'PATCH', body: JSON.stringify({ stock_enabled: isEnabled }) });
}

async function handleStockSyncToggle(checkbox) {
    const row = checkbox.closest('.product-row');
    const id = row.dataset.id;
    const enabled = checkbox.checked;
    try {
        await globalApiFetch(`/products/${id}`, { method: 'PUT', body: JSON.stringify({ stock_sync_enabled: enabled }) });
        await refreshCurrentProductView();
    } catch (error) {
        console.error(`Falha ao atualizar a sincronização de estoque para o produto ${id}:`, error);
        alert('Não foi possível atualizar a configuração de sincronização.');
        checkbox.checked = !enabled;
    }
}