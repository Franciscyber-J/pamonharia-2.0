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
            
            const allProducts = await connection('products').select('id', 'stock_quantity', 'parent_product_id', 'stock_sync_enabled', 'is_main_product');
            
            const productMap = new Map(allProducts.map(p => [p.id, p]));
            const newInventory = {};

            for (const product of allProducts) {
                let finalStock = product.stock_quantity;
                
                if (product.parent_product_id) {
                    const parent = productMap.get(product.parent_product_id);
                    if (parent && parent.stock_sync_enabled) {
                        finalStock = parent.stock_quantity;
                    }
                }
                newInventory[product.id] = finalStock;
            }

            liveInventory = newInventory;
            getIO().emit('stock_update', liveInventory);
            console.log(`[Server] ✅ Inventário completo recarregado e transmitido com regras de sincronização aplicadas.`);
        } catch (error) { 
            console.error('[Server] ❌ Erro ao recarregar o inventário:', error); 
        }
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
          console.log(`[handleStockChange] Operação de estoque recebida: ${operation}. Itens:`, JSON.stringify(items, null, 2));
    
          const trx = await connection.transaction();
          
          try {
              for (const item of items) {
                  if (!item.id || !item.quantity) continue;
                  
                  const product = await trx('products').where({ id: item.id, stock_enabled: true }).first();
                  if (!product) continue;

                  console.log(`[handleStockChange] Produto [ID: ${product.id}, Nome: ${product.name}] é válido para alteração de estoque.`);
                  const changeAmount = operation === 'decrement' ? -item.quantity : item.quantity;
                  
                  const currentStock = product.stock_quantity;
                  if (operation === 'decrement' && (currentStock === null || currentStock < item.quantity)) {
                      throw new Error(`Estoque insuficiente para o produto "${product.name}".`);
                  }

                  await trx('products').where('id', product.id).increment('stock_quantity', changeAmount);

                  if (product.is_main_product && product.stock_sync_enabled) {
                      console.log(`[handleStockChange] Sincronização ativa para ${product.name}. Propagando alteração para os filhos.`);
                      await trx('products')
                          .where('parent_product_id', product.id)
                          .increment('stock_quantity', changeAmount);
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
          console.error(`[Server] ❌ Falha crítica na operação de estoque:`, error.message);
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