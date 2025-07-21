// backend/src/controllers/BotController.js
const axios = require('axios');
const connection = require('../database/connection'); // ARQUITETO: Importação necessária

// Configurações centralizadas
const BOT_API_URL = process.env.BOT_API_URL;
const BOT_API_KEY = process.env.BOT_API_KEY;

// Função auxiliar para criar uma instância do Axios
const createBotApiClient = () => {
    if (!BOT_API_URL || !BOT_API_KEY) {
        console.error('[BotController] Variáveis de ambiente do bot (BOT_API_URL, BOT_API_KEY) não estão configuradas.');
        return null;
    }
    return axios.create({
        baseURL: BOT_API_URL,
        headers: { 'x-api-key': BOT_API_KEY },
        timeout: 8000 // Timeout de 8 segundos
    });
};

module.exports = {
    /**
     * Busca a lista de grupos de WhatsApp do bot.
     */
    async getGroups(request, response) {
        const apiClient = createBotApiClient();
        if (!apiClient) {
            return response.status(500).json({ error: 'Serviço de Bot não configurado no servidor.' });
        }

        try {
            console.log('[BotController] Solicitando lista de grupos ao bot...');
            const botResponse = await apiClient.get('/groups');
            return response.json(botResponse.data);
        } catch (error) {
            const status = error.response ? error.response.status : 500;
            const message = error.response ? error.response.data.error : 'Não foi possível comunicar com o serviço de bot.';
            console.error(`[BotController] Erro ao buscar grupos: ${message}`);
            return response.status(status).json({ error: message });
        }
    },

    /**
     * Envia uma mensagem para um grupo de WhatsApp específico via bot.
     */
    async requestDriver(request, response) {
        const apiClient = createBotApiClient();
        if (!apiClient) {
            return response.status(500).json({ error: 'Serviço de Bot não configurado no servidor.' });
        }

        // #################### INÍCIO DA CORREÇÃO ####################
        // ARQUITETO: A função agora recebe o ID do pedido em vez de uma mensagem pronta.
        // Isso centraliza a lógica de formatação da mensagem no backend.
        const { groupId, orderId } = request.body;
        if (!groupId || !orderId) {
            return response.status(400).json({ error: 'Os campos groupId e orderId são obrigatórios.' });
        }

        try {
            const order = await connection('orders').where('id', orderId).first();
            const settings = await connection('store_settings').where('id', 1).first();

            if (!order || !settings) {
                return response.status(404).json({ error: 'Pedido ou configurações da loja não encontrados.' });
            }

            // Construção da mensagem completa com dados da loja e do pedido.
            let message = `🏍️ *NOVA SOLICITAÇÃO DE ENTREGA* 🏍️\n\n`;
            message += `*Pedido:* #${order.id}\n\n`;
            message += `📍 *PONTO DE PARTIDA:*\n`;
            message += `${settings.store_name}\n`;
            message += `_${settings.address}_\n`;
            if (settings.location_link) {
                message += `🗺️ Ver no mapa: ${settings.location_link}\n\n`;
            }
            message += `🏁 *DESTINO:*\n`;
            message += `${order.client_name}\n`;
            message += `_${order.client_address}_\n\n`;
            message += `💰 *VALOR TOTAL: R$ ${parseFloat(order.total_price).toFixed(2).replace('.', ',')}*\n`;
            
            let paymentInfo = `*Pagamento:* Pagar na Entrega/Retirada`;
            if (order.payment_method === 'online') {
                paymentInfo = `*Pagamento:* JÁ PAGO (Online)`;
            }
            message += `${paymentInfo}`;
            // ##################### FIM DA CORREÇÃO ######################

            console.log(`[BotController] Enviando solicitação de entregador para o grupo ${groupId}...`);
            await apiClient.post('/send-group-message', { groupId, message });
            return response.status(204).send();
        } catch (error) {
            const status = error.response ? error.response.status : 500;
            const errorMessage = error.response ? error.response.data.error : 'Não foi possível comunicar com o serviço de bot.';
            console.error(`[BotController] Erro ao solicitar entregador: ${errorMessage}`);
            return response.status(status).json({ error: errorMessage });
        }
    },
};