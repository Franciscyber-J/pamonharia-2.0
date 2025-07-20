import { state } from './main.js';

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE_URL = IS_LOCAL ? 'http://localhost:10000' : 'https://pamonhariasaborosa.expertbr.com';

/**
 * Função centralizada para fazer requisições à API.
 * @param {string} endpoint - O endpoint da API (ex: '/public/products').
 * @param {object} options - Opções para a função fetch.
 * @returns {Promise<any>} - A resposta da API em JSON ou texto.
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
        
        // #################### INÍCIO DA CORREÇÃO ####################
        // ARQUITETO: Verifica o Content-Type. Se for JSON, faz o parse. Senão, retorna o texto.
        // Isso resolve o erro no endpoint /health que retorna "OK" como texto.
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return responseBodyText ? JSON.parse(responseBodyText) : null;
        } else {
            return responseBodyText;
        }
        // ##################### FIM DA CORREÇÃO ######################

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

    combosResponse.forEach(c => {
        if (c.products) {
            c.products = c.products.map(comboProduct => {
                const fullProductDetails = state.allProductsFlat.find(i => i.id === comboProduct.id);
                return { ...fullProductDetails, ...comboProduct };
            });
        }
    });

    state.allItems = [...combosResponse.map(c => ({...c, is_combo: true})), ...productsResponse];
}