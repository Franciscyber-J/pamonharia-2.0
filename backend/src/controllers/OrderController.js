// backend/src/controllers/OrderController.js
const connection = require('../database/connection');
const { getIO } = require('../socket-manager');
const axios = require('axios');

// --- FUNÇÃO AUXILIAR PARA NOTIFICAR O BOT ---
const notifyBot = async (phone, message) => {
    const botUrl = process.env.BOT_API_URL;
    if (!botUrl) {
        console.log('[BotNotify] URL do bot não configurada no .env. A saltar notificação.');
        return;
    }

    try {
        console.log(`[BotNotify] A enviar notificação para o bot em ${botUrl}...`);
        await axios.post(`${botUrl}/send-message`, {
            phone,
            message
        }, {
            headers: { 'x-api-key': process.env.BOT_API_KEY },
            timeout: 5000
        });
        console.log(`[BotNotify] ✅ Notificação para ${phone} enviada com sucesso para o bot.`);
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[BotNotify] ❌ Falha ao notificar o bot: ${errorMessage}`);
    }
};

module.exports = {
    async index(request, response) {
        console.log('[OrderController] Buscando lista de pedidos.');
        const activeOrders = await connection('orders')
            .whereIn('status', ['Novo', 'Pago', 'Em Preparo', 'Pronto para Entrega'])
            .select('*')
            .orderBy('created_at', 'asc');

        const finishedOrders = await connection('orders').where('status', 'Finalizado').select('*').orderBy('updated_at', 'desc').limit(20);
        const cancelledOrders = await connection('orders').where('status', 'Cancelado').select('*').orderBy('updated_at', 'desc').limit(20);
        return response.json({ activeOrders, finishedOrders, rejectedOrders: cancelledOrders });
    },

    async updateStatus(request, response) {
        const { id } = request.params;
        const { status } = request.body;
        console.log(`[OrderController] Atualizando status do pedido ${id} para: ${status}`);

        const [updatedOrder] = await connection('orders')
            .where('id', id)
            .update({ status, updated_at: new Date() })
            .returning('*');

        if (updatedOrder) {
            const io = getIO();
            io.emit('order_status_updated', { id: Number(id), status, order: updatedOrder });

            if (updatedOrder.client_phone) {
                let message = '';
                if (status === 'Em Preparo') {
                    message = `Oba! Seu pedido *#${updatedOrder.id}* foi confirmado e já entrou em preparação! 🍳`;
                } else if (status === 'Pronto para Entrega') {
                    if (updatedOrder.client_address === 'Retirada no local') {
                        message = `Boas notícias! 🎉 Seu pedido *#${updatedOrder.id}* já está pronto para ser retirado!`;
                    } else {
                        message = `Seu pedido *#${updatedOrder.id}* da Pamonharia já saiu para entrega! 🛵`;
                    }
                } else if (status === 'Cancelado') {
                    message = `Olá! Infelizmente, não poderemos prosseguir com o seu pedido *#${updatedOrder.id}* no momento. Para mais detalhes, por favor, entre em contato.`;
                }

                if (message) {
                    await notifyBot(updatedOrder.client_phone, message);
                }
            }
        }

        return response.status(204).send();
    },

    async create(request, response) {
        try {
            const { client_name, client_phone, client_address, total_price, items, payment_method } = request.body;

            // Para o novo fluxo, o status inicial é sempre 'Novo' (Aguardando Confirmação do Cliente)
            const initialStatus = 'Novo';

            const newOrderData = await connection.transaction(async (trx) => {
                const [order] = await trx('orders').insert({
                    client_name,
                    client_phone, // Este telefone é o digitado, será atualizado na confirmação
                    client_address,
                    total_price,
                    status: initialStatus,
                    payment_method
                }).returning('*');

                const order_id = order.id;

                if (items && items.length > 0) {
                    const orderItemsToInsert = items.map(item => ({
                        order_id: order_id,
                        product_id: item.is_combo ? null : item.id,
                        combo_id: item.is_combo ? item.id : null,
                        item_name: item.name,
                        quantity: item.quantity,
                        unit_price: item.price,
                        item_details: JSON.stringify(item.selected_items || [])
                    }));
                    await trx('order_items').insert(orderItemsToInsert);
                }
                
                const fullOrderDetails = { ...order, items }; // Inclui os itens para o frontend gerar a mensagem
                console.log(`[OrderController] ✅ Pré-pedido #${order_id} criado com status "${initialStatus}". Aguardando confirmação do cliente.`);
                return fullOrderDetails;
            });

            // NÃO emitimos 'new_order' aqui. A emissão só ocorrerá após a confirmação do bot.
            return response.status(201).json(newOrderData);

        } catch (error) {
            console.error('[OrderController] ❌ ERRO AO CRIAR PRÉ-PEDIDO:', error.message, error.stack);
            return response.status(400).json({ error: 'Não foi possível registrar o pedido.' });
        }
    },

    async confirmOrder(request, response) {
        const { id } = request.params;
        const { whatsapp } = request.body;
        const apiKey = request.headers['x-api-key'];

        // Camada extra de segurança, verificando a chave de API
        if (!apiKey || apiKey !== process.env.BOT_API_KEY) {
            return response.status(403).json({ error: 'Acesso não autorizado.' });
        }
        
        try {
            const [order] = await connection('orders')
                .where({ id: id, status: 'Novo' })
                .update({
                    client_phone: whatsapp // Atualiza o telefone com o número real do WhatsApp
                })
                .returning('*');

            if (!order) {
                console.log(`[OrderController] Tentativa de confirmar pedido #${id}, mas não foi encontrado ou já foi confirmado.`);
                return response.status(404).json({ error: 'Pedido não encontrado ou já processado.' });
            }

            console.log(`[OrderController] 🚀 Pedido #${id} confirmado pelo bot. Emitindo 'new_order' para o dashboard.`);
            const io = getIO();
            io.emit('new_order', order);

            return response.status(200).json({ message: 'Pedido confirmado com sucesso.' });

        } catch (error) {
            console.error(`[OrderController] ❌ ERRO AO CONFIRMAR PEDIDO #${id}:`, error);
            return response.status(500).json({ error: 'Falha ao confirmar o pedido.' });
        }
    },

    async clearHistory(request, response) {
        try {
            console.log('[OrderController] Limpando histórico de pedidos.');
            await connection('orders')
                .whereIn('status', ['Finalizado', 'Cancelado'])
                .del();

            const io = getIO();
            io.emit('history_cleared');

            return response.status(204).send();
        } catch (error) {
            console.error('[OrderController] ❌ ERRO AO LIMPAR HISTÓRICO:', error);
            return response.status(500).json({ error: 'Falha ao limpar o histórico de pedidos.' });
        }
    }
};