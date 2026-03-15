import localforage from 'localforage';
import type { AuditData } from '../../components/auditoria/types';

// Configura o banco de dados IndexedDB para o Módulo de Auditoria
const auditStore = localforage.createInstance({
    name: 'ChecklistFarma',
    storeName: 'audit_sessions',
    description: 'Persistência de alta performance para sessões de auditoria'
});

const LOCAL_AUDIT_SESSION_KEY = 'audit_flow_v72_master'; // Mantendo a chave original para compatibilidade ou troca total

/**
 * Carrega a sessão de auditoria do IndexedDB
 */
export async function loadLocalAuditSession(): Promise<AuditData | null> {
    try {
        const data = await auditStore.getItem<AuditData>(LOCAL_AUDIT_SESSION_KEY);
        return data;
    } catch (error) {
        console.error('Erro ao carregar sessão do IndexedDB (Audit):', error);
        return null;
    }
}

/**
 * Salva a sessão de auditoria no IndexedDB
 */
export async function saveLocalAuditSession(data: AuditData): Promise<void> {
    if (!data) return;
    try {
        // Tenta remover do localStorage caso exista (migração)
        try {
            window.localStorage.removeItem(LOCAL_AUDIT_SESSION_KEY);
        } catch (e) { }

        await auditStore.setItem(LOCAL_AUDIT_SESSION_KEY, data);
    } catch (error) {
        console.error('Erro ao salvar sessão no IndexedDB (Audit):', error);
    }
}

/**
 * Limpa a sessão de auditoria local
 */
export async function clearLocalAuditSession(): Promise<void> {
    try {
        await auditStore.removeItem(LOCAL_AUDIT_SESSION_KEY);
        // Garante que o localStorage também seja limpo
        try {
            window.localStorage.removeItem(LOCAL_AUDIT_SESSION_KEY);
        } catch (e) { }
    } catch (error) {
        console.error('Erro ao limpar sessão no IndexedDB (Audit):', error);
    }
}

/**
 * Cleanup de dados legados do localStorage
 */
export function cleanupLegacyAuditStorage() {
    if (typeof window === 'undefined') return;
    try {
        if (window.localStorage.getItem(LOCAL_AUDIT_SESSION_KEY)) {
            window.localStorage.removeItem(LOCAL_AUDIT_SESSION_KEY);
            console.log(`[Cleanup] Removida chave de auditoria legada do localStorage`);
        }
    } catch (e) {
        console.error('Erro no cleanup de localStorage (Audit):', e);
    }
}
