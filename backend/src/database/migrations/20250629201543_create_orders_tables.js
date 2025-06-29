/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  // Cria a tabela principal de pedidos (orders)
  return knex.schema.createTable('orders', (table) => {
    table.increments('id').primary();
    table.string('client_name').notNullable();
    table.string('client_phone').notNullable();
    table.text('client_address').notNullable();
    table.decimal('total_price', 10, 2).notNullable();

    // O status do pedido (Ex: 'Novo', 'Em Preparo', etc.)
    table.string('status').notNullable().defaultTo('Novo');

    table.timestamps(true, true);
  })
  // Depois, cria a tabela de itens do pedido (order_items)
  .then(() => {
    return knex.schema.createTable('order_items', (table) => {
      table.increments('id').primary();
      table.integer('quantity').notNullable();

      // Preço do produto NO MOMENTO DA COMPRA. Crucial para histórico.
      table.decimal('unit_price', 10, 2).notNullable(); 

      // Chave estrangeira para ligar este item a um pedido
      table.integer('order_id')
        .notNullable()
        .references('id')
        .inTable('orders')
        .onDelete('CASCADE'); // Se um pedido for apagado, seus itens também são.

      // Chave estrangeira para ligar ao produto
      table.integer('product_id')
        .nullable() // Pode ser nulo se o produto for apagado
        .references('id')
        .inTable('products')
        .onDelete('SET NULL'); // Se um produto for apagado, a referência aqui fica nula.
    });
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  // Para reverter, apagamos na ordem inversa da criação
  return knex.schema.dropTable('order_items').then(() => {
    return knex.schema.dropTable('orders');
  });
};