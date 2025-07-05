// backend/src/controllers/SettingsController.js
const connection = require('../database/connection');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const emitDataUpdated = (request) => {
  console.log('[Socket.IO] Emitindo evento "data_updated" para todos os clientes do cardápio.');
  request.io.emit('data_updated');
};

module.exports = {
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

  async update(request, response) {
    console.log('[SettingsController] Recebida requisição para atualizar configurações.');
    const settingsData = request.body;

    if (settingsData.operating_hours && typeof settingsData.operating_hours === 'object') {
      settingsData.operating_hours = JSON.stringify(settingsData.operating_hours);
    }

    await connection('store_settings').where('id', 1).update(settingsData);
    
    console.log('[SettingsController] Configurações atualizadas no banco de dados.');

    emitDataUpdated(request);
    
    return response.status(200).json({ message: 'Settings updated successfully.' });
  },

  generateCloudinarySignature(request, response) {
    console.log('[SettingsController] Gerando assinatura para upload no Cloudinary.');
    const timestamp = Math.round((new Date()).getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { timestamp: timestamp },
      process.env.CLOUDINARY_API_SECRET
    );
    return response.json({ timestamp, signature });
  },

  // #################### INÍCIO DA CORREÇÃO ####################
  // Nova função para fornecer as chaves públicas necessárias para o frontend.
  getPaymentSettings(request, response) {
    console.log('[SettingsController] Fornecendo chave pública do Mercado Pago para o frontend.');
    const publicKey = process.env.MERCADO_PAGO_PUBLIC_KEY;

    if (!publicKey) {
      console.error('[SettingsController] ❌ ERRO: A variável de ambiente MERCADO_PAGO_PUBLIC_KEY não está definida!');
      return response.status(500).json({ error: 'A configuração de pagamento do servidor está incompleta.' });
    }

    return response.json({
      mercadoPagoPublicKey: publicKey,
    });
  }
  // ##################### FIM DA CORREÇÃO ######################
};
