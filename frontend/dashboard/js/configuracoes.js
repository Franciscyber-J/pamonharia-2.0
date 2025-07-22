// frontend/dashboard/js/configuracoes.js
import { globalApiFetch } from './api.js';
import { setupAudio } from './pedidos.js';
import { state } from './main.js'; // ARQUITETO: Importa o estado global para verificar a role do utilizador.

export function renderConfiguracoesPage() {
    document.getElementById('page-title').textContent = 'Configurações da Loja';

    // ARQUITETO: A renderização do campo de atendimento agora é condicional (apenas para admin).
    const handoverSoundSection = state.userRole === 'admin' ? `
        <div class="form-group" style="margin-top: 25px; border-top: 1px solid var(--border-color); padding-top: 25px;">
            <label for="handover_sound">Som de Atendimento Humano (MP3, WAV)</label>
            <input type="file" id="handover_sound" accept="audio/*">
            <div id="handover-sound-info-container" style="display: flex; align-items: center; gap: 15px; margin-top: 10px;">
                <p id="handover-sound-feedback"></p>
                <button type="button" id="remove-handover-sound-btn" style="display: none;" class="btn btn-danger">Remover</button>
            </div>
        </div>
        <div class="option-group">
            <label class="toggle-switch"><input type="checkbox" id="handover_notifications_enabled"><span class="slider"></span></label>
            <span>Ligar/Desligar notificações de atendimento no dashboard</span>
        </div>
    ` : '';

    document.getElementById('dashboard-content').innerHTML = `
        <form id="settings-form" class="settings-form">
            <div class="settings-card">
                <div class="card-header"><h3>Informações Gerais</h3></div>
                <div class="info-grid">
                    <div class="form-group"><label for="store_name">Nome da Loja</label><input type="text" id="store_name" class="input-field"></div>
                    <div class="form-group"><label for="whatsapp_number">Número do WhatsApp (com DDI, ex: 55629...)</label><input type="text" id="whatsapp_number" class="input-field"></div>
                    <div class="grid-col-span-2 form-group"><label for="address">Endereço</label><input type="text" id="address" class="input-field"></div>
                    <div class="form-group"><label for="location_link">Link Google Maps</label><input type="text" id="location_link" class="input-field"></div>
                </div>
            </div>
            <div class="settings-card">
                <div class="card-header"><h3>Financeiro</h3></div>
                <div class="form-group"><label for="delivery_fee">Taxa de Entrega (R$)</label><input type="number" id="delivery_fee" step="0.50" class="input-field"></div>
            </div>
            <div class="settings-card">
                <div class="card-header"><h3>Horários</h3></div>
                <div class="operating-hours-grid" id="hours-grid"></div>
            </div>
            <div class="settings-card">
                <div class="card-header"><h3>Notificações</h3></div>
                <div class="form-group">
                    <label for="notification_sound">Som de Novo Pedido (MP3, WAV)</label>
                    <input type="file" id="notification_sound" accept="audio/*">
                    <div id="sound-info-container" style="display: flex; align-items: center; gap: 15px; margin-top: 10px;">
                        <p id="sound-feedback"></p>
                        <button type="button" id="remove-sound-btn" style="display: none;" class="btn btn-danger">Remover</button>
                    </div>
                </div>
                ${handoverSoundSection}
            </div>
            <div class="form-buttons">
                <span id="save-feedback"></span>
                <button type="submit" class="btn btn-primary">Salvar Alterações</button>
            </div>
        </form>`;
    
    fetchAndPopulateSettings();
}

async function fetchAndPopulateSettings() {
    try {
        const settings = await globalApiFetch('/settings');
        document.getElementById('store_name').value = settings.store_name;
        document.getElementById('whatsapp_number').value = settings.whatsapp_number || '';
        document.getElementById('address').value = settings.address;
        document.getElementById('location_link').value = settings.location_link;
        document.getElementById('delivery_fee').value = parseFloat(settings.delivery_fee).toFixed(2);

        const soundFeedback = document.getElementById('sound-feedback');
        const removeSoundBtn = document.getElementById('remove-sound-btn');
        if (settings.notification_sound_filename) {
            soundFeedback.innerHTML = `Som atual: <strong>${settings.notification_sound_filename}</strong>`;
            removeSoundBtn.style.display = 'inline-block';
        } else {
            soundFeedback.textContent = 'Nenhum som configurado.';
            removeSoundBtn.style.display = 'none';
        }
        
        if (state.userRole === 'admin') {
            const handoverSoundFeedback = document.getElementById('handover-sound-feedback');
            const removeHandoverSoundBtn = document.getElementById('remove-handover-sound-btn');
            const handoverEnabledToggle = document.getElementById('handover_notifications_enabled');
            
            if (settings.handover_sound_filename) {
                handoverSoundFeedback.innerHTML = `Som atual: <strong>${settings.handover_sound_filename}</strong>`;
                removeHandoverSoundBtn.style.display = 'inline-block';
            } else {
                handoverSoundFeedback.textContent = 'Nenhum som configurado.';
                removeHandoverSoundBtn.style.display = 'none';
            }
            handoverEnabledToggle.checked = settings.handover_notifications_enabled;
        }

        const hoursGrid = document.getElementById('hours-grid');
        hoursGrid.innerHTML = `<div class="grid-header">Dia</div><div class="grid-header">Abre</div><div class="grid-header">Fecha</div><div class="grid-header">Aberto?</div>`;
        ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'].forEach(day => {
            const daySettings = settings.operating_hours[day] || { open: '00:00', close: '00:00', enabled: false };
            hoursGrid.innerHTML += `
                <div class="day">${day.charAt(0).toUpperCase() + day.slice(1)}</div>
                <input type="time" id="open-${day}" value="${daySettings.open}" class="input-field">
                <input type="time" id="close-${day}" value="${daySettings.close}" class="input-field">
                <label class="toggle-switch"><input type="checkbox" id="enabled-${day}" ${daySettings.enabled ? "checked" : ""}><span class="slider"></span></label>`;
        });

        addSettingsListeners(settings);
    } catch (error) {
        console.error("Falha ao buscar configurações:", error);
    }
}

function addSettingsListeners(currentSettings) {
    const form = document.getElementById('settings-form');
    if (!form) return;

    const soundInput = document.getElementById('notification_sound');
    const soundFeedback = document.getElementById('sound-feedback');
    const removeSoundBtn = document.getElementById('remove-sound-btn');
    
    removeSoundBtn.onclick = () => {
        currentSettings.notification_sound_url = null;
        currentSettings.notification_sound_filename = null;
        soundInput.value = '';
        soundFeedback.textContent = 'Som de pedido removido ao salvar.';
        removeSoundBtn.style.display = 'none';
    };

    if (state.userRole === 'admin') {
        const handoverSoundInput = document.getElementById('handover_sound');
        const handoverSoundFeedback = document.getElementById('handover-sound-feedback');
        const removeHandoverSoundBtn = document.getElementById('remove-handover-sound-btn');

        removeHandoverSoundBtn.onclick = () => {
            currentSettings.handover_sound_url = null;
            currentSettings.handover_sound_filename = null;
            handoverSoundInput.value = '';
            handoverSoundFeedback.textContent = 'Som de atendimento removido ao salvar.';
            removeHandoverSoundBtn.style.display = 'none';
        };
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const saveButton = form.querySelector('button[type="submit"]');
        const feedback = document.getElementById('save-feedback');
        saveButton.disabled = true;
        feedback.textContent = 'Salvando...';

        let soundUrlToSave = currentSettings.notification_sound_url;
        let soundFilenameToSave = currentSettings.notification_sound_filename;
        let handoverSoundUrlToSave = currentSettings.handover_sound_url;
        let handoverSoundFilenameToSave = currentSettings.handover_sound_filename;

        const uploadFile = async (fileInput) => {
            if (!fileInput || !fileInput.files[0]) return null;
            try {
                const { timestamp, signature } = await globalApiFetch('/cloudinary-signature');
                const formData = new FormData();
                formData.append('file', fileInput.files[0]);
                formData.append('api_key', '351266855176353');
                formData.append('timestamp', timestamp);
                formData.append('signature', signature);
                const res = await fetch(`https://api.cloudinary.com/v1_1/dznox4s9b/video/upload`, { method: 'POST', body: formData });
                const data = await res.json();
                if (!data.secure_url) throw new Error('Falha no upload');
                return { url: data.secure_url, filename: fileInput.files[0].name };
            } catch (error) {
                feedback.textContent = `Erro no upload do ${fileInput.id}.`;
                throw error;
            }
        };

        try {
            const newOrderSound = await uploadFile(soundInput);
            if (newOrderSound) {
                soundUrlToSave = newOrderSound.url;
                soundFilenameToSave = newOrderSound.filename;
            }

            if (state.userRole === 'admin') {
                const handoverSoundInput = document.getElementById('handover_sound');
                const newHandoverSound = await uploadFile(handoverSoundInput);
                if (newHandoverSound) {
                    handoverSoundUrlToSave = newHandoverSound.url;
                    handoverSoundFilenameToSave = newHandoverSound.filename;
                }
            }
        } catch {
            saveButton.disabled = false;
            return;
        }

        const operating_hours = {};
        ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'].forEach(day => {
            operating_hours[day] = {
                open: document.getElementById(`open-${day}`).value,
                close: document.getElementById(`close-${day}`).value,
                enabled: document.getElementById(`enabled-${day}`).checked
            };
        });

        const dataToSave = {
            store_name: document.getElementById('store_name').value,
            whatsapp_number: document.getElementById('whatsapp_number').value,
            address: document.getElementById('address').value,
            location_link: document.getElementById('location_link').value,
            delivery_fee: document.getElementById('delivery_fee').value,
            operating_hours,
            notification_sound_url: soundUrlToSave,
            notification_sound_filename: soundFilenameToSave,
            handover_sound_url: handoverSoundUrlToSave,
            handover_sound_filename: handoverSoundFilenameToSave
        };
        
        if (state.userRole === 'admin') {
            dataToSave.handover_notifications_enabled = document.getElementById('handover_notifications_enabled').checked;
        }

        try {
            await globalApiFetch('/settings', { method: 'PUT', body: JSON.stringify(dataToSave) });
            feedback.textContent = 'Salvo!';
            await setupAudio();
            setTimeout(() => feedback.textContent = '', 2000);
        } catch (error) {
            feedback.textContent = 'Erro ao salvar.';
        } finally {
            saveButton.disabled = false;
        }
    });
}