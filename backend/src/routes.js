// backend/src/routes.js
const express = require('express');
const path = require('path'); // 1. IMPORTAR O MÓDULO 'path'

const UserController = require('./controllers/UserController');
const SessionController = require('./controllers/SessionController');
const ProductController = require('./controllers/ProductController');
const authMiddleware = require('./middlewares/auth');

const routes = express.Router();

// --------------------------------------------------------------------
// --- ROTAS DO FRONTEND (SERVIR PÁGINAS HTML) ---
// --------------------------------------------------------------------

// Rota para a página de Login do Dashboard
routes.get('/login', (request, response) => {
  // path.resolve() constrói o caminho absoluto para o nosso ficheiro HTML
  // __dirname: diretório atual (backend/src)
  // '..': sobe um nível (para backend/)
  // '..': sobe mais um nível (para a raiz do projeto)
  // e então entra em 'frontend/dashboard/login.html'
  return response.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'login.html'));
});

// Rota para a página principal do Dashboard
routes.get('/dashboard', (request, response) => {
  return response.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'dashboard.html'));
});

// Rota para a página do Cardápio Público
routes.get('/cardapio', (request, response) => {
  return response.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'cardapio', 'index.html'));
});

// Rota raiz '/' agora servirá a página de login
routes.get('/', (request, response) => {
  return response.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'login.html'));
});


// --------------------------------------------------------------------
// --- ROTAS DA API (DEVOLVEM DADOS JSON) ---
// --------------------------------------------------------------------

// Rotas de Autenticação e Utilizadores
routes.post('/users', UserController.create);
routes.post('/sessions', SessionController.create);

// Rotas de Produtos
routes.get('/products', ProductController.index);
routes.get('/products/:id', ProductController.show);
routes.post('/products', authMiddleware, ProductController.create);
routes.put('/products/:id', authMiddleware, ProductController.update);
routes.delete('/products/:id', authMiddleware, ProductController.destroy);

module.exports = routes;