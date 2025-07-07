// backend/src/database/connection.js
const knex = require('knex');
const configuration = require('../../knexfile');
const { parse } = require('pg-connection-string');
const dns = require('dns');

// Força preferência por IPv4 em resoluções DNS (precaução extra)
dns.setDefaultResultOrder('ipv4first');

// Determina qual ambiente usar com base na variável de ambiente NODE_ENV
const env = process.env.NODE_ENV || 'development';
const config = { ...configuration[env] };

console.log(`[Knex] A iniciar conexão em modo: ${env}...`);

// #################### AJUSTE PARA PRODUÇÃO COM SUPABASE ####################
if (env === 'production' && process.env.DATABASE_URL) {
  const dbConfig = parse(process.env.DATABASE_URL);

  config.connection = {
    host: dbConfig.host,             // Ex: aws-0-sa-east-1.pooler.supabase.com
    port: dbConfig.port || 5432,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: { rejectUnauthorized: false }, // Recomendado para Supabase
    family: 4, // Força IPv4
  };
}
// ###########################################################################

const connection = knex(config);
module.exports = connection;
