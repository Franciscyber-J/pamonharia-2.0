/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Deleta TODAS as entradas existentes para garantir que teremos apenas uma.
  await knex('store_settings').del();

  // Insere a nossa única linha de configurações padrão.
  await knex('store_settings').insert([
    {
      id: 1,
      store_name: 'Pamonharia Sabor do Goiás',
      delivery_fee: 5.00,
      is_open_manual_override: null, // Começa seguindo o horário
      operating_hours: JSON.stringify({
        segunda: { open: '11:00', close: '22:00', enabled: true },
        terca:   { open: '11:00', close: '22:00', enabled: true },
        quarta:  { open: '11:00', close: '22:00', enabled: true },
        quinta:  { open: '11:00', close: '22:00', enabled: true },
        sexta:   { open: '11:00', close: '23:00', enabled: true },
        sabado:  { open: '11:00', close: '23:00', enabled: true },
        domingo: { open: '11:00', close: '18:00', enabled: false }
      }),
      address: 'Rua Tulipas, Quadra 01, Lote 06, C-02, Jardim Mondale',
      location_link: 'https://maps.app.goo.gl/eseCGMFiB857R4BP9',
      notification_sound_url: null, // Sem som padrão
    }
  ]);
};