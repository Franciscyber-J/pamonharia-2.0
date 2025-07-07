import { state } from './main.js';

const API_BASE_URL = 'https://pamonhariasaborosa.expertbr.com';

/**
 * Função centralizada para fazer requisições à API.
 * @param {string} endpoint - O endpoint da API (ex: '/public/products').
 * @param {object} options - Opções para a função fetch.
 * @returns {Promise<any>} - A resposta da API em JSON.
 */
export async function apiFetch(endpoint, options = {}) {
    try {
        options.headers = { ...options.headers, 'Content-Type': 'application/json' };
        const response = await fetch(`${API_BASE_URL}/api${endpoint}`, options);
        
        const responseBodyText = await response.text();

        if (!response.ok) {
            let errorJson = {};
            try {
                errorJson = JSON.parse(responseBodyText);
            } catch (e) {
                throw new Error(responseBodyText || `HTTP error! status: ${response.status}`);
            }
            throw new Error(errorJson.error || `HTTP error! status: ${response.status}`);
        }

        return responseBodyText ? JSON.parse(responseBodyText) : null;
    } catch (error) {
        console.error(`Erro de API para ${endpoint}:`, error);
        throw error;
    }
}

/**
 * Busca todos os dados iniciais necessários para a aplicação.
 */
export async function fetchAndRenderAllData() {
    const [productsResponse, combosResponse, settingsResponse] = await Promise.all([
        apiFetch('/public/products'),
        apiFetch('/public/combos'),
        apiFetch('/public/settings')
    ]);

    state.storeSettings = settingsResponse;
    
    // Reseta e mapeia os produtos
    state.allProductsFlat = [];
    state.productParentMap = {};
    const recursiveFlattenAndMap = (products, parent = null) => {
        if (!products) return;
        products.forEach(p => {
            state.allProductsFlat.push(p);
            if (parent) state.productParentMap[p.id] = parent.id;
            if (p.children && p.children.length > 0) recursiveFlattenAndMap(p.children, p);
        });
    };
    recursiveFlattenAndMap(productsResponse);

    // #################### INÍCIO DA CORREÇÃO ####################
    // Processa os combos, mesclando os dados dos produtos para preservar o price_modifier.
    combosResponse.forEach(c => {
        if (c.products) {
            c.products = c.products.map(comboProduct => {
                const fullProductDetails = state.allProductsFlat.find(i => i.id === comboProduct.id);
                // Mescla os detalhes completos do produto com os detalhes específicos do combo
                // (como price_modifier), garantindo que os dados do combo tenham prioridade.
                return { ...fullProductDetails, ...comboProduct };
            });
        }
    });
    // ##################### FIM DA CORREÇÃO ######################

    state.allItems = [...combosResponse.map(c => ({...c, is_combo: true})), ...productsResponse];
}
