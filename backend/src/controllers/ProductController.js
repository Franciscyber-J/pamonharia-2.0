// backend/src/controllers/ProductController.js
const connection = require('../database/connection');

// Função auxiliar para obter as colunas de uma tabela e evitar erros de "coluna não existe"
async function getTableColumns(tableName) {
  try {
    const result = await connection.raw(`SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}'`);
    return result.rows.map(row => row.column_name);
  } catch (error) {
    console.error(`Erro ao buscar colunas para a tabela ${tableName}:`, error);
    return [];
  }
}

// NOVA FUNÇÃO AUXILIAR PARA EMITIR ATUALIZAÇÕES
const emitDataUpdated = (request) => {
  console.log('[Socket.IO] Emitindo evento "data_updated" para todos os clientes do cardápio.');
  request.io.emit('data_updated');
};

module.exports = {
  // Rota para o Dashboard (protegida e ordenada pela nova coluna 'display_order')
  async index(request, response) {
    const products = await connection('products').select('*').orderBy('display_order', 'asc');
    const productMap = new Map();
    const parentProducts = [];

    // Mapeia todos os produtos por ID e inicializa a propriedade 'children'
    products.forEach(product => {
      product.children = [];
      productMap.set(product.id, product);
    });

    // Associa os filhos aos pais
    products.forEach(product => {
      if (product.parent_product_id) {
        const parent = productMap.get(product.parent_product_id);
        if (parent) {
          parent.children.push(product);
        }
      } else {
        parentProducts.push(product);
      }
    });
    return response.json(parentProducts);
  },

  // Rota para o Cardápio Público (apenas itens ativos e ordenados)
  async indexPublic(request, response) {
    const allActiveProducts = await connection('products')
      .where({ status: true })
      .orderBy('display_order', 'asc');
      
    const productMap = new Map();
    const finalProductsList = [];

    allActiveProducts.forEach(product => {
        product.children = [];
        productMap.set(product.id, product);
    });

    allActiveProducts.forEach(product => {
        if (product.parent_product_id) {
            const parent = productMap.get(product.parent_product_id);
            if (parent) {
                parent.children.push(product);
            }
        } else if (product.is_main_product) {
            finalProductsList.push(product);
        }
    });

    return response.json(finalProductsList);
  },

  async create(request, response) {
    try {
      const productData = request.body;
      const existingColumns = await getTableColumns('products');
      const dataToInsert = {};
      // Filtra apenas os campos que existem na tabela para evitar erros
      for (const key in productData) {
        if (existingColumns.includes(key) && key !== 'children') {
          dataToInsert[key] = productData[key];
        }
      }
      const [product] = await connection('products').insert(dataToInsert).returning('*');
      
      emitDataUpdated(request); // EMITE O EVENTO
      
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
      // Filtra os dados para atualização, incluindo os novos campos
      for (const key in productData) {
        if (existingColumns.includes(key) && key !== 'children') {
          dataToUpdate[key] = productData[key];
        }
      }
      
      await connection.transaction(async trx => {
        // Atualiza os dados do produto principal
        if (Object.keys(dataToUpdate).length > 0) {
          await trx('products').where({ id }).update(dataToUpdate);
        }
        // Gerencia os complementos (filhos)
        if (productData.children !== undefined) {
          // Primeiro, desvincula todos os filhos atuais
          await trx('products').where('parent_product_id', id).update({ parent_product_id: null });
          // Depois, vincula os novos filhos selecionados
          if (productData.children.length > 0) {
            const childrenIds = productData.children.map(child => child.id);
            await trx('products').whereIn('id', childrenIds).update({ parent_product_id: id });
          }
        }
        // Sincroniza o estoque se a opção estiver habilitada
        if (dataToUpdate.stock_sync_enabled === true) {
          const parentProduct = await trx('products').where({ id }).first();
          if (parentProduct && parentProduct.stock_quantity !== null) {
            await trx('products')
              .where('parent_product_id', id)
              .update({ stock_quantity: parentProduct.stock_quantity });
          }
        }
      });
      
      emitDataUpdated(request); // EMITE O EVENTO
      
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
    
    emitDataUpdated(request); // EMITE O EVENTO
    
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

        if (product.stock_sync_enabled && dataToUpdate.stock_quantity !== undefined) {
            await connection('products')
                .where('parent_product_id', id)
                .update({ stock_quantity: dataToUpdate.stock_quantity });
        }
        
        emitDataUpdated(request); // EMITE O EVENTO
        
        return response.status(200).json({ message: 'Estoque atualizado com sucesso.' });
    } catch (error) {
        console.error(`[ProductController] Erro ao atualizar estoque do produto ${id}:`, error);
        return response.status(500).json({ error: 'Falha ao atualizar o estoque.' });
    }
  },

  async reorder(request, response) {
    const { orderedIds } = request.body;
    if (!Array.isArray(orderedIds)) {
      return response.status(400).json({ error: 'O corpo da requisição deve conter um array "orderedIds".' });
    }
    try {
      await connection.transaction(async trx => {
        const updatePromises = orderedIds.map((id, index) => {
          return trx('products').where('id', id).update({ display_order: index });
        });
        await Promise.all(updatePromises);
      });
      console.log('[ProductController] Produtos reordenados com sucesso.');
      
      emitDataUpdated(request); // EMITE O EVENTO
      
      return response.status(200).json({ message: 'Produtos reordenados com sucesso.' });
    } catch (error) {
      console.error('[ProductController] Erro ao reordenar produtos:', error);
      return response.status(500).json({ error: 'Falha ao reordenar os produtos.' });
    }
  }
};