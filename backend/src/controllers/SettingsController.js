// backend/src/controllers/SettingsController.js
const connection = require('../database/connection');
const cloudinary = require('cloudinary').v2;
const { getIO } = require('../socket-manager');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const emitDataUpdated = () => {
  console.log('[Socket.IO] Emitindo evento "data_updated" para todos os clientes do cardápio.');
  const io = getIO();
  io.emit('data_updated');
};

module.exports = {
  // Rota completa, apenas para admins
  async show(request, response) {
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
    const settingsData = request.body;
    if (settingsData.operating_hours && typeof settingsData.operating_hours === 'object') {
      settingsData.operating_hours = JSON.stringify(settingsData.operating_hours);
    }
    await connection('store_settings').where('id', 1).update(settingsData);
    emitDataUpdated();
    return response.status(200).json({ message: 'Settings updated successfully.' });
  },
  
  async updateStatus(request, response) {
    const { is_open_manual_override } = request.body;
    
    if (is_open_manual_override === undefined) {
      return response.status(400).json({ error: 'O campo is_open_manual_override é obrigatório.' });
    }

    await connection('store_settings').where('id', 1).update({
      is_open_manual_override
    });

    emitDataUpdated();
    return response.status(200).json({ message: 'Status da loja atualizado com sucesso.' });
  },

  async getDashboardConfig(request, response) {
    const settings = await connection('store_settings')
      .select('is_open_manual_override', 'notification_sound_url')
      .where('id', 1)
      .first();
      
    if (!settings) {
      return response.status(404).json({ error: 'Configurações não encontradas.' });
    }
    return response.json(settings);
  },

  generateCloudinarySignature(request, response) {
    const timestamp = Math.round((new Date()).getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { timestamp: timestamp },
      process.env.CLOUDINARY_API_SECRET
    );
    return response.json({ timestamp, signature });
  },
  
  getPaymentSettings(request, response) {
    const publicKey = process.env.MERCADO_PAGO_PUBLIC_KEY;
    if (!publicKey) {
      return response.status(500).json({ error: 'A configuração de pagamento do servidor está incompleta.' });
    }
    return response.json({
      mercadoPagoPublicKey: publicKey,
    });
  },

  // ARQUITETO: Novo método para o bot consultar o status da loja em tempo real.
  async getStoreStatus(request, response) {
    try {
        const settings = await connection('store_settings').where('id', 1).first();
        if (!settings) {
            return response.status(404).json({ error: 'Configurações da loja não encontradas.' });
        }

        const now = new Date();
        const dayOfWeek = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][now.getDay()];
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        let isOpen = false;
        let message = 'No momento, estamos fechados.';

        if (settings.is_open_manual_override !== null) {
            isOpen = settings.is_open_manual_override;
            message = isOpen ? 'Estamos abertos por controlo manual!' : 'Estamos fechados por controlo manual.';
        } else {
            const hours = typeof settings.operating_hours === 'string' ? JSON.parse(settings.operating_hours) : settings.operating_hours;
            const schedule = hours?.[dayOfWeek];
            if (schedule && schedule.enabled) {
                isOpen = currentTime >= schedule.open && currentTime <= schedule.close;
                message = isOpen ? `Estamos abertos! Nosso horário hoje é das ${schedule.open} às ${schedule.close}.` : `Estamos fechados. Nosso próximo horário de funcionamento é amanhã.`;
            } else {
                message = 'Hoje não abrimos. Consulte nosso cardápio para ver os horários da semana.';
            }
        }
        
        return response.json({
            status: isOpen ? 'aberto' : 'fechado',
            message: message,
            full_settings: settings // Enviamos tudo para o bot ter mais contexto se precisar.
        });

    } catch (error) {
        console.error('[SettingsController] Erro ao buscar status da loja:', error);
        return response.status(500).json({ error: 'Erro ao verificar o status da loja.' });
    }
  }
};