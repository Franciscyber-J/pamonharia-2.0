// backend/src/routes.js
const express = require('express');

// Importação de todos os controllers
const UserController = require('./controllers/UserController');
const SessionController = require('./controllers/SessionController');
const ProductController = require('./controllers/ProductController');
const SettingsController = require('./controllers/SettingsController');
const OrderController = require('./controllers/OrderController');
const ComboController = require('./controllers/ComboController');
const PaymentController = require('./controllers/PaymentController');
const authMiddleware = require('./middlewares/auth');

const routes = express.Router();

// --- ROTAS PÚBLICAS DA API ---
// (Não exigem token)

// Sessão (Login)
routes.post('/sessions', SessionController.create);

// Cardápio e Configurações Públicas
routes.get('/public/products', ProductController.indexPublic);
routes.get('/public/combos', ComboController.indexPublic);
routes.get('/public/settings', SettingsController.show);
routes.post('/public/orders', OrderController.create);

// Pagamentos
routes.get('/public/payment-settings', SettingsController.getPaymentSettings);
routes.post('/payments/process', PaymentController.processPayment);
routes.post('/payments/webhook', PaymentController.receiveWebhook);

// --- APLICAÇÃO DO MIDDLEWARE DE AUTENTICAÇÃO ---
// A partir desta linha, todas as rotas abaixo são privadas e exigem um token.
routes.use(authMiddleware);

// --- ROTAS PRIVADAS DA API (DASHBOARD) ---

// Produtos e Estoque
routes.get('/products', ProductController.index);
routes.post('/products', ProductController.create);
routes.put('/products/:id', ProductController.update);
routes.delete('/products/:id', ProductController.destroy);
routes.patch('/products/:id/stock', ProductController.updateStock);
routes.post('/products/reorder', ProductController.reorder);

// Combos
routes.get('/combos', ComboController.index);
routes.post('/combos', ComboController.create);
routes.put('/combos/:id', ComboController.update);
routes.delete('/combos/:id', ComboController.destroy);
routes.post('/combos/reorder', ComboController.reorder);

// Configurações da Loja
routes.get('/settings', SettingsController.show);
routes.put('/settings', SettingsController.update);
routes.get('/cloudinary-signature', SettingsController.generateCloudinarySignature);

// Pedidos
routes.get('/orders', OrderController.index);
routes.patch('/orders/:id/status', OrderController.updateStatus);
routes.delete('/orders/history', OrderController.clearHistory);

module.exports = routes;