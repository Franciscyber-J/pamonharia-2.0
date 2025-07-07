// backend/src/database/connection.js
const knex = require('knex');
const configuration = require('../../knexfile');

// #################### INÍCIO DA CORREÇÃO ####################
// Determina qual ambiente usar com base na variável de ambiente NODE_ENV.
const env = process.env.NODE_ENV || 'development';
const config = configuration[env];

console.log(`[Knex] A iniciar conexão em modo: ${env}...`);

// Força o uso de IPv4 diretamente na configuração do driver pg,
// o que resolve o erro de 'ENETUNREACH' em ambientes como o Render.
if (env === 'production') {
  config.connection = {
    ...config.connection,
    host: config.connection.host, // Garante que o host seja passado explicitamente
    port: config.connection.port,
    user: config.connection.user,
    database: config.connection.database,
    password: config.connection.password,
    ssl: { rejectUnauthorized: false },
    family: 4, // Hint para o driver pg
  };
}

const connection = knex(config);
// ##################### FIM DA CORREÇÃO ######################

module.exports = connection;
