// backend/src/database/connection.js
const knex = require('knex');
const configuration = require('../../knexfile');
const { parse } = require('pg-connection-string');

// Determina qual ambiente usar com base na variável de ambiente NODE_ENV.
const env = process.env.NODE_ENV || 'development';
const config = { ...configuration[env] }; // Clona a configuração para evitar mutação.

console.log(`[Knex] A iniciar conexão em modo: ${env}...`);

// #################### INÍCIO DA CORREÇÃO DEFINITIVA ####################
// Para o ambiente de produção, vamos usar o endereço IPv4 explícito para
// evitar problemas de resolução de DNS (IPv6) em plataformas como o Render.
if (env === 'production') {
  if (!process.env.DATABASE_URL || !process.env.DB_HOST_IPV4) {
    // Adiciona uma verificação para garantir que as variáveis de ambiente existem.
    throw new Error('As variáveis de ambiente DATABASE_URL e DB_HOST_IPV4 são obrigatórias em produção!');
  }

  const dbUrlConfig = parse(process.env.DATABASE_URL);
  
  config.connection = {
    // Usa o endereço IPv4 explícito da nossa variável de ambiente.
    host: process.env.DB_HOST_IPV4,
    
    // Pega o resto das informações da DATABASE_URL original.
    port: dbUrlConfig.port || 5432,
    user: dbUrlConfig.user,
    password: dbUrlConfig.password,
    database: dbUrlConfig.database,

    // Mantém as configurações essenciais para produção.
    ssl: { rejectUnauthorized: false },
  };
}
// ##################### FIM DA CORREÇÃO DEFINITIVA ######################

const connection = knex(config);

module.exports = connection;
