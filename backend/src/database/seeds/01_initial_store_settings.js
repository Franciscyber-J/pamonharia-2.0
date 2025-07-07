// backend/src/database/seeds/01_initial_store_settings.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // #################### INÍCIO DA CORREÇÃO ####################
  // Verifica primeiro se já existe alguma configuração na tabela.
  const settingsExist = await knex('store_settings').first();

  // Se não existir nenhuma configuração, então executa o código de inserção inicial.
  if (!settingsExist) {
    console.log("ℹ️ Seed: Nenhuma configuração de loja encontrada. A popular com os dados padrão...");
    
    // Deleta TODAS as entradas existentes para garantir um estado limpo.
    await knex('store_settings').del();

    // Insere a nossa única linha de configurações padrão.
    await knex('store_settings').insert([
      {
        id: 1,
        store_name: 'Pamonharia Sabor do Goiás',
        delivery_fee: 14.00,
        is_open_manual_override: null, // Começa seguindo o horário
        operating_hours: JSON.stringify({
          segunda: { open: '11:00', close: '21:30', enabled: true },
          terca:   { open: '11:00', close: '21:30', enabled: true },
          quarta:  { open: '11:00', close: '21:30', enabled: true },
          quinta:  { open: '11:00', close: '21:30', enabled: true },
          sexta:   { open: '11:00', close: '21:30', enabled: true },
          sabado:  { open: '00:00', close: '00:00', enabled: false },
          domingo: { open: '00:00', close: '00:00', enabled: false }
        }),
        address: 'Rua Tulipas, Quadra 01, Lote 06, C-02, Jardim Mondale',
        location_link: 'https://maps.app.goo.gl/eseCGMFiB857R4BP9',
        notification_sound_url: null, // Sem som padrão
      }
    ]);
    console.log("✅ Seed: Configurações padrão da loja criadas com sucesso.");
  } else {
    console.log("ℹ️ Seed: Configurações da loja já existem. Nenhuma ação foi tomada.");
  }
  // ##################### FIM DA CORREÇÃO ######################
};