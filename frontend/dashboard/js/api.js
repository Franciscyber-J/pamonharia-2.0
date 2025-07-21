// frontend/dashboard/js/api.js

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
export const API_BASE_URL_GLOBAL = IS_LOCAL ? 'http://localhost:10000' : 'https://pamonhariasaborosa.expertbr.com';

export async function globalApiFetch(endpoint, options = {}) {
    const currentToken = sessionStorage.getItem('authToken');
    if (!currentToken) {
        window.location.href = '/dashboard/login.html';
        return;
    }
    options.headers = { ...options.headers, 'Authorization': `Bearer ${currentToken}`, 'Content-Type': 'application/json' };

    try {
        const response = await fetch(`${API_BASE_URL_GLOBAL}/api${endpoint}`, options);

        if (response.status === 401) {
            sessionStorage.removeItem('authToken');
            sessionStorage.removeItem('userRole');
            window.location.href = '/dashboard/login.html';
            throw new Error('Token inválido ou expirado.');
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return response.status === 204 ? null : response.json();
        }
        return response.text();

    } catch (error) {
        console.error(`Falha na chamada da API para ${endpoint}:`, error);
        alert(`Erro de comunicação com o servidor: ${error.message}`);
        throw error;
    }
}