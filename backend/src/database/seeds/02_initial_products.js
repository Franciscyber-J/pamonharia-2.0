// backend/src/database/seeds/02_initial_products.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Verifica se a tabela de produtos já tem algum item para evitar duplicatas.
  const productsExist = await knex('products').first();
  if (productsExist) {
    console.log('ℹ️ Seed: A tabela de produtos já contém dados. Nenhuma ação foi tomada.');
    return;
  }

  console.log('ℹ️ Seed: Populando a tabela de produtos com o catálogo inicial...');

  // Insere os produtos principais
  await knex('products').insert([
    {
      id: 1,
      name: 'Curau Gelado',
      description: 'Creme de milho verde doce, servido gelado.',
      price: 12.00,
      image_url: null,
      status: true,
      stock_enabled: true,
      stock_quantity: 50,
      is_main_product: true,
      display_order: 0,
      sell_parent_product: true
    },
    {
      id: 2,
      name: 'Curau Quente',
      description: 'Creme de milho verde doce, servido quentinho com canela.',
      price: 12.00,
      image_url: null,
      status: true,
      stock_enabled: true,
      stock_quantity: 50,
      is_main_product: true,
      display_order: 1,
      sell_parent_product: false
    },
    {
      id: 3,
      name: 'Pamonha Tradicional',
      description: 'Pura pamonha de milho verde, cozida na palha.',
      price: 15.00,
      image_url: null,
      status: true,
      stock_enabled: true,
      stock_quantity: 30,
      is_main_product: true,
      display_order: 2,
      sell_parent_product: true
    },
    // --- Itens de Complemento ---
    {
      id: 4,
      name: 'Com Canela',
      description: '',
      price: 0.00,
      status: true,
      stock_enabled: false,
      is_main_product: false,
      display_order: 3,
      parent_product_id: 2
    },
    {
      id: 5,
      name: 'Sem Canela',
      description: '',
      price: 0.00,
      status: true,
      stock_enabled: false,
      is_main_product: false,
      display_order: 4,
      parent_product_id: 2
    }
  ]);

  console.log('✅ Seed: Produtos e complementos iniciais criados com sucesso.');

  // #################### INÍCIO DA CORREÇÃO ####################
  // ATUALIZA O CONTADOR DE ID DA TABELA PARA O VALOR MÁXIMO EXISTENTE
  // Isto é crucial para evitar erros de "chave duplicada" ao criar novos produtos.
  console.log('ℹ️ Seed: Atualizando a sequência de IDs da tabela de produtos...');
  await knex.raw("SELECT setval(pg_get_serial_sequence('products', 'id'), max(id)) FROM products;");
  console.log('✅ Seed: Sequência de IDs atualizada.');
  // ##################### FIM DA CORREÇÃO ######################
};
