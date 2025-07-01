// backend/src/controllers/ComboController.js
const connection = require('../database/connection');

module.exports = {
  // LISTAR todos os combos e os seus produtos
  async index(request, response) {
    console.log('[ComboController] Listando todos os combos.');
    try {
      const combos = await connection('combos').select('*').orderBy('id', 'asc');
      
      for (const combo of combos) {
        const products = await connection('combo_products')
          .join('products', 'products.id', '=', 'combo_products.product_id')
          .where('combo_products.combo_id', combo.id)
          .select('products.*', 'combo_products.quantity_in_combo', 'combo_products.price_modifier');
        combo.products = products;
      }
      
      return response.json(combos);
    } catch (error) {
      console.error('[ComboController] Erro ao listar combos:', error);
      return response.status(500).json({ error: 'Falha ao buscar os combos.' });
    }
  },

  // CRIAR um novo combo
  async create(request, response) {
    // Adiciona os novos campos
    const { name, description, price, status, image_url, products, total_items_limit, allow_free_choice } = request.body;
    console.log('[ComboController] Criando novo combo:', request.body);

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

      return response.status(201).json({ message: 'Combo criado com sucesso.' });
    } catch (error) {
      console.error('[ComboController] Erro ao criar combo:', error);
      return response.status(500).json({ error: 'Falha ao criar o combo.' });
    }
  },

  // ATUALIZAR um combo existente
  async update(request, response) {
    const { id } = request.params;
    // Adiciona os novos campos
    const { name, description, price, status, image_url, products, total_items_limit, allow_free_choice } = request.body;
    console.log(`[ComboController] Atualizando combo ID ${id}.`);

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

      return response.json({ message: 'Combo atualizado com sucesso.' });
    } catch (error) {
      console.error(`[ComboController] Erro ao atualizar combo ID ${id}:`, error);
      return response.status(500).json({ error: 'Falha ao atualizar o combo.' });
    }
  },

  // APAGAR um combo
  async destroy(request, response) {
    const { id } = request.params;
    const deleted_rows = await connection('combos').where('id', id).delete();
    if (deleted_rows === 0) {
      return response.status(404).json({ error: 'Combo não encontrado.' });
    }
    return response.status(204).send();
  }
};