// backend/knexfile.js
require('dotenv').config();
const { parse } = require('pg-connection-string');

const buildConnection = (connectionString) => {
  if (!connectionString) {
    throw new Error('A connection string da base de dados (DATABASE_URL ou DEV_DATABASE_URL) não foi encontrada no ficheiro .env.');
  }
  const dbConfig = parse(connectionString);
  return {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: { rejectUnauthorized: false },
  };
};

// #################### INÍCIO DA CORREÇÃO ####################
// ARQUITETO: Configuração de pool robusta para ambientes serverless/gratuitos como o Render.
const robustPoolConfig = {
  // Define o número mínimo de conexões a manter abertas. 0 é ideal para a camada gratuita.
  min: 0,
  // Define o número máximo de conexões.
  max: 7,
  // Função que o Knex/Tarn usará para verificar se uma conexão está "viva" antes de a usar.
  // Se a validação falhar, a conexão é destruída e uma nova é criada.
  validate: (connection) => {
    // A propriedade `_connected` é uma forma interna do `pg` de verificar o status.
    return connection._connected;
  },
  // Tempo em milissegundos que uma conexão pode ficar inativa no pool antes de ser fechada.
  idleTimeoutMillis: 30000,
  // Com que frequência o pool deve verificar e remover conexões inativas.
  reapIntervalMillis: 1000,
};
// ##################### FIM DA CORREÇÃO ######################

const baseConfig = {
  client: 'pg',
  migrations: {
    directory: './src/database/migrations'
  },
  seeds: {
    directory: './src/database/seeds'
  }
};

module.exports = {
  development: {
    ...baseConfig,
    connection: buildConnection(process.env.DEV_DATABASE_URL),
    pool: robustPoolConfig, // Aplica a configuração robusta ao desenvolvimento
  },

  production: {
    ...baseConfig,
    connection: buildConnection(process.env.DATABASE_URL),
    pool: robustPoolConfig, // Aplica a configuração robusta à produção
  }
};