// backend/src/database/migrations/YYYYMMDDHHMMSS_add_handover_notification_toggle.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('store_settings', (table) => {
    // Adiciona a coluna que controlará se as notificações de atendimento estão ativas.
    // O padrão 'true' garante que a funcionalidade esteja ligada por defeito.
    table.boolean('handover_notifications_enabled').notNullable().defaultTo(true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('store_settings', (table) => {
    table.dropColumn('handover_notifications_enabled');
  });
};