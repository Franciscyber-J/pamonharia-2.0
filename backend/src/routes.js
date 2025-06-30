const express = require('express');
const path = require('path');
const UserController = require('./controllers/UserController');
const SessionController = require('./controllers/SessionController');
const ProductController = require('./controllers/ProductController');
const SettingsController = require('./controllers/SettingsController');
const OrderController = require('./controllers/OrderController');
const ComboController = require('./controllers/ComboController'); // IMPORTAR

const authMiddleware = require('./middlewares/auth');

const routes = express.Router();

// --- ROTAS DO FRONTEND ---
routes.get('/', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'login.html')));
routes.get('/login', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'login.html')));
routes.get('/dashboard', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'dashboard.html')));
routes.get('/cardapio', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'cardapio', 'index.html')));

// --- ROTAS DA API ---

// Autenticação
routes.post('/users', UserController.create);
routes.post('/sessions', SessionController.create);

// Rotas de Produtos e Estoque
routes.get('/products', authMiddleware, ProductController.index);
routes.get('/products/:id', authMiddleware, ProductController.show);
routes.post('/products', authMiddleware, ProductController.create);
routes.put('/products/:id', authMiddleware, ProductController.update);
routes.delete('/products/:id', authMiddleware, ProductController.destroy);
routes.patch('/products/:id/stock', authMiddleware, ProductController.updateStock);

// ROTAS DE COMBOS (NOVAS)
routes.get('/combos', authMiddleware, ComboController.index);
routes.post('/combos', authMiddleware, ComboController.create);
routes.put('/combos/:id', authMiddleware, ComboController.update);
routes.delete('/combos/:id', authMiddleware, ComboController.destroy);

// Rotas de Configurações e Pedidos
routes.get('/settings', SettingsController.show);
routes.put('/settings', authMiddleware, SettingsController.update);
routes.get('/cloudinary-signature', authMiddleware, SettingsController.generateCloudinarySignature);
routes.get('/orders', authMiddleware, OrderController.index);
routes.patch('/orders/:id/status', authMiddleware, OrderController.updateStatus);
routes.post('/orders', OrderController.create);

module.exports = routes;
