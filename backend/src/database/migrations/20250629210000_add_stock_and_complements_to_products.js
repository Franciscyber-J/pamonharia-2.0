/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('products', (table) => {
    // 1. Colunas para o controle de estoque do produto
    table.boolean('stock_enabled').defaultTo(false).notNullable();
    table.integer('stock_quantity').nullable();

    // 2. Colunas para a relação Pai/Filho (Complementos)
    // Esta coluna indica qual é o "produto pai" de um complemento.
    // Se for nulo, o produto é um pai ou um item normal.
    table.integer('parent_product_id').unsigned().references('id').inTable('products').onDelete('SET NULL').nullable();
    
    // 3. Colunas de controle para as regras de negócio dos complementos
    // Define se o estoque do filho deve seguir o do pai.
    table.boolean('stock_sync_enabled').defaultTo(false).notNullable();
    // Define se o cliente será obrigado a escolher um complemento no cardápio.
    table.boolean('force_addons').defaultTo(false).notNullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  // O processo 'down' reverte as alterações na ordem inversa.
  return knex.schema.table('products', (table) => {
    table.dropColumn('stock_enabled');
    table.dropColumn('stock_quantity');
    table.dropColumn('parent_product_id');
    table.dropColumn('stock_sync_enabled');
    table.dropColumn('force_addons');
  });
};
