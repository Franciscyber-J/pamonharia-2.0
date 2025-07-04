// backend/src/controllers/PaymentController.js

const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const connection = require('../database/connection');

// Inicializa o cliente do Mercado Pago com o Access Token do ambiente
const client = new MercadoPagoConfig({ 
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN 
});

module.exports = {
  /**
   * Cria uma preferência de pagamento no Mercado Pago para um pedido específico.
   */
  async createPreference(request, response) {
    try {
      const { order_id } = request.params;
      const order = await connection('orders').where('id', order_id).first();
      const orderItems = await connection('order_items').where('order_id', order_id);

      if (!order || !orderItems || orderItems.length === 0) {
        return response.status(404).json({ error: 'Pedido não encontrado ou vazio.' });
      }

      // Mapeia os itens do pedido para o formato exigido pelo Mercado Pago
      const items = orderItems.map(item => ({
        title: item.item_name,
        description: item.item_details ? JSON.parse(item.item_details).map(d => d.name).join(', ') : 'Item do pedido',
        unit_price: Number(parseFloat(item.unit_price).toFixed(2)),
        quantity: item.quantity,
        currency_id: 'BRL',
      }));
      
      const preferenceData = {
        items,
        external_reference: String(order_id), // Referência externa para associar ao nosso pedido
        back_urls: {
          success: `${process.env.FRONTEND_URL}/cardapio?status=success&order_id=${order_id}`,
          failure: `${process.env.FRONTEND_URL}/cardapio?status=failure&order_id=${order_id}`,
          pending: `${process.env.FRONTEND_URL}/cardapio?status=pending&order_id=${order_id}`,
        },
        notification_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
        payment_methods: {
          excluded_payment_types: [{ id: 'ticket' }], // Exclui boleto
          installments: 1, // Apenas pagamento à vista
        },
      };

      const preference = new Preference(client);
      const result = await preference.create({ body: preferenceData });
      
      // Atualiza o nosso pedido com o ID da preferência e a URL de checkout
      await connection('orders').where('id', order_id).update({
        preference_id: result.id,
        checkout_url: result.init_point,
      });

      console.log(`[PaymentController] Preferência ${result.id} criada para o pedido ${order_id}.`);
      return response.json({ checkout_url: result.init_point });

    } catch (error) {
      // SOLUÇÃO DEFINITIVA PARA O ERRO DE PAGAMENTO
      console.error('[PaymentController] Erro detalhado ao criar preferência:', error);
      let details = 'Erro desconhecido ao comunicar com o gateway de pagamento.';
      
      // O SDK do Mercado Pago geralmente aninha o erro real dentro de `error.cause`
      if (error.cause) {
          // Garante que a causa seja um objeto antes de tentar acessá-la
          const cause = Array.isArray(error.cause) ? error.cause[0] : (typeof error.cause === 'object' ? error.cause : {});
          details = `MercadoPago: ${cause.description || error.message || JSON.stringify(cause)}`;
      } else {
          details = error.message;
      }
      
      console.error(`[PaymentController] Erro formatado para resposta: ${details}`);
      
      return response.status(500).json({ 
        error: 'Falha ao criar a preferência de pagamento.', 
        details: details 
      });
    }
  },

  /**
   * Recebe e processa webhooks (notificações) do Mercado Pago.
   */
  async receiveWebhook(request, response) {
    const { query } = request;
    const topic = query.topic || query.type;
    
    console.log(`[Webhook] Notificação recebida. Tópico: ${topic}, ID do Evento: ${query.id}`);
    if (topic !== 'payment') {
      return response.status(200).send(); // Responde OK para notificações que não são de pagamento
    }

    try {
      const payment = new Payment(client);
      const paymentDetails = await payment.get({ id: query.id });
      const order_id = paymentDetails.external_reference;

      if (paymentDetails && order_id) {
        console.log(`[Webhook] Processando pagamento ${paymentDetails.id} para o pedido ${order_id}. Status: ${paymentDetails.status}`);
        
        const orderToUpdate = { 
          payment_id: String(paymentDetails.id), 
          payment_status: paymentDetails.status 
        };
        
        // Se o pagamento for aprovado, o status do pedido muda para 'Pago'
        if (paymentDetails.status === 'approved') {
          orderToUpdate.status = 'Pago';
        }
        
        await connection('orders').where('id', order_id).update(orderToUpdate);
        
        const updatedOrder = await connection('orders').where('id', order_id).first();
        if (updatedOrder) {
            // Notifica o dashboard para atualizar o card do pedido
            request.io.emit('order_status_updated', { id: updatedOrder.id, status: updatedOrder.status });
            console.log(`[Webhook] Pedido ${order_id} atualizado para status '${updatedOrder.status}'. Evento emitido.`);
            
            // Se o pedido foi aprovado, emite um evento de "nova ordem" para tocar o som de notificação
            if (paymentDetails.status === 'approved') {
                request.io.emit('new_order', updatedOrder);
            }
        }
      }
      
      return response.status(200).send('Webhook processado.');
    } catch (error) {
      console.error('[Webhook] Erro ao processar webhook:', error.message);
      return response.status(500).send('Erro no processamento do webhook.');
    }
  },
};
