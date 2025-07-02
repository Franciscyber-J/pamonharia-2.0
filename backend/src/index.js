// backend/src/index.js
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const connection = require('./database/connection');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
  }
});

let liveInventory = {};

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
        
        broadcastLiveInventory();

        console.log(`[SocketIO-Server] ✅ Inventário inicializado e transmitido. Itens com estoque: ${productsWithStock.map(p => `${p.name}: ${p.stock_quantity}`).join(', ') || 'Nenhum'}`);
    } catch (error) {
        console.error('[SocketIO-Server] ❌ Erro ao inicializar o inventário:', error);
    }
}

function broadcastLiveInventory() {
    console.log('[SocketIO-Server] 📡 Emitindo evento "stock_update" para todos os clientes com os dados:', liveInventory);
    io.emit('stock_update', liveInventory);
}

app.use((request, response, next) => {
  request.io = io;
  request.triggerInventoryReload = initializeInventory; 
  return next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(__dirname, '..', '..', 'frontend')));

const routes = require('./routes');
app.use(routes);

io.on('connection', (socket) => {
    console.log(`[SocketIO-Server] ➡️ Cliente conectado: ${socket.id}`);
    console.log(`[SocketIO-Server] 📦 Enviando estado inicial do estoque para o cliente ${socket.id}.`);
    socket.emit('stock_update', liveInventory);

    // **LÓGICA DE RESERVA DE ESTOQUE REATORADA**
    socket.on('reserve_stock', async (itemsToReserve) => {
        console.log(`[SocketIO-Server] 📥 Recebido "reserve_stock" de ${socket.id} para os itens:`, itemsToReserve);
        console.log('[SocketIO-Server] Estoque ANTES da reserva:', JSON.stringify(liveInventory));
        try {
            await connection.transaction(async (trx) => {
                for (const item of itemsToReserve) {
                    if (!item.id || !item.quantity) continue;
                    
                    const product = await trx('products').where('id', item.id).first();
                    if (!product) continue;

                    let stockHoldingProduct = product;
                    if (product.parent_product_id) {
                        const parent = await trx('products').where('id', product.parent_product_id).first();
                        if (parent && parent.stock_sync_enabled) {
                            stockHoldingProduct = parent;
                        }
                    }

                    if (stockHoldingProduct.stock_enabled) {
                        if (liveInventory[stockHoldingProduct.id] === undefined) {
                            liveInventory[stockHoldingProduct.id] = stockHoldingProduct.stock_quantity;
                        }
                        
                        if (liveInventory[stockHoldingProduct.id] < item.quantity) {
                            throw new Error(`Estoque insuficiente para ${product.name}. Disponível: ${liveInventory[stockHoldingProduct.id]}.`);
                        }

                        liveInventory[stockHoldingProduct.id] -= item.quantity;
                        await trx('products').where('id', stockHoldingProduct.id).decrement('stock_quantity', item.quantity);
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

    // **LÓGICA DE LIBERAÇÃO DE ESTOQUE REATORADA**
    socket.on('release_stock', async (itemsToRelease) => {
        console.log(`[SocketIO-Server] 📤 Recebido "release_stock" de ${socket.id} para os itens:`, itemsToRelease);
        console.log('[SocketIO-Server] Estoque ANTES da liberação:', JSON.stringify(liveInventory));
        try {
            await connection.transaction(async (trx) => {
                for (const item of itemsToRelease) {
                    if (!item.id || !item.quantity) continue;

                    const product = await trx('products').where('id', item.id).first();
                    if (!product) continue;

                    let stockHoldingProduct = product;
                    if (product.parent_product_id) {
                        const parent = await trx('products').where('id', product.parent_product_id).first();
                        if (parent && parent.stock_sync_enabled) {
                            stockHoldingProduct = parent;
                        }
                    }

                    if (stockHoldingProduct.stock_enabled) {
                         if (liveInventory[stockHoldingProduct.id] !== undefined) {
                            liveInventory[stockHoldingProduct.id] += item.quantity;
                        }
                        await trx('products').where('id', stockHoldingProduct.id).increment('stock_quantity', item.quantity);
                    }
                }
            });
            console.log('[SocketIO-Server] Estoque DEPOIS da liberação:', JSON.stringify(liveInventory));
            broadcastLiveInventory();
        } catch (error) {
            console.error(`[SocketIO-Server] ❌ Falha na liberação de estoque para ${socket.id}:`, error);
        }
    });
    
    socket.on('force_inventory_reload', () => {
        console.log(`[SocketIO-Server] 🔄 Recebido "force_inventory_reload" de ${socket.id}. Recarregando...`);
        initializeInventory();
    });

    socket.on('disconnect', () => {
        console.log(`[SocketIO-Server] ⬅️ Cliente desconectado: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log('----------------------------------------------------');
  console.log('✅ Servidor Backend da Pamonharia 2.0 INICIADO');
  console.log(`🚀 API a rodar em: http://localhost:${PORT}`);
  console.log('----------------------------------------------------');
  initializeInventory();
});