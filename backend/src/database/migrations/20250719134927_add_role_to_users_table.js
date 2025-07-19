// backend/src/database/migrations/YYYYMMDDHHMMSS_add_role_to_users_table.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('users', (table) => {
    // Adiciona a coluna 'role' para definir a permissão do utilizador.
    // 'admin' tem acesso total. 'operador' tem acesso restrito.
    table.string('role').notNullable().defaultTo('operador');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('users', (table) => {
    table.dropColumn('role');
  });
};