// backend/src/database/migrations/YYYYMMDDHHMMSS_add_payment_fields_to_orders.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('orders', (table) => {
    // ID da preferência de pagamento gerada no Mercado Pago.
    table.string('preference_id').nullable();
    
    // ID do pagamento efetivo no Mercado Pago, recebido via webhook.
    table.string('payment_id').nullable();
    
    // Status do pagamento recebido do Mercado Pago (ex: 'pending', 'approved', 'rejected').
    table.string('payment_status').nullable();
    
    // URL para onde o cliente é redirecionado para pagar.
    table.text('checkout_url').nullable(); 
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('orders', (table) => {
    table.dropColumn('preference_id');
    table.dropColumn('payment_id');
    table.dropColumn('payment_status');
    table.dropColumn('checkout_url');
  });
};
