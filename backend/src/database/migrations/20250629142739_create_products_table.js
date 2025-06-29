/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('products', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.text('description'); // 'text' para descrições mais longas

    // Usamos 'decimal' para dinheiro para evitar problemas de arredondamento
    table.decimal('price', 10, 2).notNullable(); 

    table.string('image_url'); // Onde guardaremos o link da imagem do Cloudinary
    table.boolean('status').notNullable().defaultTo(true); // true = Ativo, false = Inativo

    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('products');
};