// bot/index.js
require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const axios = require('axios');

// --- CONFIGURAÇÕES E ESTADO GLOBAL ---
const PORT = process.env.PORT || 9000;
const API_KEY = process.env.BOT_API_KEY;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:10000';

const app = express();
app.use(express.json());

let isBotReady = false;

// --- FUNÇÃO DE LOG ---
function log(level, context, message) {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    console.log(`[${timestamp}] [${level}] [${context}] ${message}`);
}

// --- CONFIGURAÇÃO DO CLIENTE WHATSAPP-WEB.JS ---
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'pamonharia-bot-v2',
        dataPath: './sessions',
    }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
        ],
    },
});

client.on('qr', (qr) => {
    log('INFO', 'QRCode', 'QR Code recebido. Escaneie com o seu WhatsApp.');
    qrcode.toString(qr, { type: 'terminal', small: true }, (err, url) => {
        if (err) return console.error(err);
        console.log(url);
    });
});

client.on('ready', () => {
    isBotReady = true;
    log('SUCCESS', 'Client', 'Bot está online e pronto para receber comandos via API.');
});

client.on('disconnected', (reason) => {
    isBotReady = false;
    log('WARN', 'Client', `Bot foi desconectado. Motivo: ${reason}. A tentar reconectar...`);
    client.initialize();
});

// #################### INÍCIO DA CORREÇÃO ####################
// ARQUITETO: Lógica de confirmação atualizada para o novo código curto em base-36.
client.on('message', async (msg) => {
    if (msg.fromMe || !isBotReady) return;

    // A nova RegEx busca por um código alfanumérico curto após a frase chave.
    const confirmationMatch = msg.body.match(/Código de Confirmação: *\*([a-z0-9]+)\*/i);

    if (confirmationMatch && confirmationMatch[1]) {
        try {
            const confirmationCode = confirmationMatch[1];
            // Converte o código em base-36 de volta para um número (o ID do pedido).
            const orderId = parseInt(confirmationCode, 36);
            
            if (isNaN(orderId)) {
                throw new Error('Código de confirmação inválido.');
            }

            log('INFO', 'Confirmation', `Recebida confirmação do cliente para o Pedido #${orderId}`);

            await axios.post(`${BACKEND_URL}/api/public/orders/${orderId}/confirm`, {
                whatsapp: msg.from
            }, {
                headers: { 'x-api-key': API_KEY }
            });

            await msg.reply(`Perfeito! ✅\n\nSeu pedido *#${orderId}* foi confirmado e já está sendo enviado para a nossa cozinha. Manteremos você atualizado por aqui!`);

        } catch (error) {
            log('ERROR', 'Confirmation', `Falha ao processar confirmação: ${error.message}`);
            await msg.reply('Ocorreu um erro ao tentar confirmar o seu pedido. Por favor, aguarde, um atendente irá verificar.');
        }
    }
});
// ##################### FIM DA CORREÇÃO ######################

// --- API INTERNA DO BOT ---
const apiKeyMiddleware = (req, res, next) => {
    const providedKey = req.headers['x-api-key'];
    if (!providedKey || providedKey !== API_KEY) {
        log('WARN', 'API', 'Tentativa de acesso não autorizado bloqueada.');
        return res.status(403).json({ error: 'Acesso não autorizado.' });
    }
    next();
};

app.get('/status', (req, res) => {
    res.status(200).json({
        ready: isBotReady,
        message: isBotReady ? 'Bot conectado e pronto.' : 'Bot a inicializar ou desconectado.',
    });
});

function formatPhoneNumber(phone) {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('55') && cleaned.length >= 12) {
        return `${cleaned}@c.us`;
    }
    return `55${cleaned}@c.us`;
}

app.post('/send-message', apiKeyMiddleware, async (req, res) => {
    if (!isBotReady) {
        log('WARN', 'API', 'Recebida requisição de envio, mas o bot não está pronto.');
        return res.status(503).json({ error: 'O bot não está pronto para enviar mensagens.' });
    }

    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ error: 'Os campos "phone" e "message" são obrigatórios.' });
    }

    try {
        const chatId = formatPhoneNumber(phone);
        await client.sendMessage(chatId, message);
        log('SUCCESS', 'API', `Mensagem enviada com sucesso para ${phone} (Formatado como: ${chatId}).`);
        res.status(200).json({ success: true, message: 'Mensagem enviada.' });
    } catch (error) {
        log('ERROR', 'API', `Falha ao enviar mensagem para ${phone}: ${error.message}`);
        res.status(500).json({ error: 'Falha ao enviar a mensagem de WhatsApp.' });
    }
});

// --- INICIALIZAÇÃO ---
app.listen(PORT, () => {
    log('INFO', 'Server', `Servidor da API do Bot a rodar na porta ${PORT}.`);
    log('INFO', 'Client', 'A inicializar o cliente do WhatsApp...');
    client.initialize().catch(err => {
        log('FATAL', 'Initialize', `Falha ao inicializar o cliente: ${err.message}`);
    });
});