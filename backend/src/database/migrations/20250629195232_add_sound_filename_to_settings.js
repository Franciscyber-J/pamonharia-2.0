/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('store_settings', (table) => {
    // Adiciona a nova coluna que pode ser nula
    table.string('notification_sound_filename').nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('store_settings', (table) => {
    // Remove a coluna caso precisemos de reverter a migration
    table.dropColumn('notification_sound_filename');
  });
};