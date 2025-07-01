// backend/src/database/seeds/00_create_initial_user.js
const bcrypt = require('bcryptjs');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Verifica se o usuário já existe para evitar erros de duplicidade
  const userExists = await knex('users').where('email', 'admin@pamonharia.com').first();

  if (!userExists) {
    // Gera o hash da senha padrão
    const password_hash = await bcrypt.hash('admin123', 8);

    // Insere o usuário administrador na tabela 'users'
    await knex('users').insert([
      {
        name: 'Administrador',
        email: 'admin@pamonharia.com',
        password_hash: password_hash,
      }
    ]);

    console.log("✅ Seed: Usuário 'admin@pamonharia.com' criado com sucesso.");
  } else {
    console.log("ℹ️ Seed: Usuário 'admin@pamonharia.com' já existe. Nenhuma ação foi necessária.");
  }
};