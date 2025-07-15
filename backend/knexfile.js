// backend/knexfile.js
require('dotenv').config();
const { parse } = require('pg-connection-string');

const baseConfig = {
  client: 'pg',
  migrations: {
    directory: './src/database/migrations'
  },
  seeds: {
    directory: './src/database/seeds'
  },
  pool: {
    min: 2,
    max: 10
  }
};

// Constrói o objeto de conexão de produção dinamicamente
let productionConnection = {};
if (process.env.DATABASE_URL) {
  const dbConfig = parse(process.env.DATABASE_URL);
  productionConnection = {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: { rejectUnauthorized: false },
  };
}

module.exports = {
  development: {
    ...baseConfig,
    // #################### INÍCIO DA CORREÇÃO ####################
    // Usa a variável DATABASE_URL para o ambiente de produção
    connection: process.env.DEV_DATABASE_URL, // variavel de ambiente de desenvolvimento
    // ##################### FIM DA CORREÇÃO ######################
  },

  production: {
    ...baseConfig,
    connection: productionConnection,
  }
};
