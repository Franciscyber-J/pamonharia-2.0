// backend/src/database/migrations/20250701160000_add_one_to_one_complement_rule.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('products', (table) => {
    // Este campo força o cliente a escolher uma quantidade de complementos
    // exatamente igual à quantidade do produto pai.
    // Ex: 2 curaus -> obriga a escolher 2 complementos (ex: 1 com canela, 1 sem canela).
    table.boolean('force_one_to_one_complement').notNullable().defaultTo(false);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('products', (table) => {
    table.dropColumn('force_one_to_one_complement');
  });
};
