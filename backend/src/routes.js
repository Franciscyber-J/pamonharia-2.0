// backend/src/routes.js
const express = require('express');
const path = require('path');

const UserController = require('./controllers/UserController');
const SessionController = require('./controllers/SessionController');
const ProductController = require('./controllers/ProductController');
const SettingsController = require('./controllers/SettingsController');
const OrderController = require('./controllers/OrderController');
const ComboController = require('./controllers/ComboController');
const PaymentController = require('./controllers/PaymentController');
const authMiddleware = require('./middlewares/auth');

const routes = express.Router();

// --- ROTAS PÚBLICAS ---
// Todas as rotas que não exigem autenticação devem ser definidas ANTES do `routes.use(authMiddleware)`.

// Rotas para servir os ficheiros do frontend
routes.get('/', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'login.html')));
routes.get('/dashboard', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'dashboard.html')));
routes.get('/cardapio', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'cardapio', 'index.html')));

// Rotas da API pública para o cardápio
routes.get('/api/public/products', ProductController.indexPublic);
routes.get('/api/public/combos', ComboController.indexPublic);
routes.get('/api/public/settings', SettingsController.show);
routes.post('/api/public/orders', OrderController.create);

// #################### INÍCIO DA CORREÇÃO ####################
// Rotas públicas para o sistema de pagamento
routes.get('/api/public/payment-settings', SettingsController.getPaymentSettings);
routes.post('/api/payments/process', PaymentController.processPayment);
routes.post('/api/payments/webhook', PaymentController.receiveWebhook);
// ##################### FIM DA CORREÇÃO ######################

// Rota de autenticação para login
routes.post('/api/sessions', SessionController.create);


// --- APLICAÇÃO DO MIDDLEWARE DE AUTENTICAÇÃO ---
// A partir desta linha, todas as rotas definidas abaixo exigirão um token JWT válido.
routes.use(authMiddleware);


// --- ROTAS PRIVADAS DA API (DASHBOARD) ---
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
routes.delete('/api/orders/history', OrderController.clearHistory);

module.exports = routes;
