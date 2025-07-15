// backend/src/controllers/ProductController.js
const connection = require('../database/connection');
const { getIO } = require('../socket-manager');

// Função auxiliar para buscar colunas de uma tabela, para evitar erros de inserção/atualização.
async function getTableColumns(tableName) {
  try {
    const result = await connection.raw(`SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}'`);
    return result.rows.map(row => row.column_name);
  } catch (error) {
    console.error(`Erro ao buscar colunas para a tabela ${tableName}:`, error);
    return [];
  }
}

// Função auxiliar para emitir o evento de atualização de dados para os clientes.
// ARQUITETO: A função agora busca a instância do IO diretamente do nosso manager central.
// Isso garante que o evento será emitido de forma confiável, sem depender do objeto 'request'.
const emitDataUpdated = () => {
  console.log('[Socket.IO] Emitindo evento "data_updated" para todos os clientes do cardápio.');
  const io = getIO();
  io.emit('data_updated');
};

module.exports = {
  // Lista produtos para o dashboard, mantendo a estrutura hierárquica.
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
        if (parent) {
          parent.children.push(product);
        }
      } else {
        parentProducts.push(product);
      }
    });
    return response.json(parentProducts);
  },

  // Lista produtos para o cardápio público, apenas itens ativos e principais.
  async indexPublic(request, response) {
    const allActiveProducts = await connection('products')
      .where({ status: true })
      .orderBy('display_order', 'asc');
      
    const productMap = new Map();
    const finalList = [];

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
            finalList.push(product);
        }
    });

    return response.json(finalList);
  },

  // Cria um novo produto.
  async create(request, response) {
    try {
      const productData = request.body;
      const existingColumns = await getTableColumns('products');
      const dataToInsert = {};
      for (const key in productData) {
        if (existingColumns.includes(key) && key !== 'children') {
          dataToInsert[key] = productData[key];
        }
      }
      const [product] = await connection('products').insert(dataToInsert).returning('*');
      
      emitDataUpdated();
      if (dataToInsert.stock_enabled) {
          await request.triggerInventoryReload();
      }
      
      return response.status(201).json(product);
    } catch (error) {
      console.error('[ProductController] Erro ao criar produto:', error);
      return response.status(500).json({ error: 'Falha ao criar o produto.' });
    }
  },

  // Atualiza um produto existente e seus complementos.
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
          // Desvincula todos os filhos antigos
          await trx('products').where('parent_product_id', id).update({ parent_product_id: null });
          // Vincula os novos filhos
          if (productData.children.length > 0) {
            const childrenIds = productData.children.map(child => child.id);
            await trx('products').whereIn('id', childrenIds).update({ parent_product_id: id });
          }
        }
        // Se a sincronização de estoque foi ativada, sincroniza o estoque dos filhos imediatamente.
        if (dataToUpdate.stock_sync_enabled === true) {
          const parentProduct = await trx('products').where({ id }).first();
          if (parentProduct && parentProduct.stock_quantity !== null) {
            await trx('products')
              .where('parent_product_id', id)
              .update({ stock_quantity: parentProduct.stock_quantity });
          }
        }
      });
      
      emitDataUpdated();
      await request.triggerInventoryReload();
      
      return response.json({ message: 'Produto atualizado com sucesso.' });
    } catch (error) {
      console.error(`[ProductController] Erro ao atualizar produto ID ${request.params.id}:`, error);
      return response.status(500).json({ error: 'Falha ao atualizar o produto.' });
    }
  },

  // Apaga um produto.
  async destroy(request, response) {
    const { id } = request.params;
    const deleted_rows = await connection('products').where('id', id).delete();
    if (deleted_rows === 0) return response.status(404).json({ error: 'Produto não encontrado.' });
    
    emitDataUpdated();
    await request.triggerInventoryReload();
    
    return response.status(204).send();
  },

  // Atualiza o estoque de um produto e propaga a alteração para os filhos, se necessário.
  async updateStock(request, response) {
    const { id } = request.params;
    const { stock_quantity, stock_enabled } = request.body;

    try {
      await connection.transaction(async (trx) => {
        const dataToUpdate = {};
        if (stock_quantity !== undefined) dataToUpdate.stock_quantity = stock_quantity;
        if (stock_enabled !== undefined) dataToUpdate.stock_enabled = stock_enabled;

        if (Object.keys(dataToUpdate).length === 0) {
          return; // Nenhuma alteração a ser feita
        }

        // 1. Atualiza o produto principal (pai)
        const [product] = await trx('products').where('id', id).update(dataToUpdate).returning('*');

        if (!product) {
          throw new Error('Produto não encontrado.');
        }

        // 2. Se a sincronização estiver ativa E a quantidade foi alterada, propaga para os filhos.
        if (product.stock_sync_enabled && dataToUpdate.stock_quantity !== undefined) {
          console.log(`[ProductController] Sincronização ativa para o produto ${id}. Propagando estoque ${dataToUpdate.stock_quantity} para os filhos.`);
          await trx('products')
            .where('parent_product_id', id)
            .update({ stock_quantity: dataToUpdate.stock_quantity });
        }
      });

      // 3. Notifica todos os clientes sobre a mudança para recarregar os dados.
      emitDataUpdated();
      
      // 4. Força o servidor a recarregar o inventário da base de dados.
      await request.triggerInventoryReload(); 
      
      return response.status(200).json({ message: 'Estoque atualizado com sucesso.' });

    } catch (error) {
      console.error(`[ProductController] Erro ao atualizar estoque do produto ${id}:`, error);
      if (error.message === 'Produto não encontrado.') {
        return response.status(404).json({ error: error.message });
      }
      return response.status(500).json({ error: 'Falha ao atualizar o estoque.' });
    }
  },

  // Reordena os produtos no cardápio.
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
      
      emitDataUpdated();
      
      return response.status(200).json({ message: 'Produtos reordenados com sucesso.' });
    } catch (error) {
      console.error('[ProductController] Erro ao reordenar produtos:', error);
      return response.status(500).json({ error: 'Falha ao reordenar os produtos.' });
    }
  },

  // Duplica um produto e seus complementos associados.
  async duplicate(request, response) {
    const { id } = request.params;
    try {
        await connection.transaction(async trx => {
            const originalParent = await trx('products').where('id', id).first();
            if (!originalParent) {
                return response.status(404).json({ error: 'Produto original não encontrado.' });
            }
            const originalChildren = await trx('products').where('parent_product_id', id);

            const { id: parentId, created_at: p_created, updated_at: p_updated, ...parentData } = originalParent;
            parentData.name = `${parentData.name} (Cópia)`;
            parentData.status = false; 
            
            const [newParent] = await trx('products').insert(parentData).returning('*');

            if (originalChildren.length > 0) {
                const newChildrenData = originalChildren.map(child => {
                    const { id: childId, parent_product_id, created_at, updated_at, ...childData } = child;
                    return {
                        ...childData,
                        parent_product_id: newParent.id, 
                        status: false 
                    };
                });
                await trx('products').insert(newChildrenData);
            }
        });

        emitDataUpdated();
        await request.triggerInventoryReload();

        return response.status(201).json({ message: 'Produto duplicado com sucesso.' });
    } catch (error) {
        console.error(`[ProductController] Erro ao duplicar produto ID ${id}:`, error);
        return response.status(500).json({ error: 'Falha ao duplicar o produto.' });
    }
  }
};