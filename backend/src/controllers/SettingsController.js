// backend/src/controllers/SettingsController.js
const connection = require('../database/connection');

module.exports = {
  // Função para LER as configurações
  async show(request, response) {
    console.log('[SettingsController] Buscando configurações...');

    // A nossa tabela só tem a linha com id = 1
    const settings = await connection('store_settings').where('id', 1).first();

    if (!settings) {
      return response.status(404).json({ error: 'Settings not found.' });
    }

    // Converte a string JSON dos horários de volta para um objeto
    // (O PostgreSQL armazena JSONB, mas o Knex pode retorná-lo como string)
    if (typeof settings.operating_hours === 'string') {
        settings.operating_hours = JSON.parse(settings.operating_hours);
    }

    return response.json(settings);
  },

  // Função para ATUALIZAR as configurações
  async update(request, response) {
    console.log('[SettingsController] Recebida requisição para atualizar configurações.');
    const settingsData = request.body;

    // Se os horários forem enviados como objeto, converte para string JSON para salvar no banco
    if (settingsData.operating_hours) {
      settingsData.operating_hours = JSON.stringify(settingsData.operating_hours);
    }

    await connection('store_settings').where('id', 1).update(settingsData);

    console.log('[SettingsController] Configurações atualizadas no banco de dados.');

    // --- A MÁGICA DO TEMPO REAL ACONTECE AQUI ---
    // Pega as configurações recém-atualizadas do banco
    const newSettings = await connection('store_settings').where('id', 1).first();
    if (typeof newSettings.operating_hours === 'string') {
        newSettings.operating_hours = JSON.parse(newSettings.operating_hours);
    }

    // Emite um evento 'settings_updated' para todos os clientes conectados
    request.io.emit('settings_updated', newSettings);
    console.log('[Socket.IO] Evento "settings_updated" emitido para todos os clientes.');

    return response.status(200).json({ message: 'Settings updated successfully.' });
  }
};