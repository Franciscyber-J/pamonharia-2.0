// backend/src/database/migrations/20250701120000_add_display_order.js
exports.up = function(knex) {
  return knex.schema.table('products', (table) => {
    table.integer('display_order').defaultTo(0);
  }).then(() => {
    return knex.schema.table('combos', (table) => {
      table.integer('display_order').defaultTo(0);
    });
  });
};

exports.down = function(knex) {
  return knex.schema.table('products', (table) => {
    table.dropColumn('display_order');
  }).then(() => {
    return knex.schema.table('combos', (table) => {
      table.dropColumn('display_order');
    });
  });
};