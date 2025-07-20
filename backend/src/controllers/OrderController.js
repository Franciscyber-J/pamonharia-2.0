// backend/src/controllers/OrderController.js
const connection = require('../database/connection');
const { getIO } = require('../socket-manager');
const axios = require('axios');

const notifyBot = async (phone, message) => {
    const botUrl = process.env.BOT_API_URL;
    if (!botUrl) {
        console.log('[BotNotify] URL do bot não configurada no .env. A saltar notificação.');
        return;
    }
    try {
        console.log(`[BotNotify] A enviar notificação para o bot em ${botUrl} para o número ${phone}`);
        await axios.post(`${botUrl}/send-message`, {
            phone,
            message
        }, {
            headers: { 'x-api-key': process.env.BOT_API_KEY },
            timeout: 5000
        });
        console.log(`[BotNotify] ✅ Notificação para ${phone} enviada com sucesso para o bot.`);
    } catch (error) {
        const errorMessage = error.response 
            ? JSON.stringify(error.response.data)
            : error.message;
        console.error(`[BotNotify] ❌ Falha ao notificar o bot: ${errorMessage}`);
    }
};

// #################### INÍCIO DA CORREÇÃO ####################
// ARQUITETO: Função auxiliar para enriquecer os pedidos com detalhes financeiros.
const enrichOrdersWithFinancials = async (orders) => {
    if (!orders || orders.length === 0) {
        return orders;
    }
    // Buscamos a taxa de entrega uma única vez
    const settings = await connection('store_settings').select('delivery_fee').where('id', 1).first();
    const delivery_fee = settings ? parseFloat(settings.delivery_fee) : 0;

    return orders.map(order => {
        const isDelivery = order.client_address !== 'Retirada no local';
        if (isDelivery && delivery_fee > 0) {
            const total = parseFloat(order.total_price);
            return {
                ...order,
                delivery_fee: delivery_fee,
                subtotal: total - delivery_fee
            };
        }
        return order; // Retorna o pedido original se não for entrega
    });
};
// ##################### FIM DA CORREÇÃO ######################

module.exports = {
    async index(request, response) {
        console.log('[OrderController] Buscando lista de pedidos com detalhes.');
        const activeOrders = await connection('orders')
            .whereIn('status', ['Novo', 'Pago', 'Em Preparo', 'Pronto para Entrega'])
            .select('*')
            .orderBy('created_at', 'asc');

        const finishedOrders = await connection('orders').where('status', 'Finalizado').select('*').orderBy('updated_at', 'desc').limit(20);
        const cancelledOrders = await connection('orders').where('status', 'Cancelado').select('*').orderBy('updated_at', 'desc').limit(20);
        
        let allOrders = [...activeOrders, ...finishedOrders, ...cancelledOrders];
        
        // Enriquece todos os pedidos com os detalhes financeiros
        allOrders = await enrichOrdersWithFinancials(allOrders);

        const orderIds = allOrders.map(o => o.id);
        if (orderIds.length > 0) {
            const items = await connection('order_items').whereIn('order_id', orderIds);
            allOrders.forEach(order => {
                order.items = items.filter(item => item.order_id === order.id);
            });
        }

        return response.json({ 
            activeOrders: allOrders.filter(o => ['Novo', 'Pago', 'Em Preparo', 'Pronto para Entrega'].includes(o.status)),
            finishedOrders: allOrders.filter(o => o.status === 'Finalizado'),
            rejectedOrders: allOrders.filter(o => o.status === 'Cancelado')
        });
    },

    async updateStatus(request, response) {
        // ... (código existente sem alterações)
        const { id } = request.params;
        const { status: newStatus, reason } = request.body;
        console.log(`[OrderController] Pedido de atualização para pedido ${id}. Novo status: ${newStatus}, Motivo: ${reason || 'N/A'}`);

        try {
            const currentOrder = await connection('orders').where('id', id).first();
            if (!currentOrder) {
                return response.status(404).json({ error: 'Pedido não encontrado.' });
            }

            const [updatedOrderRaw] = await connection('orders')
                .where('id', id)
                .update({ status: newStatus, updated_at: new Date() })
                .returning('*');

            if (!updatedOrderRaw) {
                return response.status(404).json({ error: 'Falha ao atualizar o pedido.' });
            }
            
            // Enriquece o pedido atualizado antes de emitir
            const [updatedOrder] = await enrichOrdersWithFinancials([updatedOrderRaw]);

            const items = await connection('order_items').where('order_id', updatedOrder.id);
            const fullOrder = { ...updatedOrder, items };

            const io = getIO();
            io.emit('order_status_updated', { id: Number(id), status: newStatus, order: fullOrder });

            if (updatedOrder.client_phone) {
                let message = '';
                if (currentOrder.status === 'Em Preparo' && newStatus === 'Finalizado' && updatedOrder.client_address === 'Retirada no local') {
                    message = `Boas notícias! 🎉 Seu pedido *#${updatedOrder.id}* já está pronto para ser retirado!`;
                } else if (newStatus === 'Em Preparo') {
                    message = `Oba! Seu pedido *#${updatedOrder.id}* foi confirmado e já entrou em preparação! 🍳`;
                } else if (newStatus === 'Pronto para Entrega') {
                    message = `Seu pedido *#${updatedOrder.id}* da Pamonharia já saiu para entrega! 🛵`;
                } else if (newStatus === 'Cancelado') {
                    const defaultReasonText = "Para mais detalhes, por favor, entre em contato com a loja.";
                    const finalReason = reason ? `Motivo: *${reason}*.` : defaultReasonText;
                    message = `Olá! Infelizmente, o seu pedido *#${updatedOrder.id}* foi cancelado. ${finalReason}`;
                }

                if (message) {
                    await notifyBot(updatedOrder.client_phone, message);
                }
            }
            return response.status(204).send();

        } catch (error) {
            console.error(`[OrderController] Erro crítico ao atualizar status do pedido ${id}:`, error);
            return response.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async create(request, response) {
        // ... (código existente sem alterações)
        try {
            const { client_name, client_phone, client_address, total_price, items, payment_method, observations, needs_cutlery } = request.body;
            const initialStatus = 'Novo';
            const newOrderData = await connection.transaction(async (trx) => {
                const [order] = await trx('orders').insert({
                    client_name, 
                    client_phone, 
                    client_address, 
                    total_price, 
                    status: initialStatus, 
                    payment_method,
                    observations,
                    needs_cutlery
                }).returning('*');

                const order_id = order.id;
                if (items && items.length > 0) {
                    const orderItemsToInsert = items.map(item => ({
                        order_id: order_id,
                        product_id: item.is_combo ? null : item.original_id,
                        combo_id: item.is_combo ? item.original_id : null,
                        item_name: item.name,
                        quantity: item.quantity,
                        unit_price: item.price,
                        item_details: JSON.stringify(item.details || {})
                    }));
                    await trx('order_items').insert(orderItemsToInsert);
                }
                const fullOrderDetails = { ...order, items };
                console.log(`[OrderController] ✅ Pré-pedido #${order_id} criado. Aguardando confirmação.`);
                return fullOrderDetails;
            });
            return response.status(201).json(newOrderData);
        } catch (error) {
            console.error('[OrderController] ❌ ERRO AO CRIAR PRÉ-PEDIDO:', error.message, error.stack);
            return response.status(400).json({ error: 'Não foi possível registrar o pedido.' });
        }
    },

    async confirmOrder(request, response) {
        // ... (código existente sem alterações, mas o pedido retornado será enriquecido)
        const { id } = request.params;
        const { whatsapp } = request.body;
        const apiKey = request.headers['x-api-key'];

        if (!apiKey || apiKey !== process.env.BOT_API_KEY) {
            return response.status(403).json({ error: 'Acesso não autorizado.' });
        }
        
        try {
            const [orderRaw] = await connection('orders')
                .where({ id: id, status: 'Novo' })
                .update({ client_phone: whatsapp })
                .returning('*');

            if (!orderRaw) {
                console.log(`[OrderController] Tentativa de confirmar pedido #${id}, mas não foi encontrado.`);
                return response.status(404).json({ error: 'Pedido não encontrado ou já processado.' });
            }
            
            const [order] = await enrichOrdersWithFinancials([orderRaw]);
            const items = await connection('order_items').where('order_id', order.id);
            const fullOrder = { ...order, items };

            console.log(`[OrderController] 🚀 Pedido #${id} confirmado pelo bot. Emitindo 'new_order'.`);
            getIO().emit('new_order', fullOrder);

            return response.status(200).json(fullOrder);

        } catch (error) {
            console.error(`[OrderController] ❌ ERRO AO CONFIRMAR PEDIDO #${id}:`, error);
            return response.status(500).json({ error: 'Falha ao confirmar o pedido.' });
        }
    },
    
    async getDetails(request, response) {
        // ... (código existente sem alterações, mas o pedido retornado será enriquecido)
        const { id } = request.params;
        try {
            const orderRaw = await connection('orders').where('id', id).first();
            if (!orderRaw) {
                return response.status(404).json({ error: 'Pedido não encontrado.' });
            }
            const [order] = await enrichOrdersWithFinancials([orderRaw]);
            const items = await connection('order_items').where('order_id', id);
            const fullOrder = { ...order, items };
            return response.json(fullOrder);
        } catch (error) {
            console.error(`[OrderController] Erro ao buscar detalhes do pedido #${id}:`, error);
            return response.status(500).json({ error: 'Falha ao buscar detalhes do pedido.' });
        }
    },

    async clearHistory(request, response) {
        // ... (código existente sem alterações)
        try {
            console.log('[OrderController] Limpando histórico de pedidos.');
            await connection('orders').whereIn('status', ['Finalizado', 'Cancelado']).del();
            getIO().emit('history_cleared');
            return response.status(204).send();
        } catch (error) {
            console.error('[OrderController] ❌ ERRO AO LIMPAR HISTÓRICO:', error);
            return response.status(500).json({ error: 'Falha ao limpar o histórico de pedidos.' });
        }
    }
};