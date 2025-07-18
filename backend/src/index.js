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

    // #################### INÍCIO DA CORREÇÃO ####################
    // ARQUITETO: Função `triggerFullInventoryReload` refatorada para aplicar a regra de
    // sincronização de stock antes de transmitir os dados para os clientes.
    const triggerFullInventoryReload = async () => {
        try {
            console.log('[Server] Recarregando inventário completo da base de dados...');
            
            // 1. Busca todos os produtos para entender a hierarquia e as regras de sincronização.
            const allProducts = await connection('products').select('id', 'stock_quantity', 'parent_product_id', 'stock_sync_enabled');
            
            // 2. Cria mapas para uma consulta rápida e eficiente.
            const productMap = new Map(allProducts.map(p => [p.id, p]));
            const newInventory = {};

            // 3. Constrói o inventário final, aplicando a regra de sincronização.
            for (const product of allProducts) {
                let finalStock = product.stock_quantity;
                
                // Se este produto tem um pai e esse pai tem a sincronização ativa, o stock do pai é a lei.
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
    // ##################### FIM DA CORREÇÃO ######################
    
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
    
          const stockChanges = new Map();
    
          for (const item of items) {
              if (!item.id || !item.quantity) continue;
    
              const product = await connection('products').where({ id: item.id, stock_enabled: true }).first();
    
              if (product) {
                  console.log(`[handleStockChange] Produto [ID: ${product.id}, Nome: ${product.name}] é válido para alteração de estoque.`);
                  const currentChange = stockChanges.get(product.id) || 0;
                  stockChanges.set(product.id, currentChange + item.quantity);
              }
          }
    
          console.log('[handleStockChange] Mapa final de alterações de estoque a ser processado:', stockChanges);
    
          if (stockChanges.size === 0) {
              console.log('[handleStockChange] Nenhum item com controle de estoque ativo para atualizar.');
              return { success: true };
          }
    
          const trx = await connection.transaction();
          try {
              for (const [productId, totalQuantityChange] of stockChanges.entries()) {
                  const dbProduct = await trx('products').where('id', productId).first();
                  if (!dbProduct) {
                      console.warn(`[handleStockChange] Produto ID ${productId} não encontrado na transação. A ignorar.`);
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