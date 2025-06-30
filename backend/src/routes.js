// backend/src/routes.js
const express = require('express');
const path = require('path');

// Controllers
const UserController = require('./controllers/UserController');
const SessionController = require('./controllers/SessionController');
const ProductController = require('./controllers/ProductController');
const SettingsController = require('./controllers/SettingsController');
const OrderController = require('./controllers/OrderController');
const ComboController = require('./controllers/ComboController'); // Importado

// Middlewares
const authMiddleware = require('./middlewares/auth');

const routes = express.Router();

// --- ROTAS DO FRONTEND (para servir as páginas HTML) ---
routes.get('/', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'login.html')));
routes.get('/dashboard', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'dashboard.html')));
routes.get('/cardapio', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'cardapio', 'index.html')));

// --- ROTAS DA API ---

// Autenticação
routes.post('/users', UserController.create);
routes.post('/sessions', SessionController.create);

// Rotas de Produtos e Estoque (protegidas por autenticação)
routes.get('/products', authMiddleware, ProductController.index);
routes.post('/products', authMiddleware, ProductController.create);
routes.put('/products/:id', authMiddleware, ProductController.update);
routes.delete('/products/:id', authMiddleware, ProductController.destroy);
routes.patch('/products/:id/stock', authMiddleware, ProductController.updateStock);

// Rotas de Combos (NOVAS e protegidas por autenticação)
routes.get('/combos', authMiddleware, ComboController.index);
routes.post('/combos', authMiddleware, ComboController.create);
routes.put('/combos/:id', authMiddleware, ComboController.update);
routes.delete('/combos/:id', authMiddleware, ComboController.destroy);

// Rotas de Configurações
routes.get('/settings', SettingsController.show); // Pública para o cardápio
routes.put('/settings', authMiddleware, SettingsController.update);
routes.get('/cloudinary-signature', authMiddleware, SettingsController.generateCloudinarySignature);

// Rotas de Pedidos
routes.get('/orders', authMiddleware, OrderController.index);
routes.patch('/orders/:id/status', authMiddleware, OrderController.updateStatus);
routes.post('/orders', OrderController.create); // Pública para o cardápio

module.exports = routes;
