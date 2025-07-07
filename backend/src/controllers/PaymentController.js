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
   * Processa um pagamento vindo do Core API (Checkout Transparente).
   * Lida com diferentes tipos de pagamento (Cartão e PIX).
   */
  async processPayment(request, response) {
    const { order_id, token, payment_method_id, issuer_id, installments, payer, payment_type } = request.body;

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
            },
            external_reference: String(order_id),
        };

        if (payment_type === 'credit_card' || payment_type === 'debit_card') {
            if (!token) {
                return response.status(400).json({ error: 'O token do cartão é obrigatório para este tipo de pagamento.' });
            }
            paymentRequestBody.token = token;
            paymentRequestBody.installments = installments;
            paymentRequestBody.issuer_id = issuer_id;
            
            if (payer.identification && payer.identification.type && payer.identification.number) {
                 paymentRequestBody.payer.identification = {
                    type: payer.identification.type,
                    number: payer.identification.number,
                };
            } else {
                return response.status(400).json({ error: 'A identificação do pagador (CPF/CNPJ) é obrigatória para pagamentos com cartão.' });
            }
        }
        
        console.log(`[PaymentController] Enviando para o Mercado Pago para o pedido ${order_id}:`);
        console.log(JSON.stringify(paymentRequestBody, null, 2));
        
        const paymentResult = await payment.create({ body: paymentRequestBody }, {
            idempotencyKey: idempotencyKey
        });
        
        console.log(`[PaymentController] Resposta do Mercado Pago recebida para o pedido ${order_id}.`);

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
                message: 'Pagamento processado com sucesso.'
            });
        }

    } catch (error) {
        console.error(`[PaymentController] Erro detalhado ao processar pagamento para o pedido ${order_id}:`, error);
        const errorMessage = error.cause?.api_response?.data?.message || error.message || 'Erro desconhecido ao processar o pagamento.';
        return response.status(500).json({ 
            error: 'Falha ao processar o pagamento.', 
            details: errorMessage
        });
    }
  },

  /**
   * Recebe e processa notificações de webhook do Mercado Pago.
   * Segue a boa prática de responder imediatamente com 200 OK e depois processar os dados.
   */
  async receiveWebhook(request, response) {
    // 1. Extrai os dados da requisição. O tópico pode vir na query, os detalhes vêm no corpo.
    const { query, body } = request;
    const topic = query.topic || query.type || body.topic;
    
    console.log(`[Webhook] Notificação recebida. Tópico: ${topic}`);
    console.log('[Webhook] Corpo da requisição:', JSON.stringify(body, null, 2));

    // 2. Responde IMEDIATAMENTE ao Mercado Pago para confirmar o recebimento.
    // Isso é crucial para evitar que o Mercado Pago considere a notificação como falha.
    response.status(200).send('Webhook recebido.');

    // 3. Verifica se é um evento de pagamento e se temos um ID para processar.
    // O ID do pagamento vem dentro do objeto `data`.
    const paymentId = body.data?.id;

    if (topic === 'payment' && paymentId) {
      console.log(`[Webhook] Evento de pagamento identificado. ID do Pagamento: ${paymentId}. Iniciando processamento...`);
      try {
        // 4. Busca os detalhes completos do pagamento na API do Mercado Pago.
        const paymentDetails = await payment.get({ id: paymentId });
        const order_id = paymentDetails.external_reference;

        if (paymentDetails && order_id) {
          console.log(`[Webhook] Processando pagamento ${paymentDetails.id} para o pedido ${order_id}. Status: ${paymentDetails.status}`);
          
          const orderToUpdate = { 
            payment_id: String(paymentDetails.id), 
            payment_status: paymentDetails.status 
          };
          
          // Se o pagamento foi aprovado, atualizamos o status principal do pedido.
          if (paymentDetails.status === 'approved') {
            orderToUpdate.status = 'Pago';
          }
          
          await connection('orders').where('id', order_id).update(orderToUpdate);
          
          // 5. Emite eventos via Socket.IO para notificar o frontend em tempo real.
          const updatedOrder = await connection('orders').where('id', order_id).first();
          if (updatedOrder) {
              // Notifica a mudança de status (ex: de 'Aguardando Pagamento' para 'Pago')
              request.io.emit('order_status_updated', { id: updatedOrder.id, status: updatedOrder.status });
              console.log(`[Webhook] Pedido ${order_id} atualizado para status '${updatedOrder.status}'. Evento 'order_status_updated' emitido.`);
              
              // Se foi aprovado, trata como um novo pedido que precisa de atenção na cozinha.
              if (paymentDetails.status === 'approved') {
                  request.io.emit('new_order', updatedOrder);
                  console.log(`[Webhook] Pagamento aprovado. Evento 'new_order' emitido para o pedido ${order_id}.`);
              }
          }
        }
      } catch (error) {
        // Se ocorrer um erro durante o processamento, apenas registamos no log.
        // Não tentamos responder ao Mercado Pago novamente, pois já enviámos o status 200.
        console.error(`[Webhook] Erro ao processar o pagamento ${paymentId} após o recebimento:`, error.message);
      }
    } else {
      console.log('[Webhook] Evento ignorado (não é de pagamento ou não possui ID).');
    }
  },
};