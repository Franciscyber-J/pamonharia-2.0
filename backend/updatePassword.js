// Ficheiro: backend/updatePassword.js
// OBJETIVO: SCRIPT DE USO ÚNICO PARA ATUALIZAR A SENHA DO ADMIN
require('dotenv').config({ path: require('path').resolve(__dirname, './.env') });
const bcrypt = require('bcryptjs');
const connection = require('./src/database/connection');

async function updateAdminPassword() {
  console.log('Iniciando atualização de senha...');
  const newPassword = 'admin123';
  const adminEmail = 'admin@pamonharia.com';

  // Criptografar a nova senha
  const password_hash = await bcrypt.hash(newPassword, 8);
  console.log('Novo hash da senha gerado.');

  // Atualizar no banco de dados
  const updated_rows = await connection('users')
    .where('email', adminEmail)
    .update({ password_hash: password_hash });

  if (updated_rows > 0) {
    console.log(`✅ Sucesso! A senha para '${adminEmail}' foi atualizada para '${newPassword}'.`);
  } else {
    console.error(`❌ Erro: Utilizador com email '${adminEmail}' não encontrado.`);
  }

  // Encerrar a conexão com o banco de dados para o script terminar
  await connection.destroy();
}

updateAdminPassword();