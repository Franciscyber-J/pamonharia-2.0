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
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const app = express();
app.use(express.json());

let isBotReady = false;
const chatStates = new Map();

const PRODUCT_KEYWORDS = ["pamonha", "curau", "bolo", "bolinho", "chica", "caldo", "creme", "doce", "combo"];
const DRINK_KEYWORDS = ["bebida", "refrigerante", "refri", "coca", "guarana", "suco", "agua", "água", "cerveja"];
const CANCEL_KEYWORDS = ["cancelar", "cancela", "nao quero mais", "não quero mais"];
const END_KEYWORDS = ["sair", "parar", "encerrar", "obrigado", "obg", "vlw", "tchau"];

// --- FUNÇÃO DE LOG ---
function log(level, context, message) {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    console.log(`[${timestamp}] [${level}] [${context}] ${message}`);
}

async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        log('WARN', 'Telegram', 'Token ou Chat ID do Telegram não configurados. A saltar notificação.');
        return;
    }
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await axios.post(url, { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' });
        log('SUCCESS', 'Telegram', 'Notificação enviada com sucesso para o Telegram.');
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        log('ERROR', 'Telegram', `Falha ao enviar notificação para o Telegram: ${errorMessage}`);
    }
}


// --- CONFIGURAÇÃO DO CLIENTE WHATSAPP-WEB.JS ---
const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'pamonharia-bot-concierge', dataPath: './sessions' }),
    webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' },
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--single-process', '--disable-gpu', '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'],
    },
});

client.on('qr', (qr) => {
    log('INFO', 'QRCode', 'QR Code recebido...');
    qrcode.toString(qr, { type: 'terminal', small: true }, (err, qrTerminal) => {
        if (err) { console.log('Não foi possível gerar o QR Code.'); } 
        else { console.log(qrTerminal); }
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
            await msg.reply(`🗺️ *Ainda aguardando a sua localização...*\n\nPara que o entregador encontre você facilmente, por favor, envie a sua localização.\n\n*Como fazer:*\n1. Toque no ícone de anexo (📎).\n2. Escolha a opção "Localização".\n3. Envie a sua "Localização Atual".\n\n_Se preferir não enviar, basta digitar *cancelar*._`);
        }
        return;
    }

    if (currentState === 'HUMANO_ATIVO') {
        if (lowerBody === 'reiniciar') {
            chatStates.delete(chatId);
            await msg.reply(`🤖 *Atendimento Automático Reativado*\n\nO bot está de volta! 👋 Como posso te ajudar agora?`);
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
        
        let resumo = `🎉 *Pedido Confirmado!* 🎉\n\n`;
        resumo += `Olá! O seu pedido *P-${order.id}* foi recebido com sucesso e a nossa cozinha já foi notificada.\n\n`;
        resumo += `🧾 *Resumo do Pedido:*\n`;
        order.items.forEach(item => {
            resumo += `  • *${item.quantity}x* ${item.item_name}\n`;
            const details = item.item_details || {};
            if (details.complements?.length > 0) {
                details.complements.forEach(sub => { resumo += `    ↳ _${sub.quantity}x ${sub.name}_\n`; });
            }
        });
        resumo += `\n✅ *Detalhes do Pedido:*\n`;
        resumo += `  • *Pagamento:* ${order.payment_method === 'online' ? 'Pago Online' : 'Na Entrega'}\n`;
        resumo += `  • *Destino:* ${order.client_address}\n`;
        resumo += `  • *Total:* R$ ${Number.parseFloat(order.total_price).toFixed(2).replace(".", ",")}*\n\n`;
        resumo += `_Obrigado pela sua preferência! Manteremos você atualizado sobre o estado do seu pedido._`;
        
        await msg.reply(resumo);

        if (order.client_address !== 'Retirada no local') {
            await new Promise(resolve => setTimeout(resolve, 1500));
            chatStates.set(msg.from, 'AGUARDANDO_LOCALIZACAO');
            await msg.reply("Para facilitar a entrega, poderia compartilhar sua localização?\n\nUse o anexo (📎) e escolha *Localização* > *Localização Atual*. Se não quiser, digite *cancelar*.");
        }
    } catch (error) {
        log('ERROR', 'Confirmation', `Falha ao confirmar pedido #${orderId}: ${error.response?.data?.error || error.message}`);
        await msg.reply(`⚠️ *Atenção: Falha na Confirmação*\n\nTivemos um problema ao tentar confirmar o seu pedido em nosso sistema.\n\n*Não se preocupe, a nossa equipe já foi alertada sobre isso e irá verificar a situação manualmente.* Um atendente entrará em contacto em breve.`);
    }
}

async function handleConcierge(msg, lowerBody) {
    const horarioKeywords = ["horário", "horario", "hora", "abre", "fecha", "aberto", "até que horas"];
    if (horarioKeywords.some(kw => lowerBody.includes(kw))) {
        const { data: scheduleData } = await axios.get(`${BACKEND_URL}/api/public/store-status`);
        await msg.reply(scheduleData.message);
        return;
    }

    if (END_KEYWORDS.some(kw => lowerBody.startsWith(kw))) {
        log('INFO', 'Concierge', `Utilizador encerrou a conversa: "${lowerBody}"`);
        await msg.reply("Entendido! Se precisar de algo mais, é só chamar. 😊");
        return;
    }

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
                await msg.reply(scheduleData.message);
                break;
            // #################### INÍCIO DA CORREÇÃO ####################
            // ARQUITETO: Adicionada a notificação via Telegram para a solicitação de atendimento humano geral.
            case 4:
                chatStates.set(msg.from, 'HUMANO_ATIVO');
                await msg.reply("Ok, um de nossos atendentes irá te responder em instantes.\n\n_Para reativar o atendimento automático, por favor, digite *reiniciar*._");
                await sendTelegramNotification(`🗣️ *Solicitação de Atendimento Humano*\n\nUm cliente solicitou para falar com um atendente no WhatsApp.\n\n👤 *Contacto:*\n   • \`${msg.from.replace('@c.us', '')}\`\n\n*Ação Necessária: Por favor, verifique a conversa e inicie o atendimento.*`);
                break;
            // ##################### FIM DA CORREÇÃO ######################
            case 5:
                chatStates.set(msg.from, 'HUMANO_ATIVO');
                await msg.reply("*Atendimento a Fornecedores/Parceiros*\n\nEntendido. A sua mensagem foi encaminhada para a nossa equipe de gestão.\n\nUm responsável entrará em contacto assim que possível.\n\n_Para reativar o bot, digite *reiniciar*._");
                await sendTelegramNotification(`🔔 *Novo Contacto de Fornecedor*\n\nUm possível fornecedor ou parceiro iniciou uma conversa no WhatsApp.\n\n👤 *Contacto:*\n   • \`${msg.from.replace('@c.us', '')}\`\n\n*Ação Necessária: Por favor, verifique a conversa e dê seguimento.*`);
                break;
            case 6:
                chatStates.set(msg.from, 'HUMANO_ATIVO');
                await msg.reply("*Atendimento a Entregadores/Parceiros*\n\nOlá, parceiro! A sua mensagem foi direcionada para a nossa equipe de logística.\n\nUm operador irá responder em breve. Se desejar, pode adiantar o motivo do seu contacto.\n\n_Para reativar o bot, digite *reiniciar*._");
                await sendTelegramNotification(`🏍️ *Novo Contacto de Entregador*\n\nUm entregador ou parceiro de logística iniciou uma conversa no WhatsApp.\n\n👤 *Contacto:*\n   • \`${msg.from.replace('@c.us', '')}\`\n\n*Ação Necessária: Por favor, verifique a conversa e preste o suporte necessário.*`);
                break;
            default:
                if (DRINK_KEYWORDS.some(kw => lowerBody.includes(kw))) {
                    await msg.reply(`🥤 *Sobre Bebidas*\n\nNo momento, nosso foco é 100% em oferecer as melhores pamonhas e delícias de milho! Por isso, não trabalhamos com a venda de bebidas.\n\nAgradecemos a sua compreensão! 😊`);
                } else if (PRODUCT_KEYWORDS.some(kw => lowerBody.includes(kw))) {
                    const matchedKeyword = PRODUCT_KEYWORDS.find(kw => lowerBody.includes(kw));
                    log('INFO', 'Concierge', `Palavra-chave de produto encontrada: "${matchedKeyword}".`);
                    const { data } = await axios.get(`${BACKEND_URL}/api/public/product-query`, { params: { q: matchedKeyword } });
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
        await msg.reply(`⚠️ *Ops! Ocorreu um problema.*\n\nDesculpe, não consegui processar a sua última mensagem. Por favor, tente novamente.\n\nSe o erro persistir, digite *4* para falar diretamente com um de nossos atendentes.`);
    }
}

async function sendDefaultMenu(msg) {
    const { data: status } = await axios.get(`${BACKEND_URL}/api/public/store-status`);
    const statusMessage = status.status === 'aberto' ? `*Estamos abertos!*` : `*No momento estamos fechados.*`;
    await msg.reply(
`Olá! Bem-vindo(a) à *Pamonharia Saborosa do Goiás*! 🌽

${statusMessage}

Para ver o cardápio e fazer seu pedido, acesse o link abaixo:
*${CARDAPIO_URL}*

--------------------
Ou, se preferir, *digite o número de uma das opções:*

*1.* Ver Cardápio / Fazer Pedido
*2.* Ver Endereço
*3.* Ver Horário de Funcionamento
*4.* Falar com Atendente
*5.* Sou Fornecedor/Parceiro
*6.* Sou Entregador/Parceiro`
    );
}

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