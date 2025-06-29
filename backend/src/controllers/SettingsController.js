// backend/src/controllers/SettingsController.js
const connection = require('../database/connection');
const cloudinary = require('cloudinary').v2;

// Configuração do Cloudinary com as nossas variáveis de ambiente
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

module.exports = {
  // Função para LER as configurações
  async show(request, response) {
    console.log('[SettingsController] Buscando configurações...');
    const settings = await connection('store_settings').where('id', 1).first();
    if (!settings) {
      return response.status(404).json({ error: 'Settings not found.' });
    }
    if (settings.operating_hours && typeof settings.operating_hours === 'string') {
        settings.operating_hours = JSON.parse(settings.operating_hours);
    }
    return response.json(settings);
  },

  // Função para ATUALIZAR as configurações
  async update(request, response) {
    console.log('[SettingsController] Recebida requisição para atualizar configurações.');
    const settingsData = request.body;

    if (settingsData.operating_hours && typeof settingsData.operating_hours === 'object') {
      settingsData.operating_hours = JSON.stringify(settingsData.operating_hours);
    }

    await connection('store_settings').where('id', 1).update(settingsData);
    
    console.log('[SettingsController] Configurações atualizadas no banco de dados.');

    const newSettings = await connection('store_settings').where('id', 1).first();
    if (newSettings.operating_hours && typeof newSettings.operating_hours === 'string') {
        newSettings.operating_hours = JSON.parse(newSettings.operating_hours);
    }
    
    request.io.emit('settings_updated', newSettings);
    console.log('[Socket.IO] Evento "settings_updated" emitido para todos os clientes.');
    
    return response.status(200).json({ message: 'Settings updated successfully.' });
  },

  // Função para gerar a assinatura segura para o upload
  generateCloudinarySignature(request, response) {
    console.log('[SettingsController] Gerando assinatura para upload no Cloudinary.');
    const timestamp = Math.round((new Date()).getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { timestamp: timestamp },
      process.env.CLOUDINARY_API_SECRET
    );
    return response.json({ timestamp, signature });
  }
};