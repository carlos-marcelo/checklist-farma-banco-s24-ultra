import localforage from 'localforage';

/**
 * Serviço de Cache centralizado para o aplicativo ChecklistFarma.
 * Utiliza o padrão "Cache-First with Background Sync".
 */

// Configuração do banco de dados para dados gerais e relatórios
const generalStore = localforage.createInstance({
    name: 'ChecklistFarma',
    storeName: 'general_cache',
    description: 'Cache para relatórios, históricos e sessões'
});

export const CacheService = {
    /**
     * Wrapper para chamadas de rede com cache local.
     * 1. Retorna o cache imediatamente se disponível.
     * 2. Executa a chamada remota em paralelo.
     * 3. Se a chamada remota trouxer novos dados (ou se não houver cache), atualiza o cache e notifica via callback (opcional).
     * 
     * @param key Chave única para o cache
     * @param remoteFetch Função que busca os dados do servidor
     * @param onUpdate Callback executado quando os dados remotos chegam (se diferentes do cache)
     */
    async fetchWithCache<T>(
        key: string,
        remoteFetch: () => Promise<T | null>,
        onUpdate?: (newData: T) => void
    ): Promise<T | null> {
        // Tenta carregar do cache primeiro
        const cachedData = await this.get<T>(key);

        // Dispara a busca remota em paralelo
        const remotePromise = remoteFetch().then(async (remoteData) => {
            if (remoteData !== null) {
                // Otimização de Performance: Evitar JSON.stringify em objetos gigantes se possível.
                // Se o objeto tem updated_at ou IDs que podemos comparar rapidamente, usamos isso.
                let hasChanged = true;

                if (cachedData) {
                    const c = cachedData as any;
                    const r = remoteData as any;

                    // 1. Comparação por updated_at (padrão Supabase)
                    if (r.updated_at && c.updated_at) {
                        hasChanged = r.updated_at !== c.updated_at;
                    }
                    // 2. Comparação por length se for array
                    else if (Array.isArray(r) && Array.isArray(c)) {
                        if (r.length !== c.length) {
                            hasChanged = true;
                        } else if (r.length > 0 && r[0].updated_at && c[0].updated_at) {
                            hasChanged = r[0].updated_at !== c[0].updated_at;
                        } else {
                            // Fallback seguro mas pesado para arrays sem metadados claros
                            hasChanged = JSON.stringify(c) !== JSON.stringify(r);
                        }
                    }
                    // 3. Fallback para objetos pequenos ou sem metadados
                    else {
                        hasChanged = JSON.stringify(cachedData) !== JSON.stringify(remoteData);
                    }
                }

                await this.set(key, remoteData);

                if (hasChanged && onUpdate) {
                    onUpdate(remoteData);
                }
                return remoteData;
            }
            return cachedData; // Se falhar o remoto, retorna o cache
        }).catch(err => {
            console.error(`[CacheService] Erro na busca remota para ${key}:`, err);
            return cachedData;
        });

        // Se tem cache, retorna o cache e deixa o remoto rodando em background
        // Se NÃO tem cache, espera pelo remoto
        if (cachedData !== null) {
            // Não bloqueia o retorno do cache
            return cachedData;
        }

        console.log(`[CacheService] Cache MISS para ${key}, esperando remoto...`);
        return remotePromise;
    },

    /**
     * Salva um item no cache
     */
    async set<T>(key: string, data: T): Promise<T> {
        try {
            return await generalStore.setItem(key, data);
        } catch (e) {
            console.error(`[CacheService] Erro ao salvar ${key}:`, e);
            return data;
        }
    },

    /**
     * Recupera um item do cache
     */
    async get<T>(key: string): Promise<T | null> {
        try {
            return await generalStore.getItem<T>(key);
        } catch (e) {
            return null;
        }
    },

    /**
     * Remove um item do cache
     */
    async remove(key: string): Promise<void> {
        await generalStore.removeItem(key);
    },

    /**
     * Limpa todo o cache
     */
    async clear(): Promise<void> {
        await generalStore.clear();
    }
};
