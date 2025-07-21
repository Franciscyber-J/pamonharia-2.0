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

const enrichOrdersWithFinancials = async (orders) => {
    if (!orders || orders.length === 0) {
        return orders;
    }
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
        return order;
    });
};

module.exports = {
    async index(request, response) {
        const activeOrders = await connection('orders')
            .whereIn('status', ['Novo', 'Pago', 'Em Preparo', 'Pronto para Entrega'])
            .select('*').orderBy('created_at', 'asc');
        const finishedOrders = await connection('orders').where('status', 'Finalizado').select('*').orderBy('updated_at', 'desc').limit(20);
        const cancelledOrders = await connection('orders').where('status', 'Cancelado').select('*').orderBy('updated_at', 'desc').limit(20);
        let allOrders = await enrichOrdersWithFinancials([...activeOrders, ...finishedOrders, ...cancelledOrders]);
        const orderIds = allOrders.map(o => o.id);
        if (orderIds.length > 0) {
            const items = await connection('order_items').whereIn('order_id', orderIds);
            allOrders.forEach(order => order.items = items.filter(item => item.order_id === order.id));
        }
        return response.json({ 
            activeOrders: allOrders.filter(o => ['Novo', 'Pago', 'Em Preparo', 'Pronto para Entrega'].includes(o.status)),
            finishedOrders: allOrders.filter(o => o.status === 'Finalizado'),
            rejectedOrders: allOrders.filter(o => o.status === 'Cancelado')
        });
    },

    async updateStatus(request, response) {
        const { id } = request.params;
        const { status: newStatus, reason } = request.body;
        
        try {
            const [updatedOrderRaw] = await connection('orders').where('id', id).update({ status: newStatus, updated_at: new Date() }).returning('*');
            if (!updatedOrderRaw) return response.status(404).json({ error: 'Pedido não encontrado.' });
            
            const [updatedOrder] = await enrichOrdersWithFinancials([updatedOrderRaw]);
            const items = await connection('order_items').where('order_id', updatedOrder.id);
            getIO().emit('order_status_updated', { id: Number(id), status: newStatus, order: { ...updatedOrder, items } });

            // #################### INÍCIO DA CORREÇÃO ####################
            if (updatedOrder.client_phone) {
                let message = '';
                if (newStatus === 'Em Preparo') {
                    message = `🍳 *O seu pedido entrou em preparação!*\n\nOba! O seu pedido *P-${updatedOrder.id}* foi confirmado e já está a ser preparado com todo o carinho pela nossa equipe.`;
                } else if (newStatus === 'Pronto para Entrega') {
                    message = `🛵 *A caminho!*\n\nO seu pedido *P-${updatedOrder.id}* já saiu para entrega e em breve chegará até você!`;
                } else if (newStatus === 'Finalizado' && updatedOrder.client_address === 'Retirada no local') {
                    message = `✅ *Pronto para Retirada!*\n\nBoas notícias! O seu pedido *P-${updatedOrder.id}* já está pronto e à sua espera para ser retirado.`;
                } else if (newStatus === 'Cancelado') {
                    const finalReason = reason ? `*Motivo:* ${reason}` : "Para mais detalhes, por favor, entre em contato com a loja.";
                    message = `⚠️ *Pedido Cancelado*\n\nOlá! Informamos que o seu pedido *P-${updatedOrder.id}* foi cancelado.\n\n${finalReason}\n\nLamentamos o inconveniente. Para tentar um novo pedido, por favor, fale com um de nossos atendentes.`;
                }
                if (message) await notifyBot(updatedOrder.client_phone, message);
            }
            // ##################### FIM DA CORREÇÃO ######################
            return response.status(204).send();
        } catch (error) {
            console.error(`[OrderController] Erro ao atualizar status do pedido ${id}:`, error);
            return response.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async create(request, response) {
        try {
            const { client_name, client_phone, client_address, total_price, items, payment_method, observations, needs_cutlery } = request.body;
            const newOrderData = await connection.transaction(async (trx) => {
                const [order] = await trx('orders').insert({
                    client_name, client_phone, client_address, total_price, 
                    status: 'Novo', payment_method, observations, needs_cutlery
                }).returning('*');

                if (items && items.length > 0) {
                    const orderItems = items.map(item => ({
                        order_id: order.id,
                        product_id: item.is_combo ? null : item.original_id,
                        combo_id: item.is_combo ? item.original_id : null,
                        item_name: item.name,
                        quantity: item.quantity,
                        unit_price: item.price,
                        item_details: JSON.stringify(item.details || {})
                    }));
                    await trx('order_items').insert(orderItems);
                }
                return { ...order, items };
            });
            return response.status(201).json(newOrderData);
        } catch (error) {
            console.error('[OrderController] ❌ ERRO AO CRIAR PRÉ-PEDIDO:', error);
            return response.status(400).json({ error: 'Não foi possível registrar o pedido.' });
        }
    },

    async confirmOrder(request, response) {
        const { id } = request.params;
        const { whatsapp } = request.body;
        const apiKey = request.headers['x-api-key'];
        if (!apiKey || apiKey !== process.env.BOT_API_KEY) return response.status(403).json({ error: 'Acesso não autorizado.' });
        
        try {
            const [orderRaw] = await connection('orders').where({ id, status: 'Novo' }).update({ client_phone: whatsapp }).returning('*');
            if (!orderRaw) return response.status(404).json({ error: 'Pedido não encontrado ou já processado.' });
            
            const [order] = await enrichOrdersWithFinancials([orderRaw]);
            const items = await connection('order_items').where('order_id', order.id);
            getIO().emit('new_order', { ...order, items });
            return response.status(200).json({ ...order, items });
        } catch (error) {
            console.error(`[OrderController] ❌ ERRO AO CONFIRMAR PEDIDO #${id}:`, error);
            return response.status(500).json({ error: 'Falha ao confirmar o pedido.' });
        }
    },
    
    async getDetails(request, response) {
        const { id } = request.params;
        try {
            const orderRaw = await connection('orders').where('id', id).first();
            if (!orderRaw) return response.status(404).json({ error: 'Pedido não encontrado.' });
            const [order] = await enrichOrdersWithFinancials([orderRaw]);
            const items = await connection('order_items').where('order_id', id);
            return response.json({ ...order, items });
        } catch (error) {
            console.error(`[OrderController] Erro ao buscar detalhes do pedido #${id}:`, error);
            return response.status(500).json({ error: 'Falha ao buscar detalhes do pedido.' });
        }
    },

    async clearHistory(request, response) {
        try {
            await connection('orders').whereIn('status', ['Finalizado', 'Cancelado']).del();
            getIO().emit('history_cleared');
            return response.status(204).send();
        } catch (error) {
            console.error('[OrderController] ❌ ERRO AO LIMPAR HISTÓRICO:', error);
            return response.status(500).json({ error: 'Falha ao limpar o histórico.' });
        }
    }
};