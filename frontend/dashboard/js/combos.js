// frontend/dashboard/js/combos.js
import { globalApiFetch } from './api.js';
import { state } from './main.js';
import { initSortable, showCustomConfirm, PLACEHOLDER_IMG_60, PLACEHOLDER_IMG_200 } from './ui.js';

let allCombos = [];

export function renderCombosPage() {
    document.getElementById('page-title').textContent = 'Gestão de Combos';
    document.getElementById('dashboard-content').innerHTML = `
        <div class="page-header">
            <h2>Todos os Combos</h2>
            <button id="add-combo-btn" class="btn btn-primary">Criar Combo</button>
        </div>
        <p style="opacity: 0.7; margin-bottom: 20px;">Arraste e solte as linhas pela alça (⠿) para reordenar a exibição no cardápio.</p>
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 40px;"></th>
                    <th>Combo</th>
                    <th>Preço Base</th>
                    <th>Itens</th>
                    <th>Status</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody id="combos-tbody"></tbody>
        </table>`;
    
    document.getElementById('add-combo-btn').addEventListener('click', () => openComboModal());
    document.getElementById('combo-form').addEventListener('submit', saveCombo);
    document.getElementById('combo-cancel-button').addEventListener('click', closeComboModal);
    document.getElementById('combo-modal-close-btn').addEventListener('click', closeComboModal);
    document.getElementById('combo-modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'combo-modal-overlay') closeComboModal(); });
    document.getElementById('combo-image-input').addEventListener('change', (e) => {
        const preview = document.getElementById('combo-image-preview');
        const prompt = document.getElementById('combo-upload-prompt');
        if (e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                preview.src = ev.target.result;
                prompt.style.display = 'none';
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });

    fetchAndRenderCombos();
}

async function fetchAndRenderCombos() {
    try {
        allCombos = await globalApiFetch('/combos');
        const tbody = document.getElementById('combos-tbody');
        tbody.innerHTML = '';
        allCombos.forEach(c => {
            const itemNames = c.products.map(p => p.name).join(', ');
            tbody.innerHTML += `
                <tr data-id="${c.id}">
                    <td><span class="drag-handle">⠿</span></td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <img src="${c.image_url || PLACEHOLDER_IMG_60}" alt="${c.name}" class="product-image-thumbnail">
                            <span>${c.name}</span>
                        </div>
                    </td>
                    <td>R$ ${parseFloat(c.price).toFixed(2).replace('.', ',')}</td>
                    <td>${itemNames || 'Nenhum'}</td>
                    <td><span class="status-badge ${c.status ? 'active' : 'inactive'}">${c.status ? 'Ativo' : 'Inativo'}</span></td>
                    <td class="action-buttons-cell">
                        <div class="actions-container">
                            <button class="btn-icon btn-actions-menu">⋮</button>
                            <div class="actions-menu">
                                <a href="#" class="edit-combo">Editar</a>
                                <a href="#" class="danger delete-combo">Apagar</a>
                            </div>
                        </div>
                    </td>
                </tr>`;
        });
        setupComboEventListeners(tbody);
        initSortable('combos-tbody', '/combos/reorder', globalApiFetch);
    } catch (error) {
        console.error("Erro ao buscar combos:", error);
    }
}

// #################### INÍCIO DA CORREÇÃO ####################
// ARQUITETO: Implementada a delegação de eventos para os botões da tabela de combos.
function setupComboEventListeners(tbody) {
    if (tbody.dataset.eventsAttached) return;
    tbody.dataset.eventsAttached = 'true';

    tbody.addEventListener('click', (event) => {
        const target = event.target;
        
        if (target.classList.contains('btn-actions-menu')) {
            event.stopPropagation();
            const menu = target.nextElementSibling;
            document.querySelectorAll('.actions-menu.visible').forEach(openMenu => {
                if (openMenu !== menu) openMenu.classList.remove('visible');
            });
            menu.classList.toggle('visible');
        }

        const actionLink = target.closest('.actions-menu a');
        if (actionLink) {
            event.preventDefault();
            const row = actionLink.closest('tr');
            const comboId = parseInt(row.dataset.id);

            if (actionLink.classList.contains('edit-combo')) {
                openComboModal(comboId);
            } else if (actionLink.classList.contains('delete-combo')) {
                deleteCombo(comboId);
            }
        }
    });
}
// ##################### FIM DA CORREÇÃO ######################

function openComboModal(id = null) {
    const modal = document.getElementById('combo-modal-overlay');
    const form = document.getElementById('combo-form');
    form.reset();
    document.getElementById('combo-id').value = '';
    document.getElementById('combo-image-url').value = '';
    document.getElementById('combo-image-preview').src = PLACEHOLDER_IMG_200;
    document.getElementById('combo-upload-prompt').style.display = 'block';
    const listDiv = document.getElementById('combo-products-list');
    listDiv.innerHTML = 'Carregando...';

    const setupModal = (comboData) => {
        document.getElementById('total-items-limit').value = comboData.total_items_limit;
        const freeChoice = document.getElementById('allow-free-choice');
        freeChoice.checked = comboData.allow_free_choice;

        const productMap = new Map((comboData.products || []).map(p => [p.product_id, { quantity: p.quantity_in_combo, modifier: p.price_modifier || '0.00' }]));
        listDiv.innerHTML = `<div class="combo-product-item-header"><span>Produto</span><span class="quantity-header">Qtd. no Combo</span><span>Ajuste de Preço (R$)</span></div>`;
        
        state.allProductsFlat.forEach(p => {
            const info = productMap.get(p.id);
            const isChecked = !!info;
            const qty = info ? info.quantity : 1;
            const mod = info ? parseFloat(info.modifier).toFixed(2) : '0.00';
            listDiv.innerHTML += `
                <div class="combo-product-item">
                    <label class="combo-product-name"><input type="checkbox" data-product-id="${p.id}" ${isChecked ? 'checked' : ''}> ${p.name}</label>
                    <input type="number" class="input-field quantity-in-combo" min="1" value="${qty}" ${!isChecked ? 'disabled' : ''}>
                    <input type="number" step="0.01" class="input-field price-modifier" value="${mod}" ${!isChecked ? 'disabled' : ''}>
                </div>`;
        });

        const validator = document.getElementById('combo-quantity-validator');
        const saveBtn = document.getElementById('save-combo-button');

        const validate = () => {
            if (freeChoice.checked) {
                validator.style.display = 'none';
                saveBtn.disabled = false;
                return;
            }
            validator.style.display = 'block';
            const limit = parseInt(document.getElementById('total-items-limit').value) || 0;
            let total = 0;
            listDiv.querySelectorAll('.combo-product-item input:checked').forEach(cb => {
                total += parseInt(cb.closest('.combo-product-item').querySelector('.quantity-in-combo').value) || 0;
            });
            
            validator.textContent = `Total de itens: ${total} / ${limit}`;
            saveBtn.disabled = total !== limit;
            validator.className = total === limit ? 'combo-quantity-validator valid' : 'combo-quantity-validator invalid';
        };

        const toggleInputs = () => {
            const isFree = freeChoice.checked;
            listDiv.querySelector('.quantity-header').style.display = isFree ? 'none' : 'block';
            listDiv.querySelectorAll('.combo-product-item').forEach(row => {
                const cb = row.querySelector('input[type="checkbox"]');
                const qtyInput = row.querySelector('.quantity-in-combo');
                qtyInput.style.display = isFree ? 'none' : 'block';
                if (cb.checked) {
                    qtyInput.disabled = isFree;
                }
            });
            validate();
        };

        freeChoice.addEventListener('change', toggleInputs);
        document.getElementById('total-items-limit').addEventListener('input', validate);
        listDiv.querySelectorAll('input').forEach(el => el.addEventListener('input', validate));
        listDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const row = e.target.closest('.combo-product-item');
                row.querySelector('.price-modifier').disabled = !e.target.checked;
                row.querySelector('.quantity-in-combo').disabled = !e.target.checked || freeChoice.checked;
                validate();
            });
        });
        
        toggleInputs();
    };

    if (id) {
        document.getElementById('combo-modal-title').textContent = 'Editar Combo';
        const comboData = allCombos.find(c => c.id === id);
        if (comboData) {
            document.getElementById('combo-id').value = comboData.id;
            document.getElementById('combo-name').value = comboData.name;
            document.getElementById('combo-description').value = comboData.description;
            document.getElementById('combo-price').value = parseFloat(comboData.price).toFixed(2);
            document.getElementById('combo-status').value = String(comboData.status);
            if (comboData.image_url) {
                document.getElementById('combo-image-url').value = comboData.image_url;
                document.getElementById('combo-image-preview').src = comboData.image_url;
                document.getElementById('combo-upload-prompt').style.display = 'none';
            }
            setupModal(comboData);
        }
    } else {
        document.getElementById('combo-modal-title').textContent = 'Adicionar Novo Combo';
        setupModal({ products: [], total_items_limit: 1, allow_free_choice: true });
    }
    
    modal.style.display = 'flex';
}

function closeComboModal() {
    document.getElementById('combo-modal-overlay').style.display = 'none';
}

async function saveCombo(e) {
    e.preventDefault();
    const btn = document.getElementById('save-combo-button');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    let imageUrl = document.getElementById('combo-image-url').value;
    const input = document.getElementById('combo-image-input');

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
            alert('Erro ao fazer upload da imagem do combo.');
            btn.disabled = false;
            btn.textContent = 'Salvar Combo';
            return;
        }
    }

    const id = document.getElementById('combo-id').value;
    const products = Array.from(document.querySelectorAll('#combo-products-list input:checked')).map(cb => {
        const row = cb.closest('.combo-product-item');
        const qty = document.getElementById('allow-free-choice').checked ? 1 : (parseInt(row.querySelector('.quantity-in-combo').value) || 1);
        return {
            id: parseInt(cb.dataset.productId),
            quantity_in_combo: qty,
            price_modifier: parseFloat(row.querySelector('.price-modifier').value) || 0
        };
    });

    const data = {
        name: document.getElementById('combo-name').value,
        description: document.getElementById('combo-description').value,
        price: parseFloat(document.getElementById('combo-price').value),
        status: document.getElementById('combo-status').value === 'true',
        image_url: imageUrl,
        products,
        total_items_limit: parseInt(document.getElementById('total-items-limit').value),
        allow_free_choice: document.getElementById('allow-free-choice').checked
    };

    try {
        await globalApiFetch(id ? `/combos/${id}` : '/combos', {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(data)
        });
        closeComboModal();
        await fetchAndRenderCombos();
    } catch (error) {
        alert('Falha ao salvar o combo.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar Combo';
    }
}

function deleteCombo(id) {
    showCustomConfirm('Tem a certeza de que deseja apagar este combo?', async () => {
        try {
            await globalApiFetch(`/combos/${id}`, { method: 'DELETE' });
            await fetchAndRenderCombos();
        } catch (error) {
            console.error('Erro ao apagar combo:', error);
            alert('Não foi possível apagar o combo.');
        }
    });
}