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

client.on('message', async (msg) => {
    if (msg.fromMe || !isBotReady || msg.isStatus) return;

    const lowerBody = msg.body.trim().toLowerCase();
    
    // 1. Lógica de Confirmação de Pedido (Prioridade Máxima)
    const confirmationMatch = msg.body.match(/Código de Confirmação: *\*P-(\d+)-([A-Z0-9]{4})\*/i);
    if (confirmationMatch) {
        const orderId = confirmationMatch[1];
        await handleOrderConfirmation(msg, orderId);
        return;
    }

    // 2. Lógica de Concierge (Menu, Produtos, etc.)
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
        
        // #################### INÍCIO DA CORREÇÃO ####################
        // ARQUITETO: Lógica de formatação do resumo do pedido refatorada para incluir todos os detalhes.
        let resumo = `Pedido *P-${confirmedOrder.id}* confirmado com sucesso! ✅\n\n`;
        resumo += "Resumo do seu pedido:\n\n";
        
        confirmedOrder.items.forEach(item => {
            resumo += `*${item.quantity}x* ${item.item_name}\n`;
            if (item.item_details && item.item_details.length > 2) {
                try {
                    const details = JSON.parse(item.item_details);
                    if(Array.isArray(details) && details.length > 0) {
                        details.forEach(det => {
                            resumo += `  ↳ _${det.quantity}x ${det.name}_\n`;
                        });
                    }
                } catch(e) {
                    log('WARN', 'Confirmation', `Não foi possível parsear item_details para o item ${item.id}`);
                }
            }
        });

        resumo += `\n*TOTAL: R$ ${Number.parseFloat(confirmedOrder.total_price).toFixed(2).replace(".", ",")}*`;
        resumo += `\n\n*Pagamento:* ${confirmedOrder.payment_method === 'online' ? 'Pago Online' : 'Pagar na Entrega/Retirada'}`;
        resumo += `\n*Destino:* ${confirmedOrder.client_address}`;
        
        if (confirmedOrder.observations) {
            resumo += `\n\n*Observações:* ${confirmedOrder.observations}`;
        }
        resumo += `\n*Precisa de talher?* ${confirmedOrder.needs_cutlery ? 'Sim' : 'Não'}`;
        
        resumo += `\n\nNossa equipe já foi notificada e em breve começará a prepará-lo. Manteremos você atualizado!`;
        // ##################### FIM DA CORREÇÃO ######################
        
        await msg.reply(resumo);

    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        log('ERROR', 'Confirmation', `Falha ao confirmar pedido #${orderId}: ${errorMessage}`);
        await msg.reply('Ocorreu um erro ao confirmar seu pedido. Por favor, aguarde que um atendente irá verificar.');
    }
}

async function handleConcierge(msg, lowerBody) {
    const keywords = {
        menu: ["cardapio", "cardápio", "menu", "pedido", "pedir"],
        endereco: ["endereço", "endereco", "local", "onde"],
        horario: ["horário", "horario", "hora", "abre", "fecha", "aberto"],
        atendente: ["atendente", "falar", "humano", "ajuda"],
        produtos: ["pamonha", "curau", "bolo", "bolinho", "chica", "caldo", "creme", "doce", "combo"]
    };

    const findKeyword = (text, kws) => kws.some(kw => text.includes(kw));

    try {
        if (findKeyword(lowerBody, keywords.menu)) {
            await msg.reply(`Para ver nosso cardápio completo e fazer seu pedido, acesse o link:\n\n*${CARDAPIO_URL}*`);
        } else if (findKeyword(lowerBody, keywords.endereco)) {
            const { data } = await axios.get(`${BACKEND_URL}/api/public/store-status`);
            let response = `Nosso endereço para retirada é:\n*${data.full_settings.address}*`;
            if (data.full_settings.location_link) {
                response += `\n\n📍 Ver no mapa:\n${data.full_settings.location_link}`;
            }
            await msg.reply(response);
        } else if (findKeyword(lowerBody, keywords.horario)) {
            const { data } = await axios.get(`${BACKEND_URL}/api/public/store-status`);
            await msg.reply(`*Status atual:* ${data.status.toUpperCase()}\n\n${data.message}`);
        } else if (findKeyword(lowerBody, keywords.atendente)) {
            await msg.reply("Ok, um de nossos atendentes irá te responder em instantes.");
        } else if (findKeyword(lowerBody, keywords.produtos)) {
            const { data } = await axios.get(`${BACKEND_URL}/api/public/product-query`, { params: { q: lowerBody } });
            if (data.encontrado) {
                const response = data.emEstoque
                    ? `Temos *${data.nome}* sim! 😊\n\nPode pedir diretamente em nosso cardápio online:\n*${CARDAPIO_URL}*`
                    : `Poxa, nosso(a) *${data.nome}* esgotou por hoje! 😥\n\nVeja outras delícias em nosso cardápio:\n*${CARDAPIO_URL}*`;
                await msg.reply(response);
            } else {
                await sendDefaultMenu(msg);
            }
        } else {
            await sendDefaultMenu(msg);
        }
    } catch (error) {
        log('ERROR', 'Concierge', `Falha ao processar mensagem: ${error.message}`);
        await msg.reply("Desculpe, tive um problema para processar sua solicitação. Tente novamente ou digite 'ajuda' para falar com um atendente.");
    }
}

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

// --- INICIALIZAÇÃO ---
app.listen(PORT, () => {
    log('INFO', 'Server', `API do Bot a rodar na porta ${PORT}.`);
    log('INFO', 'Client', 'A inicializar o cliente do WhatsApp...');
    client.initialize().catch(err => {
        log('FATAL', 'Initialize', `Falha ao inicializar: ${err.message}`);
    });
});