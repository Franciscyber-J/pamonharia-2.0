// backend/src/controllers/ProductController.js
const connection = require('../database/connection');

async function getTableColumns(tableName) {
  try {
    const result = await connection.raw(`SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}'`);
    return result.rows.map(row => row.column_name);
  } catch (error) {
    console.error(`Erro ao buscar colunas para a tabela ${tableName}:`, error);
    return [];
  }
}

module.exports = {
  // Rota para o Dashboard (protegida e ordenada)
  async index(request, response) {
    const products = await connection('products').select('*').orderBy('display_order', 'asc');
    const productMap = new Map();
    const parentProducts = [];

    products.forEach(product => {
      product.children = [];
      productMap.set(product.id, product);
    });

    products.forEach(product => {
      if (product.parent_product_id) {
        const parent = productMap.get(product.parent_product_id);
        if (parent) parent.children.push(product);
      } else {
        parentProducts.push(product);
      }
    });
    return response.json(parentProducts);
  },

  // Rota para o Cardápio Público (ordenada)
  async indexPublic(request, response) {
    const parentProducts = await connection('products')
      .where({ status: true, is_main_product: true })
      .orderBy('display_order', 'asc');

    for (const product of parentProducts) {
      product.children = await connection('products')
        .where({ parent_product_id: product.id, status: true })
        .orderBy('display_order', 'asc');
    }
    return response.json(parentProducts);
  },

  async create(request, response) {
    try {
      const productData = request.body;
      const existingColumns = await getTableColumns('products');
      const dataToInsert = {};
      for (const key in productData) {
        if (existingColumns.includes(key)) {
          dataToInsert[key] = productData[key];
        }
      }
      const [product] = await connection('products').insert(dataToInsert).returning('*');
      return response.status(201).json(product);
    } catch (error) {
      console.error('[ProductController] Erro ao criar produto:', error);
      return response.status(500).json({ error: 'Falha ao criar o produto.' });
    }
  },

  async update(request, response) {
    try {
      const { id } = request.params;
      const productData = request.body;
      const existingColumns = await getTableColumns('products');
      const dataToUpdate = {};
      for (const key in productData) {
        if (existingColumns.includes(key) && key !== 'children') {
          dataToUpdate[key] = productData[key];
        }
      }
      
      await connection.transaction(async trx => {
        if (Object.keys(dataToUpdate).length > 0) {
          await trx('products').where({ id }).update(dataToUpdate);
        }
        if (productData.children !== undefined) {
          await trx('products').where('parent_product_id', id).update({ parent_product_id: null });
          if (productData.children.length > 0) {
            const childrenIds = productData.children.map(child => child.id);
            await trx('products').whereIn('id', childrenIds).update({ parent_product_id: id });
          }
        }
        if (dataToUpdate.stock_sync_enabled === true) {
          const parentProduct = await trx('products').where({ id }).first();
          if (parentProduct && parentProduct.stock_quantity !== null) {
            await trx('products')
              .where('parent_product_id', id)
              .update({ stock_quantity: parentProduct.stock_quantity });
          }
        }
      });
      
      return response.json({ message: 'Produto atualizado com sucesso.' });
    } catch (error) {
      console.error(`[ProductController] Erro ao atualizar produto ID ${request.params.id}:`, error);
      return response.status(500).json({ error: 'Falha ao atualizar o produto.' });
    }
  },

  async destroy(request, response) {
    const { id } = request.params;
    const deleted_rows = await connection('products').where('id', id).delete();
    if (deleted_rows === 0) return response.status(404).json({ error: 'Produto não encontrado.' });
    return response.status(204).send();
  },

  async updateStock(request, response) {
    const { id } = request.params;
    try {
        const productData = request.body;
        const dataToUpdate = {};
        if (productData.stock_quantity !== undefined) dataToUpdate.stock_quantity = productData.stock_quantity;
        if (productData.stock_enabled !== undefined) dataToUpdate.stock_enabled = productData.stock_enabled;

        if (Object.keys(dataToUpdate).length === 0) {
            return response.status(200).json({ message: 'Nenhuma informação de estoque para atualizar.' });
        }

        const product = await connection('products').where('id', id).first();
        if (!product) {
            return response.status(404).json({ error: 'Produto não encontrado.' });
        }

        await connection('products').where('id', id).update(dataToUpdate);

        const updatedProduct = await connection('products').where('id', id).first();
        
        // Emite o evento de atualização de estoque para todos os clientes
        request.io.emit('stock_updated', {
            productId: updatedProduct.id,
            stock_quantity: updatedProduct.stock_quantity,
            stock_enabled: updatedProduct.stock_enabled,
        });

        if (product.stock_sync_enabled && dataToUpdate.stock_quantity !== undefined) {
            const childrenToUpdate = await connection('products').where('parent_product_id', id).select('id');
            await connection('products')
                .where('parent_product_id', id)
                .update({ stock_quantity: dataToUpdate.stock_quantity });
            
            // Emite evento para cada filho atualizado
            childrenToUpdate.forEach(child => {
                request.io.emit('stock_updated', {
                    productId: child.id,
                    stock_quantity: dataToUpdate.stock_quantity,
                    stock_enabled: true // Assumindo que o filho também deve estar habilitado
                });
            });
        }
        
        return response.status(200).json({ message: 'Estoque atualizado com sucesso.' });
    } catch (error) {
        console.error(`[ProductController] Erro ao atualizar estoque do produto ${id}:`, error);
        return response.status(500).json({ error: 'Falha ao atualizar o estoque.' });
    }
  },

  // NOVA FUNÇÃO PARA REORDENAR
  async reorder(request, response) {
    const { orderedIds } = request.body; // Array de IDs na nova ordem
    try {
      await connection.transaction(async trx => {
        for (let i = 0; i < orderedIds.length; i++) {
          const id = orderedIds[i];
          const display_order = i;
          await trx('products').where('id', id).update({ display_order });
        }
      });
      return response.status(200).json({ message: 'Produtos reordenados com sucesso.' });
    } catch (error) {
      console.error('[ProductController] Erro ao reordenar produtos:', error);
      return response.status(500).json({ error: 'Falha ao reordenar os produtos.' });
    }
  }
};
