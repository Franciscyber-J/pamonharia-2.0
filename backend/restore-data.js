// backend/restore-data.js
require('dotenv').config({ path: require('path').resolve(__dirname, './.env') });
const knex = require('knex');
const configuration = require('./knexfile');
const fs = require('fs');
const path = require('path');

// IMPORTANTE: Este script usa a base de dados de DESENVOLVIMENTO.
// Ele foi desenhado para popular a sua base de dados local para testes.
const db = knex(configuration.development);

async function restoreData() {
    console.log('--- INICIANDO RESTAURAÇÃO DE DADOS DO CARDÁPIO ---');
    
    try {
        const backupFilePath = path.resolve(__dirname, './src/database/cardapio_backup.json');
        if (!fs.existsSync(backupFilePath)) {
            throw new Error(`Ficheiro de backup não encontrado em: ${backupFilePath}`);
        }

        console.log('[1/4] Lendo o ficheiro de backup...');
        const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf-8'));
        const { products, combos } = backupData;

        if (!products || !combos) {
            throw new Error('Ficheiro de backup inválido ou incompleto.');
        }

        // Limpa as tabelas na ordem correta para evitar erros de chave estrangeira
        console.log('[2/4] Limpando tabelas existentes (combo_products, combos, products)...');
        await db('combo_products').del();
        await db('combos').del();
        await db('products').del();

        console.log('[3/4] Inserindo produtos e complementos...');
        // O knex em modo batch é a forma mais eficiente de inserir múltiplos registos.
        await db.batchInsert('products', products, 100);

        console.log('[4/4] Inserindo combos e as suas relações com produtos...');
        // Temos de inserir os combos primeiro para obter os seus IDs
        const comboInsertData = combos.map(({ id, name, description, price, image_url, status, total_items_limit, allow_free_choice, display_order }) => ({
            id, name, description, price, image_url, status, total_items_limit, allow_free_choice, display_order
        }));
        await db.batchInsert('combos', comboInsertData, 100);
        
        // Agora, construímos a lista de relações 'combo_products'
        const comboProductsToInsert = [];
        combos.forEach(combo => {
            if (combo.products && combo.products.length > 0) {
                combo.products.forEach(productInCombo => {
                    comboProductsToInsert.push({
                        combo_id: combo.id,
                        product_id: productInCombo.product_id,
                        quantity_in_combo: productInCombo.quantity_in_combo,
                        price_modifier: productInCombo.price_modifier
                    });
                });
            }
        });
        
        if (comboProductsToInsert.length > 0) {
            await db.batchInsert('combo_products', comboProductsToInsert, 100);
        }

        // Atualiza as sequências de ID para evitar conflitos ao criar novos itens no dashboard
        console.log('Ajustando as sequências de ID da base de dados...');
        await db.raw("SELECT setval(pg_get_serial_sequence('products', 'id'), coalesce(max(id), 1)) FROM products;");
        await db.raw("SELECT setval(pg_get_serial_sequence('combos', 'id'), coalesce(max(id), 1)) FROM combos;");

        console.log('--- ✅ RESTAURAÇÃO CONCLUÍDA COM SUCESSO! ---');
        console.log('A sua base de dados de desenvolvimento agora contém os dados de produção.');

    } catch (error) {
        console.error('--- ❌ ERRO DURANTE A RESTAURAÇÃO ---', error);
    } finally {
        await db.destroy();
        console.log('Conexão com a base de dados encerrada.');
    }
}

restoreData();