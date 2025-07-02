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

    // ######################## INÍCIO DA CORREÇÃO (SINCRONIZAÇÃO ATÔMICA) ########################
    const handleStockChange = async (items, operation) => {
        const trx = await connection.transaction();
        try {
            for (const item of items) {
                if (!item.id || !item.quantity) continue;

                // Encontra o produto que efetivamente controla o estoque (pode ser ele mesmo ou o pai)
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
                    const currentStock = liveInventory[stockHoldingProduct.id] ?? stockHoldingProduct.stock_quantity;
                    const quantityChange = operation === 'decrement' ? item.quantity : -item.quantity;

                    if (operation === 'decrement' && currentStock < item.quantity) {
                        throw new Error(`Estoque insuficiente para ${stockHoldingProduct.name}. Disponível: ${currentStock}.`);
                    }

                    // 1. Atualiza o estoque do produto que detém o controle
                    await trx('products').where('id', stockHoldingProduct.id)[operation]('stock_quantity', item.quantity);
                    liveInventory[stockHoldingProduct.id] = (liveInventory[stockHoldingProduct.id] || 0) - quantityChange;

                    // 2. Se o produto que detém o estoque tem sincronização ativa, propaga a alteração para os filhos
                    if (stockHoldingProduct.stock_sync_enabled) {
                        console.log(`[SocketIO-Server] Sincronização ativa para ${stockHoldingProduct.name}. Propagando estoque para os filhos.`);
                        const newStockValue = await trx('products').where('id', stockHoldingProduct.id).select('stock_quantity').first();
                        await trx('products')
                            .where('parent_product_id', stockHoldingProduct.id)
                            .update({ stock_quantity: newStockValue.stock_quantity });
                    }
                }
            }
            await trx.commit();
            return { success: true };
        } catch (error) {
            await trx.rollback();
            console.error(`[SocketIO-Server] ❌ Falha na operação de estoque:`, error.message);
            return { success: false, message: error.message };
        }
    };

    socket.on('reserve_stock', async (itemsToReserve) => {
        console.log(`[SocketIO-Server] 📥 Recebido "reserve_stock" de ${socket.id} para os itens:`, itemsToReserve);
        const result = await handleStockChange(itemsToReserve, 'decrement');
        if (result.success) {
            socket.emit('reservation_success');
            await initializeInventory(); // Recarrega o inventário do DB e transmite para todos
        } else {
            socket.emit('reservation_failure', { message: result.message });
        }
    });

    socket.on('release_stock', async (itemsToRelease) => {
        console.log(`[SocketIO-Server] 📤 Recebido "release_stock" de ${socket.id} para os itens:`, itemsToRelease);
        await handleStockChange(itemsToRelease, 'increment');
        await initializeInventory(); // Recarrega o inventário do DB e transmite para todos
    });
    // ######################### FIM DA CORREÇÃO (SINCRONIZAÇÃO ATÔMICA) ##########################
    
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
