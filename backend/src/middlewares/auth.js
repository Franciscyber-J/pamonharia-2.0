// backend/src/middlewares/auth.js
const jwt = require('jsonwebtoken');

module.exports = (request, response, next) => {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return response.status(401).json({ error: 'No token provided' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2) {
    return response.status(401).json({ error: 'Token error' });
  }

  const [scheme, token] = parts;
  if (!/^Bearer$/i.test(scheme)) {
    return response.status(401).json({ error: 'Token malformatted' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return response.status(401).json({ error: 'Token invalid' });
    }

    // #################### INÍCIO DA CORREÇÃO ####################
    // ARQUITETO: Extraímos o ID e a ROLE do token e anexamo-los à requisição.
    // Todas as rotas protegidas agora saberão quem é o utilizador e qual a sua permissão.
    request.userId = decoded.id;
    request.userRole = decoded.role;
    // ##################### FIM DA CORREÇÃO ######################

    return next();
  });
};