// backend/src/index.js
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const connection = require('./database/connection');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
  }
});

app.use((request, response, next) => {
  request.io = io;
  return next();
});

app.use(express.json());
app.use(express.static(path.resolve(__dirname, '..', '..', 'frontend')));

const routes = require('./routes');
app.use(routes);

// --- ARQUITETURA DE ESTOQUE EM TEMPO REAL ---

let liveInventory = {};
const userCarts = {}; // Armazena o carrinho de cada socket conectado

/**
 * Carrega o inventário inicial do banco de dados para a memória.
 */
async function initializeInventory() {
    try {
        console.log('Inicializando inventário...');
        const productsWithStock = await connection('products')
            .where('stock_enabled', true)
            .select('id', 'stock_quantity');
        
        liveInventory = {};
        productsWithStock.forEach(p => {
            liveInventory[p.id] = p.stock_quantity;
        });
        console.log('Inventário inicializado com sucesso.');
    } catch (error) {
        console.error('Erro ao inicializar o inventário:', error);
    }
}

/**
 * Emite o estado atual do estoque para todos os clientes.
 */
function broadcastStockUpdate() {
    io.emit('data_updated'); // Evento genérico que força o cardápio e o dashboard a recarregarem os dados
}

io.on('connection', (socket) => {
    console.log(`Novo cliente conectado: ${socket.id}`);
    userCarts[socket.id] = []; // Inicializa um carrinho vazio para o novo cliente

    // Envia o estado atual do estoque para o cliente que acabou de conectar
    socket.emit('data_updated');

    // Lida com a adição de itens ao carrinho
    socket.on('reserve_stock', async (itemsToReserve) => {
        try {
            await connection.transaction(async (trx) => {
                for (const item of itemsToReserve) {
                    const product = await trx('products').where('id', item.id).forUpdate().first();
                    if (product && product.stock_enabled) {
                        if (liveInventory[item.id] < item.quantity) {
                            throw new Error(`Estoque insuficiente para ${product.name}.`);
                        }
                        liveInventory[item.id] -= item.quantity;
                        await trx('products').where('id', item.id).decrement('stock_quantity', item.quantity);
                    }
                }
            });
            socket.emit('reservation_success', itemsToReserve); // Avisa o cliente que a reserva deu certo
            broadcastStockUpdate();
        } catch (error) {
            console.error(`[Socket.IO] Falha na reserva para ${socket.id}:`, error.message);
            socket.emit('reservation_failure', { message: error.message });
        }
    });

    // Lida com a remoção de itens do carrinho
    socket.on('release_stock', async (itemsToRelease) => {
        try {
            const updates = itemsToRelease.map(item => {
                if (liveInventory[item.id] !== undefined) {
                    liveInventory[item.id] += item.quantity;
                }
                return connection('products')
                    .where({ id: item.id, stock_enabled: true })
                    .increment('stock_quantity', item.quantity);
            });
            await Promise.all(updates);
            broadcastStockUpdate();
        } catch (error) {
            console.error(`[Socket.IO] Falha na liberação de estoque para ${socket.id}:`, error);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Cliente desconectado: ${socket.id}`);
        // Aqui, você poderia adicionar uma lógica para devolver o estoque do carrinho se o usuário desconectar.
        // Por simplicidade, vamos manter a lógica de devolução manual.
        delete userCarts[socket.id];
    });
});


const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log('----------------------------------------------------');
  console.log('✅ Servidor Backend da Pamonharia 2.0 INICIADO');
  console.log(`🚀 API a rodar em: http://localhost:${PORT}`);
  console.log('----------------------------------------------------');
  initializeInventory(); // Carrega o estoque na inicialização
});
