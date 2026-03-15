import localforage from 'localforage';
import type { DbStockConferenceSession } from '../../supabaseService';

// Configura o banco de dados IndexedDB para o Módulo de Estoque
const stockStore = localforage.createInstance({
    name: 'ChecklistFarma',
    storeName: 'stock_sessions',
    description: 'Persistência de alta performance para sessões de conferência de estoque'
});

const LOCAL_STOCK_SESSION_PREFIX = 'STOCK_SESSION_';
const buildLocalSessionKey = (email: string) => `${LOCAL_STOCK_SESSION_PREFIX}${email}`;
const STOCK_STORAGE_DEBUG = import.meta.env.DEV && Boolean((globalThis as any).__STOCK_DEBUG);
const stockStorageDebugLog = (...args: any[]) => {
    if (STOCK_STORAGE_DEBUG) console.log(...args);
};

/**
 * Carrega a sessão de estoque do IndexedDB (Padrão localforage - Assíncrono)
 */
export async function loadLocalStockSession(email: string): Promise<DbStockConferenceSession | null> {
    if (!email) return null;
    try {
        const data = await stockStore.getItem<DbStockConferenceSession>(buildLocalSessionKey(email));
        return data;
    } catch (error) {
        console.error('Erro ao carregar sessão do IndexedDB (Stock):', error);
        return null;
    }
}

/**
 * Salva a sessão de estoque no IndexedDB (Suporta objetos gigantes)
 */
export async function saveLocalStockSession(email: string, session: DbStockConferenceSession): Promise<void> {
    if (!email) return;
    try {
        const key = buildLocalSessionKey(email);

        // Limpar sessões legadas do localStorage para migrar espaço
        try {
            window.localStorage.removeItem(key);
        } catch (e) { }

        await stockStore.setItem(key, session);
        stockStorageDebugLog(`[StockStorage] Sessão salva em IndexedDB para ${email}`);
    } catch (error) {
        console.error('Erro ao salvar sessão no IndexedDB (Stock):', error);
    }
}

/**
 * Limpa a sessão de estoque local
 */
export async function clearLocalStockSession(email: string): Promise<void> {
    if (!email) return;
    try {
        await stockStore.removeItem(buildLocalSessionKey(email));
    } catch (error) {
        console.error('Erro ao limpar sessão no IndexedDB (Stock):', error);
    }
}

/**
 * Utilitário para limpar chaves legadas do localStorage que podem estar ocupando espaço
 */
export function cleanupLegacyStockStorage() {
    if (typeof window === 'undefined') return;
    try {
        const keys = Object.keys(window.localStorage);
        keys.forEach(key => {
            if (key.startsWith(LOCAL_STOCK_SESSION_PREFIX)) {
                window.localStorage.removeItem(key);
                stockStorageDebugLog(`[Cleanup] Removida chave legada: ${key}`);
            }
        });
    } catch (e) {
        console.error('Erro no cleanup de localStorage:', e);
    }
}
