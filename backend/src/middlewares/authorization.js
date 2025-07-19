// backend/src/middlewares/authorization.js

/**
 * Middleware de verificação de função (role).
 * Cria um middleware que verifica se a role do utilizador logado
 * está incluída na lista de roles permitidas.
 *
 * @param {Array<string>} allowedRoles - Um array de strings com as roles permitidas (ex: ['admin', 'operador']).
 */
function checkRole(allowedRoles) {
  return (request, response, next) => {
    // A role do utilizador foi adicionada à 'request' pelo middleware de autenticação
    const userRole = request.userRole;

    // Se a role do utilizador não estiver na lista de permitidas, bloqueia o acesso.
    if (!userRole || !allowedRoles.includes(userRole)) {
      // 403 Forbidden é o código HTTP correto para acesso negado por falta de permissão.
      return response.status(403).json({ error: 'Access denied. You do not have permission to perform this action.' });
    }

    // Se a role for permitida, o segurança deixa passar.
    return next();
  };
}

module.exports = {
  checkRole,
};