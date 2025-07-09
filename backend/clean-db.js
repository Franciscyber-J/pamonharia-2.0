// backend/clean-db.js
require('dotenv').config({ path: require('path').resolve(__dirname, './.env') });
const knex = require('knex');
const configuration = require('./knexfile');

// Usa a configuração de desenvolvimento para o script de limpeza local.
// Altere para configuration.production se precisar limpar o banco de produção.
const db = knex(configuration.development);

async function cleanDatabase() {
  console.log('--- INICIANDO LIMPEZA MANUAL DA BASE DE DADOS ---');
  try {
    // CORREÇÃO: A ordem das tabelas foi ajustada para respeitar as dependências
    // de chaves estrangeiras. Tabelas que são referenciadas por outras
    // são apagadas por último.
    const tableNames = [
      'knex_migrations_lock',
      'knex_migrations',
      'order_items',      // Depende de 'orders', 'products', 'combos' -> Apagada primeiro
      'combo_products',   // Depende de 'combos', 'products' -> Apagada no início
      'orders',           // É referenciada por 'order_items'
      'combos',           // É referenciada por 'combo_products' e 'order_items'
      'products',         // É referenciada por várias tabelas
      'users',
      'store_settings',
    ];

    for (const table of tableNames) {
      console.log(`A verificar e apagar tabela: ${table}...`);
      // Usamos .raw para poder adicionar o 'CASCADE', que apaga as dependências automaticamente.
      // Esta é uma abordagem ainda mais robusta.
      await db.raw(`DROP TABLE IF EXISTS "${table}" CASCADE`);
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
