import type { DbPVSession } from '../supabaseService';
import type { Product, SalesUploadRecord } from './types';

const LOCAL_PV_SESSION_PREFIX = 'PV_SESSION_';
const REPORTS_KEY_PREFIX = 'PV_REPORTS_';
const REPORTS_DB_NAME = 'PVReportsDB';
const REPORTS_STORE_NAME = 'reports';
const REPORTS_DB_VERSION = 1;
const LAST_UPLOAD_KEY_PREFIX = 'PV_LAST_UPLOAD_';

const buildLocalSessionKey = (email: string) => `${LOCAL_PV_SESSION_PREFIX}${email.trim().toLowerCase()}`;
const buildReportsKey = (email: string) => `${REPORTS_KEY_PREFIX}${email.trim().toLowerCase()}`;
const buildLastUploadKey = (email: string) => `${LAST_UPLOAD_KEY_PREFIX}${email.trim().toLowerCase()}`;

const isIndexedDBAvailable = () => typeof window !== 'undefined' && 'indexedDB' in window;

let reportsDbPromise: Promise<IDBDatabase> | null = null;

const openReportsDB = () => {
  if (!isIndexedDBAvailable()) return Promise.reject(new Error('IndexedDB não disponível'));
  if (reportsDbPromise) return reportsDbPromise;
  reportsDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(REPORTS_DB_NAME, REPORTS_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REPORTS_STORE_NAME)) {
        db.createObjectStore(REPORTS_STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onerror = () => {
      reportsDbPromise = null;
      reject(request.error);
    };
  });
  return reportsDbPromise;
};

const readReportsFromIndexedDB = async (key: string): Promise<LocalPVReports | null> => {
  if (!isIndexedDBAvailable()) return null;
  try {
    const db = await openReportsDB();
    return await new Promise<LocalPVReports | null>((resolve, reject) => {
      const tx = db.transaction(REPORTS_STORE_NAME, 'readonly');
      const store = tx.objectStore(REPORTS_STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.data ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    reportsDbPromise = null;
    console.warn('Erro ao ler relatórios no IndexedDB:', error);
    return null;
  }
};

const writeReportsToIndexedDB = async (key: string, reports: LocalPVReports): Promise<boolean> => {
  if (!isIndexedDBAvailable()) return false;
  try {
    const db = await openReportsDB();
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(REPORTS_STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      tx.objectStore(REPORTS_STORE_NAME).put({ key, data: reports });
    });
  } catch (error) {
    reportsDbPromise = null;
    console.warn('Erro ao gravar relatórios no IndexedDB:', error);
    return false;
  }
};

const deleteReportsFromIndexedDB = async (key: string): Promise<boolean> => {
  if (!isIndexedDBAvailable()) return false;
  try {
    const db = await openReportsDB();
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(REPORTS_STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      tx.objectStore(REPORTS_STORE_NAME).delete(key);
    });
  } catch (error) {
    reportsDbPromise = null;
    console.warn('Erro ao limpar relatórios no IndexedDB:', error);
    return false;
  }
};

const deleteOtherSessions = (currentKey: string) => {
  const allKeys = Object.keys(window.localStorage);
  allKeys.forEach(key => {
    if (key.startsWith(LOCAL_PV_SESSION_PREFIX) && key !== currentKey) {
      window.localStorage.removeItem(key);
    }
  });
};

const deleteAllSessions = () => {
  const allKeys = Object.keys(window.localStorage);
  allKeys.forEach(key => {
    if (key.startsWith(LOCAL_PV_SESSION_PREFIX)) {
      window.localStorage.removeItem(key);
    }
  });
};

const minimizeSessionForStorage = (session: DbPVSession): DbPVSession => {
  const data = session.session_data || {};
  const minimalSession = {
    id: session.id,
    user_email: session.user_email,
    company_id: session.company_id,
    branch: session.branch,
    area: session.area,
    pharmacist: session.pharmacist,
    manager: session.manager,
    session_data: {
      companyName: data.companyName,
      currentView: data.currentView,
      sales_period: data.sales_period
    }
  };
  return minimalSession;
};

const attemptSave = (storageKey: string, session: DbPVSession) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(session));
  } catch (error) {
    console.error('Erro ao salvar sessao PV local:', error);
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      deleteAllSessions();
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(session));
        console.info('Sessao PV salva depois de limpar o armazenamento.');
      } catch (retryError) {
        console.error('Falha persistindo sessao PV apos limpar o armazenamento:', retryError);
      }
    }
  }
};

export const loadLocalPVSession = (email: string): DbPVSession | null => {
  if (typeof window === 'undefined' || !email) return null;
  try {
    const key = buildLocalSessionKey(email);
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error('Erro ao carregar sessao PV local:', error);
    return null;
  }
};

export const saveLocalPVSession = (email: string, session: DbPVSession) => {
  if (typeof window === 'undefined' || !email) return;
  try {
    const key = buildLocalSessionKey(email);
    deleteOtherSessions(key);
    const sessionToStore = minimizeSessionForStorage(session);
    attemptSave(key, sessionToStore);
  } catch (error) {
    console.error('Erro ao preparar armazenamento PV local:', error);
  }
};

export const clearLocalPVSession = (email: string) => {
  if (typeof window === 'undefined' || !email) return;
  try {
    window.localStorage.removeItem(buildLocalSessionKey(email));
  } catch (error) {
    console.error('Erro ao limpar sessao PV local:', error);
  }
};

export const loadLastSalesUpload = (email: string): SalesUploadRecord | null => {
  if (typeof window === 'undefined' || !email) return null;
  try {
    const raw = window.localStorage.getItem(buildLastUploadKey(email));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error('Erro ao carregar último carregamento de vendas local:', error);
    return null;
  }
};

export const saveLastSalesUpload = (email: string, upload: SalesUploadRecord) => {
  if (typeof window === 'undefined' || !email) return;
  try {
    window.localStorage.setItem(buildLastUploadKey(email), JSON.stringify(upload));
  } catch (error) {
    console.error('Erro ao salvar último carregamento de vendas local:', error);
  }
};

export const clearLastSalesUpload = (email: string) => {
  if (typeof window === 'undefined' || !email) return;
  try {
    window.localStorage.removeItem(buildLastUploadKey(email));
  } catch (error) {
    console.error('Erro ao limpar o último carregamento de vendas local:', error);
  }
};

export interface LocalPVReports {
  systemProducts?: Product[];
  dcbProducts?: Product[];
}

const loadFromLocalStorageReports = (key: string): LocalPVReports | null => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error('Erro ao carregar relatórios PV locais (fallback):', error);
    return null;
  }
};

const saveToLocalStorageReports = (key: string, reports: LocalPVReports) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(reports));
  } catch (error) {
    console.error('Erro ao salvar relatórios PV locais (fallback):', error);
  }
};

export const loadLocalPVReports = async (email: string): Promise<LocalPVReports | null> => {
  if (typeof window === 'undefined' || !email) return null;
  const key = buildReportsKey(email);
  const fromIndexedDB = await readReportsFromIndexedDB(key);
  if (fromIndexedDB) return fromIndexedDB;
  return loadFromLocalStorageReports(key);
};

export const saveLocalPVReports = async (email: string, reports: LocalPVReports) => {
  if (typeof window === 'undefined' || !email) return;
  const key = buildReportsKey(email);
  const persisted = await writeReportsToIndexedDB(key, reports);
  if (!persisted) {
    saveToLocalStorageReports(key, reports);
  }
};

export const clearLocalPVReports = async (email: string) => {
  if (typeof window === 'undefined' || !email) return;
  const key = buildReportsKey(email);
  const deleted = await deleteReportsFromIndexedDB(key);
  if (!deleted) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.error('Erro ao limpar relatórios PV locais (fallback):', error);
    }
  }
};
