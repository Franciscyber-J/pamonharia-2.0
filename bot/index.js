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

const app = express();
app.use(express.json());

let isBotReady = false;
// #################### INÍCIO DA CORREÇÃO ####################
// ARQUITETO: Adicionado um Map para gerir o estado de cada conversa individualmente.
// Isso permite funcionalidades como "Aguardando Localização" ou "Atendimento Humano".
const chatStates = new Map();

// Listas de palavras-chave para uma interpretação mais inteligente das mensagens.
const PRODUCT_KEYWORDS = ["pamonha", "curau", "bolo", "bolinho", "chica", "caldo", "creme", "doce", "combo"];
const DRINK_KEYWORDS = ["bebida", "refrigerante", "refri", "coca", "guarana", "suco", "agua", "água", "cerveja"];
const CANCEL_KEYWORDS = ["cancelar", "cancela", "nao quero mais", "não quero mais"];
// ##################### FIM DA CORREÇÃO ######################

// --- FUNÇÃO DE LOG ---
function log(level, context, message) {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    console.log(`[${timestamp}] [${level}] [${context}] ${message}`);
}

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
        if (err) {
            console.error('Erro ao gerar URL do QR Code:', err);
            return;
        }
        console.log('--------------------------------------------------');
        console.log('QR Code pronto! Use um leitor ou a câmara para ler a URL abaixo e abri-la no navegador:');
        
        qrcode.toString(url, { type: 'terminal', small: true }, (err, qrTerminal) => {
            if (err) {
                console.log('Não foi possível gerar o QR Code da URL, por favor, copie a URL manualmente.');
            } else {
                console.log(qrTerminal);
            }
            console.log('URL DIRETA (copie e cole no navegador):', url);
            console.log('--------------------------------------------------');
        });
    });
});

client.on('ready', () => {
    isBotReady = true;
    log('SUCCESS', 'Client', 'Bot Concierge está online e pronto.');
});

client.on('disconnected', (reason) => {
    isBotReady = false;
    log('WARN', 'Client', `Bot foi desconectado. Motivo: ${reason}. A tentar reconectar...`);
    client.initialize();
});

// #################### INÍCIO DA CORREÇÃO ####################
// ARQUITETO: O listener de mensagens foi refatorado para usar um sistema de estados,
// tornando o bot mais inteligente e contextual.
client.on('message', async (msg) => {
    const chat = await msg.getChat();
    if (msg.fromMe || !isBotReady || msg.isStatus || chat.isGroup) return;

    const lowerBody = msg.body.trim().toLowerCase();
    const chatId = msg.from;
    const currentState = chatStates.get(chatId);

    // MÁQUINA DE ESTADOS: Verifica se o chat está em um estado especial.
    if (currentState === 'AGUARDANDO_LOCALIZACAO') {
        if (msg.hasLocation || msg.type === 'location') {
            await msg.reply('Localização recebida! Muito obrigado, isso ajudará bastante o nosso entregador. 👍');
            chatStates.delete(chatId);
        } else if (CANCEL_KEYWORDS.some(kw => lowerBody.includes(kw))) {
            await msg.reply('Entendido. A entrega seguirá para o endereço informado no pedido.');
            chatStates.delete(chatId);
        } else {
            await msg.reply('Não consegui identificar uma localização. Para ajudar, por favor, use a função de anexo (📎) do WhatsApp e escolha "Localização". Se não quiser, é só digitar "cancelar".');
        }
        return; // Finaliza o processamento aqui
    }

    if (currentState === 'HUMANO_ATIVO') {
        if (lowerBody === 'menu' || lowerBody === 'voltar') {
            chatStates.delete(chatId);
            await msg.reply('Ok, o atendimento automático foi reativado! 👋');
            await sendDefaultMenu(msg); // Volta ao menu principal
        }
        return; // Ignora outras mensagens enquanto espera o atendente
    }

    // FLUXO NORMAL DE CONVERSA
    const confirmationMatch = msg.body.match(/Código de Confirmação: *\*P-(\d+)-([A-Z0-9]{4})\*/i);
    if (confirmationMatch) {
        const orderId = confirmationMatch[1];
        await handleOrderConfirmation(msg, orderId);
        return;
    }

    await handleConcierge(msg, lowerBody);
});

async function handleOrderConfirmation(msg, orderId) {
    try {
        log('INFO', 'Confirmation', `Recebida confirmação para o Pedido #${orderId}`);
        const { data: confirmedOrder } = await axios.post(`${BACKEND_URL}/api/public/orders/${orderId}/confirm`, {
            whatsapp: msg.from
        }, {
            headers: { 'x-api-key': API_KEY }
        });
        
        let resumo = `Pedido *P-${confirmedOrder.id}* confirmado com sucesso! ✅\n\nResumo do seu pedido:\n\n`;
        confirmedOrder.items.forEach(item => {
            const detailsWrapper = item.item_details || {};
            const complements = detailsWrapper.complements || [];
            if (parseFloat(item.unit_price) === 0 && complements.length > 0) {
                complements.forEach(det => resumo += `*${det.quantity}x* ${item.item_name} - ${det.name}\n`);
            } else {
                resumo += `*${item.quantity}x* ${item.item_name}\n`;
                if (complements.length > 0) {
                    complements.forEach(det => resumo += `  ↳ _${(detailsWrapper.force_one_to_one ? det.quantity : (det.quantity * item.quantity))}x ${det.name}_\n`);
                }
            }
        });
        
        resumo += `\n*TOTAL: R$ ${Number.parseFloat(confirmedOrder.total_price).toFixed(2).replace(".", ",")}*\n`;
        resumo += `\n*Pagamento:* ${confirmedOrder.payment_method === 'online' ? 'Pago Online' : 'Pagar na Entrega/Retirada'}`;
        resumo += `\n*Destino:* ${confirmedOrder.client_address}`;
        resumo += `\n\nNossa equipe já foi notificada. Manteremos você atualizado!`;
        
        await msg.reply(resumo);

        // Lógica para solicitar localização após a confirmação.
        if (confirmedOrder.client_address !== 'Retirada no local') {
            await new Promise(resolve => setTimeout(resolve, 1500)); // Pequena pausa
            chatStates.set(msg.from, 'AGUARDANDO_LOCALIZACAO');
            await msg.reply("Para facilitar a entrega, você poderia compartilhar sua localização conosco?\n\nBasta usar o anexo (📎) do WhatsApp e escolher *Localização* > *Localização Atual*. Se não quiser, é só digitar *cancelar*.");
        }

    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        log('ERROR', 'Confirmation', `Falha ao confirmar pedido #${orderId}: ${errorMessage}`);
        await msg.reply('Ocorreu um erro ao confirmar seu pedido. Por favor, aguarde que um atendente irá verificar.');
    }
}

function cleanSearchQuery(text) {
    const stopWords = ["quero", "queria", "tem", "vcs", "voces", "de", "do", "da", "com", "um", "uma"];
    return text.toLowerCase().replace(/[?.,!]/g, "").split(" ").filter(word => !stopWords.includes(word)).join(" ").trim();
}

async function handleConcierge(msg, lowerBody) {
    const keywords = {
        menu: ["cardapio", "cardápio", "menu", "pedido", "pedir"],
        endereco: ["endereço", "endereco", "local", "onde"],
        horario: ["horário", "horario", "hora", "abre", "fecha", "aberto"],
        atendente: ["atendente", "falar", "humano", "ajuda"],
    };
    const findKeyword = (text, kws) => kws.some(kw => text.includes(kw));

    try {
        if (findKeyword(lowerBody, keywords.menu)) {
            await msg.reply(`Para ver nosso cardápio completo e fazer seu pedido, acesse o link:\n\n*${CARDAPIO_URL}*`);
        } else if (findKeyword(lowerBody, keywords.endereco)) {
            const { data } = await axios.get(`${BACKEND_URL}/api/public/store-status`);
            let response = `Nosso endereço para retirada é:\n*${data.full_settings.address}*`;
            if (data.full_settings.location_link) response += `\n\n📍 Ver no mapa:\n${data.full_settings.location_link}`;
            await msg.reply(response);
        } else if (findKeyword(lowerBody, keywords.horario)) {
            const { data } = await axios.get(`${BACKEND_URL}/api/public/store-status`);
            await msg.reply(`*Status atual:* ${data.status.toUpperCase()}\n\n${data.message}`);
        } else if (findKeyword(lowerBody, keywords.atendente)) {
            chatStates.set(msg.from, 'HUMANO_ATIVO');
            await msg.reply("Ok, um de nossos atendentes irá te responder em instantes. Para reativar o atendimento automático, digite *menu*.");
        } else if (DRINK_KEYWORDS.some(kw => lowerBody.includes(kw))) {
            await msg.reply("Olá! No momento, focamos em oferecer as melhores pamonhas e derivados, e por isso não trabalhamos com a venda de bebidas. 😊");
        } else if (PRODUCT_KEYWORDS.some(kw => lowerBody.includes(kw))) {
            const cleanQuery = cleanSearchQuery(lowerBody);
            const { data } = await axios.get(`${BACKEND_URL}/api/public/product-query`, { params: { q: cleanQuery } });
            const response = data.encontrado
                ? (data.emEstoque ? `Temos *${data.nome}* sim! 😊\n\nPode pedir diretamente em nosso cardápio online:\n*${CARDAPIO_URL}*` : `Poxa, nosso(a) *${data.nome}* esgotou por hoje! 😥\n\nVeja outras delícias em nosso cardápio:\n*${CARDAPIO_URL}*`)
                : await sendDefaultMenu(msg); // Se não achou, manda o menu padrão
            if (data.encontrado) await msg.reply(response);
        } else {
            await sendDefaultMenu(msg);
        }
    } catch (error) {
        log('ERROR', 'Concierge', `Falha ao processar mensagem: ${error.message}`);
        await msg.reply("Desculpe, tive um problema para processar sua solicitação. Tente novamente ou digite 'ajuda' para falar com um atendente.");
    }
}
// ##################### FIM DA CORREÇÃO ######################

async function sendDefaultMenu(msg) {
    const { data: status } = await axios.get(`${BACKEND_URL}/api/public/store-status`);
    const menuMessage = status.status === 'aberto'
        ? `*Estamos abertos!*\n\nPara ver o cardápio e fazer seu pedido, acesse:\n*${CARDAPIO_URL}*`
        : `*No momento estamos fechados.*\n\n${status.message}\n\nVeja nosso cardápio para o próximo pedido:\n*${CARDAPIO_URL}*`;
    
    await msg.reply(`Olá! Bem-vindo(a) à *Pamonharia Saborosa do Goiás*! 🌽\n\n${menuMessage}\n\n--------------------\nOu, se preferir, digite uma das opções abaixo:\n\n*Endereço*\n*Horário*\n*Falar com um atendente*`);
}

// --- API INTERNA PARA O BACKEND ---
const apiKeyMiddleware = (req, res, next) => {
    const providedKey = req.headers['x-api-key'];
    if (!providedKey || providedKey !== API_KEY) {
        log('WARN', 'API', 'Tentativa de acesso não autorizado bloqueada.');
        return res.status(403).json({ error: 'Acesso não autorizado.' });
    }
    next();
};

app.get('/status', (req, res) => res.status(200).json({ ready: isBotReady }));

app.post('/send-message', apiKeyMiddleware, async (req, res) => {
    if (!isBotReady) {
        return res.status(503).json({ error: 'O bot não está pronto.' });
    }
    const { phone, message } = req.body;
    if (!phone || !message) {
        return res.status(400).json({ error: 'Campos "phone" e "message" são obrigatórios.' });
    }
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
    if (!isBotReady) {
        return res.status(503).json({ error: 'O bot não está pronto para listar os grupos.' });
    }
    try {
        const chats = await client.getChats();
        const groups = chats
            .filter(chat => chat.isGroup)
            .map(chat => ({
                id: chat.id._serialized,
                name: chat.name,
            }));
        res.status(200).json(groups);
    } catch (error) {
        log('ERROR', 'API', `Falha ao listar grupos: ${error.message}`);
        res.status(500).json({ error: 'Falha ao obter a lista de grupos do WhatsApp.' });
    }
});

app.post('/send-group-message', apiKeyMiddleware, async (req, res) => {
    if (!isBotReady) {
        return res.status(503).json({ error: 'O bot não está pronto para enviar mensagens.' });
    }
    const { groupId, message } = req.body;
    if (!groupId || !message) {
        return res.status(400).json({ error: 'Campos "groupId" e "message" são obrigatórios.' });
    }
    try {
        await client.sendMessage(groupId, message);
        log('SUCCESS', 'API', `Mensagem enviada com sucesso para o grupo ${groupId}.`);
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