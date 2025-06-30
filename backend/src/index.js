// backend/src/index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// IMPORTANTE: A conexão só será importada DENTRO da função de arranque.
const connection = require('./database/connection');

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
app.use(express.static(path.resolve(__dirname, '..', '..', 'frontend')));

const PORT = 10000;

// --- FUNÇÃO DE INICIALIZAÇÃO ROBUSTA ---
async function startServer() {
  try {
    console.log('----------------------------------------------------');
    console.log('🔄 Verificando o estado da conexão com a base de dados...');
    
    // Garante que o pool de conexões está limpo antes de começar.
    await connection.destroy();
    await connection.initialize();
    console.log('-> Pool de conexões reinicializado.');

    // Executa a verificação do schema.
    const result = await connection.raw(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'products'"
    );
    const columns = result.rows.map(r => r.column_name);
    
    if (columns.includes('is_main_product')) {
        console.log('✅ SUCESSO: A base de dados está sincronizada!');
    } else {
        console.log('❌ FALHA CRÍTICA: A coluna "is_main_product" não foi encontrada.');
        console.log('   Execute o ciclo de limpeza e migração novamente:');
        console.log('   1. node clean-db.js');
        console.log('   2. npx knex migrate:latest');
        console.log('   3. node seed-db.js');
        throw new Error('Schema Mismatch');
    }

    // CARREGAMENTO ESTRATÉGICO: As rotas só são carregadas DEPOIS da verificação da BD.
    console.log('-> Conexão validada. Carregando rotas da aplicação...');
    const routes = require('./routes');
    app.use(routes);
    console.log('-> Rotas carregadas com sucesso.');

    // Se tudo correu bem, inicia o servidor.
    server.listen(PORT, () => {
      console.log('----------------------------------------------------');
      console.log('✅ Servidor Backend da Pamonharia 2.0 INICIADO');
      console.log(`🚀 API rodando em: http://localhost:${PORT}`);
      console.log('----------------------------------------------------');
      console.log('Aguardando requisições...');
    });

  } catch (error) {
    console.error('❌ ERRO FATAL AO INICIAR O SERVIDOR:', error.message);
    process.exit(1); // Encerra o processo se a conexão com a BD falhar
  }
}

// Inicia o servidor usando a nossa função robusta
startServer();
