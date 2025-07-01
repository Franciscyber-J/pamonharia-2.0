// backend/src/database/migrations/20250701100000_add_price_modifier_to_combo_products.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('combo_products', (table) => {
    // Armazena o valor a ser somado (ou subtraído) do preço do item DENTRO do combo.
    // O padrão 0.00 significa que não há alteração de preço.
    table.decimal('price_modifier', 10, 2).notNullable().defaultTo(0.00);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('combo_products', (table) => {
    table.dropColumn('price_modifier');
  });
};