// backend/src/database/seeds/00_create_initial_user.js
const bcrypt = require('bcryptjs');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // --- Utilizador Administrador ---
  const adminEmail = 'admin@pamonharia.com';
  const adminExists = await knex('users').where('email', adminEmail).first();

  if (!adminExists) {
    const password_hash = await bcrypt.hash('admin123', 8);
    await knex('users').insert([{
      name: 'Administrador',
      email: adminEmail,
      password_hash: password_hash,
    }]);
    console.log(`✅ Seed: Utilizador '${adminEmail}' criado com sucesso.`);
  } else {
    console.log(`ℹ️ Seed: Utilizador '${adminEmail}' já existe.`);
  }

  // --- Utilizador Operador ---
  const operatorEmail = 'operador@pamonharia.com';
  const operatorExists = await knex('users').where('email', operatorEmail).first();

  if (!operatorExists) {
    // Senha para o operador: 'operador123'
    const password_hash = await bcrypt.hash('operador123', 8);
    await knex('users').insert([{
      name: 'Operador de Caixa',
      email: operatorEmail,
      password_hash: password_hash,
    }]);
    console.log(`✅ Seed: Utilizador '${operatorEmail}' criado com sucesso.`);
  } else {
    console.log(`ℹ️ Seed: Utilizador '${operatorEmail}' já existe.`);
  }
};