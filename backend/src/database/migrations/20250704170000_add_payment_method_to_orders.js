// backend/src/database/migrations/20250704170000_add_payment_method_to_orders.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('orders', (table) => {
    // Adiciona a coluna para armazenar o método de pagamento escolhido pelo cliente.
    // Ex: 'online' ou 'on_delivery'.
    table.string('payment_method').notNullable().defaultTo('on_delivery');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('orders', (table) => {
    table.dropColumn('payment_method');
  });
};
