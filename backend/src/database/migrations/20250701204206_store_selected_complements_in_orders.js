// backend/src/database/migrations/YYYYMMDDHHMMSS_store_selected_complements_in_orders.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('order_items', (table) => {
    // Adiciona uma coluna do tipo JSONB para armazenar os detalhes
    // dos complementos selecionados (um array de objetos).
    // É ideal para dados estruturados, mas flexíveis.
    table.jsonb('item_details').nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('order_items', (table) => {
    table.dropColumn('item_details');
  });
};