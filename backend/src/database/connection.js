// backend/src/database/connection.js
const knex = require('knex');
const configuration = require('../../knexfile');
const { parse } = require('pg-connection-string');

const env = process.env.NODE_ENV || 'development';
const config = { ...configuration[env] };

console.log(`[Knex] A iniciar conexão em modo: ${env}...`);

// #################### INÍCIO DA CORREÇÃO DEFINITIVA ####################
// Em produção, decompomos a DATABASE_URL para forçar o uso de IPv4,
// resolvendo o erro 'ENETUNREACH' em plataformas como o Render.
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
