// backend/src/database/migrations/YYYYMMDDHHMMSS_add_whatsapp_number_to_settings.js
exports.up = function(knex) {
  return knex.schema.table('store_settings', (table) => {
    table.string('whatsapp_number').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.table('store_settings', (table) => {
    table.dropColumn('whatsapp_number');
  });
};