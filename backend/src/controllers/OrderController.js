// backend/src/controllers/OrderController.js
const connection = require('../database/connection');

module.exports = {
  // Função para LISTAR pedidos (para o dashboard)
  async index(request, response) {
    console.log('[OrderController] Buscando lista de pedidos ativos.');

    // Vamos buscar pedidos que NÃO estão finalizados ou cancelados
    const orders = await connection('orders')
      .whereNotIn('status', ['Finalizado', 'Cancelado'])
      .select('*')
      .orderBy('created_at', 'asc'); // Pedidos mais antigos primeiro

    return response.json(orders);
  },

  // Função para ATUALIZAR O STATUS de um pedido
  async updateStatus(request, response) {
    const { id } = request.params;
    const { status } = request.body;
    console.log(`[OrderController] Atualizando status do pedido ${id} para: ${status}`);

    await connection('orders').where('id', id).update({ status });

    // Emite um evento para todos os dashboards sincronizarem a mudança
    request.io.emit('order_status_updated', { id, status });

    return response.status(204).send();
  },

  // Função para CRIAR um novo pedido (do cardápio público)
  async create(request, response) {
    try {
      const newOrderData = await connection.transaction(async (trx) => {
        const { client_name, client_phone, client_address, total_price, items } = request.body;
        const [order_id_obj] = await trx('orders').insert({
          client_name, client_phone, client_address, total_price, status: 'Novo'
        }).returning('id');
        const order_id = order_id_obj.id;

        const orderItems = items.map(item => ({
          order_id: order_id, product_id: item.id, quantity: item.quantity, unit_price: item.price
        }));
        await trx('order_items').insert(orderItems);

        // Retorna o pedido completo com os itens
        return { id: order_id, client_name, total_price, status: 'Novo', items: orderItems };
      });

      request.io.emit('new_order', newOrderData);
      console.log('[Socket.IO] Evento "new_order" emitido para o dashboard.');
      return response.status(201).json(newOrderData);
    } catch (error) {
      console.error('[OrderController] ERRO NA TRANSAÇÃO:', error);
      return response.status(500).json({ error: 'Falha ao registar o pedido.' });
    }
  }
};