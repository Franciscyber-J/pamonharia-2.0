// backend/src/index.js
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const connection = require('./database/connection');

// Inicialização do Servidor Express e HTTP
const app = express();
const server = http.createServer(app);

// Configuração do Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
  }
});

// Middleware para injetar o 'io' em todas as requisições
app.use((request, response, next) => {
  request.io = io;
  return next();
});

// Middlewares Padrão
app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(__dirname, '..', '..', 'frontend')));

// Rotas da Aplicação
const routes = require('./routes');
app.use(routes);

// --- ARQUITETURA DE ESTOQUE EM TEMPO REAL ---

// Variável em memória para o inventário ao vivo.
let liveInventory = {};

/**
 * Carrega/recarrega o inventário da base de dados para a memória.
 * Esta função é a única fonte da verdade para o estado inicial do estoque.
 */
async function initializeInventory() {
    try {
        console.log('[SocketIO-Server] INICIALIZANDO/RECARREGANDO inventário da base de dados...');
        const productsWithStock = await connection('products')
            .where('stock_enabled', true)
            .select('id', 'stock_quantity', 'name');
        
        const newInventory = {};
        productsWithStock.forEach(p => {
            newInventory[p.id] = p.stock_quantity;
        });
        liveInventory = newInventory;
        console.log(`[SocketIO-Server] ✅ Inventário inicializado. Itens com estoque: ${productsWithStock.map(p => `${p.name}: ${p.stock_quantity}`).join(', ') || 'Nenhum'}`);
    } catch (error) {
        console.error('[SocketIO-Server] ❌ Erro ao inicializar o inventário:', error);
    }
}

/**
 * Emite o estado atual do inventário para todos os clientes conectados.
 */
function broadcastLiveInventory() {
    console.log('[SocketIO-Server] 📡 Emitindo evento "stock_update" para todos os clientes com os dados:', liveInventory);
    io.emit('stock_update', liveInventory);
}

// Lógica de Conexão do Socket.IO
io.on('connection', (socket) => {
    console.log(`[SocketIO-Server] ➡️ Cliente conectado: ${socket.id}`);
    
    // Envia o estado atual do estoque assim que o cliente se conecta
    console.log(`[SocketIO-Server] 📦 Enviando estado inicial do estoque para o cliente ${socket.id}.`);
    socket.emit('stock_update', liveInventory);

    /**
     * Listener para o evento 'reserve_stock'.
     * Recebe um array de itens, valida o estoque e, se bem-sucedido,
     * decrementa na memória e no banco de dados, e notifica todos os clientes.
     */
    socket.on('reserve_stock', async (itemsToReserve) => {
        console.log(`[SocketIO-Server] 📥 Recebido "reserve_stock" de ${socket.id} para os itens:`, itemsToReserve);
        console.log('[SocketIO-Server] Estoque ANTES da reserva:', JSON.stringify(liveInventory));
        try {
            // A transação garante que todas as atualizações de estoque ocorram ou nenhuma ocorra.
            await connection.transaction(async (trx) => {
                for (const item of itemsToReserve) {
                    if (!item.id || !item.quantity) continue;
                    
                    const product = await trx('products').where('id', item.id).forUpdate().first();

                    if (product && product.stock_enabled) {
                        if (liveInventory[item.id] === undefined) {
                             console.warn(`[SocketIO-Server] ⚠️ Tentativa de reservar item (${product.name}) não monitorado pelo liveInventory. A inicializar com valor da DB.`);
                             liveInventory[item.id] = product.stock_quantity;
                        }
                        
                        if (liveInventory[item.id] < item.quantity) {
                            throw new Error(`Estoque insuficiente para ${product.name}. Disponível: ${liveInventory[item.id]}.`);
                        }
                        liveInventory[item.id] -= item.quantity;
                        await trx('products').where('id', item.id).decrement('stock_quantity', item.quantity);
                    }
                }
            });
            console.log('[SocketIO-Server] Estoque DEPOIS da reserva:', JSON.stringify(liveInventory));
            socket.emit('reservation_success');
            broadcastLiveInventory();
        } catch (error) {
            console.error(`[SocketIO-Server] ❌ Falha na reserva para ${socket.id}:`, error.message);
            socket.emit('reservation_failure', { message: error.message });
        }
    });

    /**
     * Listener para o evento 'release_stock'.
     * Recebe um array de itens, incrementa o estoque na memória e no banco de dados,
     * e notifica todos os clientes.
     */
    socket.on('release_stock', async (itemsToRelease) => {
        console.log(`[SocketIO-Server] 📤 Recebido "release_stock" de ${socket.id} para os itens:`, itemsToRelease);
        console.log('[SocketIO-Server] Estoque ANTES da liberação:', JSON.stringify(liveInventory));
        try {
            const updates = itemsToRelease.map(item => {
                if (!item.id || !item.quantity) return Promise.resolve();
                if (liveInventory[item.id] !== undefined) {
                    liveInventory[item.id] += item.quantity;
                }
                return connection('products')
                    .where({ id: item.id, stock_enabled: true })
                    .increment('stock_quantity', item.quantity);
            });
            await Promise.all(updates);
            console.log('[SocketIO-Server] Estoque DEPOIS da liberação:', JSON.stringify(liveInventory));
            broadcastLiveInventory();
        } catch (error) {
            console.error(`[SocketIO-Server] ❌ Falha na liberação de estoque para ${socket.id}:`, error);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[SocketIO-Server] ⬅️ Cliente desconectado: ${socket.id}`);
    });
});

// Inicialização do Servidor
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log('----------------------------------------------------');
  console.log('✅ Servidor Backend da Pamonharia 2.0 INICIADO');
  console.log(`🚀 API a rodar em: http://localhost:${PORT}`);
  console.log('----------------------------------------------------');
  initializeInventory();
});
