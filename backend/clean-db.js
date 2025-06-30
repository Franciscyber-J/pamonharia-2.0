// backend/clean-db.js
require('dotenv').config();
const knex = require('knex');
const configuration = require('./knexfile');

// IMPORTANTE: Usa a mesma configuração de conexão que a sua aplicação
const db = knex(configuration.development);

async function cleanDatabase() {
  console.log('--- INICIANDO LIMPEZA MANUAL DA BASE DE DADOS ---');
  try {
    // Lista de todas as tabelas na ordem inversa de dependência
    const tableNames = [
      'knex_migrations_lock',
      'knex_migrations',
      'combo_products',
      'combos',
      'order_items',
      'orders',
      'products',
      'users',
      'store_settings',
    ];

    for (const table of tableNames) {
      console.log(`A verificar e apagar tabela: ${table}...`);
      await db.schema.dropTableIfExists(table);
      console.log(`Tabela ${table} apagada (se existia).`);
    }

    console.log('--- ✅ LIMPEZA CONCLUÍDA ---');
    console.log('A sua base de dados está agora vazia e pronta para ser reconstruída.');

  } catch (error) {
    console.error('--- ❌ ERRO DURANTE A LIMPEZA ---', error);
  } finally {
    // Encerra a conexão para o script terminar
    await db.destroy();
    console.log('Conexão com a base de dados encerrada.');
  }
}

cleanDatabase();
