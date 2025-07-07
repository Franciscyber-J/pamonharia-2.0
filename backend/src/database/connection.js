const knex = require('knex');
const configuration = require('../../knexfile');
const { parse } = require('pg-connection-string');
const dns = require('dns');

// Força o Node a preferir IPv4 em resoluções DNS (segurança extra)
dns.setDefaultResultOrder('ipv4first');

const env = process.env.NODE_ENV || 'development';
const config = { ...configuration[env] };

console.log(`[Knex] A iniciar conexão em modo: ${env}...`);

if (!process.env.DATABASE_URL) {
  throw new Error('A variável DATABASE_URL não está definida!');
}

if (env === 'production') {
  const dbConfig = parse(process.env.DATABASE_URL);

  config.connection = {
    host: dbConfig.host, // já será o IPv4 se você ajustou .env
    port: dbConfig.port || 5432,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: { rejectUnauthorized: false },
    family: 4, // Força uso de IPv4 (ainda que redundante se host já for IP)
  };
} else {
  config.connection = process.env.DATABASE_URL;
}

const connection = knex(config);
module.exports = connection;
