// backend/backup-data.js
require('dotenv').config({ path: require('path').resolve(__dirname, './.env') });
const knex = require('knex');
const configuration = require('./knexfile');
const fs = require('fs');
const path = require('path');

// ARQUITETO: Corrigido para usar a configuração de 'production' explicitamente.
// Isto garante que estamos a usar a DATABASE_URL e as configurações de SSL corretas
// para aceder à base de dados de produção de forma segura.
const db = knex(configuration.production);

async function backupData() {
    console.log('--- INICIANDO BACKUP DE DADOS DO CARDÁPIO (PRODUÇÃO) ---');
    try {
        console.log('[1/3] Buscando todos os produtos e complementos...');
        const allProducts = await db('products').select('*').orderBy('id', 'asc');

        console.log('[2/3] Buscando todos os combos...');
        const allCombos = await db('combos').select('*').orderBy('id', 'asc');
        const comboProducts = await db('combo_products').select('*');

        const productMap = new Map(allProducts.map(p => [p.id, p]));

        allCombos.forEach(combo => {
            combo.products = comboProducts
                .filter(cp => cp.combo_id === combo.id)
                .map(cp => {
                    const product = productMap.get(cp.product_id);
                    return {
                        product_id: cp.product_id,
                        quantity_in_combo: cp.quantity_in_combo,
                        price_modifier: cp.price_modifier,
                        name: product ? product.name : 'Produto não encontrado'
                    };
                });
        });

        const backupData = {
            products: allProducts,
            combos: allCombos,
        };

        const backupFilePath = path.resolve(__dirname, './src/database/cardapio_backup.json');
        
        console.log(`[3/3] Escrevendo dados no ficheiro: ${backupFilePath}`);
        fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));

        console.log('--- ✅ BACKUP CONCLUÍDO COM SUCESSO! ---');
        console.log('O ficheiro "cardapio_backup.json" foi criado e contém o estado atual do seu cardápio de produção.');

    } catch (error) {
        console.error('--- ❌ ERRO DURANTE O BACKUP ---', error);
    } finally {
        await db.destroy();
        console.log('Conexão com a base de dados encerrada.');
    }
}

backupData();