// backend/knexfile.js
require('dotenv').config();

module.exports = {
  development: {
    client: 'pg',
    // A lógica de conexão foi movida para o connection.js
    connection: process.env.DATABASE_URL, 
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
  },

  production: {
    client: 'pg',
    // A lógica de conexão foi movida para o connection.js
    connection: process.env.DATABASE_URL, 
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
  }
};
