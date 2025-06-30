// backend/src/controllers/ProductController.js
const connection = require('../database/connection');

// Função auxiliar para buscar as colunas de uma tabela em tempo real
async function getTableColumns(tableName) {
  try {
    const result = await connection.raw(
      `SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}'`
    );
    return result.rows.map(row => row.column_name);
  } catch (error) {
    console.error(`Erro ao buscar colunas para a tabela ${tableName}:`, error);
    return []; // Retorna um array vazio em caso de erro para não quebrar a aplicação
  }
}

module.exports = {
  // LISTAR todos os produtos, agrupando complementos sob seus pais
  async index(request, response) {
    const products = await connection('products').select('*').orderBy('id', 'asc');
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

  // CRIAR um novo produto de forma resiliente
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
      
      console.log('[ProductController] Dados a serem inseridos (após filtro de colunas):', dataToInsert);
      const [product] = await connection('products').insert(dataToInsert).returning('*');
      return response.status(201).json(product);
    } catch (error) {
      console.error('[ProductController] Erro ao criar produto:', error);
      return response.status(500).json({ error: 'Falha ao criar o produto.' });
    }
  },

  // ATUALIZAR um produto de forma resiliente
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
      
      console.log(`[ProductController] Dados a serem atualizados para o ID ${id} (após filtro):`, dataToUpdate);

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
      });
      
      return response.json({ message: 'Produto atualizado com sucesso.' });
    } catch (error) {
      console.error(`[ProductController] Erro ao atualizar produto ID ${request.params.id}:`, error);
      return response.status(500).json({ error: 'Falha ao atualizar o produto.' });
    }
  },

  // APAGAR um produto
  async destroy(request, response) {
    const { id } = request.params;
    const deleted_rows = await connection('products').where('id', id).delete();
    if (deleted_rows === 0) return response.status(404).json({ error: 'Produto não encontrado.' });
    return response.status(204).send();
  },

  // ATUALIZAR O ESTOQUE de forma resiliente
  async updateStock(request, response) {
    const { id } = request.params;
    try {
        const productData = request.body;

        // 1. Busca as colunas existentes
        const existingColumns = await getTableColumns('products');

        // 2. Filtra os dados para garantir que apenas colunas existentes sejam atualizadas
        const dataToUpdate = {};
        if (productData.stock_quantity !== undefined && existingColumns.includes('stock_quantity')) {
            dataToUpdate.stock_quantity = productData.stock_quantity;
        }
        if (productData.stock_enabled !== undefined && existingColumns.includes('stock_enabled')) {
            dataToUpdate.stock_enabled = productData.stock_enabled;
        }

        // Se não houver dados válidos para atualizar, retorna sucesso.
        if (Object.keys(dataToUpdate).length === 0) {
            console.log(`[ProductController] Nenhuma coluna de estoque válida encontrada para o produto ${id}. Ação ignorada.`);
            return response.status(200).json({ message: 'Nenhuma coluna de estoque válida para atualizar.' });
        }

        const product = await connection('products').where('id', id).first();
        if (!product) {
            return response.status(404).json({ error: 'Produto não encontrado.' });
        }

        await connection('products').where('id', id).update(dataToUpdate);

        if (product.stock_sync_enabled && dataToUpdate.stock_quantity !== undefined) {
            await connection('products')
                .where('parent_product_id', id)
                .update({ stock_quantity: dataToUpdate.stock_quantity });
        }
        
        return response.status(200).json({ message: 'Estoque atualizado com sucesso.' });

    } catch (error) {
        console.error(`[ProductController] Erro ao atualizar estoque do produto ${id}:`, error);
        return response.status(500).json({ error: 'Falha ao atualizar o estoque.' });
    }
  }
};
