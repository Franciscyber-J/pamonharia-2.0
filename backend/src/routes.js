const express = require('express');
const path = require('path');
const UserController = require('./controllers/UserController');
const SessionController = require('./controllers/SessionController');
const ProductController = require('./controllers/ProductController');
const SettingsController = require('./controllers/SettingsController');
const OrderController = require('./controllers/OrderController'); // 1. IMPORTAR

const authMiddleware = require('./middlewares/auth');

const routes = express.Router();

// --- ROTAS DO FRONTEND ---
routes.get('/', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'login.html')));
routes.get('/login', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'login.html')));
routes.get('/dashboard', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'dashboard', 'dashboard.html')));
routes.get('/cardapio', (req, res) => res.sendFile(path.resolve(__dirname, '..', '..', 'frontend', 'cardapio', 'index.html')));

// --- ROTAS DA API ---
routes.post('/users', UserController.create);
routes.post('/sessions', SessionController.create);

routes.get('/products', ProductController.index);
routes.get('/products/:id', ProductController.show);
routes.post('/products', authMiddleware, ProductController.create);
routes.put('/products/:id', authMiddleware, ProductController.update);
routes.delete('/products/:id', authMiddleware, ProductController.destroy);

routes.get('/settings', SettingsController.show);
routes.put('/settings', authMiddleware, SettingsController.update);
routes.get('/cloudinary-signature', authMiddleware, SettingsController.generateCloudinarySignature);

// Rotas de Pedidos (Dashboard)
routes.get('/orders', authMiddleware, OrderController.index);
routes.patch('/orders/:id/status', authMiddleware, OrderController.updateStatus);

// Rota para RECEBER NOVOS PEDIDOS (Pública)
routes.post('/orders', OrderController.create);

routes.post('/test-order-notification', authMiddleware, (request, response) => {
    request.io.emit('new_order', { id: 999, client_name: 'Cliente Teste', total_price: 50.00 });
    return response.status(200).json({ message: 'Evento de teste enviado!' });
});

module.exports = routes;