// backend/src/routes.js
const express = require('express');
const path = require('path');

const UserController = require('./controllers/UserController');
const SessionController = require('./controllers/SessionController');
const ProductController = require('./controllers/ProductController');
const SettingsController = require('./controllers/SettingsController');
const OrderController = require('./controllers/OrderController');
const ComboController = require('./controllers/ComboController');
const authMiddleware = require('./middlewares/auth');

const routes = express.Router();

// --- ROTAS DO FRONTEND ---
routes.get('/', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'login.html')));
routes.get('/dashboard', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'dashboard.html')));
routes.get('/cardapio', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'cardapio', 'index.html')));

// --- ROTAS PÚBLICAS DA API ---
routes.get('/api/public/products', ProductController.indexPublic);
routes.get('/api/public/combos', ComboController.indexPublic);
routes.get('/api/public/settings', SettingsController.show);
routes.post('/api/public/orders', OrderController.create);

// --- ROTAS PRIVADAS DA API ---
routes.post('/api/sessions', SessionController.create);

// Produtos e Estoque
routes.get('/api/products', authMiddleware, ProductController.index);
routes.post('/api/products', authMiddleware, ProductController.create);
routes.put('/api/products/:id', authMiddleware, ProductController.update);
routes.delete('/api/products/:id', authMiddleware, ProductController.destroy);
routes.patch('/api/products/:id/stock', authMiddleware, ProductController.updateStock);
routes.post('/api/products/reorder', authMiddleware, ProductController.reorder); // NOVA ROTA

// Combos
routes.get('/api/combos', authMiddleware, ComboController.index);
routes.post('/api/combos', authMiddleware, ComboController.create);
routes.put('/api/combos/:id', authMiddleware, ComboController.update);
routes.delete('/api/combos/:id', authMiddleware, ComboController.destroy);
routes.post('/api/combos/reorder', authMiddleware, ComboController.reorder); // NOVA ROTA

// Configurações
routes.get('/api/settings', authMiddleware, SettingsController.show);
routes.put('/api/settings', authMiddleware, SettingsController.update);
routes.get('/api/cloudinary-signature', authMiddleware, SettingsController.generateCloudinarySignature);

// Pedidos
routes.get('/api/orders', authMiddleware, OrderController.index);
routes.patch('/api/orders/:id/status', authMiddleware, OrderController.updateStatus);

module.exports = routes;
