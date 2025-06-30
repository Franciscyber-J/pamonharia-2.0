// backend/seed-db.js
require('dotenv').config();
const knex = require('knex');
const configuration = require('./knexfile');

// Usa a mesma configuração de conexão que a sua aplicação, garantindo o uso de IPv4
const db = knex(configuration.development);

async function runSeeds() {
  console.log('--- INICIANDO EXECUÇÃO MANUAL DOS SEEDS ---');
  try {
    // Roda os seeds programaticamente usando a conexão correta
    await db.seed.run();
    console.log('--- ✅ SEEDS EXECUTADOS COM SUCESSO ---');
    console.log('A sua base de dados está agora pronta, com a estrutura e dados iniciais.');
  } catch (error) {
    console.error('--- ❌ ERRO DURANTE A EXECUÇÃO DOS SEEDS ---', error);
  } finally {
    // Encerra a conexão para o script terminar
    await db.destroy();
    console.log('Conexão com a base de dados encerrada.');
  }
}

runSeeds();
