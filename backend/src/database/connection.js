// backend/src/database/connection.js
const knex = require('knex');
const configuration = require('../../knexfile');
const { parse } = require('pg-connection-string');

const env = process.env.NODE_ENV || 'development';
const config = { ...configuration[env] };

console.log(`[Knex] A iniciar conexão em modo: ${env}...`);

// #################### INÍCIO DA CORREÇÃO FINAL ####################
// Constrói o objeto de conexão do zero para garantir que não haja sobreposições.
if (env === 'production') {
  if (!process.env.DATABASE_URL) {
    throw new Error('A variável de ambiente DATABASE_URL é obrigatória em produção!');
  }
  const dbConfig = parse(process.env.DATABASE_URL);
  
  config.connection = {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: { rejectUnauthorized: false },
    family: 4 // Força o uso de IPv4
  };
} else {
  // Para desenvolvimento, usa a DATABASE_URL diretamente.
  config.connection = process.env.DATABASE_URL;
}
// ##################### FIM DA CORREÇÃO FINAL ######################

const connection = knex(config);

module.exports = connection;
