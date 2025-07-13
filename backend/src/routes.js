// backend/src/routes.js
const express = require('express');

// Importação de todos os controllers
const SessionController = require('./controllers/SessionController');
const ProductController = require('./controllers/ProductController');
const SettingsController = require('./controllers/SettingsController');
const OrderController = require('./controllers/OrderController');
const ComboController = require('./controllers/ComboController');
const PaymentController = require('./controllers/PaymentController');
const authMiddleware = require('./middlewares/auth');

const router = express.Router(); // Usamos router em vez de routes para clareza

// --- ROTAS PÚBLICAS DA API ---
router.post('/sessions', SessionController.create);
router.get('/public/products', ProductController.indexPublic);
router.get('/public/combos', ComboController.indexPublic);
router.get('/public/settings', SettingsController.show);
router.post('/public/orders', OrderController.create);
router.get('/public/payment-settings', SettingsController.getPaymentSettings);
router.post('/payments/process', PaymentController.processPayment);
router.post('/payments/webhook', PaymentController.receiveWebhook);

// --- APLICAÇÃO DO MIDDLEWARE DE AUTENTICAÇÃO ---
// A partir desta linha, todas as rotas abaixo são privadas
router.use(authMiddleware);

// --- ROTAS PRIVADAS DA API (DASHBOARD) ---
router.get('/products', ProductController.index);
router.post('/products', ProductController.create);
router.put('/products/:id', ProductController.update);
router.delete('/products/:id', ProductController.destroy);
router.patch('/products/:id/stock', ProductController.updateStock);
router.post('/products/reorder', ProductController.reorder);
router.post('/products/:id/duplicate', ProductController.duplicate); // NOVA ROTA

router.get('/combos', ComboController.index);
router.post('/combos', ComboController.create);
router.put('/combos/:id', ComboController.update);
router.delete('/combos/:id', ComboController.destroy);
router.post('/combos/reorder', ComboController.reorder);

router.get('/settings', SettingsController.show);
router.put('/settings', SettingsController.update);
router.get('/cloudinary-signature', SettingsController.generateCloudinarySignature);

router.get('/orders', OrderController.index);
router.patch('/orders/:id/status', OrderController.updateStatus);
router.delete('/orders/history', OrderController.clearHistory);

module.exports = router;