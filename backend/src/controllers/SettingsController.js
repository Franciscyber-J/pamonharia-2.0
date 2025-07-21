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
        let statusMessage = '';
        const hours = typeof settings.operating_hours === 'string' ? JSON.parse(settings.operating_hours) : settings.operating_hours;
        
        // #################### INÍCIO DA CORREÇÃO ####################
        // ARQUITETO: A lógica agora constrói a mensagem de "placa de horários" completa,
        // tratando a exceção do modo manual de forma clara.
        const dayNames = { segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado', domingo: 'Domingo' };

        if (settings.is_open_manual_override !== null) {
            isOpen = settings.is_open_manual_override;
            statusMessage = isOpen ? `ABERTO (em modo manual)` : `FECHADO (em modo manual)`;
        } else {
            const schedule = hours?.[dayOfWeek];
            if (schedule && schedule.enabled) {
                isOpen = currentTime >= schedule.open && currentTime <= schedule.close;
                statusMessage = isOpen ? `ABERTO (Hoje, das ${schedule.open} às ${schedule.close})` : `FECHADO`;
            } else {
                isOpen = false;
                statusMessage = 'FECHADO';
            }
        }
        
        let fullMessage = `🕒 *Nosso Horário de Funcionamento*\n\n`;
        fullMessage += `*Status Atual:* ${statusMessage}\n\n`;
        fullMessage += `*Horários da Semana:*\n`;
        for (const day in dayNames) {
            const dayInfo = hours[day];
            const scheduleText = (dayInfo && dayInfo.enabled) ? `${dayInfo.open} - ${dayInfo.close}` : 'Fechado';
            fullMessage += `  • *${dayNames[day]}:* ${scheduleText}\n`;
        }
        fullMessage += `\n_Os horários podem sofrer alterações. Para pedidos, acesse nosso cardápio online!_`;
        // ##################### FIM DA CORREÇÃO ######################
        
        return response.json({
            status: isOpen ? 'aberto' : 'fechado',
            message: fullMessage,
            full_settings: settings
        });

    } catch (error) {
        console.error('[SettingsController] Erro ao buscar status da loja:', error);
        return response.status(500).json({ error: 'Erro ao verificar o status da loja.' });
    }
  }
};