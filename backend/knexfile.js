// backend/knexfile.js
require('dotenv').config();

module.exports = {
  development: {
    client: 'pg',
    // A propriedade 'connection' foi REMOVIDA.
    // Ela será construída dinamicamente no connection.js
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
    // A propriedade 'connection' foi REMOVIDA.
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
