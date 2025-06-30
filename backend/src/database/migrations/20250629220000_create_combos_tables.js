// backend/src/database/migrations/20250629220000_create_combos_tables.js
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // --- VERSÃO SEGURA (IDEMPOTENTE) ---
  // 1. Verifica se a tabela 'combos' JÁ EXISTE antes de tentar criá-la.
  const combosExists = await knex.schema.hasTable('combos');
  if (!combosExists) {
    console.log("Criando tabela 'combos'...");
    await knex.schema.createTable('combos', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.text('description').nullable();
      table.decimal('price', 10, 2).notNullable();
      table.string('image_url').nullable();
      table.boolean('status').defaultTo(true).notNullable();
      table.timestamps(true, true);
    });
  }

  // 2. Verifica se a tabela 'combo_products' JÁ EXISTE.
  const comboProductsExists = await knex.schema.hasTable('combo_products');
  if (!comboProductsExists) {
    console.log("Criando tabela 'combo_products'...");
    await knex.schema.createTable('combo_products', (table) => {
      table.increments('id').primary();
      table.integer('combo_id').unsigned().notNullable().references('id').inTable('combos').onDelete('CASCADE');
      table.integer('product_id').unsigned().notNullable().references('id').inTable('products').onDelete('CASCADE');
      table.integer('quantity_in_combo').defaultTo(1).notNullable();
      table.unique(['combo_id', 'product_id']);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // Desfaz na ordem inversa, verificando se as tabelas existem.
  await knex.schema.dropTableIfExists('combo_products');
  await knex.schema.dropTableIfExists('combos');
};
