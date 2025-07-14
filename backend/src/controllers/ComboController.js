// backend/src/controllers/ComboController.js
const connection = require('../database/connection');

// NOVA FUNÇÃO AUXILIAR PARA EMITIR ATUALIZAÇÕES
const emitDataUpdated = (request) => {
  console.log('[Socket.IO] Emitindo evento "data_updated" para todos os clientes do cardápio.');
  request.io.emit('data_updated');
};

module.exports = {
  // Rota para o Dashboard (ordenada)
  async index(request, response) {
    console.log('[ComboController] Listando todos os combos para o dashboard.');
    try {
      const combos = await connection('combos').select('*').orderBy('display_order', 'asc');
      
      for (const combo of combos) {
        combo.products = await connection('combo_products')
          .join('products', 'products.id', '=', 'combo_products.product_id')
          .where('combo_products.combo_id', combo.id)
          .select(
            'products.*', 
            'combo_products.quantity_in_combo', 
            'combo_products.price_modifier', 
            'combo_products.product_id as product_id' // Garante que o product_id seja selecionado
          );
      }
      
      return response.json(combos);
    } catch (error) {
      console.error('[ComboController] Erro ao listar combos:', error);
      return response.status(500).json({ error: 'Falha ao buscar os combos.' });
    }
  },

  // Rota para o Cardápio Público (ordenada)
  async indexPublic(request, response) {
    console.log('[ComboController] Listando combos para o cardápio público.');
    try {
      const combos = await connection('combos')
        .where('status', true)
        .orderBy('display_order', 'asc');

      for (const combo of combos) {
        combo.products = await connection('combo_products')
          .join('products', 'products.id', '=', 'combo_products.product_id')
          .where('combo_products.combo_id', combo.id)
          .andWhere('products.status', true)
          .select(
            'products.*',
            'products.id as id',
            'combo_products.quantity_in_combo',
            'combo_products.price_modifier'
          );
      }
      
      return response.json(combos);
    } catch (error) {
      console.error('[ComboController] Erro ao listar combos públicos:', error);
      return response.status(500).json({ error: 'Falha ao buscar os combos.' });
    }
  },

  async create(request, response) {
    const { name, description, price, status, image_url, products, total_items_limit, allow_free_choice } = request.body;
    try {
      await connection.transaction(async trx => {
        const [combo_id_obj] = await trx('combos').insert({
          name, description, price, status, image_url, total_items_limit, allow_free_choice
        }).returning('id');
        const combo_id = combo_id_obj.id;

        if (products && products.length > 0) {
          const comboProducts = products.map(product => ({
            combo_id: combo_id,
            product_id: product.id,
            quantity_in_combo: product.quantity_in_combo || 1,
            price_modifier: product.price_modifier || 0.00
          }));
          await trx('combo_products').insert(comboProducts);
        }
      });
      
      emitDataUpdated(request); 
      
      return response.status(201).json({ message: 'Combo criado com sucesso.' });
    } catch (error) {
      console.error('[ComboController] Erro ao criar combo:', error);
      return response.status(500).json({ error: 'Falha ao criar o combo.' });
    }
  },

  async update(request, response) {
    const { id } = request.params;
    const { name, description, price, status, image_url, products, total_items_limit, allow_free_choice } = request.body;
    try {
      await connection.transaction(async trx => {
        await trx('combos').where('id', id).update({
          name, description, price, status, image_url, total_items_limit, allow_free_choice
        });

        await trx('combo_products').where('combo_id', id).delete();

        if (products && products.length > 0) {
          const comboProducts = products.map(product => ({
            combo_id: id,
            product_id: product.id,
            quantity_in_combo: product.quantity_in_combo || 1,
            price_modifier: product.price_modifier || 0.00
          }));
          await trx('combo_products').insert(comboProducts);
        }
      });
      
      emitDataUpdated(request); 
      
      return response.json({ message: 'Combo atualizado com sucesso.' });
    } catch (error) {
      console.error(`[ComboController] Erro ao atualizar combo ID ${id}:`, error);
      return response.status(500).json({ error: 'Falha ao atualizar o combo.' });
    }
  },

  async destroy(request, response) {
    const { id } = request.params;
    const deleted_rows = await connection('combos').where('id', id).delete();
    if (deleted_rows === 0) {
      return response.status(404).json({ error: 'Combo não encontrado.' });
    }
    
    emitDataUpdated(request); 
    
    return response.status(204).send();
  },

  async reorder(request, response) {
    const { orderedIds } = request.body;
    if (!Array.isArray(orderedIds)) {
      return response.status(400).json({ error: 'O corpo da requisição deve conter um array "orderedIds".' });
    }
    try {
      await connection.transaction(async trx => {
        const updatePromises = orderedIds.map((id, index) => {
          return trx('combos').where('id', id).update({ display_order: index });
        });
        await Promise.all(updatePromises);
      });
      console.log('[ComboController] Combos reordenados com sucesso.');
      
      // #################### INÍCIO DA CORREÇÃO ####################
      emitDataUpdated(request); // EMITE O EVENTO PARA ATUALIZAR OS CARDÁPIOS
      // ##################### FIM DA CORREÇÃO ######################
      
      return response.status(200).json({ message: 'Combos reordenados com sucesso.' });
    } catch (error) {
      console.error('[ComboController] Erro ao reordenar combos:', error);
      return response.status(500).json({ error: 'Falha ao reordenar os combos.' });
    }
  }
};