// backend/src/controllers/SessionController.js
const connection = require('../database/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = {
  async create(request, response) {
    const { email, password } = request.body;

    const user = await connection('users').where('email', email).first();

    if (!user) {
      return response.status(400).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return response.status(400).json({ error: 'Invalid credentials' });
    }

    // #################### INÍCIO DA CORREÇÃO ####################
    // ARQUITETO: Adicionamos a 'role' ao payload do token.
    // Agora, o "crachá" de autenticação contém a permissão do utilizador.
    const token = jwt.sign(
      { id: user.id, role: user.role }, // Payload agora inclui a role
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    // ##################### FIM DA CORREÇÃO ######################

    return response.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role, // Enviamos a role para o frontend também
      },
      token,
    });
  }
};