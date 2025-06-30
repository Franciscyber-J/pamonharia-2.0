// backend/test-db-connection.js
require('dotenv').config();
const knex = require('knex');
const configuration = require('./knexfile');

// Usa a mesma configuração de conexão que a sua aplicação
const db = knex(configuration.development);

async function testConnection() {
  console.log('--- INICIANDO TESTE DE CONEXÃO E SCHEMA ---');
  const testTableName = 'connection_test';
  try {
    console.log(`[1/4] Apagando a tabela de teste antiga ('${testTableName}')...`);
    await db.schema.dropTableIfExists(testTableName);
    console.log('-> Tabela de teste antiga apagada (se existia).');

    console.log(`[2/4] Criando uma nova tabela de teste ('${testTableName}') com a coluna 'test_column'...`);
    await db.schema.createTable(testTableName, (table) => {
      table.increments('id');
      table.string('test_column').notNullable();
    });
    console.log('-> Nova tabela de teste criada.');

    console.log(`[3/4] Verificando as colunas da nova tabela...`);
    const result = await db.raw(
      `SELECT column_name FROM information_schema.columns WHERE table_name = '${testTableName}'`
    );
    const columns = result.rows.map(row => row.column_name);
    
    console.log('-> Colunas encontradas:', columns);

    if (columns.includes('test_column')) {
      console.log('--- ✅ SUCESSO! O teste foi concluído. ---');
      console.log('Isto prova que a conexão está a funcionar e as alterações de schema são visíveis.');
      console.log('O problema está definitivamente relacionado a um cache no processo do Node.js ao usar "npm start".');
    } else {
      console.log('--- ❌ FALHA! O teste falhou. ---');
      console.log('A coluna "test_column" não foi encontrada após ser criada.');
      console.log('Isto indica um problema sério com a conexão à base de dados ou permissões.');
    }

    console.log(`[4/4] Limpando a tabela de teste...`);
    await db.schema.dropTableIfExists(testTableName);
    console.log('-> Tabela de teste apagada.');

  } catch (error) {
    console.error('--- ❌ ERRO CRÍTICO DURANTE O TESTE ---', error);
  } finally {
    await db.destroy();
    console.log('--- Teste finalizado. Conexão encerrada. ---');
  }
}

testConnection();
