// backend/src/controllers/PaymentController.js

const { MercadoPagoConfig, Payment } = require('mercadopago');
const connection = require('../database/connection');

// Inicializa o cliente do Mercado Pago com o Access Token do ambiente
const client = new MercadoPagoConfig({ 
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN 
});
const payment = new Payment(client);

module.exports = {
  /**
   * Processa um pagamento vindo do Checkout Brick.
   */
  async processPayment(request, response) {
    const { order_id, token, payment_method_id, issuer_id, installments, payer } = request.body;

    try {
        const order = await connection('orders').where('id', order_id).first();
        if (!order) {
            return response.status(404).json({ error: 'Pedido não encontrado.' });
        }

        if (order.payment_id && order.status === 'Pago') {
            return response.status(409).json({ error: 'Este pedido já foi pago.' });
        }
        
        const idempotencyKey = `pamonharia-order-${order_id}-${Date.now()}`;

        const paymentRequestBody = {
            transaction_amount: Number(order.total_price),
            description: `Pedido #${order.id} - ${order.client_name}`,
            payment_method_id,
            payer: {
                email: payer.email,
                first_name: payer.firstName,
                last_name: payer.lastName,
                identification: {
                    type: payer.identification.type,
                    number: payer.identification.number,
                },
            },
            external_reference: String(order_id),
        };

        if (payment_method_id !== 'pix') {
            if (!token) {
                return response.status(400).json({ error: 'O token do cartão é obrigatório para este tipo de pagamento.' });
            }
            paymentRequestBody.token = token;
            paymentRequestBody.installments = installments;
            paymentRequestBody.issuer_id = issuer_id;
        }

        console.log(`[PaymentController] Processando pagamento para o pedido ${order_id}...`);
        
        const paymentResult = await payment.create({ body: paymentRequestBody }, {
            idempotencyKey: idempotencyKey
        });
        
        console.log(`[PaymentController] Resposta do Mercado Pago recebida para o pedido ${order_id}:`, paymentResult);

        const orderUpdateData = {
            payment_id: String(paymentResult.id),
            payment_status: paymentResult.status,
        };

        if (paymentResult.status === 'approved') {
            orderUpdateData.status = 'Pago';
        } else if (paymentResult.status === 'in_process' || paymentResult.status === 'pending') {
            orderUpdateData.status = 'Aguardando Pagamento';
        }

        await connection('orders').where('id', order_id).update(orderUpdateData);
        
        const updatedOrder = await connection('orders').where('id', order_id).first();
        request.io.emit('order_status_updated', { id: updatedOrder.id, status: updatedOrder.status });
        if (orderUpdateData.status === 'Pago') {
            request.io.emit('new_order', updatedOrder);
        }

        if (payment_method_id === 'pix') {
            return response.json({
                status: paymentResult.status,
                qr_code: paymentResult.point_of_interaction.transaction_data.qr_code,
                qr_code_base64: paymentResult.point_of_interaction.transaction_data.qr_code_base64,
            });
        } else {
            return response.json({
                status: paymentResult.status,
                payment_id: paymentResult.id,
            });
        }

    } catch (error) {
        console.error(`[PaymentController] Erro detalhado ao processar pagamento para o pedido ${order_id}:`, error);
        // Tenta extrair a mensagem de erro mais específica da resposta da API do Mercado Pago
        const errorMessage = error.cause?.api_response?.data?.message || error.message || 'Erro desconhecido ao processar o pagamento.';
        return response.status(500).json({ 
            error: 'Falha ao processar o pagamento.', 
            details: errorMessage
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
      return response.status(200).send();
    }

    try {
      const paymentDetails = await payment.get({ id: query.id });
      const order_id = paymentDetails.external_reference;

      if (paymentDetails && order_id) {
        console.log(`[Webhook] Processando pagamento ${paymentDetails.id} para o pedido ${order_id}. Status: ${paymentDetails.status}`);
        
        const orderToUpdate = { 
          payment_id: String(paymentDetails.id), 
          payment_status: paymentDetails.status 
        };
        
        if (paymentDetails.status === 'approved') {
          orderToUpdate.status = 'Pago';
        }
        
        await connection('orders').where('id', order_id).update(orderToUpdate);
        
        const updatedOrder = await connection('orders').where('id', order_id).first();
        if (updatedOrder) {
            request.io.emit('order_status_updated', { id: updatedOrder.id, status: updatedOrder.status });
            console.log(`[Webhook] Pedido ${order_id} atualizado para status '${updatedOrder.status}'. Evento emitido.`);
            
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
