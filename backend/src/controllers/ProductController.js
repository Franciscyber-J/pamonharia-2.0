// backend/src/controllers/ProductController.js
const connection = require('../database/connection');

module.exports = {
  // LISTAR todos os produtos
  async index(request, response) {
    console.log('[ProductController] Recebida requisição para listar produtos.');
    const products = await connection('products').select('*');
    console.log(`[ProductController] Encontrados ${products.length} produtos.`);
    return response.json(products);
  },

  // VER um único produto
  async show(request, response) {
    const { id } = request.params;
    console.log(`[ProductController] Recebida requisição para ver produto com ID: ${id}`);

    const product = await connection('products').where('id', id).first();

    if (!product) {
      console.log(`[ProductController] Produto com ID: ${id} não encontrado.`);
      return response.status(404).json({ error: 'Product not found.' });
    }

    console.log(`[ProductController] Produto encontrado:`, product);
    return response.json(product);
  },

  // CRIAR um novo produto
  async create(request, response) {
    const { name, description, price, status } = request.body;
    console.log('[ProductController] Recebida requisição para criar produto:', request.body);

    try {
      const [id] = await connection('products').insert({
        name,
        description,
        price,
        status
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
    const { name, description, price, status } = request.body;
    console.log(`[ProductController] Recebida requisição para atualizar produto ID ${id} com dados:`, request.body);

    const updated_rows = await connection('products').where('id', id).update({
      name,
      description,
      price,
      status
    });

    if (updated_rows === 0) {
      console.log(`[ProductController] Tentativa de atualizar produto ID ${id}, mas não foi encontrado.`);
      return response.status(404).json({ error: 'Product not found.' });
    }

    console.log(`[ProductController] Produto ID ${id} atualizado com sucesso.`);
    return response.json({ message: 'Product updated successfully.' });
  },

  // APAGAR um produto
  async destroy(request, response) {
    const { id } = request.params;
    console.log(`[ProductController] Recebida requisição para apagar produto ID: ${id}`);
    
    const deleted_rows = await connection('products').where('id', id).delete();

    if (deleted_rows === 0) {
      console.log(`[ProductController] Tentativa de apagar produto ID ${id}, mas não foi encontrado.`);
      return response.status(404).json({ error: 'Product not found.' });
    }

    console.log(`[ProductController] Produto ID ${id} apagado com sucesso.`);
    // 204 = No Content, resposta padrão para delete bem-sucedido
    return response.status(204).send();
  }
};