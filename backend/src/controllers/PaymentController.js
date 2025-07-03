// backend/src/controllers/PaymentController.js

// Importa as classes necessárias do SDK do Mercado Pago
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const connection = require('../database/connection');

// Cria uma instância do cliente do Mercado Pago com o seu Access Token
const client = new MercadoPagoConfig({ 
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN 
});

module.exports = {
  /**
   * Cria uma preferência de pagamento no Mercado Pago.
   */
  async createPreference(request, response) {
    try {
      const { order_id } = request.params;
      const order = await connection('orders').where('id', order_id).first();
      const orderItems = await connection('order_items').where('order_id', order_id);

      if (!order || !orderItems || orderItems.length === 0) {
        return response.status(404).json({ error: 'Pedido não encontrado ou vazio.' });
      }

      const items = orderItems.map(item => ({
        title: item.item_name,
        description: item.item_details ? JSON.parse(item.item_details).map(d => d.name).join(', ') : 'Item do pedido',
        unit_price: Number(parseFloat(item.unit_price).toFixed(2)), // Garante que o preço é um número com 2 casas decimais
        quantity: item.quantity,
        currency_id: 'BRL',
      }));
      
      const preferenceData = {
        items,
        external_reference: String(order_id),
        back_urls: {
          success: `${process.env.FRONTEND_URL}/cardapio?status=success&order_id=${order_id}`,
          failure: `${process.env.FRONTEND_URL}/cardapio?status=failure&order_id=${order_id}`,
          pending: `${process.env.FRONTEND_URL}/cardapio?status=pending&order_id=${order_id}`,
        },
        notification_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
        // **MELHORIA**: Define explicitamente os métodos de pagamento aceites.
        payment_methods: {
          excluded_payment_types: [
            { id: 'ticket' }, // Exclui Boleto
            { id: 'debit_card' } // Exclui Cartão de Débito se não for desejado
          ],
          installments: 1, // Número máximo de parcelas (1 = à vista)
        },
      };

      const preference = new Preference(client);
      const result = await preference.create({ body: preferenceData });
      
      await connection('orders').where('id', order_id).update({
        preference_id: result.id,
        checkout_url: result.init_point,
      });

      console.log(`[PaymentController] Preferência ${result.id} criada para o pedido ${order_id}.`);

      return response.json({ checkout_url: result.init_point });

    } catch (error) {
      // Log mais detalhado para facilitar a depuração
      console.error('[PaymentController] Erro ao criar preferência:', error?.cause || error.message);
      return response.status(500).json({ error: 'Falha ao criar a preferência de pagamento.', details: error?.cause || error.message });
    }
  },

  /**
   * Recebe e processa webhooks do Mercado Pago.
   */
  async receiveWebhook(request, response) {
    const { query } = request;
    const topic = query.topic || query.type;
    
    console.log(`[Webhook] Notificação recebida. Tópico: ${topic}, ID do Evento: ${query.id}`);
    
    if (topic !== 'payment') {
      return response.status(200).send();
    }

    try {
      const payment = new Payment(client);
      const paymentDetails = await payment.get({ id: query.id });

      const order_id = paymentDetails.external_reference;

      if (paymentDetails && order_id) {
        const paymentStatus = paymentDetails.status;
        console.log(`[Webhook] Processando pagamento ${paymentDetails.id} para o pedido ${order_id}. Status: ${paymentStatus}`);
        
        const orderToUpdate = {
          payment_id: paymentDetails.id,
          payment_status: paymentStatus,
        };

        if (paymentStatus === 'approved') {
          orderToUpdate.status = 'Pago';
        }

        await connection('orders').where('id', order_id).update(orderToUpdate);
        
        if (paymentStatus === 'approved') {
          const updatedOrder = await connection('orders').where('id', order_id).first();
          request.io.emit('new_order', updatedOrder);
          console.log(`[Webhook] Pedido ${order_id} aprovado. Evento 'new_order' emitido para o dashboard.`);
        }
      }
      
      return response.status(200).send('Webhook processado.');
    } catch (error) {
      console.error('[Webhook] Erro ao processar webhook:', error.message);
      return response.status(500).send('Erro no processamento do webhook.');
    }
  },
};
