// backend/knexfile.js
require('dotenv').config();
const { parse } = require('pg-connection-string');

// Configuração base partilhada entre ambientes
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
    family: 4 // A correção do IPv4 agora está no sítio certo
  };
}

module.exports = {
  development: {
    ...baseConfig,
    connection: process.env.DATABASE_URL,
  },

  production: {
    ...baseConfig,
    connection: productionConnection,
  }
};