// backend/src/database/connection.js
const knex = require('knex');
const configuration = require('../../knexfile');

const env = process.env.NODE_ENV || 'development';
const config = configuration[env];

console.log(`[Knex] A iniciar conexão em modo: ${env}...`);

const connection = knex(config);

module.exports = connection;