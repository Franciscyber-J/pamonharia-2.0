const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path'); // 1. IMPORTAR O MÓDULO 'path'
const routes = require('./routes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use((request, response, next) => {
  request.io = io;
  return next();
});

app.use(express.json());

// 2. ADICIONAR O MIDDLEWARE DE FICHEIROS ESTÁTICOS
// Ele diz ao Express: "Sirva qualquer ficheiro pedido diretamente da pasta 'frontend'"
app.use(express.static(path.resolve(__dirname, '..', '..', 'frontend')));

app.use(routes);

const PORT = 10000;

// 6. Usamos 'server.listen' em vez de 'app.listen' para iniciar tudo junto
server.listen(PORT, () => {
  console.log('----------------------------------------------------');
  console.log('✅ Servidor Backend da Pamonharia 2.0 INICIADO');
  console.log(`🚀 API rodando em: http://localhost:${PORT}`);
  console.log('----------------------------------------------------');
  console.log('       -- ACESSO ÀS PÁGINAS (FRONTEND) --');
  console.log('');
  console.log('🔑 Dashboard Login:');
  console.log(`   http://localhost:${PORT}/`);
  console.log('');
  console.log('🍽️ Cardápio Público:');
  console.log(`   http://localhost:${PORT}/cardapio`);
  console.log('----------------------------------------------------');
  console.log('Aguardando requisições...');
});