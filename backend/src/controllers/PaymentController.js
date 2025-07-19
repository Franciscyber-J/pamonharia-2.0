// backend/src/controllers/PaymentController.js
const { MercadoPagoConfig, Payment } = require('mercadopago');
const connection = require('../database/connection');
const { getIO } = require('../socket-manager');
const crypto = require('crypto');

const client = new MercadoPagoConfig({ 
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN 
});
const payment = new Payment(client);

module.exports = {
  // #################### INÍCIO DA CORREÇÃO ####################
  // ARQUITETO: A função agora não cria um pedido. Ela recebe os dados do pedido,
  // cria o pagamento no MP e anexa os dados do pedido como metadados.
  async processPayment(request, response) {
    const { token, payment_method_id, issuer_id, installments, payer, payment_type, order_details } = request.body;

    try {
        // Gera uma chave de idempotência única para esta tentativa de pagamento.
        const idempotencyKey = crypto.randomUUID();
        
        const paymentRequestBody = {
            transaction_amount: Number(order_details.total_price),
            description: `Pedido de ${order_details.client_name}`,
            payment_method_id,
            payer: {
                email: payer.email,
            },
            // Guarda os detalhes do pedido nos metadados para usá-los no webhook.
            metadata: {
                order_details: order_details
            },
            notification_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
        };

        if (payment_type === 'credit_card' || payment_type === 'debit_card') {
            paymentRequestBody.token = token;
            paymentRequestBody.installments = installments;
            if(issuer_id) paymentRequestBody.issuer_id = issuer_id;
            if (payer.identification) paymentRequestBody.payer.identification = payer.identification;
        }
        
        console.log(`[PaymentController] Enviando para o Mercado Pago:`, {
            amount: paymentRequestBody.transaction_amount,
            method: paymentRequestBody.payment_method_id
        });
        
        const paymentResult = await payment.create({ body: paymentRequestBody, requestOptions: { idempotencyKey } });
        
        console.log(`[PaymentController] Resposta do MP recebida. Status: ${paymentResult.status}`);
        
        // Retorna a resposta do MP para o frontend
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
        console.error(`[PaymentController] Erro detalhado ao processar pagamento:`, error);
        const errorMessage = error.cause?.error?.message || error.message || 'Erro desconhecido.';
        return response.status(500).json({ error: 'Falha ao processar o pagamento.', details: errorMessage });
    }
  },

  // ARQUITETO: A função de webhook agora é a responsável por CRIAR o pedido na base de dados.
  async receiveWebhook(request, response) {
    const { query } = request;
    const topic = query.topic || query.type;
    console.log(`[Webhook] Notificação recebida. Tópico: ${topic}`);

    if (topic === 'payment') {
        try {
            const paymentId = query.id || request.body.data?.id;
            if (!paymentId) return response.status(200).send();

            console.log(`[Webhook] Obtendo detalhes do pagamento ID: ${paymentId}`);
            const paymentDetails = await payment.get({ id: paymentId });
            
            // Só nos importamos com pagamentos aprovados.
            if (paymentDetails && paymentDetails.status === 'approved') {
                const order_details = paymentDetails.metadata.order_details;
                
                // Verifica se já não criámos um pedido para este pagamento.
                const existingOrder = await connection('orders').where('payment_id', String(paymentId)).first();
                if (existingOrder) {
                    console.log(`[Webhook] Pedido para o pagamento ${paymentId} já existe. Nenhuma ação tomada.`);
                    return response.status(200).send('ok');
                }

                // Cria o pedido na base de dados pela primeira vez.
                const newOrderData = await connection.transaction(async (trx) => {
                    const [order] = await trx('orders').insert({
                      client_name: order_details.client_name,
                      client_phone: order_details.client_phone,
                      client_address: order_details.client_address,
                      total_price: order_details.total_price,
                      status: 'Pago', // O pedido já nasce como "Pago"
                      payment_method: 'online',
                      payment_id: String(paymentId),
                      payment_status: 'approved'
                    }).returning('*');
              
                    if (order_details.items && order_details.items.length > 0) {
                      const orderItemsToInsert = order_details.items.map(item => ({
                        order_id: order.id,
                        product_id: item.is_combo ? null : item.id,
                        combo_id: item.is_combo ? item.id : null,
                        item_name: item.name,
                        quantity: item.quantity,
                        unit_price: item.price,
                        item_details: JSON.stringify(item.selected_items || [])
                      }));
                      await trx('order_items').insert(orderItemsToInsert);
                    }
                    return order;
                });
                
                console.log(`[Webhook] ✅ Pedido #${newOrderData.id} criado com sucesso a partir do pagamento ${paymentId}.`);
                const io = getIO();
                io.emit('new_order', newOrderData);
            }
        } catch (error) {
            console.error(`[Webhook] Erro ao processar notificação:`, error.message);
        }
    }
    response.status(200).send('ok');
  },
  // ##################### FIM DA CORREÇÃO ######################
};