// backend/src/index.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const connection = require('./database/connection');
const apiRoutes = require('./routes');
const { init: initSocketManager, getIO } = require('./socket-manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }
});

initSocketManager(io);

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
            getIO().emit('stock_update', liveInventory);
            console.log(`[Server] ✅ Inventário completo recarregado e transmitido.`);
        } catch (error) { console.error('[Server] ❌ Erro ao recarregar o inventário:', error); }
    };
    
    app.use((request, response, next) => {
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
        console.log(`[DIAGNÓSTICO] handleStockChange recebido. Operação: ${operation}. Itens:`, JSON.stringify(items, null, 2));

        const stockChanges = new Map();

        for (const item of items) {
            if (!item.id || !item.quantity) continue;

            const product = await connection('products').where('id', item.id).first();
            if (!product) continue;

            // Checa se o produto é filho de um pai com estoque sincronizado
            if (product.parent_product_id) {
                const parent = await connection('products').where('id', product.parent_product_id).first();

                // ⚠️ Se o pai tiver stock_sync_enabled, ENTÃO somente o pai deve controlar o estoque
                // E como o pai não está sendo enviado nesse caso, devemos ignorar este item
                if (parent && parent.stock_sync_enabled) {
                    console.log(`[IGNORADO] Produto ${product.id} está sincronizado com o pai ${parent.id}, mas o pai não está no payload. Ignorando.`);
                    continue;
                }
            }

            // ⚠️ Agora sim: este produto controla seu próprio estoque
            if (!product.stock_enabled) continue;

            const currentChange = stockChanges.get(product.id) || 0;
            stockChanges.set(product.id, currentChange + item.quantity);
        }

        console.log('[DIAGNÓSTICO] Mapa de alterações de estoque a ser processado:', stockChanges);

        if (stockChanges.size === 0) {
            console.log('[Stock] Nenhum item com controle de estoque para atualizar.');
            return { success: true };
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
                        throw new Error(`Estoque insuficiente para o produto "${dbProduct.name}".`);
                    }
                    await trx('products').where('id', productId).decrement('stock_quantity', totalQuantityChange);
                } else {
                    await trx('products').where('id', productId).increment('stock_quantity', totalQuantityChange);
                }
            }
            await trx.commit();
        } catch (err) {
            await trx.rollback();
            console.error(`[Server] ❌ Falha na transação de estoque, revertendo. Erro:`, err.message);
            await triggerFullInventoryReload();
            throw err;
        }

        await triggerFullInventoryReload();
        return { success: true };

    } catch (error) {
        console.error(`[Server] ❌ Falha na operação de estoque:`, error.message);
        return { success: false, message: error.message };
    }
}
    
    io.on('connection', (socket) => {
        console.log(`[Server] ➡️ Cliente conectado: ${socket.id}`);
        socket.emit('stock_update', liveInventory);

        socket.on('reserve_stock', async (itemsToReserve, callback) => {
            console.log(`[Socket.IO] Recebido 'reserve_stock' do cliente ${socket.id}`);
            try {
                const result = await handleStockChange(itemsToReserve, 'decrement');
                if (typeof callback === 'function') {
                    callback(result);
                }
            } catch (error) {
                console.error(`[Socket.IO] Falha na reserva para ${socket.id}: ${error.message}.`);
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