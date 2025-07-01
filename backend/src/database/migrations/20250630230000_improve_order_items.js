// backend/src/database/migrations/20250630230000_improve_order_items.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('order_items', (table) => {
    // Adiciona uma coluna para guardar o nome do item no momento da venda.
    table.string('item_name').notNullable().defaultTo('Item');
    
    // Adiciona uma referência opcional à tabela de combos.
    table.integer('combo_id').unsigned().references('id').inTable('combos').onDelete('SET NULL');
    
    // Altera a coluna product_id para permitir valores nulos,
    // já que um item de pedido pode ser um combo em vez de um produto.
    table.integer('product_id').nullable().alter();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('order_items', (table) => {
    table.dropColumn('item_name');
    table.dropColumn('combo_id');
    // Reverte a alteração, tornando product_id obrigatório novamente.
    table.integer('product_id').notNullable().alter();
  });
};