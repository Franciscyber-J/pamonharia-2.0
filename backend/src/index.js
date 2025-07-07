// backend/src/index.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const connection = require('./database/connection');
const routes = require('./routes');

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

  app.use((request, response, next) => {
    request.io = io;
    request.triggerInventoryReload = initializeInventory;
    return next();
  });

  // 1. SERVE TODOS OS FICHEIROS ESTÁTICOS DA PASTA `frontend`
  app.use(express.static(path.resolve(__dirname, '..', '..', 'frontend')));

  // 2. USA O FICHEIRO DE ROTAS APENAS PARA ENDPOINTS QUE COMEÇAM COM `/api`
  app.use('/api', routes);

  // 3. ROTA DE FALLBACK: Redireciona o acesso à raiz do site para a página de login
  //    Isto garante que os utilizadores tenham sempre um ponto de entrada.
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'login.html'));
  });

  // Lógica de Sockets e Inventário (sem alterações)
  let liveInventory = {};
  async function initializeInventory() {
    try {
        console.log('[SocketIO-Server] INICIALIZANDO/RECARREGANDO inventário da base de dados...');
        const productsWithStock = await connection('products').where('stock_enabled', true).select('id', 'stock_quantity', 'name');
        const newInventory = {};
        productsWithStock.forEach(p => { newInventory[p.id] = p.stock_quantity; });
        liveInventory = newInventory;
        broadcastLiveInventory();
        console.log(`[SocketIO-Server] ✅ Inventário inicializado e transmitido. Itens com estoque: ${productsWithStock.map(p => `${p.name}: ${p.stock_quantity}`).join(', ') || 'Nenhum'}`);
    } catch (error) { console.error('[SocketIO-Server] ❌ Erro ao inicializar o inventário:', error); }
  }
  function broadcastLiveInventory() {
    console.log('[SocketIO-Server] 📡 Emitindo evento "stock_update" para todos os clientes com os dados:', liveInventory);
    io.emit('stock_update', liveInventory);
  }
  io.on('connection', (socket) => {
    console.log(`[SocketIO-Server] ➡️ Cliente conectado: ${socket.id}`);
    socket.emit('stock_update', liveInventory);
    const handleStockChange = async (items, operation) => {
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
                    if (parent && parent.stock_sync_enabled) {
                        stockHoldingProductId = parent.id;
                    }
                }
                const currentChange = stockChanges.get(stockHoldingProductId) || 0;
                stockChanges.set(stockHoldingProductId, currentChange + item.quantity);
            }
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
    socket.on('reserve_stock', async (itemsToReserve) => { const result = await handleStockChange(itemsToReserve, 'decrement'); if (result.success) { socket.emit('reservation_success'); await initializeInventory(); } else { socket.emit('reservation_failure', { message: result.message }); } });
    socket.on('release_stock', async (itemsToRelease) => { await handleStockChange(itemsToRelease, 'increment'); await initializeInventory(); });
    socket.on('force_inventory_reload', () => { initializeInventory(); });
    socket.on('disconnect', () => { console.log(`[SocketIO-Server] ⬅️ Cliente desconectado: ${socket.id}`); });
  });

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