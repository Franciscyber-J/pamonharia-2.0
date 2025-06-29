// backend/src/controllers/UserController.js
const connection = require('../database/connection');
const bcrypt = require('bcryptjs');

module.exports = {
  async create(request, response) {
    // Lógica para criar um utilizador
    const { name, email, password } = request.body;

    // Gerar o hash da senha
    const password_hash = await bcrypt.hash(password, 8); // O 8 é o "custo" do hash

    // Inserir na base de dados
    try {
      await connection('users').insert({
        name,
        email,
        password_hash,
      });

      // Retornar sucesso (201 - Created) sem mostrar dados sensíveis
      return response.status(201).send();

    } catch (error) {
      // Tratar erros, como email duplicado
      if (error.code === '23505') { // Código de erro do PostgreSQL para violação de constraint única
        return response.status(409).json({ error: 'Email already in use.' }); // 409 - Conflict
      }
      
      return response.status(500).json({ error: 'An error occurred while creating the user.' });
    }
  }
};