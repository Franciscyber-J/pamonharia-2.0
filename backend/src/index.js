// backend/src/index.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const connection = require('./database/connection');
const routes = require('./routes'); // Importa as rotas da API

// Função principal assíncrona para controlar a ordem de inicialização
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

  // Lógica de inventário e Sockets (sem alterações)
  let liveInventory = {};
  async function initializeInventory() { /* ...código do inventário existente... */ }
  function broadcastLiveInventory() { /* ...código do inventário existente... */ }
  
  // Middlewares essenciais
  app.use(cors());
  app.use(express.json());

  // Middleware para injetar io e trigger nos controllers
  app.use((request, response, next) => {
    request.io = io;
    request.triggerInventoryReload = initializeInventory;
    return next();
  });

  // SERVE TODOS OS FICHEIROS ESTÁTICOS DA PASTA FRONTEND
  // Esta linha resolve o problema de acesso ao CSS e JS do dashboard.
  app.use(express.static(path.resolve(__dirname, '..', '..', 'frontend')));

  // USA O FICHEIRO DE ROTAS APENAS PARA ENDPOINTS DE API
  app.use('/api', routes); // Prefixo '/api' para todas as rotas da API

  io.on('connection', (socket) => { /* ...lógica de sockets existente... */ });

  const PORT = process.env.PORT || 10000;
  server.listen(PORT, async () => {
    await initializeInventory();
    console.log('----------------------------------------------------');
    console.log('✅ Servidor Backend da Pamonharia 2.0 ONLINE');
    console.log(`🚀 API a rodar em: http://localhost:${PORT}`);
    console.log('----------------------------------------------------');
  });

  // Funções do inventário (para colar o código completo)
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
    const handleStockChange = async (items, operation) => { /* ... */ };
    socket.on('reserve_stock', async (itemsToReserve) => { const result = await handleStockChange(itemsToReserve, 'decrement'); if (result.success) { socket.emit('reservation_success'); await initializeInventory(); } else { socket.emit('reservation_failure', { message: result.message }); } });
    socket.on('release_stock', async (itemsToRelease) => { await handleStockChange(itemsToRelease, 'increment'); await initializeInventory(); });
    socket.on('force_inventory_reload', () => { initializeInventory(); });
    socket.on('disconnect', () => { console.log(`[SocketIO-Server] ⬅️ Cliente desconectado: ${socket.id}`); });
  });
}

startServer();