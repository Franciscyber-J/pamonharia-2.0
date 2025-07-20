// backend/src/routes.js
const express = require('express');

const SessionController = require('./controllers/SessionController');
const ProductController = require('./controllers/ProductController');
const SettingsController = require('./controllers/SettingsController');
const OrderController = require('./controllers/OrderController');
const ComboController = require('./controllers/ComboController');
const PaymentController = require('./controllers/PaymentController');

const authMiddleware = require('./middlewares/auth');
const { checkRole } = require('./middlewares/authorization');

const router = express.Router();

// --- ROTAS PÚBLICAS ---
router.post('/sessions', SessionController.create);
router.get('/public/products', ProductController.indexPublic);
router.get('/public/combos', ComboController.indexPublic);
router.get('/public/settings', SettingsController.show);
router.post('/public/orders', OrderController.create);
router.post('/public/orders/:id/confirm', OrderController.confirmOrder);
router.get('/public/payment-settings', SettingsController.getPaymentSettings);
router.post('/payments/process', PaymentController.processPayment);
router.post('/payments/webhook', PaymentController.receiveWebhook);

// ARQUITETO: Novos endpoints para o bot concierge
router.get('/public/orders/:id/details', OrderController.getDetails);
router.get('/public/store-status', SettingsController.getStoreStatus);
router.get('/public/product-query', ProductController.queryByName);


router.use(authMiddleware);

// --- ROTAS PRIVADAS (ADMIN E OPERADOR) ---
router.get('/orders', checkRole(['admin', 'operador']), OrderController.index);
router.patch('/orders/:id/status', checkRole(['admin', 'operador']), OrderController.updateStatus);
router.delete('/orders/history', checkRole(['admin', 'operador']), OrderController.clearHistory);

router.patch('/products/:id/stock', checkRole(['admin', 'operador']), ProductController.updateStock);
router.get('/products', checkRole(['admin', 'operador']), ProductController.index);

router.get('/dashboard/config', checkRole(['admin', 'operador']), SettingsController.getDashboardConfig);
router.patch('/settings/status', checkRole(['admin', 'operador']), SettingsController.updateStatus);


// --- ROTAS RESTRITAS (APENAS ADMIN) ---
router.post('/products', checkRole(['admin']), ProductController.create);
router.put('/products/:id', checkRole(['admin']), ProductController.update);
router.delete('/products/:id', checkRole(['admin']), ProductController.destroy);
router.post('/products/reorder', checkRole(['admin']), ProductController.reorder);
router.post('/products/:id/duplicate', checkRole(['admin']), ProductController.duplicate);

router.get('/combos', checkRole(['admin']), ComboController.index);
router.post('/combos', checkRole(['admin']), ComboController.create);
router.put('/combos/:id', checkRole(['admin']), ComboController.update);
router.delete('/combos/:id', checkRole(['admin']), ComboController.destroy);
router.post('/combos/reorder', checkRole(['admin']), ComboController.reorder);

router.get('/settings', checkRole(['admin']), SettingsController.show);
router.put('/settings', checkRole(['admin']), SettingsController.update);
router.get('/cloudinary-signature', checkRole(['admin']), SettingsController.generateCloudinarySignature);

module.exports = router;