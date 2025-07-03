// backend/src/controllers/OrderController.js
const connection = require('../database/connection');

module.exports = {
  // Função para LISTAR pedidos (para o dashboard)
  async index(request, response) {
    console.log('[OrderController] Buscando lista de pedidos.');
    
    // Busca pedidos que precisam de ação ou estão em andamento
    const activeOrders = await connection('orders')
      .whereIn('status', ['Novo', 'Em Preparo', 'Pronto para Entrega'])
      .select('*')
      .orderBy('created_at', 'asc');

    // Busca os últimos 20 pedidos finalizados
    const finishedOrders = await connection('orders')
      .where('status', 'Finalizado')
      .select('*')
      .orderBy('updated_at', 'desc')
      .limit(20);

    // Busca os últimos 20 pedidos cancelados
    const rejectedOrders = await connection('orders')
      .where('status', 'Cancelado')
      .select('*')
      .orderBy('updated_at', 'desc')
      .limit(20);

    // Retorna um objeto com as três listas para o frontend
    return response.json({ activeOrders, finishedOrders, rejectedOrders });
  },

  // Função para ATUALIZAR O STATUS de um pedido
  async updateStatus(request, response) {
    const { id } = request.params;
    const { status } = request.body;
    console.log(`[OrderController] Atualizando status do pedido ${id} para: ${status}`);
    
    await connection('orders').where('id', id).update({ 
      status, 
      updated_at: new Date() 
    });

    request.io.emit('order_status_updated', { id, status });
    return response.status(204).send();
  },

  // Função para CRIAR um novo pedido
  async create(request, response) {
    try {
      const { client_name, client_phone, client_address, total_price, items } = request.body;
      
      const newOrderData = await connection.transaction(async (trx) => {
        const [order_id_obj] = await trx('orders').insert({ 
          client_name, 
          client_phone, 
          client_address, 
          total_price, 
          status: 'Novo' 
        }).returning('id');
        
        const order_id = order_id_obj.id;

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

        console.log(`[OrderController] Pedido ${order_id} criado com sucesso.`);
        
        const newOrder = await trx('orders').where('id', order_id).first();
        return newOrder;
      });

      request.io.emit('new_order', newOrderData);
      console.log('[Socket.IO] Evento "new_order" emitido para o dashboard.');
      
      return response.status(201).json(newOrderData);

    } catch (error) {
      console.error('[OrderController] ERRO AO CRIAR PEDIDO:', error.message);
      return response.status(400).json({ error: 'Não foi possível registrar o pedido.' });
    }
  },

  // NOVA FUNÇÃO para limpar o histórico de pedidos concluídos e cancelados
  async clearHistory(request, response) {
    try {
      console.log('[OrderController] Limpando histórico de pedidos (Finalizados e Cancelados).');
      await connection('orders').whereIn('status', ['Finalizado', 'Cancelado']).del();
      
      // Notifica o frontend para recarregar a view de pedidos
      request.io.emit('history_cleared');
      
      return response.status(204).send();
    } catch (error) {
      console.error('[OrderController] ERRO AO LIMPAR HISTÓRICO:', error);
      return response.status(500).json({ error: 'Falha ao limpar o histórico de pedidos.' });
    }
  }
};
