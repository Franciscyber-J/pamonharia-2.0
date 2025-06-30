// backend/src/database/migrations/20250630140000_add_is_main_product_flag.js

exports.up = async function(knex) {
  const exists = await knex.schema.hasColumn('products', 'is_main_product');
  if (!exists) {
    console.log("Adicionando coluna 'is_main_product'...");
    await knex.schema.table('products', (table) => {
      table.boolean('is_main_product').notNullable().defaultTo(true);
    });
  }
};

exports.down = async function(knex) {
  const exists = await knex.schema.hasColumn('products', 'is_main_product');
  if (exists) {
    await knex.schema.table('products', (table) => {
      table.dropColumn('is_main_product');
    });
  }
};
