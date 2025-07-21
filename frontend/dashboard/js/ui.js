// frontend/dashboard/js/ui.js

export function initSortable(tbodyId, endpoint, apiFetch) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    new Sortable(tbody, {
        handle: '.drag-handle',
        animation: 150,
        filter: '.is-child',
        onMove: (evt) => {
            return !evt.related.classList.contains('is-child');
        },
        onEnd: async (evt) => {
            const ids = Array.from(tbody.querySelectorAll('tr:not(.is-child)')).map(row => row.dataset.id);
            try {
                await apiFetch(endpoint, {
                    method: 'POST',
                    body: JSON.stringify({ orderedIds: ids })
                });
            } catch (error) {
                alert('Não foi possível salvar a nova ordem. A página será recarregada.');
                location.reload();
            }
        }
    });
}

export function showCustomConfirm(message, onConfirm, confirmClass = 'btn-danger', confirmText = 'Confirmar') {
    const modal = document.getElementById('confirm-modal-overlay');
    const msg = document.getElementById('confirm-modal-message');
    const confirmBtn = document.getElementById('confirm-modal-confirm');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    msg.textContent = message;
    confirmBtn.textContent = confirmText;
    confirmBtn.className = `btn ${confirmClass}`;
    
    // Clonar para remover event listeners antigos
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
    
    newBtn.onclick = () => {
        onConfirm();
        modal.style.display = 'none';
    };
    cancelBtn.onclick = () => {
        modal.style.display = 'none';
    };
    modal.style.display = 'flex';
}

export const PLACEHOLDER_IMG_60 = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%2260%22%20height%3D%2260%22%20fill%3D%22%232d3748%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22Poppins%2C%20sans-serif%22%20font-size%3D%229%22%20fill%3D%22%2394A3B8%22%20dy%3D%22.3em%22%20text-anchor%3D%22middle%22%3ESem%20Foto%3C%2Ftext%3E%3C%2Fsvg%3E';
export const PLACEHOLDER_IMG_200 = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22200%22%20height%3D%22200%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%232d3748%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22Poppins%2C%20sans-serif%22%20font-size%3D%2214%22%20fill%3D%22%2394A3B8%22%20dy%3D%22.3em%22%20text-anchor%3D%22middle%22%3ESelecionar%20Imagem%3C%2Ftext%3E%3C%2Fsvg%3E';