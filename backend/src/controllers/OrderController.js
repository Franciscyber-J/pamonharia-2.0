// backend/src/controllers/OrderController.js
const connection = require('../database/connection');

module.exports = {
  // Função para LISTAR pedidos (para o dashboard)
  async index(request, response) {
    console.log('[OrderController] Buscando lista de pedidos ativos.');
    const orders = await connection('orders')
      .whereNotIn('status', ['Finalizado', 'Cancelado'])
      .select('*')
      .orderBy('created_at', 'asc');
    return response.json(orders);
  },

  // Função para ATUALIZAR O STATUS de um pedido
  async updateStatus(request, response) {
    const { id } = request.params;
    const { status } = request.body;
    console.log(`[OrderController] Atualizando status do pedido ${id} para: ${status}`);
    await connection('orders').where('id', id).update({ status });
    request.io.emit('order_status_updated', { id, status });
    return response.status(204).send();
  },

  // ✅ --- FUNÇÃO CREATE SIMPLIFICADA --- ✅
  // A responsabilidade de verificar e deduzir estoque foi movida para o StockController.
  // Esta função agora apenas cria o registro do pedido.
  async create(request, response) {
    try {
      const { client_name, client_phone, client_address, total_price, items } = request.body;
      
      const newOrderData = await connection.transaction(async (trx) => {
        // --- CRIAÇÃO DO PEDIDO E ITENS ---
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
        return { id: order_id, client_name, total_price, status: 'Novo' };
      });

      // Emite o evento para o dashboard de pedidos.
      request.io.emit('new_order', newOrderData);
      console.log('[Socket.IO] Evento "new_order" emitido para o dashboard.');
      
      return response.status(201).json(newOrderData);

    } catch (error) {
      console.error('[OrderController] ERRO AO CRIAR PEDIDO:', error.message);
      return response.status(400).json({ error: 'Não foi possível registrar o pedido.' });
    }
  }
};
