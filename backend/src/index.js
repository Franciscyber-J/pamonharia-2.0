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

  // #################### INÍCIO DA ARQUITETURA PROFISSIONAL DE ESTADO ####################

  // O liveInventory é a ÚNICA FONTE DA VERDADE para o estado do estoque em tempo real.
  let liveInventory = {};

  // O triggerInventoryReload agora é uma função interna, usada apenas para recarregar
  // o estado completo em casos específicos (como uma alteração de produto no dashboard).
  const triggerFullInventoryReload = async () => {
    try {
        console.log('[SocketIO-Server] RECARREGANDO inventário completo da base de dados...');
        const productsWithStock = await connection('products').where('stock_enabled', true).select('id', 'stock_quantity', 'name');
        const newInventory = {};
        productsWithStock.forEach(p => { newInventory[p.id] = p.stock_quantity; });
        liveInventory = newInventory;
        broadcastLiveInventory(); // Transmite o estado novo e completo
        console.log(`[SocketIO-Server] ✅ Inventário completo recarregado e transmitido.`);
    } catch (error) { console.error('[SocketIO-Server] ❌ Erro ao recarregar o inventário:', error); }
  };
  
  // Injeta o 'io' e o 'trigger' em todas as requisições da API
  app.use((request, response, next) => {
    request.io = io;
    // O nome da função exposta é mais explícito agora
    request.triggerInventoryReload = triggerFullInventoryReload; 
    return next();
  });

  // 1. Roteamento da API: Todas as rotas de API são prefixadas com /api
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
  
  // Lógica de Sockets e Inventário Otimizada
  function broadcastLiveInventory() {
    console.log('[SocketIO-Server] 📡 Emitindo evento "stock_update" para todos os clientes com os dados:', liveInventory);
    io.emit('stock_update', liveInventory);
  }

  // Função centralizada para alterar o estoque. Agora, ela atualiza a memória PRIMEIRO.
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
            // Se a transação falhar, recarregamos o inventário da DB para garantir a consistência.
            await triggerFullInventoryReload(); 
            throw err; // Propaga o erro para o chamador
          }
          
          // Transmite o estado do inventário atualizado em memória IMEDIATAMENTE.
          broadcastLiveInventory(); 
          return { success: true };

      } catch (error) {
          console.error(`[SocketIO-Server] ❌ Falha na operação de estoque:`, error.message);
          return { success: false, message: error.message };
      }
  };

  io.on('connection', (socket) => {
    console.log(`[SocketIO-Server] ➡️ Cliente conectado: ${socket.id}`);
    // Envia o estado atual do inventário assim que um cliente conecta.
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

  // ##################### FIM DA ARQUITETURA PROFISSIONAL DE ESTADO #####################

  const PORT = process.env.PORT || 10000;
  server.listen(PORT, async () => {
    // A carga inicial do inventário a partir da base de dados.
    await triggerFullInventoryReload();
    console.log('----------------------------------------------------');
    console.log('✅ Servidor Backend da Pamonharia 2.0 ONLINE');
    console.log(`🚀 API a rodar em: http://localhost:${PORT}`);
    console.log('----------------------------------------------------');
  });
}

startServer();