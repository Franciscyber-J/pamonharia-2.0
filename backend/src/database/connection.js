// backend/src/database/connection.js
const knex = require('knex');
const configuration = require('../../knexfile');
const { parse } = require('pg-connection-string');

// Determina qual ambiente usar com base na variável de ambiente NODE_ENV.
const env = process.env.NODE_ENV || 'development';
const config = { ...configuration[env] }; // Clona a configuração para evitar mutação do objeto original

console.log(`[Knex] A iniciar conexão em modo: ${env}...`);

// #################### INÍCIO DA CORREÇÃO DEFINITIVA ####################
// Para o ambiente de produção, decompõe a DATABASE_URL e força o uso de IPv4.
// Isto é essencial para resolver o erro ENETUNREACH em plataformas como o Render.
if (env === 'production' && process.env.DATABASE_URL) {
  const dbConfig = parse(process.env.DATABASE_URL);
  
  config.connection = {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: { rejectUnauthorized: false },
    family: 4 // Força o driver 'pg' a usar IPv4
  };
}
// ##################### FIM DA CORREÇÃO DEFINITIVA ######################

const connection = knex(config);

module.exports = connection;
