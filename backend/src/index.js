// backend/src/index.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const connection = require('./database/connection');
const apiRoutes = require('./routes'); // Renomeado para clareza

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

  // Middlewares essenciais
  app.use(cors());
  app.use(express.json());

  // Injeta o 'io' e o 'trigger' em todas as requisições da API
  app.use((request, response, next) => {
    request.io = io;
    request.triggerInventoryReload = initializeInventory;
    return next();
  });

  // 1. Roteamento da API: Todas as rotas de API são prefixadas com /api
  app.use('/api', apiRoutes);

  // 2. Roteamento de Ficheiros Estáticos: Serve CSS, JS, imagens, etc.
  app.use(express.static(path.resolve(__dirname, '..', '..', 'frontend')));

  // 3. Roteamento de Páginas HTML: Define explicitamente as rotas para as páginas principais
  app.get(['/', '/login'], (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'login.html'));
  });
   app.get(['/dashboard', '/dashboard.html'], (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'dashboard.html'));
  });
  app.get('/cardapio', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'cardapio', 'index.html'));
  });
  
  // #################### INÍCIO DA CORREÇÃO ####################
  // Lógica de Sockets e Inventário Otimizada
  let liveInventory = {};

  async function initializeInventory() {
    try {
        console.log('[SocketIO-Server] INICIALIZANDO/RECARREGANDO inventário da base de dados...');
        const productsWithStock = await connection('products').where('stock_enabled', true).select('id', 'stock_quantity', 'name');
        const newInventory = {};
        productsWithStock.forEach(p => { newInventory[p.id] = p.stock_quantity; });
        liveInventory = newInventory;
        broadcastLiveInventory();
        console.log(`[SocketIO-Server] ✅ Inventário inicializado e transmitido.`);
    } catch (error) { console.error('[SocketIO-Server] ❌ Erro ao inicializar o inventário:', error); }
  }

  function broadcastLiveInventory() {
    console.log('[SocketIO-Server] 📡 Emitindo evento "stock_update" para todos os clientes com os dados:', liveInventory);
    io.emit('stock_update', liveInventory);
  }

  // Função centralizada para alterar o estoque de forma atômica
  async function handleStockChange(items, operation) {
      const trx = await connection.transaction();
      try {
          const stockChanges = new Map();
          for (const item of items) {
              if (!item.id || !item.quantity) continue;
              const product = await trx('products').where('id', item.id).first();
              if (!product || !product.stock_enabled) continue;
              
              let stockHoldingProductId = product.id;
              if (product.parent_product_id) {
                  const parent = await trx('products').where('id', product.parent_product_id).first();
                  if (parent && parent.stock_sync_enabled) { stockHoldingProductId = parent.id; }
              }
              
              const currentChange = stockChanges.get(stockHoldingProductId) || 0;
              stockChanges.set(stockHoldingProductId, currentChange + item.quantity);
          }

          for (const [productId, totalQuantityChange] of stockChanges.entries()) {
              const product = await trx('products').where('id', productId).first();
              const currentStock = liveInventory[productId] ?? product.stock_quantity;

              if (operation === 'decrement') {
                  if (currentStock < totalQuantityChange) {
                    throw new Error(`Estoque insuficiente para ${product.name}. Disponível: ${currentStock}, Solicitado: ${totalQuantityChange}.`);
                  }
                  liveInventory[productId] = currentStock - totalQuantityChange;
                  await trx('products').where('id', productId).decrement('stock_quantity', totalQuantityChange);
              } else { // increment
                  liveInventory[productId] = currentStock + totalQuantityChange;
                  await trx('products').where('id', productId).increment('stock_quantity', totalQuantityChange);
              }
          }
          await trx.commit();
          broadcastLiveInventory(); // Transmite o estado do inventário atualizado em memória
          return { success: true };
      } catch (error) {
          await trx.rollback();
          console.error(`[SocketIO-Server] ❌ Falha na operação de estoque:`, error.message);
          return { success: false, message: error.message };
      }
  };

  io.on('connection', (socket) => {
    console.log(`[SocketIO-Server] ➡️ Cliente conectado: ${socket.id}`);
    socket.emit('stock_update', liveInventory);

    socket.on('reserve_stock', async (itemsToReserve, callback) => {
        const result = await handleStockChange(itemsToReserve, 'decrement');
        if (result.success) {
            socket.emit('reservation_success');
        } else {
            socket.emit('reservation_failure', { message: result.message });
        }
    });

    socket.on('release_stock', async (itemsToRelease) => {
        await handleStockChange(itemsToRelease, 'increment');
    });

    socket.on('force_inventory_reload', () => {
        initializeInventory();
    });

    socket.on('disconnect', () => {
        console.log(`[SocketIO-Server] ⬅️ Cliente desconectado: ${socket.id}`);
    });
  });
  // ##################### FIM DA CORREÇÃO ######################

  const PORT = process.env.PORT || 10000;
  server.listen(PORT, async () => {
    await initializeInventory();
    console.log('----------------------------------------------------');
    console.log('✅ Servidor Backend da Pamonharia 2.0 ONLINE');
    console.log(`🚀 API a rodar em: http://localhost:${PORT}`);
    console.log('----------------------------------------------------');
  });
}

startServer();