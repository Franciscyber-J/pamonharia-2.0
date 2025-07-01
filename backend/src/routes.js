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

// --- ROTAS DE AUTENTICAÇÃO ---
routes.post('/api/sessions', SessionController.create);

// --- ROTAS PRIVADAS DA API (Protegidas por autenticação - Dashboard) ---
routes.use(authMiddleware);

// Produtos e Estoque
routes.get('/api/products', ProductController.index);
routes.post('/api/products', ProductController.create);
routes.put('/api/products/:id', ProductController.update);
routes.delete('/api/products/:id', ProductController.destroy);
routes.patch('/api/products/:id/stock', ProductController.updateStock);
routes.post('/api/products/reorder', ProductController.reorder);

// Combos
routes.get('/api/combos', ComboController.index);
routes.post('/api/combos', ComboController.create);
routes.put('/api/combos/:id', ComboController.update);
routes.delete('/api/combos/:id', ComboController.destroy);
routes.post('/api/combos/reorder', ComboController.reorder);

// Configurações
routes.get('/api/settings', SettingsController.show);
routes.put('/api/settings', SettingsController.update);
routes.get('/api/cloudinary-signature', SettingsController.generateCloudinarySignature);

// Pedidos
routes.get('/api/orders', OrderController.index);
routes.patch('/api/orders/:id/status', OrderController.updateStatus);

module.exports = routes;
