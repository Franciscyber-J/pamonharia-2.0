// backend/src/controllers/ProductController.js
const connection = require('../database/connection');

module.exports = {
  // LISTAR todos os produtos
  async index(request, response) {
    console.log('[ProductController] Recebida requisição para listar produtos.');
    const products = await connection('products').select('*').orderBy('id', 'asc');
    
    // Lógica para agrupar complementos sob seus pais
    const productMap = new Map();
    const parentProducts = [];

    products.forEach(product => {
      product.children = []; // Adiciona uma propriedade para os filhos
      productMap.set(product.id, product);
    });

    products.forEach(product => {
      if (product.parent_product_id) {
        const parent = productMap.get(product.parent_product_id);
        if (parent) {
          parent.children.push(product);
        }
      } else {
        parentProducts.push(product); // É um produto pai ou autônomo
      }
    });

    console.log(`[ProductController] Encontrados ${parentProducts.length} produtos pai/autônomos.`);
    return response.json(parentProducts);
  },

  // VER um único produto
  async show(request, response) {
    const { id } = request.params;
    console.log(`[ProductController] Recebida requisição para ver produto com ID: ${id}`);
    const product = await connection('products').where('id', id).first();
    if (!product) {
      return response.status(404).json({ error: 'Product not found.' });
    }
    console.log(`[ProductController] Produto encontrado:`, product);
    return response.json(product);
  },

  // CRIAR um novo produto
  async create(request, response) {
    const { name, description, price, status, image_url, stock_enabled, stock_quantity, parent_product_id } = request.body;
    console.log('[ProductController] Recebida requisição para criar produto:', request.body);
    try {
      const [id] = await connection('products').insert({
        name, description, price, status, image_url, stock_enabled, stock_quantity, parent_product_id
      }).returning('id');
      console.log(`[ProductController] Produto criado com sucesso com ID: ${id}.`);
      return response.status(201).json({ id });
    } catch (error) {
      console.error('[ProductController] Erro ao criar produto:', error);
      return response.status(500).json({ error: 'An error occurred while creating the product.' });
    }
  },

  // ATUALIZAR um produto
  async update(request, response) {
    const { id } = request.params;
    const { name, description, price, status, image_url, stock_enabled, stock_quantity, parent_product_id, stock_sync_enabled, force_addons, children } = request.body;
    console.log(`[ProductController] Recebida requisição para atualizar produto ID ${id} com dados:`, request.body);

    try {
      await connection.transaction(async trx => {
        // 1. Atualiza o produto principal
        await trx('products').where('id', id).update({
          name, description, price, status, image_url, stock_enabled, stock_quantity, parent_product_id, stock_sync_enabled, force_addons
        });

        // 2. Lógica para atualizar os filhos (complementos) vinculados
        if (children && Array.isArray(children)) {
            const childrenIds = children.map(child => child.id);
            // Vincula os filhos atuais
            await trx('products').whereIn('id', childrenIds).update({ parent_product_id: id });
            
            // Desvincula filhos que foram removidos
            await trx('products')
              .where('parent_product_id', id)
              .whereNotIn('id', childrenIds)
              .update({ parent_product_id: null });
        } else {
           // Se a lista de filhos vier vazia, desvincula todos
           await trx('products').where('parent_product_id', id).update({ parent_product_id: null });
        }
      });

      console.log(`[ProductController] Produto ID ${id} e seus complementos foram atualizados com sucesso.`);
      return response.json({ message: 'Product updated successfully.' });

    } catch(error) {
      console.error(`[ProductController] Erro ao atualizar produto ID ${id}:`, error);
      return response.status(500).json({ error: 'An error occurred while updating the product.' });
    }
  },

  // APAGAR um produto
  async destroy(request, response) {
    const { id } = request.params;
    console.log(`[ProductController] Recebida requisição para apagar produto ID: ${id}`);
    const deleted_rows = await connection('products').where('id', id).delete();
    if (deleted_rows === 0) {
      return response.status(404).json({ error: 'Product not found.' });
    }
    console.log(`[ProductController] Produto ID ${id} apagado com sucesso.`);
    return response.status(204).send();
  },

  // NOVO: ATUALIZAR O ESTOQUE
  async updateStock(request, response) {
    const { id } = request.params;
    const { stock_quantity, stock_enabled } = request.body;

    console.log(`[ProductController] Atualizando estoque do produto ${id}:`, request.body);

    const updateData = {};
    if (stock_quantity !== undefined) {
      updateData.stock_quantity = stock_quantity;
    }
    if (stock_enabled !== undefined) {
      updateData.stock_enabled = stock_enabled;
    }

    const product = await connection('products').where('id', id).first();
    if(!product) {
        return response.status(404).json({ error: 'Product not found.' });
    }

    await connection('products').where('id', id).update(updateData);
    
    // Se a sincronização de estoque estiver ativa, atualiza os filhos
    if(product.stock_sync_enabled) {
        await connection('products').where('parent_product_id', id).update(updateData);
    }

    return response.status(200).json({ message: 'Stock updated successfully.' });
  }
};
