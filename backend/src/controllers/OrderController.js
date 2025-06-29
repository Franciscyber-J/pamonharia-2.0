const connection = require('../database/connection');

module.exports = {
  // Função para CRIAR um novo pedido
  async create(request, response) {
    // Usamos um bloco 'try...catch' para capturar qualquer erro durante o processo
    try {
      // knex.transaction é a nossa garantia de "tudo ou nada".
      // Ou todas as operações dentro dele são bem-sucedidas, ou todas são revertidas.
      // 'trx' é o nosso objeto de transação, que usaremos em vez de 'connection'
      const newOrder = await connection.transaction(async (trx) => {
        console.log('[OrderController] Iniciando transação para novo pedido.');

        const { client_name, client_phone, client_address, total_price, items } = request.body;

        // 1. Inserir na tabela 'orders' e obter o ID do novo pedido
        const [order_id] = await trx('orders').insert({
          client_name,
          client_phone,
          client_address,
          total_price,
          status: 'Novo'
        }).returning('id');
        
        console.log(`[OrderController] Pedido principal criado com ID: ${order_id.id}`);

        // 2. Preparar os itens do pedido para inserção
        const orderItems = items.map(item => ({
          order_id: order_id.id,
          product_id: item.id,
          quantity: item.quantity,
          unit_price: item.price
        }));

        // 3. Inserir todos os itens na tabela 'order_items' de uma só vez
        await trx('order_items').insert(orderItems);
        
        console.log(`[OrderController] ${orderItems.length} itens inseridos para o pedido ID: ${order_id.id}`);

        // Retorna os dados completos do pedido para uso posterior
        return { id: order_id.id, client_name, total_price };
      });

      // Se a transação foi concluída com sucesso, a execução continua aqui.
      console.log('[OrderController] Transação concluída com sucesso.');

      // --- Notificação em Tempo Real ---
      // Agora, emitimos o evento para o dashboard.
      request.io.emit('new_order', newOrder);
      console.log('[Socket.IO] Evento "new_order" emitido para o dashboard.');

      return response.status(201).json(newOrder);

    } catch (error) {
      // Se qualquer passo dentro da transação falhar, o Knex reverte tudo
      // e o código irá pular para este bloco 'catch'.
      console.error('[OrderController] ERRO NA TRANSAÇÃO, rollback executado:', error);
      return response.status(500).json({ error: 'Falha ao registar o pedido.' });
    }
  }
};