// backend/src/index.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const connection = require('./database/connection');
const apiRoutes = require('./routes');

async function startServer() {
  console.log('----------------------------------------------------');
  console.log('🚀 INICIANDO SERVIDOR DA PAMONHARIA 2.0...');
  console.log('----------------------------------------------------');

  try {
    console.log('[Knex] A executar migrações...');
    await connection.migrate.latest();
    console.log('[Knex] ✅ Migrações concluídas com sucesso!');
    console.log('[Knex] A executar seeds...');
    await connection.seed.run();
    console.log('[Knex] ✅ Seeds concluídos com sucesso!');
  } catch (error) {
    console.error('❌ ERRO CRÍTICO AO INICIALIZAR A BASE DE DADOS:', error);
    process.exit(1);
  }

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }
  });

  app.use(cors());
  app.use(express.json());

  // #################### INÍCIO DA ARQUITETURA DE EVENTOS ####################
  let liveInventory = {};

  const triggerFullInventoryReload = async () => {
    try {
        console.log('[EventBus] Recarregando inventário completo da base de dados...');
        const productsWithStock = await connection('products').where('stock_enabled', true).select('id', 'stock_quantity');
        const newInventory = {};
        productsWithStock.forEach(p => { newInventory[p.id] = p.stock_quantity; });
        liveInventory = newInventory;
        io.emit('stock_update', liveInventory);
        console.log(`[EventBus] ✅ Inventário completo recarregado e transmitido.`);
    } catch (error) { console.error('[EventBus] ❌ Erro ao recarregar o inventário:', error); }
  };

  // O EventBus centraliza todas as emissões de Socket.IO
  const eventBus = {
    broadcastNewOrder: (order) => {
      console.log(`[EventBus] 🚀 Transmitindo evento 'new_order' para o pedido #${order.id}`);
      io.emit('new_order', order);
    },
    broadcastStatusUpdate: (orderId, status) => {
      console.log(`[EventBus] 🔄 Transmitindo evento 'order_status_updated' para o pedido #${orderId} com status ${status}`);
      io.emit('order_status_updated', { id: orderId, status });
    },
    broadcastHistoryCleared: () => {
      console.log(`[EventBus] 🧹 Transmitindo evento 'history_cleared'`);
      io.emit('history_cleared');
    },
    broadcastDataUpdated: () => {
      console.log('[EventBus] 🔄 Transmitindo evento geral "data_updated"');
      io.emit('data_updated');
    }
  };
  
  // Injeta o 'eventBus' e outras funções em todas as requisições da API
  app.use((request, response, next) => {
    request.eventBus = eventBus;
    request.triggerInventoryReload = triggerFullInventoryReload;
    request.io = io; // Mantemos o 'io' para compatibilidade com o stock
    return next();
  });
  // ##################### FIM DA ARQUITETURA DE EVENTOS ######################

  // 1. Roteamento da API
  app.use('/api', apiRoutes);

  // 2. Roteamento de Ficheiros Estáticos
  app.use(express.static(path.resolve(__dirname, '..', '..', 'frontend')));

  // 3. Roteamento de Páginas HTML
  app.get(['/', '/login'], (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'login.html'));
  });
   app.get(['/dashboard', '/dashboard.html'], (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'dashboard.html'));
  });
  app.get('/cardapio', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'cardapio', 'index.html'));
  });
  
  // Lógica de Sockets e Inventário
  io.on('connection', (socket) => {
    console.log(`[SocketIO-Server] ➡️ Cliente conectado: ${socket.id}`);
    socket.emit('stock_update', liveInventory);

    socket.on('reserve_stock', async (itemsToReserve) => {
        try {
            await handleStockChange(itemsToReserve, 'decrement');
            socket.emit('reservation_success');
        } catch (error) {
            socket.emit('reservation_failure', { message: error.message });
        }
    });

    socket.on('release_stock', async (itemsToRelease) => {
        await handleStockChange(itemsToRelease, 'increment');
    });

    socket.on('disconnect', () => {
        console.log(`[SocketIO-Server] ⬅️ Cliente desconectado: ${socket.id}`);
    });
  });
  
  async function handleStockChange(items, operation) {
      try {
          const stockChanges = new Map();
          for (const item of items) {
              if (!item.id || !item.quantity) continue;
              
              const product = await connection('products').where('id', item.id).first();
              if (!product || !product.stock_enabled) continue;
              
              let stockHoldingProductId = product.id;
              if (product.parent_product_id) {
                  const parent = await connection('products').where('id', product.parent_product_id).first();
                  if (parent && parent.stock_sync_enabled) { stockHoldingProductId = parent.id; }
              }
              
              const currentChange = stockChanges.get(stockHoldingProductId) || 0;
              stockChanges.set(stockHoldingProductId, currentChange + item.quantity);
          }

          const trx = await connection.transaction();
          try {
            for (const [productId, totalQuantityChange] of stockChanges.entries()) {
                const currentStock = liveInventory[productId] ?? 0;

                if (operation === 'decrement') {
                    if (currentStock < totalQuantityChange) {
                      const productDetails = await trx('products').where('id', productId).first();
                      throw new Error(`Estoque insuficiente para ${productDetails.name}.`);
                    }
                    liveInventory[productId] = currentStock - totalQuantityChange;
                    await trx('products').where('id', productId).decrement('stock_quantity', totalQuantityChange);
                } else { // increment
                    liveInventory[productId] = (liveInventory[productId] ?? 0) + totalQuantityChange;
                    await trx('products').where('id', productId).increment('stock_quantity', totalQuantityChange);
                }
            }
            await trx.commit();
          } catch(err) {
            await trx.rollback();
            console.error(`[SocketIO-Server] ❌ Falha na transação de estoque, revertendo. Erro:`, err.message);
            await triggerFullInventoryReload(); 
            throw err;
          }
          
          io.emit('stock_update', liveInventory);
          return { success: true };

      } catch (error) {
          console.error(`[SocketIO-Server] ❌ Falha na operação de estoque:`, error.message);
          return { success: false, message: error.message };
      }
  };

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