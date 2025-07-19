// backend/knexfile.js
require('dotenv').config();
const { parse } = require('pg-connection-string');

// Função auxiliar para construir um objeto de conexão robusto a partir de uma string.
// Inclui a configuração SSL essencial para a Supabase.
const buildConnection = (connectionString) => {
  if (!connectionString) {
    // Lança um erro claro se a variável de ambiente não estiver definida.
    throw new Error('A connection string da base de dados (DATABASE_URL ou DEV_DATABASE_URL) não foi encontrada no ficheiro .env.');
  }
  const dbConfig = parse(connectionString);
  return {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: { rejectUnauthorized: false }, // Esta linha é a chave para a conexão bem-sucedida.
  };
};

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

module.exports = {
  development: {
    ...baseConfig,
    connection: buildConnection(process.env.DEV_DATABASE_URL),
  },

  production: {
    ...baseConfig,
    connection: buildConnection(process.env.DATABASE_URL),
  }
};