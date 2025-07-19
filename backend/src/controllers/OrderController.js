// backend/src/controllers/OrderController.js
const connection = require('../database/connection');
const { getIO } = require('../socket-manager');

module.exports = {
  async index(request, response) {
    console.log('[OrderController] Buscando lista de pedidos.');
    // ARQUITETO: Removido o status 'Aguardando Pagamento' da consulta principal.
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
    }

    return response.status(204).send();
  },

  // #################### INÍCIO DA CORREÇÃO ####################
  // ARQUITETO: Esta função agora só lida com pedidos 'Pagamento na Entrega'.
  // Pedidos online são criados pelo PaymentController após a confirmação.
  async create(request, response) {
    try {
      const { client_name, client_phone, client_address, total_price, items, payment_method } = request.body;
      
      if (payment_method !== 'on_delivery') {
        return response.status(400).json({ error: 'Este endpoint é exclusivo para pedidos com pagamento na entrega.' });
      }

      const newOrderData = await connection.transaction(async (trx) => {
        const [order] = await trx('orders').insert({
          client_name, client_phone, client_address, total_price,
          status: 'Novo', // Status inicial para pagamento na entrega
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

        console.log(`[OrderController] ✅ Pedido ${order_id} (Na Entrega) criado com sucesso.`);
        return order;
      });

      console.log(`[OrderController] 🚀 Emitindo evento 'new_order' para o pedido #${newOrderData.id}`);
      const io = getIO();
      io.emit('new_order', newOrderData);

      return response.status(201).json(newOrderData);
    } catch (error) {
      console.error('[OrderController] ❌ ERRO AO CRIAR PEDIDO:', error.message, error.stack);
      return response.status(400).json({ error: 'Não foi possível registrar o pedido.' });
    }
  },
  // ##################### FIM DA CORREÇÃO ######################

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