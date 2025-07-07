// backend/src/database/connection.js
const knex = require('knex');
const configuration = require('../../knexfile');

// #################### INÍCIO DA CORREÇÃO ####################
// Determina qual ambiente usar com base na variável de ambiente NODE_ENV.
// O Render define automaticamente NODE_ENV como 'production'.
const config = process.env.NODE_ENV === 'production' 
  ? configuration.production 
  : configuration.development;

console.log(`[Knex] A iniciar conexão em modo: ${process.env.NODE_ENV || 'development'}...`);

const connection = knex(config);
// ##################### FIM DA CORREÇÃO ######################

module.exports = connection;
