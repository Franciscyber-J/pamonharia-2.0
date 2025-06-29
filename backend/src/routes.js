// backend/src/routes.js
const express = require('express');
const path = require('path'); // Módulo para lidar com caminhos de ficheiros

// --- Importação dos Controllers ---
const UserController = require('./controllers/UserController');
const SessionController = require('./controllers/SessionController');
const ProductController = require('./controllers/ProductController');
const SettingsController = require('./controllers/SettingsController');

// --- Importação do Middleware de Autenticação ---
const authMiddleware = require('./middlewares/auth');

const routes = express.Router();

// --------------------------------------------------------------------
// --- ROTAS DO FRONTEND (SERVEM PÁGINAS HTML) ---
// --------------------------------------------------------------------

// Rota raiz '/' e '/login' servem a página de login
routes.get('/', (request, response) => {
  return response.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'login.html'));
});
routes.get('/login', (request, response) => {
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

// Rotas de Configurações
routes.get('/settings', SettingsController.show);
routes.put('/settings', authMiddleware, SettingsController.update);


module.exports = routes;