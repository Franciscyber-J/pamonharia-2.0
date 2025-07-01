// backend/src/database/migrations/20250701110000_add_combo_rules.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('combos', (table) => {
    // Define o número total de itens que o cliente DEVE escolher.
    // Ex: Em um "Combo 10 Pamonhas", este valor será 10.
    table.integer('total_items_limit').notNullable().defaultTo(1);

    // Define se o cliente tem liberdade para escolher as quantidades (até o limite)
    // ou se as quantidades são fixas e definidas pelo admin.
    table.boolean('allow_free_choice').notNullable().defaultTo(true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('combos', (table) => {
    table.dropColumn('total_items_limit');
    table.dropColumn('allow_free_choice');
  });
};