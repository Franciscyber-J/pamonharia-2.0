// backend/src/database/migrations/20250701150000_add_sell_parent_product_flag.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  // Adiciona a nova coluna à tabela 'products'
  return knex.schema.table('products', (table) => {
    // Esta coluna controla se o produto "pai" é vendido com seu próprio preço (true)
    // ou se ele é apenas um agrupador para os complementos (false).
    table.boolean('sell_parent_product').notNullable().defaultTo(true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  // Remove a coluna em caso de rollback
  return knex.schema.table('products', (table) => {
    table.dropColumn('sell_parent_product');
  });
};
