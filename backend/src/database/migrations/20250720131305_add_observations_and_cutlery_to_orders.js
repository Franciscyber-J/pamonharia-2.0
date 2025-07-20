// backend/src/database/migrations/YYYYMMDDHHMMSS_add_observations_and_cutlery_to_orders.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('orders', (table) => {
    // Campo de texto para observações do cliente (sem limite prático de caracteres).
    table.text('observations').nullable();
    // Campo booleano para indicar a necessidade de talheres.
    table.boolean('needs_cutlery').notNullable().defaultTo(false);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('orders', (table) => {
    table.dropColumn('observations');
    table.dropColumn('needs_cutlery');
  });
};