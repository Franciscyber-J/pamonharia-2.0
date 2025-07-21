// backend/src/controllers/BotController.js
const axios = require('axios');

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

        const { groupId, message } = request.body;
        if (!groupId || !message) {
            return response.status(400).json({ error: 'Os campos groupId e message são obrigatórios.' });
        }

        try {
            console.log(`[BotController] Enviando solicitação de entregador para o grupo ${groupId}...`);
            await apiClient.post('/send-group-message', { groupId, message });
            return response.status(204).send();
        } catch (error) {
            const status = error.response ? error.response.status : 500;
            const message = error.response ? error.response.data.error : 'Não foi possível comunicar com o serviço de bot.';
            console.error(`[BotController] Erro ao solicitar entregador: ${message}`);
            return response.status(status).json({ error: message });
        }
    },
};