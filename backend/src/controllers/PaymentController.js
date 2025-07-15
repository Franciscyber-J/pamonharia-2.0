// backend/src/controllers/PaymentController.js
const { MercadoPagoConfig, Payment } = require('mercadopago');
const connection = require('../database/connection');
const { io } = require('../index'); // Importa a instância 'io' real

const client = new MercadoPagoConfig({ 
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN 
});
const payment = new Payment(client);

module.exports = {
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
            notification_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
            external_reference: String(order_id),
        };

        if (payment_type === 'credit_card' || payment_type === 'debit_card') {
            if (!token) return response.status(400).json({ error: 'O token do cartão é obrigatório.' });
            paymentRequestBody.token = token;
            paymentRequestBody.installments = installments;
            if(issuer_id) paymentRequestBody.issuer_id = issuer_id;
            
            if (payer.identification && payer.identification.type && payer.identification.number) {
                 paymentRequestBody.payer.identification = {
                    type: payer.identification.type,
                    number: payer.identification.number,
                };
            }
        }
        
        console.log(`[PaymentController] Enviando para o Mercado Pago para o pedido ${order_id}:`);
        
        const paymentResult = await payment.create({ body: paymentRequestBody, requestOptions: { idempotencyKey } });
        
        console.log(`[PaymentController] Resposta do MP recebida para o pedido ${order_id}.`);

        const orderUpdateData = {
            payment_id: String(paymentResult.id),
            payment_status: paymentResult.status,
        };

        if (paymentResult.status === 'approved') {
            orderUpdateData.status = 'Pago';
        } else if (paymentResult.status === 'in_process' || paymentResult.status === 'pending') {
            orderUpdateData.status = 'Aguardando Pagamento';
        }

        const [updatedOrder] = await connection('orders').where('id', order_id).update(orderUpdateData).returning('*');
        
        io.emit('order_status_updated', { id: updatedOrder.id, status: updatedOrder.status, order: updatedOrder });
        
        if (updatedOrder.status === 'Pago') {
            io.emit('new_order', updatedOrder);
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
                status_detail: paymentResult.status_detail,
                payment_id: paymentResult.id,
                message: 'Pagamento processado.'
            });
        }

    } catch (error) {
        console.error(`[PaymentController] Erro detalhado ao processar pagamento para o pedido ${order_id}:`, error);
        const errorMessage = error.cause?.error?.message || error.message || 'Erro desconhecido.';
        return response.status(500).json({ 
            error: 'Falha ao processar o pagamento.', 
            details: errorMessage
        });
    }
  },

  async receiveWebhook(request, response) {
    const { query } = request;
    const topic = query.topic || query.type;

    if (!topic) {
        console.log('[Webhook] Notificação recebida sem tópico. A ignorar.');
        return response.status(200).send();
    }

    console.log(`[Webhook] Notificação recebida. Tópico: ${topic}`);

    try {
        if (topic === 'payment') {
            const paymentId = query.id || request.body.data?.id;
            if (!paymentId) {
                console.log('[Webhook] Evento de pagamento sem ID. A ignorar.');
                return response.status(200).send();
            }

            console.log(`[Webhook] Evento de pagamento identificado. ID do Pagamento: ${paymentId}.`);
            
            const paymentDetails = await payment.get({ id: paymentId });
            const order_id = paymentDetails.external_reference;
            const currentStatus = paymentDetails.status;
            
            if (paymentDetails && order_id) {
                console.log(`[Webhook] Processando pagamento ${paymentId} para pedido ${order_id}. Novo Status: ${currentStatus}`);
                
                const order = await connection('orders').where('id', order_id).first();
                if (order && order.status !== 'Pago' && order.status !== 'Finalizado') {
                    
                    const orderUpdate = { 
                        payment_id: String(paymentDetails.id), 
                        payment_status: currentStatus 
                    };

                    if (currentStatus === 'approved') {
                        orderUpdate.status = 'Pago';
                    } else if (currentStatus === 'cancelled' || currentStatus === 'rejected') {
                        orderUpdate.status = 'Cancelado';
                    }
                    
                    const [updatedOrder] = await connection('orders').where('id', order_id).update(orderUpdate).returning('*');
                    
                    console.log(`[Webhook] Pedido ${order_id} atualizado para status: ${updatedOrder.status}.`);

                    io.emit('order_status_updated', { id: updatedOrder.id, status: updatedOrder.status, order: updatedOrder });
                    
                    if (updatedOrder.status === 'Pago') {
                        console.log(`[Webhook] Emitindo evento 'new_order' para o pedido pago #${updatedOrder.id}`);
                        io.emit('new_order', updatedOrder);
                    }
                } else {
                     console.log(`[Webhook] Pedido ${order_id} já está em um estado final ('${order?.status}') ou não foi encontrado. Nenhuma ação tomada.`);
                }
            }
        }
    } catch (error) {
        console.error(`[Webhook] Erro ao processar notificação:`, error.message);
    }
    
    response.status(200).send('ok');
  },
};