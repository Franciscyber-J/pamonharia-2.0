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

    // #################### INÍCIO DA CORREÇÃO (AGREGAÇÃO DE ESTOQUE) ####################
    const handleStockChange = async (items, operation) => {
        const trx = await connection.transaction();
        try {
            const stockChanges = new Map();

            // 1. AGREGAR MUDANÇAS: Agrupa todas as requisições pelo produto que realmente controla o estoque.
            for (const item of items) {
                if (!item.id || !item.quantity) continue;

                const product = await trx('products').where('id', item.id).first();
                if (!product || !product.stock_enabled) continue;

                let stockHoldingProductId = product.id;
                if (product.parent_product_id) {
                    const parent = await trx('products').where('id', product.parent_product_id).first();
                    if (parent && parent.stock_sync_enabled) {
                        stockHoldingProductId = parent.id;
                    }
                }
                
                const currentChange = stockChanges.get(stockHoldingProductId) || 0;
                stockChanges.set(stockHoldingProductId, currentChange + item.quantity);
            }

            // 2. VALIDAR E APLICAR: Itera sobre as mudanças agregadas e aplica ao banco de dados.
            for (const [productId, totalQuantityChange] of stockChanges.entries()) {
                const product = await trx('products').where('id', productId).first();
                const currentStock = liveInventory[productId] ?? product.stock_quantity;

                if (operation === 'decrement' && currentStock < totalQuantityChange) {
                    throw new Error(`Estoque insuficiente para ${product.name}. Disponível: ${currentStock}, Solicitado: ${totalQuantityChange}.`);
                }

                await trx('products').where('id', productId)[operation]('stock_quantity', totalQuantityChange);
            }

            await trx.commit();
            return { success: true };
        } catch (error) {
            await trx.rollback();
            console.error(`[SocketIO-Server] ❌ Falha na operação de estoque:`, error.message);
            return { success: false, message: error.message };
        }
    };
    // ##################### FIM DA CORREÇÃO (AGREGAÇÃO DE ESTOQUE) ######################

    socket.on('reserve_stock', async (itemsToReserve) => {
        console.log(`[SocketIO-Server] 📥 Recebido "reserve_stock" de ${socket.id} para os itens:`, itemsToReserve);
        const result = await handleStockChange(itemsToReserve, 'decrement');
        if (result.success) {
            socket.emit('reservation_success');
            await initializeInventory(); 
        } else {
            socket.emit('reservation_failure', { message: result.message });
        }
    });

    socket.on('release_stock', async (itemsToRelease) => {
        console.log(`[SocketIO-Server] 📤 Recebido "release_stock" de ${socket.id} para os itens:`, itemsToRelease);
        // Para 'release', a operação no banco de dados é de incremento.
        await handleStockChange(itemsToRelease, 'increment');
        await initializeInventory();
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
