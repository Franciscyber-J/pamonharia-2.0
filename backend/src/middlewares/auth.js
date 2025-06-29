// backend/src/middlewares/auth.js
const jwt = require('jsonwebtoken');

module.exports = (request, response, next) => {
  const authHeader = request.headers.authorization;

  // 1. Verificar se o token foi enviado
  if (!authHeader) {
    return response.status(401).json({ error: 'No token provided' });
  }

  // 2. O token vem no formato "Bearer [token]". Vamos separar as duas partes.
  const parts = authHeader.split(' ');

  if (parts.length !== 2) {
    return response.status(401).json({ error: 'Token error' });
  }

  const [scheme, token] = parts;

  if (!/^Bearer$/i.test(scheme)) {
    return response.status(401).json({ error: 'Token malformatted' });
  }

  // 3. Verificar se o token é válido
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return response.status(401).json({ error: 'Token invalid' });
    }

    // Se for válido, guardamos o id do utilizador na requisição para uso futuro
    request.userId = decoded.id;

    // O segurança deixa passar. O next() passa a requisição para o próximo passo (o controller)
    return next();
  });
};