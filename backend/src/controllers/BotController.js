// backend/src/controllers/BotController.js
const axios = require('axios');
const connection = require('../database/connection');
// ARQUITETO: Importa o getIO para poder emitir eventos para o dashboard.
const { getIO } = require('../socket-manager');

const BOT_API_URL = process.env.BOT_API_URL;
const BOT_API_KEY = process.env.BOT_API_KEY;

const createBotApiClient = () => {
    if (!BOT_API_URL || !BOT_API_KEY) {
        console.error('[BotController] Variáveis de ambiente do bot não configuradas.');
        return null;
    }
    return axios.create({
        baseURL: BOT_API_URL,
        headers: { 'x-api-key': BOT_API_KEY },
        timeout: 8000
    });
};

module.exports = {
    async getGroups(request, response) {
        const apiClient = createBotApiClient();
        if (!apiClient) return response.status(500).json({ error: 'Serviço de Bot não configurado.' });
        try {
            const botResponse = await apiClient.get('/groups');
            return response.json(botResponse.data);
        } catch (error) {
            const status = error.response?.status || 500;
            const message = error.response?.data?.error || 'Não foi possível comunicar com o serviço de bot.';
            console.error(`[BotController] Erro ao buscar grupos: ${message}`);
            return response.status(status).json({ error: message });
        }
    },

    async requestDriver(request, response) {
        const apiClient = createBotApiClient();
        if (!apiClient) return response.status(500).json({ error: 'Serviço de Bot não configurado.' });
        const { groupId, orderId } = request.body;
        if (!groupId || !orderId) return response.status(400).json({ error: 'groupId e orderId são obrigatórios.' });

        try {
            const order = await connection('orders').where('id', orderId).first();
            const settings = await connection('store_settings').where('id', 1).first();
            if (!order || !settings) return response.status(404).json({ error: 'Pedido ou configurações não encontrados.' });

            let message = `🏍️ *NOVA SOLICITAÇÃO DE ENTREGA* 🏍️\n\n`;
            message += `*Pedido:* #${order.id}\n\n`;
            message += `📍 *PONTO DE PARTIDA:*\n${settings.store_name}\n_${settings.address}_\n`;
            if (settings.location_link) message += `🗺️ Ver no mapa: ${settings.location_link}\n\n`;
            message += `🏁 *DESTINO:*\n${order.client_name}\n_${order.client_address}_\n\n`;
            message += `💰 *VALOR TOTAL: R$ ${parseFloat(order.total_price).toFixed(2).replace('.', ',')}*\n`;
            message += `*Pagamento:* ${order.payment_method === 'online' ? 'JÁ PAGO (Online)' : 'Pagar na Entrega/Retirada'}`;

            await apiClient.post('/send-group-message', { groupId, message });
            return response.status(204).send();
        } catch (error) {
            const status = error.response?.status || 500;
            const errorMessage = error.response?.data?.error || 'Não foi possível comunicar com o serviço de bot.';
            console.error(`[BotController] Erro ao solicitar entregador: ${errorMessage}`);
            return response.status(status).json({ error: errorMessage });
        }
    },

    // ARQUITETO: Novo método para receber a notificação do bot e retransmiti-la
    // para todos os dashboards conectados via Socket.IO.
    async notifyHumanHandover(request, response) {
        const { contactId, type } = request.body;
        if (!contactId || !type) {
            return response.status(400).json({ error: 'contactId e type são obrigatórios.' });
        }

        try {
            console.log(`[BotController] Recebido pedido de atendimento para ${contactId} (Tipo: ${type}). Emitindo para dashboards.`);
            const io = getIO();
            io.emit('human_handover_request', { contactId, type });
            return response.status(200).json({ message: 'Notificação recebida.' });
        } catch (error) {
            console.error(`[BotController] Erro ao processar notificação de handover: ${error.message}`);
            return response.status(500).json({ error: 'Erro interno ao processar a notificação.' });
        }
    }
};