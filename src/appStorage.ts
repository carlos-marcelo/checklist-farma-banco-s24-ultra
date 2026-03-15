import localforage from 'localforage';

// Configura o banco de dados IndexedDB para o Estado Global do App
const appStore = localforage.createInstance({
    name: 'ChecklistFarma',
    storeName: 'app_state',
    description: 'Cache global para rápida hidratação da interface'
});

export const AppStorage = {
    /**
     * Salva uma fatia do estado no cache
     */
    async saveState<T>(key: string, data: T): Promise<void> {
        try {
            await appStore.setItem(key, data);
        } catch (e) {
            console.error(`[AppStorage] Erro ao salvar ${key}:`, e);
        }
    },

    /**
     * Carrega uma fatia do estado do cache
     */
    async loadState<T>(key: string): Promise<T | null> {
        try {
            return await appStore.getItem<T>(key);
        } catch (e) {
            console.log(`[AppStorage] ${key} não encontrado no cache`);
            return null;
        }
    },

    /**
     * Limpa todo o cache do app
     */
    async clearAll(): Promise<void> {
        await appStore.clear();
    }
};
