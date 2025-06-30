// backend/src/database/migrations/20250629210000_add_stock_and_complements_to_products.js
exports.up = async function(knex) {
  const columns = await knex('information_schema.columns')
    .select('column_name')
    .where('table_name', 'products');

  const has = (col) => columns.some(c => c.column_name === col);

  await knex.schema.table('products', (table) => {
    if (!has('stock_enabled')) {
      console.log("Adicionando coluna 'stock_enabled'...");
      table.boolean('stock_enabled').defaultTo(false).notNullable();
    }
    if (!has('stock_quantity')) {
      console.log("Adicionando coluna 'stock_quantity'...");
      table.integer('stock_quantity').nullable();
    }
    if (!has('parent_product_id')) {
      console.log("Adicionando coluna 'parent_product_id'...");
      table.integer('parent_product_id').unsigned().references('id').inTable('products').onDelete('SET NULL').nullable();
    }
    if (!has('stock_sync_enabled')) {
      console.log("Adicionando coluna 'stock_sync_enabled'...");
      table.boolean('stock_sync_enabled').defaultTo(false).notNullable();
    }
    if (!has('force_addons')) {
      console.log("Adicionando coluna 'force_addons'...");
      table.boolean('force_addons').defaultTo(false).notNullable();
    }
  });
};

exports.down = async function(knex) {
  const columns = await knex('information_schema.columns')
    .select('column_name')
    .where('table_name', 'products');

  const has = (col) => columns.some(c => c.column_name === col);

  await knex.schema.table('products', (table) => {
    if (has('force_addons')) table.dropColumn('force_addons');
    if (has('stock_sync_enabled')) table.dropColumn('stock_sync_enabled');
    if (has('parent_product_id')) table.dropColumn('parent_product_id');
    if (has('stock_quantity')) table.dropColumn('stock_quantity');
    if (has('stock_enabled')) table.dropColumn('stock_enabled');
  });
};
