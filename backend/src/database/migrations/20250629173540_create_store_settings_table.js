/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('store_settings', (table) => {
    table.increments('id').primary();

    table.string('store_name').notNullable();
    table.decimal('delivery_fee', 10, 2).defaultTo(0);

    // true = Forçar Aberta, false = Forçar Fechada, null = Seguir Horário
    table.boolean('is_open_manual_override').nullable().defaultTo(null);

    // Campo JSONB para guardar um objeto com os horários de cada dia
    table.jsonb('operating_hours'); 

    table.text('address');
    table.string('location_link');
    table.string('notification_sound_url');

    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('store_settings');
};