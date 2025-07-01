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

  // Função para CRIAR um novo pedido (com lógica de estoque atômico)
  async create(request, response) {
    try {
      const { client_name, client_phone, client_address, total_price, items } = request.body;
      
      const newOrderData = await connection.transaction(async (trx) => {
        // --- 1. VERIFICAÇÃO DE ESTOQUE ---
        for (const item of items) {
          const isCombo = !!item.is_combo;

          if (isCombo) {
            const comboProducts = await trx('combo_products').where('combo_id', item.id).select('product_id', 'quantity_in_combo');
            if (comboProducts.length === 0) throw new Error(`O combo '${item.name}' está vazio e não pode ser vendido.`);
            
            for (const comboProduct of comboProducts) {
              const product = await trx('products').where('id', comboProduct.product_id).first();
              if (product.stock_enabled) {
                const requiredStock = comboProduct.quantity_in_combo * item.quantity;
                if (!product.stock_quantity || product.stock_quantity < requiredStock) {
                  throw new Error(`Estoque insuficiente para o item '${product.name}' do combo '${item.name}'.`);
                }
              }
            }
          } else {
            const product = await trx('products').where('id', item.id).first();
            if (product.stock_enabled) {
              if (!product.stock_quantity || product.stock_quantity < item.quantity) {
                throw new Error(`Estoque insuficiente para o produto '${product.name}'.`);
              }
            }
          }
        }

        // --- 2. DEDUÇÃO DE ESTOQUE ---
        for (const item of items) {
            const isCombo = !!item.is_combo;
            if (isCombo) {
                const comboProducts = await trx('combo_products').where('combo_id', item.id).select('product_id', 'quantity_in_combo');
                for (const comboProduct of comboProducts) {
                    const requiredStock = comboProduct.quantity_in_combo * item.quantity;
                    await trx('products').where('id', comboProduct.product_id).decrement('stock_quantity', requiredStock);
                }
            } else {
                await trx('products').where({ id: item.id, stock_enabled: true }).decrement('stock_quantity', item.quantity);
            }
        }
        
        // --- 3. CRIAÇÃO DO PEDIDO E ITENS ---
        const [order_id_obj] = await trx('orders').insert({ client_name, client_phone, client_address, total_price, status: 'Novo' }).returning('id');
        const order_id = order_id_obj.id;

        const orderItemsToInsert = items.map(item => ({
            order_id: order_id,
            product_id: item.is_combo ? null : item.id,
            combo_id: item.is_combo ? item.id : null,
            item_name: item.name,
            quantity: item.quantity,
            unit_price: item.price
        }));

        await trx('order_items').insert(orderItemsToInsert);

        console.log(`[OrderController] Pedido ${order_id} criado e estoque deduzido com sucesso.`);
        return { id: order_id, client_name, total_price, status: 'Novo', items: request.body.items };
      });

      request.io.emit('new_order', newOrderData);
      console.log('[Socket.IO] Evento "new_order" emitido para o dashboard.');
      return response.status(201).json(newOrderData);
    } catch (error) {
      console.error('[OrderController] ERRO NA TRANSAÇÃO AO CRIAR PEDIDO:', error.message);
      return response.status(400).json({ error: error.message });
    }
  }
};