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
const memoryCache = new Map<string, unknown>();
const memoryMeta = new Map<string, CacheMeta>();
const scheduledRevalidations = new Set<string>();
const pendingPersistentWrites = new Map<string, { data: unknown; meta: CacheMeta }>();
let persistentWriteHandle: number | null = null;
let remoteFailureStreak = 0;
let remoteCircuitOpenUntil = 0;

const REMOTE_BACKOFF_BASE_MS = 15_000;
const REMOTE_BACKOFF_MAX_MS = 2 * 60_000;

const scheduleWhenIdle = (task: () => void, timeoutMs = 1200) => {
    if (typeof window === 'undefined') {
        globalThis.setTimeout(task, 0);
        return;
    }

    const requestIdleCallback = (window as any).requestIdleCallback as
        | undefined
        | ((callback: () => void, options?: { timeout?: number }) => number);
    if (requestIdleCallback) {
        requestIdleCallback(task, { timeout: timeoutMs });
        return;
    }

    window.setTimeout(task, 0);
};

const flushPersistentWrites = async () => {
    persistentWriteHandle = null;
    const entries = Array.from(pendingPersistentWrites.entries());
    pendingPersistentWrites.clear();
    if (entries.length === 0) return;

    await Promise.allSettled(entries.flatMap(([key, value]) => [
        generalStore.setItem(key, value.data),
        generalStore.setItem(`${META_PREFIX}${key}`, value.meta)
    ]));
};

const schedulePersistentWrite = (key: string, data: unknown, meta: CacheMeta) => {
    pendingPersistentWrites.set(key, { data, meta });
    if (persistentWriteHandle !== null) return;

    if (typeof window !== 'undefined') {
        const requestIdleCallback = (window as any).requestIdleCallback as
            | undefined
            | ((callback: () => void, options?: { timeout?: number }) => number);
        if (requestIdleCallback) {
            persistentWriteHandle = requestIdleCallback(() => {
                void flushPersistentWrites();
            }, { timeout: 1800 });
            return;
        }
        persistentWriteHandle = window.setTimeout(() => {
            void flushPersistentWrites();
        }, 0);
        return;
    }

    persistentWriteHandle = globalThis.setTimeout(() => {
        void flushPersistentWrites();
    }, 0) as unknown as number;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs?: number): Promise<T> => {
    if (!timeoutMs || timeoutMs <= 0) return promise;
    return new Promise<T>((resolve, reject) => {
        const timeoutId = globalThis.setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
        promise.then(
            value => {
                globalThis.clearTimeout(timeoutId);
                resolve(value);
            },
            error => {
                globalThis.clearTimeout(timeoutId);
                reject(error);
            }
        );
    });
};

const isTimeoutError = (error: unknown): boolean =>
    error instanceof Error && /^timeout \d+ms$/.test(error.message);

const isTransientRemoteError = (error: unknown): boolean => {
    const candidate = (error || {}) as Record<string, unknown>;
    const status = Number(candidate.status || candidate.statusCode || 0);
    const code = String(candidate.code || '').toUpperCase();
    const message = String(candidate.message || error || '').toLowerCase();
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504 ||
        status === 520 || status === 521 || status === 522 || status === 523 || status === 524 ||
        code === 'PGRST002' || code === 'PGRST000' ||
        message.includes('bad gateway') ||
        message.includes('service unavailable') ||
        message.includes('origin time-out') ||
        message.includes('schema cache') ||
        message.includes('failed to fetch');
};

const registerRemoteFailure = (error: unknown) => {
    if (!isTransientRemoteError(error)) return;
    remoteFailureStreak = Math.min(remoteFailureStreak + 1, 5);
    const delay = Math.min(
        REMOTE_BACKOFF_MAX_MS,
        REMOTE_BACKOFF_BASE_MS * (2 ** Math.max(0, remoteFailureStreak - 1))
    );
    remoteCircuitOpenUntil = Math.max(remoteCircuitOpenUntil, Date.now() + delay);
};

const registerRemoteSuccess = () => {
    if (remoteFailureStreak === 0) return;
    remoteFailureStreak = Math.max(0, remoteFailureStreak - 1);
    if (remoteFailureStreak === 0) remoteCircuitOpenUntil = 0;
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

    const canCompareDeeply = (value: unknown): boolean => {
        if (Array.isArray(value)) {
            if (value.length > 200) return false;
            return value.every(item => {
                if (item === null || typeof item !== 'object') return true;
                const values = Object.values(item as Record<string, unknown>);
                return values.length <= 30 && values.every(entry => entry === null || typeof entry !== 'object');
            });
        }
        if (!value || typeof value !== 'object') return true;
        const values = Object.values(value as Record<string, unknown>);
        return values.length <= 50 && values.every(entry => entry === null || typeof entry !== 'object');
    };

    // Snapshots de auditoria e relatórios podem ter vários MB. Neles, id/updated_at
    // é a versão autoritativa; serializar o objeto inteiro trava a thread principal.
    if (!canCompareDeeply(remoteData) || !canCompareDeeply(cachedData)) return false;
    try {
        return JSON.stringify(cachedData) !== JSON.stringify(remoteData);
    } catch {
        return true;
    }
};

export const CacheService = {
    /** Retorna apenas o valor já aquecido em memória, sem tocar no IndexedDB. */
    peek<T>(key: string): T | null {
        return memoryCache.has(key) ? memoryCache.get(key) as T : null;
    },

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
        const hasHotData = memoryCache.has(key);
        const [cachedData, cachedMeta] = hasHotData
            ? [memoryCache.get(key) as T, memoryMeta.get(key) || await CacheService.getMeta(key)] as const
            : await Promise.all([
                CacheService.get<T>(key),
                CacheService.getMeta(key)
            ]);

        const revalidate = options.revalidate || 'always';
        const isFresh = !!cachedMeta?.savedAt && !!options.maxAgeMs && Date.now() - cachedMeta.savedAt < options.maxAgeMs;

        if (cachedData !== null && (revalidate === 'never' || (revalidate === 'stale' && isFresh))) {
            return cachedData;
        }

        const runRemote = () => {
            const existing = inFlightRequests.get(key) as Promise<T | null> | undefined;
            if (existing) return existing;

            // Quando o PostgREST/origin sinaliza indisponibilidade, todas as telas tendem a
            // revalidar ao mesmo tempo. Durante a pausa, servimos somente o snapshot local.
            if (Date.now() < remoteCircuitOpenUntil) {
                scheduledRevalidations.delete(key);
                return Promise.resolve(cachedData);
            }

            // O timeout deve liberar somente quem está aguardando pela resposta. A consulta
            // original continua em segundo plano para aquecer o cache assim que o banco responder.
            const sourceRequest = Promise.resolve()
                .then(remoteFetch)
                .then(async (remoteData) => {
                    registerRemoteSuccess();
                    if (remoteData !== null) {
                        const changed = hasDataChanged(cachedData, cachedMeta, remoteData, options.compare);
                        await CacheService.set(key, remoteData);

                        if (changed && onUpdate) {
                            scheduleWhenIdle(() => onUpdate(remoteData), 500);
                        }
                        return remoteData;
                    }
                    return cachedData;
                })
                .catch(err => {
                    registerRemoteFailure(err);
                    console.error(`[CacheService] Erro na busca remota para ${key}:`, err);
                    return cachedData;
                });

            const visibleRequest = withTimeout(sourceRequest, options.timeoutMs)
                .catch(err => {
                    if (isTimeoutError(err)) {
                        console.warn(
                            `[CacheService] ${key} excedeu ${options.timeoutMs}ms; ` +
                            'a sincronização continuará em segundo plano.'
                        );
                    } else {
                        console.error(`[CacheService] Erro ao aguardar ${key}:`, err);
                    }
                    return cachedData;
                });

            inFlightRequests.set(key, visibleRequest);

            const clearInFlight = () => {
                // Só libera a chave quando a consulta real terminar. Isso impede que um timeout
                // gere novas consultas iguais enquanto a anterior ainda está no Cloudflare/banco.
                if (inFlightRequests.get(key) === visibleRequest) {
                    inFlightRequests.delete(key);
                    scheduledRevalidations.delete(key);
                }
            };
            void sourceRequest.then(clearInFlight, clearInFlight);

            return visibleRequest;
        };

        // Se tem cache, retorna o cache e deixa o remoto rodando em background
        // Se NÃO tem cache, espera pelo remoto
        if (cachedData !== null) {
            if (!scheduledRevalidations.has(key)) {
                scheduledRevalidations.add(key);
                scheduleWhenIdle(() => {
                    void runRemote();
                });
            }
            return cachedData;
        }

        console.log(`[CacheService] Cache MISS para ${key}, esperando remoto...`);
        return runRemote();
    },

    /**
     * Salva um item no cache
     */
    async set<T>(key: string, data: T): Promise<T> {
        const meta = {
            savedAt: Date.now(),
            fingerprint: fingerprintData(data)
        };
        memoryCache.set(key, data);
        memoryMeta.set(key, meta);
        schedulePersistentWrite(key, data, meta);
        return data;
    },

    /**
     * Recupera um item do cache
     */
    async get<T>(key: string): Promise<T | null> {
        if (memoryCache.has(key)) return memoryCache.get(key) as T;
        try {
            const value = await generalStore.getItem<T>(key);
            if (value !== null) memoryCache.set(key, value);
            return value;
        } catch (e) {
            return null;
        }
    },

    async getMany<T = unknown>(keys: string[]): Promise<Record<string, T | null>> {
        const entries = await Promise.all(keys.map(async key => [key, await CacheService.get<T>(key)] as const));
        return entries.reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {} as Record<string, T | null>);
    },

    async getMeta(key: string): Promise<CacheMeta | null> {
        if (memoryMeta.has(key)) return memoryMeta.get(key) || null;
        try {
            const meta = await generalStore.getItem<CacheMeta>(`${META_PREFIX}${key}`);
            if (meta) memoryMeta.set(key, meta);
            return meta;
        } catch {
            return null;
        }
    },

    async setMeta(key: string, meta: CacheMeta): Promise<void> {
        memoryMeta.set(key, meta);
        const data = memoryCache.get(key);
        if (data !== undefined) schedulePersistentWrite(key, data, meta);
    },

    /**
     * Remove um item do cache
     */
    async remove(key: string): Promise<void> {
        memoryCache.delete(key);
        memoryMeta.delete(key);
        pendingPersistentWrites.delete(key);
        scheduledRevalidations.delete(key);
        await Promise.all([
            generalStore.removeItem(key),
            generalStore.removeItem(`${META_PREFIX}${key}`)
        ]);
    },

    /**
     * Limpa todo o cache
     */
    async clear(): Promise<void> {
        memoryCache.clear();
        memoryMeta.clear();
        pendingPersistentWrites.clear();
        scheduledRevalidations.clear();
        await generalStore.clear();
    }
};
