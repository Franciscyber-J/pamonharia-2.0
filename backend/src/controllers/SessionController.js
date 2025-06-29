// backend/src/controllers/SessionController.js
const connection = require('../database/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = {
  async create(request, response) {
    const { email, password } = request.body;

    // 1. Verificar se o utilizador existe
    const user = await connection('users').where('email', email).first();

    if (!user) {
      // Usamos um erro 400 em vez de 404 para não dar pistas a atacantes
      return response.status(400).json({ error: 'Invalid credentials' });
    }

    // 2. Verificar se a senha está correta
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return response.status(400).json({ error: 'Invalid credentials' });
    }

    // 3. Se tudo estiver correto, gerar o Token JWT
    const token = jwt.sign(
      { id: user.id }, // O "payload" - dados que queremos guardar no token
      process.env.JWT_SECRET, // Nosso segredo do .env
      { expiresIn: '7d' } // Opções, como o tempo de expiração
    );

    // Retornar os dados do utilizador (sem a senha!) e o token
    return response.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      token,
    });
  }
};