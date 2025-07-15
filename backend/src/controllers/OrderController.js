// backend/src/controllers/OrderController.js
const connection = require('../database/connection');

module.exports = {
  async index(request, response) {
    console.log('[OrderController] Buscando lista de pedidos.');
    const activeOrders = await connection('orders')
      .whereIn('status', ['Novo', 'Pago', 'Em Preparo', 'Pronto para Entrega'])
      .select('*')
      .orderBy('created_at', 'asc');
      
    const finishedOrders = await connection('orders').where('status', 'Finalizado').select('*').orderBy('updated_at', 'desc').limit(20);
    const rejectedOrders = await connection('orders').where('status', 'Cancelado').select('*').orderBy('updated_at', 'desc').limit(20);
    return response.json({ activeOrders, finishedOrders, rejectedOrders });
  },

  async updateStatus(request, response) {
    const { id } = request.params;
    const { status } = request.body;
    console.log(`[OrderController] Atualizando status do pedido ${id} para: ${status}`);
    await connection('orders').where('id', id).update({ status, updated_at: new Date() });
    
    request.io.emit('order_status_updated', { id: Number(id), status });

    return response.status(204).send();
  },

  async create(request, response) {
    try {
      const { client_name, client_phone, client_address, total_price, items, payment_method } = request.body;
      
      const isNewOnDeliveryOrder = payment_method === 'on_delivery';
      const initialStatus = isNewOnDeliveryOrder ? 'Novo' : 'Aguardando Pagamento';

      const newOrderData = await connection.transaction(async (trx) => {
        const [order_id_obj] = await trx('orders').insert({
          client_name,
          client_phone,
          client_address,
          total_price,
          status: initialStatus,
          payment_method
        }).returning('id');

        const order_id = order_id_obj.id;

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

        const createdOrder = await trx('orders').where('id', order_id).first();
        console.log(`[OrderController] ✅ Pedido ${order_id} criado com sucesso com status "${initialStatus}".`);
        return createdOrder;
      });

      // #################### INÍCIO DA CORREÇÃO DEFINITIVA ####################
      if (isNewOnDeliveryOrder) {
        console.log(`[OrderController] 🚀 Emitindo evento 'new_order' para o pedido #${newOrderData.id}`);
        request.io.emit('new_order', newOrderData);
      }
      // ##################### FIM DA CORREÇÃO DEFINITIVA ######################

      return response.status(201).json(newOrderData);
    } catch (error) {
      console.error('[OrderController] ❌ ERRO AO CRIAR PEDIDO:', error.message, error.stack);
      return response.status(400).json({ error: 'Não foi possível registrar o pedido.' });
    }
  },

  async clearHistory(request, response) {
    try {
      console.log('[OrderController] Limpando histórico de pedidos.');
      await connection('orders')
        .whereIn('status', ['Finalizado', 'Cancelado'])
        .del();
      
      request.io.emit('history_cleared');
      
      return response.status(204).send();
    } catch (error) {
      console.error('[OrderController] ❌ ERRO AO LIMPAR HISTÓRICO:', error);
      return response.status(500).json({ error: 'Falha ao limpar o histórico de pedidos.' });
    }
  }
};
