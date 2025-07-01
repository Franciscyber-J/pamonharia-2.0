// backend/src/index.js
const express = require('express');
const cors = require('cors'); // Pacote para gerir o CORS
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const connection = require('./database/connection'); // Conexão com a base de dados

const app = express();

// --- CONFIGURAÇÃO DE CORS ---
// Permite que o nosso frontend (e outras origens, se necessário) aceda à API.
app.use(cors()); 

const server = http.createServer(app);

// Configuração do Socket.IO com CORS para permitir a conexão do frontend
const io = new Server(server, {
  cors: {
    origin: "*", // Permite todas as origens, ideal para desenvolvimento
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
  }
});

// Middleware para injetar a instância do 'io' em todas as requisições
app.use((request, response, next) => {
  request.io = io;
  return next();
});

app.use(express.json());

// Serve os ficheiros estáticos do frontend
app.use(express.static(path.resolve(__dirname, '..', '..', 'frontend')));

// --- CARREGAMENTO ESTRATÉGICO DAS ROTAS ---
// As rotas só são carregadas DEPOIS de toda a configuração do app.
const routes = require('./routes');
app.use(routes);

const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log('----------------------------------------------------');
  console.log('✅ Servidor Backend da Pamonharia 2.0 INICIADO');
  console.log(`🚀 API a rodar em: http://localhost:${PORT}`);
  console.log('----------------------------------------------------');
  console.log('A aguardar requisições...');
});