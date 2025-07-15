// backend/src/index.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const connection = require('./database/connection');
const apiRoutes = require('./routes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }
});

module.exports.io = io;

async function startServer() {
    console.log('----------------------------------------------------');
    console.log('🚀 INICIANDO SERVIDOR DA PAMONHARIA 2.0...');
    console.log('----------------------------------------------------');

    try {
        console.log('[Knex] A executar migrações...');
        await connection.migrate.latest();
        console.log('[Knex] ✅ Migrações concluídas com sucesso!');
        await connection.seed.run();
        console.log('[Knex] ✅ Seeds concluídos com sucesso!');
    } catch (error) {
        console.error('❌ ERRO CRÍTICO AO INICIALIZAR A BASE DE DADOS:', error);
        process.exit(1);
    }

    app.use(cors());
    app.use(express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));

    let liveInventory = {};

    const triggerFullInventoryReload = async () => {
        try {
            console.log('[Server] Recarregando inventário completo da base de dados...');
            const productsWithStock = await connection('products').where('stock_enabled', true).select('id', 'stock_quantity');
            const newInventory = {};
            productsWithStock.forEach(p => { newInventory[p.id] = p.stock_quantity; });
            liveInventory = newInventory;
            io.emit('stock_update', liveInventory);
            console.log(`[Server] ✅ Inventário completo recarregado e transmitido.`);
        } catch (error) { console.error('[Server] ❌ Erro ao recarregar o inventário:', error); }
    };
    
    app.use((request, response, next) => {
        request.io = io;
        request.triggerInventoryReload = triggerFullInventoryReload;
        return next();
    });

    app.use('/api', apiRoutes);
    app.use(express.static(path.resolve(__dirname, '..', '..', 'frontend')));
    app.get(['/', '/login'], (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'login.html')));
    app.get(['/dashboard', '/dashboard.html'], (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'dashboard.html')));
    app.get('/cardapio', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'cardapio', 'index.html')));

    async function handleStockChange(items, operation) {
        try {
            const stockChanges = new Map();
            const productsToSync = new Map();

            for (const item of items) {
                if (!item.id || !item.quantity) continue;
                
                const product = await connection('products').where('id', item.id).first();
                if (!product || !product.stock_enabled) continue;
                
                let stockHoldingProductId = product.id;
                let parentProductDetails = null;

                if (product.parent_product_id) {
                    parentProductDetails = await connection('products').where('id', product.parent_product_id).first();
                    if (parentProductDetails && parentProductDetails.stock_sync_enabled) { 
                        stockHoldingProductId = parentProductDetails.id;
                    }
                } else {
                    parentProductDetails = product;
                }
                
                if (parentProductDetails && parentProductDetails.stock_sync_enabled) {
                    productsToSync.set(parentProductDetails.id, parentProductDetails);
                }

                const currentChange = stockChanges.get(stockHoldingProductId) || 0;
                stockChanges.set(stockHoldingProductId, currentChange + item.quantity);
            }

            const trx = await connection.transaction();
            try {
                for (const [productId, totalQuantityChange] of stockChanges.entries()) {
                    const dbProduct = await trx('products').where('id', productId).first();
                    if (!dbProduct) {
                        console.warn(`[Stock] Produto ID ${productId} não encontrado na transação. A ignorar.`);
                        continue;
                    }
                    const currentStock = dbProduct.stock_quantity;
                    
                    if (operation === 'decrement') {
                        if (currentStock === null || currentStock < totalQuantityChange) {
                          throw new Error(`Estoque insuficiente para ${dbProduct.name}.`);
                        }
                        await trx('products').where('id', productId).decrement('stock_quantity', totalQuantityChange);
                    } else {
                        await trx('products').where('id', productId).increment('stock_quantity', totalQuantityChange);
                    }
                    
                    const productForSyncCheck = productsToSync.get(productId);
                    if (productForSyncCheck) {
                        const updatedParent = await trx('products').where('id', productId).first();
                        const newStockValue = updatedParent.stock_quantity;

                        console.log(`[StockSync] Sincronizando filhos do produto #${productId} para o novo estoque: ${newStockValue}`);
                        await trx('products')
                            .where('parent_product_id', productId)
                            .update({ stock_quantity: newStockValue });
                    }
                }
                await trx.commit();
            } catch(err) {
                await trx.rollback();
                console.error(`[Server] ❌ Falha na transação de estoque, revertendo. Erro:`, err.message);
                await triggerFullInventoryReload();
                throw err;
            }
            
            // #################### INÍCIO DA CORREÇÃO ####################
            // Após a transação bem-sucedida, recarrega o inventário inteiro e transmite.
            // Isto garante que o estado do inventário está sempre consistente com a fonte da verdade (DB).
            await triggerFullInventoryReload();
            // ##################### FIM DA CORREÇÃO ######################
            
            return { success: true };

        } catch (error) {
            console.error(`[Server] ❌ Falha na operação de estoque:`, error.message);
            return { success: false, message: error.message };
        }
    };
    
    io.on('connection', (socket) => {
        console.log(`[Server] ➡️ Cliente conectado: ${socket.id}`);
        socket.emit('stock_update', liveInventory);

        socket.on('reserve_stock', async (itemsToReserve, callback) => {
            console.log(`[Socket.IO] Recebido 'reserve_stock' do cliente ${socket.id}`);
            try {
                await handleStockChange(itemsToReserve, 'decrement');
                console.log(`[Socket.IO] Reserva para ${socket.id} bem-sucedida. Enviando ACK de sucesso.`);
                if (typeof callback === 'function') {
                    callback({ success: true });
                }
            } catch (error) {
                console.error(`[Socket.IO] Falha na reserva para ${socket.id}: ${error.message}. Enviando ACK de falha.`);
                if (typeof callback === 'function') {
                    callback({ success: false, message: error.message });
                }
            }
        });

        socket.on('release_stock', async (itemsToRelease) => {
            await handleStockChange(itemsToRelease, 'increment');
        });

        socket.on('disconnect', () => {
            console.log(`[Server] ⬅️ Cliente desconectado: ${socket.id}`);
        });
    });

    const PORT = process.env.PORT || 10000;
    server.listen(PORT, async () => {
        await triggerFullInventoryReload();
        console.log('----------------------------------------------------');
        console.log('✅ Servidor Backend da Pamonharia 2.0 ONLINE');
        console.log(`🚀 API a rodar em: http://localhost:${PORT}`);
        console.log('----------------------------------------------------');
    });
}

startServer();