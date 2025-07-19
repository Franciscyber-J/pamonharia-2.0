// backend/clean-db.js
require('dotenv').config({ path: require('path').resolve(__dirname, './.env') });
const knex = require('knex');
const configuration = require('./knexfile');
const readline = require('readline');

const db = knex(configuration.development);

// #################### INÍCIO DA CORREÇÃO ####################
// ARQUITETO: Adicionada uma camada de confirmação para prevenir a execução acidental.
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));
// ##################### FIM DA CORREÇÃO ######################

async function cleanDatabase() {
  console.log('--- ⚠️ ATENÇÃO: INICIANDO LIMPEZA DA BASE DE DADOS DE DESENVOLVIMENTO ---');
  
  const confirmation = await askQuestion('Tem a certeza absoluta de que deseja apagar TODAS as tabelas desta base de dados? (sim/não): ');

  if (confirmation.toLowerCase() !== 'sim') {
    console.log('Operação cancelada pelo utilizador.');
    rl.close();
    await db.destroy();
    return;
  }
  
  rl.close();

  try {
    const tableNames = [
      'knex_migrations_lock', 'knex_migrations',
      'order_items', 'combo_products', 'orders', 
      'combos', 'products', 'users', 'store_settings',
    ];

    for (const table of tableNames) {
      console.log(`A apagar tabela: ${table}...`);
      await db.raw(`DROP TABLE IF EXISTS "${table}" CASCADE`);
      console.log(`-> Tabela ${table} apagada.`);
    }

    console.log('--- ✅ LIMPEZA CONCLUÍDA ---');
    console.log('A sua base de dados de desenvolvimento está vazia.');

  } catch (error) {
    console.error('--- ❌ ERRO DURANTE A LIMPEZA ---', error);
  } finally {
    await db.destroy();
    console.log('Conexão com a base de dados encerrada.');
  }
}

cleanDatabase();