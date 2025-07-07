// backend/src/database/connection.js
const knex = require('knex');
const configuration = require('../../knexfile');
const { parse } = require('pg-connection-string');
const dns = require('dns'); // Importa o módulo de DNS do Node.js

// Determina qual ambiente usar com base na variável de ambiente NODE_ENV.
const env = process.env.NODE_ENV || 'development';
const config = { ...configuration[env] }; // Clona a configuração para segurança.

console.log(`[Knex] A iniciar conexão em modo: ${env}...`);

// #################### INÍCIO DA CORREÇÃO DEFINITIVA PARA RENDER/SUPABASE ####################
// Para o ambiente de produção, vamos sobrepor a função de resolução de DNS (lookup)
// para forçar explicitamente o uso de IPv4. Esta é a forma mais fiável de
// resolver o erro 'ENETUNREACH' em plataformas de cloud que têm problemas com IPv6.
if (env === 'production') {
  if (!process.env.DATABASE_URL) {
    throw new Error('A variável de ambiente DATABASE_URL é obrigatória em produção!');
  }

  // Decompõe a URL de conexão para podermos modificar as suas propriedades.
  const dbUrlConfig = parse(process.env.DATABASE_URL);
  
  config.connection = {
    ...dbUrlConfig, // Usa todas as propriedades da URL (user, password, port, etc.)
    ssl: { rejectUnauthorized: false }, // Essencial para conexões com a Supabase

    // Esta é a correção crucial. Fornecemos uma função de lookup customizada.
    lookup: (hostname, options, callback) => {
      // Usamos a função de lookup padrão do Node, mas forçamo-la a procurar apenas por endereços da família '4' (IPv4).
      dns.lookup(hostname, { family: 4 }, (err, address, family) => {
        // Retornamos o resultado (o endereço IPv4) para o driver do banco de dados.
        callback(err, address, family);
      });
    },
  };
}
// ##################### FIM DA CORREÇÃO DEFINITIVA ######################

const connection = knex(config);

module.exports = connection;
