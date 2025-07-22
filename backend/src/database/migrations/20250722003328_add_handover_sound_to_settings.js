// backend/src/database/migrations/YYYYMMDDHHMMSS_add_handover_sound_to_settings.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('store_settings', (table) => {
    // URL do som para a notificação de atendimento humano (handover)
    table.string('handover_sound_url').nullable();
    // Nome original do ficheiro de som do handover para exibição no dashboard
    table.string('handover_sound_filename').nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('store_settings', (table) => {
    table.dropColumn('handover_sound_url');
    table.dropColumn('handover_sound_filename');
  });
};