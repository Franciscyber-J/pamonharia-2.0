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
const CARDAPIO_URL = process.env.CARDAPIO_URL || 'https://pamonhariasaborosa.expertbr.com/cardapio';
// #################### INÍCIO DA CORREÇÃO ####################
// ARQUITETO: Adicionadas variáveis de ambiente para a integração com o Telegram.
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
// ##################### FIM DA CORREÇÃO ######################

const app = express();
app.use(express.json());

let isBotReady = false;
const chatStates = new Map();

const PRODUCT_KEYWORDS = ["pamonha", "curau", "bolo", "bolinho", "chica", "caldo", "creme", "doce", "combo"];
const DRINK_KEYWORDS = ["bebida", "refrigerante", "refri", "coca", "guarana", "suco", "agua", "água", "cerveja"];
const CANCEL_KEYWORDS = ["cancelar", "cancela", "nao quero mais", "não quero mais"];

// --- FUNÇÃO DE LOG ---
function log(level, context, message) {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    console.log(`[${timestamp}] [${level}] [${context}] ${message}`);
}

// #################### INÍCIO DA CORREÇÃO ####################
// ARQUITETO: Nova função para enviar notificações para o Telegram.
async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        log('WARN', 'Telegram', 'Token ou Chat ID do Telegram não configurados. A saltar notificação.');
        return;
    }
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        });
        log('SUCCESS', 'Telegram', 'Notificação enviada com sucesso para o Telegram.');
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        log('ERROR', 'Telegram', `Falha ao enviar notificação para o Telegram: ${errorMessage}`);
    }
}
// ##################### FIM DA CORREÇÃO ######################


// --- CONFIGURAÇÃO DO CLIENTE WHATSAPP-WEB.JS ---
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'pamonharia-bot-concierge',
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
    log('INFO', 'QRCode', 'QR Code recebido. A gerar URL de imagem...');
    qrcode.toDataURL(qr, (err, url) => {
        if (err) { console.error('Erro ao gerar URL do QR Code:', err); return; }
        console.log('--------------------------------------------------');
        console.log('QR Code pronto!');
        qrcode.toString(qr, { type: 'terminal', small: true }, (err, qrTerminal) => {
            if (err) { console.log('Não foi possível gerar o QR Code, copie a URL manualmente.'); } 
            else { console.log(qrTerminal); }
            console.log('URL para login (copie e cole no navegador):', url);
            console.log('--------------------------------------------------');
        });
    });
});

client.on('ready', () => { isBotReady = true; log('SUCCESS', 'Client', 'Bot Concierge está online e pronto.'); });
client.on('disconnected', (reason) => { isBotReady = false; log('WARN', 'Client', `Bot desconectado. Motivo: ${reason}.`); client.initialize(); });

client.on('message', async (msg) => {
    const chat = await msg.getChat();
    if (msg.fromMe || !isBotReady || msg.isStatus || chat.isGroup) return;

    const lowerBody = msg.body.trim().toLowerCase();
    const chatId = msg.from;
    const currentState = chatStates.get(chatId);

    if (currentState === 'AGUARDANDO_LOCALIZACAO') {
        if (msg.hasLocation || msg.type === 'location') {
            await msg.reply('Localização recebida! Muito obrigado. 👍');
            chatStates.delete(chatId);
        } else if (CANCEL_KEYWORDS.some(kw => lowerBody.includes(kw))) {
            await msg.reply('Entendido. A entrega seguirá para o endereço informado.');
            chatStates.delete(chatId);
        } else {
            await msg.reply('Não identifiquei uma localização. Use o anexo (📎) e escolha "Localização". Para cancelar, digite *cancelar*.');
        }
        return;
    }

    if (currentState === 'HUMANO_ATIVO') {
        if (lowerBody === 'reiniciar') {
            chatStates.delete(chatId);
            await msg.reply('Ok, o atendimento automático foi reativado! 👋');
            await sendDefaultMenu(msg);
        }
        return;
    }

    const confirmationMatch = msg.body.match(/Código de Confirmação: *\*P-(\d+)-([A-Z0-9]{4})\*/i);
    if (confirmationMatch) {
        await handleOrderConfirmation(msg, confirmationMatch[1]);
        return;
    }

    await handleConcierge(msg, lowerBody);
});

async function handleOrderConfirmation(msg, orderId) {
    try {
        log('INFO', 'Confirmation', `Recebida confirmação para o Pedido #${orderId}`);
        const { data: order } = await axios.post(`${BACKEND_URL}/api/public/orders/${orderId}/confirm`, { whatsapp: msg.from }, { headers: { 'x-api-key': API_KEY } });
        
        let resumo = `Pedido *P-${order.id}* confirmado! ✅\n\n*Resumo:*\n`;
        order.items.forEach(item => {
            const details = item.item_details || {};
            resumo += `*${item.quantity}x* ${item.item_name}\n`;
            if (details.complements?.length > 0) {
                details.complements.forEach(sub => {
                    resumo += `  ↳ _${sub.quantity}x ${sub.name}_\n`;
                });
            }
        });
        resumo += `\n*TOTAL: R$ ${Number.parseFloat(order.total_price).toFixed(2).replace(".", ",")}*`;
        resumo += `\n*Pagamento:* ${order.payment_method === 'online' ? 'Pago Online' : 'Pagar na Entrega'}`;
        resumo += `\n*Destino:* ${order.client_address}`;
        resumo += `\n\nNossa equipe já foi notificada. Manteremos você atualizado!`;
        
        await msg.reply(resumo);

        if (order.client_address !== 'Retirada no local') {
            await new Promise(resolve => setTimeout(resolve, 1500));
            chatStates.set(msg.from, 'AGUARDANDO_LOCALIZACAO');
            await msg.reply("Para facilitar a entrega, poderia compartilhar sua localização?\n\nUse o anexo (📎) e escolha *Localização* > *Localização Atual*. Se não quiser, digite *cancelar*.");
        }
    } catch (error) {
        log('ERROR', 'Confirmation', `Falha ao confirmar pedido #${orderId}: ${error.response?.data?.error || error.message}`);
        await msg.reply('Ocorreu um erro ao confirmar seu pedido. Um atendente irá verificar.');
    }
}

function cleanSearchQuery(text) {
    const stopWords = ["quero", "queria", "tem", "vcs", "voces", "de", "do", "da", "com", "um", "uma"];
    return text.toLowerCase().replace(/[?.,!]/g, "").split(" ").filter(word => !stopWords.includes(word)).join(" ").trim();
}

// #################### INÍCIO DA CORREÇÃO ####################
// ARQUITETO: A lógica do concierge foi atualizada para um menu numérico,
// incluindo as novas opções e a transição para o estado 'HUMANO_ATIVO'.
async function handleConcierge(msg, lowerBody) {
    const choice = parseInt(lowerBody, 10);

    try {
        switch (choice) {
            case 1:
                await msg.reply(`Para ver nosso cardápio completo e fazer seu pedido, acesse o link:\n\n*${CARDAPIO_URL}*`);
                break;
            case 2:
                const { data: statusData } = await axios.get(`${BACKEND_URL}/api/public/store-status`);
                let addressResponse = `Nosso endereço para retirada é:\n*${statusData.full_settings.address}*`;
                if (statusData.full_settings.location_link) addressResponse += `\n\n📍 Ver no mapa:\n${statusData.full_settings.location_link}`;
                await msg.reply(addressResponse);
                break;
            case 3:
                const { data: scheduleData } = await axios.get(`${BACKEND_URL}/api/public/store-status`);
                await msg.reply(`*Status atual:* ${scheduleData.status.toUpperCase()}\n\n${scheduleData.message}`);
                break;
            case 4:
                chatStates.set(msg.from, 'HUMANO_ATIVO');
                await msg.reply("Ok, um de nossos atendentes irá te responder em instantes. Para reativar o atendimento automático, digite *reiniciar*.");
                break;
            case 5:
                chatStates.set(msg.from, 'HUMANO_ATIVO');
                await msg.reply("Entendido. Já notifiquei a nossa equipa. Um responsável entrará em contacto em breve. Para reativar o bot, digite *reiniciar*.");
                await sendTelegramNotification(`🔔 *Novo Contacto de Fornecedor*\n\nUm possível fornecedor/parceiro entrou em contacto no WhatsApp.\n\n*Contacto:* ${msg.from.replace('@c.us', '')}\n\nPor favor, verifique a conversa.`);
                break;
            case 6:
                chatStates.set(msg.from, 'HUMANO_ATIVO');
                await msg.reply("Olá, parceiro! Nossa equipa de logística já foi notificada e irá responder em breve. Se quiser, pode adiantar sua dúvida. Para reativar o bot, digite *reiniciar*.");
                await sendTelegramNotification(`🏍️ *Novo Contacto de Entregador*\n\nUm entregador/parceiro entrou em contacto no WhatsApp.\n\n*Contacto:* ${msg.from.replace('@c.us', '')}\n\nPor favor, verifique a conversa.`);
                break;
            default:
                // Se não for um número válido, verifica por palavras-chave de produto/bebida
                if (DRINK_KEYWORDS.some(kw => lowerBody.includes(kw))) {
                    await msg.reply("Olá! No momento, focamos em oferecer as melhores pamonhas e derivados, por isso não trabalhamos com bebidas. 😊");
                } else if (PRODUCT_KEYWORDS.some(kw => lowerBody.includes(kw))) {
                    const cleanQuery = cleanSearchQuery(lowerBody);
                    const { data } = await axios.get(`${BACKEND_URL}/api/public/product-query`, { params: { q: cleanQuery } });
                    if(data.encontrado) {
                        await msg.reply(data.emEstoque ? `Temos *${data.nome}* sim! 😊\n\nPode pedir em nosso cardápio:\n*${CARDAPIO_URL}*` : `Poxa, nosso(a) *${data.nome}* esgotou! 😥\n\nVeja outras delícias em:\n*${CARDAPIO_URL}*`);
                    } else {
                        await sendDefaultMenu(msg);
                    }
                } else {
                    await sendDefaultMenu(msg);
                }
                break;
        }
    } catch (error) {
        log('ERROR', 'Concierge', `Falha ao processar mensagem: ${error.message}`);
        await msg.reply("Desculpe, tive um problema. Tente novamente ou digite *4* para falar com um atendente.");
    }
}

async function sendDefaultMenu(msg) {
    const { data: status } = await axios.get(`${BACKEND_URL}/api/public/store-status`);
    const menuMessage = status.status === 'aberto'
        ? `*Estamos abertos!*`
        : `*No momento estamos fechados.*\n\n${status.message}`;
    
    await msg.reply(
`Olá! Bem-vindo(a) à *Pamonharia Saborosa do Goiás*! 🌽
${status.status === 'aberto' ? '' : `\n${status.message}\n`}
Como posso ajudar? *Digite o número da opção desejada:*

*1.* Ver Cardápio / Fazer Pedido
*2.* Ver Endereço
*3.* Ver Horário de Funcionamento
*4.* Falar com Atendente
*5.* Sou Fornecedor/Parceiro
*6.* Sou Entregador/Parceiro`
    );
}
// ##################### FIM DA CORREÇÃO ######################

// --- API INTERNA PARA O BACKEND ---
const apiKeyMiddleware = (req, res, next) => {
    const providedKey = req.headers['x-api-key'];
    if (!providedKey || providedKey !== API_KEY) {
        log('WARN', 'API', 'Acesso não autorizado bloqueado.');
        return res.status(403).json({ error: 'Acesso não autorizado.' });
    }
    next();
};

app.get('/status', (req, res) => res.status(200).json({ ready: isBotReady }));

app.post('/send-message', apiKeyMiddleware, async (req, res) => {
    if (!isBotReady) { return res.status(503).json({ error: 'O bot não está pronto.' }); }
    const { phone, message } = req.body;
    if (!phone || !message) { return res.status(400).json({ error: '"phone" e "message" são obrigatórios.' }); }
    try {
        const chatId = phone.includes('@c.us') ? phone : `55${phone.replace(/\D/g, '')}@c.us`;
        await client.sendMessage(chatId, message);
        res.status(200).json({ success: true });
    } catch (error) {
        log('ERROR', 'API', `Falha ao enviar mensagem para ${phone}: ${error.message}`);
        res.status(500).json({ error: 'Falha ao enviar a mensagem.' });
    }
});

app.get('/groups', apiKeyMiddleware, async (req, res) => {
    if (!isBotReady) { return res.status(503).json({ error: 'O bot não está pronto.' }); }
    try {
        const chats = await client.getChats();
        const groups = chats.filter(c => c.isGroup).map(c => ({ id: c.id._serialized, name: c.name }));
        res.status(200).json(groups);
    } catch (error) {
        log('ERROR', 'API', `Falha ao listar grupos: ${error.message}`);
        res.status(500).json({ error: 'Falha ao obter lista de grupos.' });
    }
});

app.post('/send-group-message', apiKeyMiddleware, async (req, res) => {
    if (!isBotReady) { return res.status(503).json({ error: 'O bot não está pronto.' }); }
    const { groupId, message } = req.body;
    if (!groupId || !message) { return res.status(400).json({ error: '"groupId" e "message" são obrigatórios.' }); }
    try {
        await client.sendMessage(groupId, message);
        log('SUCCESS', 'API', `Mensagem enviada para o grupo ${groupId}.`);
        res.status(200).json({ success: true });
    } catch (error) {
        log('ERROR', 'API', `Falha ao enviar mensagem para o grupo ${groupId}: ${error.message}`);
        res.status(500).json({ error: 'Falha ao enviar a mensagem para o grupo.' });
    }
});

// --- INICIALIZAÇÃO ---
app.listen(PORT, () => {
    log('INFO', 'Server', `API do Bot a rodar na porta ${PORT}.`);
    log('INFO', 'Client', 'A inicializar o cliente do WhatsApp...');
    client.initialize().catch(err => {
        log('FATAL', 'Initialize', `Falha ao inicializar: ${err.message}`);
    });
});