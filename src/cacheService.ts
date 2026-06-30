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

type CacheMeta = {
    savedAt: number;
    fingerprint: string;
};

type FetchWithCacheOptions<T> = {
    maxAgeMs?: number;
    revalidate?: 'always' | 'stale' | 'never';
    timeoutMs?: number;
    compare?: false | ((cachedData: T, remoteData: T) => boolean);
};

const META_PREFIX = '__meta__:';
const inFlightRequests = new Map<string, Promise<any>>();

const withTimeout = async <T>(promise: Promise<T>, timeoutMs?: number): Promise<T> => {
    if (!timeoutMs || timeoutMs <= 0) return promise;
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            globalThis.setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
        })
    ]);
};

const getValueTimestamp = (value: any): string => {
    if (!value || typeof value !== 'object') return '';
    return String(value.updated_at || value.updatedAt || value.created_at || value.createdAt || '');
};

const getValueIdentity = (value: any): string => {
    if (!value || typeof value !== 'object') return String(value ?? '');
    return String(value.id || value.email || value.key || value.module_key || value.level || value.branch || '');
};

const fingerprintData = (data: any): string => {
    if (Array.isArray(data)) {
        const length = data.length;
        if (length === 0) return 'array:0';
        let latestTimestamp = '';
        const sampleIndexes = new Set<number>();
        const sampleSize = Math.min(20, length);
        for (let i = 0; i < sampleSize; i += 1) sampleIndexes.add(i);
        for (let i = Math.max(0, length - sampleSize); i < length; i += 1) sampleIndexes.add(i);

        const sample = Array.from(sampleIndexes)
            .sort((a, b) => a - b)
            .map(index => {
                const item = data[index];
                const ts = getValueTimestamp(item);
                if (ts > latestTimestamp) latestTimestamp = ts;
                return `${getValueIdentity(item)}:${ts}`;
            })
            .join('|');

        data.forEach(item => {
            const ts = getValueTimestamp(item);
            if (ts > latestTimestamp) latestTimestamp = ts;
        });

        return `array:${length}:${latestTimestamp}:${sample}`;
    }

    if (data && typeof data === 'object') {
        const ts = getValueTimestamp(data);
        const id = getValueIdentity(data);
        const keys = Object.keys(data).sort().join(',');
        return `object:${id}:${ts}:${keys}`;
    }

    return `${typeof data}:${String(data)}`;
};

const hasDataChanged = <T>(
    cachedData: T | null,
    cachedMeta: CacheMeta | null,
    remoteData: T,
    compare?: FetchWithCacheOptions<T>['compare']
): boolean => {
    if (cachedData === null) return true;
    if (compare === false) return true;
    if (typeof compare === 'function') return compare(cachedData, remoteData);

    const remoteFingerprint = fingerprintData(remoteData);
    if (cachedMeta?.fingerprint && cachedMeta.fingerprint !== remoteFingerprint) return true;

    const cachedFingerprint = fingerprintData(cachedData);
    if (cachedFingerprint !== remoteFingerprint) return true;

    if (Array.isArray(remoteData) && remoteData.length > 200) return false;
    try {
        return JSON.stringify(cachedData) !== JSON.stringify(remoteData);
    } catch {
        return true;
    }
};

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
        onUpdate?: (newData: T) => void,
        options: FetchWithCacheOptions<T> = {}
    ): Promise<T | null> {
        const [cachedData, cachedMeta] = await Promise.all([
            this.get<T>(key),
            this.getMeta(key)
        ]);

        const revalidate = options.revalidate || 'always';
        const isFresh = !!cachedMeta?.savedAt && !!options.maxAgeMs && Date.now() - cachedMeta.savedAt < options.maxAgeMs;

        if (cachedData !== null && (revalidate === 'never' || (revalidate === 'stale' && isFresh))) {
            return cachedData;
        }

        const remoteRequest = inFlightRequests.get(key) || withTimeout(remoteFetch(), options.timeoutMs)
            .finally(() => {
                inFlightRequests.delete(key);
            });
        inFlightRequests.set(key, remoteRequest);

        const remotePromise = remoteRequest.then(async (remoteData) => {
            if (remoteData !== null) {
                const changed = hasDataChanged(cachedData, cachedMeta, remoteData, options.compare);

                await this.set(key, remoteData);

                if (changed && onUpdate) {
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
            const saved = await generalStore.setItem(key, data);
            await this.setMeta(key, {
                savedAt: Date.now(),
                fingerprint: fingerprintData(data)
            });
            return saved;
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

    async getMany<T = unknown>(keys: string[]): Promise<Record<string, T | null>> {
        const entries = await Promise.all(keys.map(async key => [key, await this.get<T>(key)] as const));
        return entries.reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {} as Record<string, T | null>);
    },

    async getMeta(key: string): Promise<CacheMeta | null> {
        try {
            return await generalStore.getItem<CacheMeta>(`${META_PREFIX}${key}`);
        } catch {
            return null;
        }
    },

    async setMeta(key: string, meta: CacheMeta): Promise<void> {
        try {
            await generalStore.setItem(`${META_PREFIX}${key}`, meta);
        } catch {
            // Metadados são otimização; falha aqui não deve bloquear o app.
        }
    },

    /**
     * Remove um item do cache
     */
    async remove(key: string): Promise<void> {
        await generalStore.removeItem(key);
        await generalStore.removeItem(`${META_PREFIX}${key}`);
    },

    /**
     * Limpa todo o cache
     */
    async clear(): Promise<void> {
        await generalStore.clear();
    }
};
