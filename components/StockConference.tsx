import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CheckCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  Download,
  Search,
  Box,
  FileCode,
  FileSpreadsheet,
  ClipboardList,
  RefreshCw,
  Printer,
  ThumbsUp,
  TrendingUp,
  TrendingDown,
  Volume2,
  Tag,
  Ban,
  Eraser,
  Lock,
  Unlock,
  User,
  Building,
  PenTool,
  X,
  Pill,
  ArrowRight,
  Save,
  LayoutDashboard,
  Clock,
  FileText,
  ChevronRight,
  Barcode,
  Package,
  Camera,
  Smartphone,
  Trash2
} from 'lucide-react';
import SignaturePad from './SignaturePad';
import * as SupabaseService from '../supabaseService';
import { CadastrosBaseService } from '../src/cadastrosBase/cadastrosBaseService';
import * as StockStorage from '../src/stockConference/storage';
import { ImageUtils } from '../src/utils/imageUtils';

// Migrado para StockStorage (IndexedDB)







const getSessionTimestamp = (session?: SupabaseService.DbStockConferenceSession | null): number => {
  if (!session) return 0;
  const rawDate = session.updated_at || '';
  const parsed = Date.parse(rawDate);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getSessionProgressScore = (session?: SupabaseService.DbStockConferenceSession | null): number => {
  if (!session || !Array.isArray(session.inventory)) return 0;
  return session.inventory.reduce((count, entry) => {
    if (!entry) return count;
    if (entry.last_updated) return count + 1;
    const qty = Number(entry.counted_qty ?? 0);
    if (!Number.isNaN(qty) && qty > 0) return count + 1;
    if (entry.status && entry.status !== 'pending') return count + 1;
    return count;
  }, 0);
};

const STOCK_DEBUG = import.meta.env.DEV && Boolean((globalThis as any).__STOCK_DEBUG);
const stockDebugLog = (...args: any[]) => {
  if (STOCK_DEBUG) console.log(...args);
};

// --- Types ---

interface Product {
  reducedCode: string;
  barcode: string;
  description: string;
}

interface StockItem {
  reducedCode: string;
  systemQty: number;
  countedQty: number;
  lastUpdated: Date | null;
  status: 'pending' | 'matched' | 'divergent';
}

type AppStep = 'setup' | 'conference' | 'divergence' | 'report';

interface StockConferenceProps {
  userEmail?: string;
  userName?: string;
  companies?: SupabaseService.DbCompany[];
  onReportSaved?: () => Promise<void>;
  pendingReportsCount?: number;
  onManualSync?: () => Promise<void>;
}

type StockSummaryPayload = {
  total: number;
  matched: number;
  divergent: number;
  pending: number;
  percent: number;
  signatures?: {
    pharmacist?: string | null;
    manager?: string | null;
  };
  duration_ms?: number;
  durationMs?: number;
  startedAt?: string;
  started_at?: string;
  endedAt?: string;
  ended_at?: string;
};

const GLOBAL_CADASTRO_MODULE_KEY = 'shared_cadastro_produtos';

const decodeGlobalFileToBrowserFile = (file: SupabaseService.DbGlobalBaseFile): File | null => {
  if ((file as any)._parsedFile) return (file as any)._parsedFile;

  const raw = String(file?.file_data_base64 || '').trim();
  if (!raw) return null;

  let mimeType = file?.mime_type || 'application/octet-stream';
  let base64 = raw;
  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.*)$/);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1] || mimeType;
    base64 = dataUrlMatch[2] || '';
  }
  if (!base64) return null;

  try {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const originalName = file.file_name || `${file.module_key || 'base'}.xlsx`;
    const fileName = originalName.startsWith('[GLOBAL] ')
      ? originalName
      : `[GLOBAL] ${originalName}`;

    return new File([bytes], fileName, { type: mimeType });
  } catch (error) {
    console.error('Erro ao decodificar arquivo global de conferência:', error);
    return null;
  }
};

interface CompanyAreaMatch {
  companyId: string;
  areaName: string;
}

const findCompanyAreaByBranch = (
  branchName: string,
  companies: SupabaseService.DbCompany[]
): CompanyAreaMatch | null => {
  if (!branchName) return null;
  const normalizedBranch = branchName.trim().toLowerCase();

  for (const company of companies) {
    if (!company || !company.areas) continue;
    for (const area of company.areas) {
      if (!area) continue;
      const branches = area.branches || [];
      for (const candidate of branches) {
        if (!candidate) continue;
        if (candidate.trim().toLowerCase() === normalizedBranch) {
          return {
            companyId: company.id || '',
            areaName: area.name || ''
          };
        }
      }
    }
  }

  return null;
};

// --- Audio Helper ---

const playSound = (type: 'success' | 'error') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // High pitch happy beep
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else {
      // Low pitch error buzz
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch (e) {
    console.error("Audio play failed", e);
  }
};

const playAccumulationBeep = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {
    console.error("Audio play failed", e);
  }
};

// --- Parsers ---

// Simple CSV parser that tries to detect delimiter and headers
const parseCSV = (text: string): any[] => {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];

  // Detect delimiter
  const firstLine = lines[0];
  const delimiter = firstLine.includes(';') ? ';' : ',';

  const headers = firstLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/"/g, ''));

  return lines.slice(1).map(line => {
    const values = line.split(delimiter).map(v => v.trim().replace(/"/g, ''));
    const obj: any = {};
    headers.forEach((h, i) => {
      obj[h] = values[i];
    });
    return obj;
  });
};

// HTML Table parser
const parseHTML = (text: string): any[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return [];

  // Try to find headers in thead, otherwise use first row
  let headerRow = table.querySelector('thead tr');
  let dataRows: Element[] = [];

  if (headerRow) {
    // If thead exists, get rows from tbody
    dataRows = Array.from(table.querySelectorAll('tbody tr'));
    // If no tbody, just get rows after thead
    if (dataRows.length === 0) {
      const allRows = Array.from(table.querySelectorAll('tr'));
      const headerIndex = allRows.indexOf(headerRow as HTMLTableRowElement);
      dataRows = allRows.slice(headerIndex + 1);
    }
  } else {
    // No thead, assume first row is header
    const allRows = Array.from(table.querySelectorAll('tr'));
    if (allRows.length > 0) {
      headerRow = allRows[0];
      dataRows = allRows.slice(1);
    }
  }

  if (!headerRow) return [];

  const headers = Array.from(headerRow.querySelectorAll('th, td')).map(c => c.textContent?.trim().toLowerCase() || '');

  const results: any[] = [];
  dataRows.forEach(row => {
    const cells = row.querySelectorAll('td');
    // Basic validation: row should have similar cell count or at least content
    if (cells.length === 0) return;

    const obj: any = {};
    cells.forEach((cell, i) => {
      if (headers[i]) {
        obj[headers[i]] = cell.textContent?.trim();
      }
    });
    // Only add if it has at least some data
    if (Object.keys(obj).length > 0) {
      results.push(obj);
    }
  });

  return results;
};

// Excel Parser using SheetJS
const parseExcel = async (file: File): Promise<any[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  if (!workbook.SheetNames.length) {
    throw new Error("Arquivo Excel vazio ou inválido.");
  }

  // Use first sheet
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Use header: "A" to get raw column letters (A, B, C...)
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: "A", defval: "" });
  return jsonData;
};

// More robust header normalization
const normalizeHeader = (h: any) => {
  if (!h) return '';
  const lower = String(h).toLowerCase().trim();

  // Reduced Code Variations
  if (lower === 'id' || lower === 'cod' || lower === 'código' || lower === 'codigo' || lower.includes('reduzido') || lower.includes('produto') && !lower.includes('desc')) return 'reducedCode';

  // Barcode Variations
  if (lower.includes('barra') || lower.includes('gtin') || lower.includes('ean')) return 'barcode';

  // Description Variations
  if (lower.includes('desc') || lower.includes('nome')) return 'description';

  // Quantity Variations
  if (lower.includes('qtd') || lower.includes('quant') || lower.includes('estoque') || lower.includes('saldo') || lower === 'q') return 'qty';

  return lower;
};

// Helper to safely parse numbers from various formats (1.000,00 or 1000.00)
const safeParseFloat = (value: any): number => {
  if (typeof value === 'number') return value;
  if (!value) return 0;

  let valStr = String(value).trim();
  if (!valStr) return 0;

  // Check for Brazilian format: contains comma, maybe dots for thousands
  // Pattern: digits with dots, ending with comma and digits: 1.234,56
  if (valStr.match(/^[0-9]{1,3}(\.[0-9]{3})*,\d+$/) || valStr.includes(',')) {
    // Remove dots (thousands separator)
    valStr = valStr.replace(/\./g, '');
    // Replace comma with dot (decimal separator)
    valStr = valStr.replace(',', '.');
  }

  const parsed = parseFloat(valStr);
  return isNaN(parsed) ? 0 : parsed;
};

// --- Main Component ---

export const StockConference: React.FC<StockConferenceProps> = ({ 
  userEmail, 
  userName, 
  companies = [], 
  onReportSaved,
  pendingReportsCount = 0,
  onManualSync
}) => {
  const [step, setStep] = useState<AppStep>('setup');
  const [isSyncingManual, setIsSyncingManual] = useState(false);

  const resetConferenceState = useCallback(async () => {
    setStep('setup');
    setInventory(new Map());
    setMasterProducts(new Map());
    setBarcodeIndex(new Map());
    setStockFile(null);
    setProductFile(null);
    setRecountTargets(new Set());
    setPharmSignature(null);
    setManagerSignature(null);
    setPharmacist('');
    setManager('');
    setBranch('');
    setSelectedCompanyId('');
    setSelectedAreaName('');
    setSessionId(null);
    setLastSavedReportId(null);
    setLastSavedSummary(null);
    setIsDirty(false);
    setActiveItem(null);
    setLastScanned(null);
    setAccumulationMode(false);
    setScanInput('');
    setCountInput('');
    setIsControlledStock(false);
    setErrorMsg('');
    manualSessionStartedRef.current = false;
    
    if (userEmail) {
      await StockStorage.clearLocalStockSession(userEmail);
      try {
        await SupabaseService.deleteStockConferenceSession(userEmail);
      } catch (e) {
        console.error("Erro ao limpar sessão no Supabase durante reset:", e);
      }
    }
  }, [userEmail]);

  const handleManualSyncClick = async () => {
    if (!onManualSync) return;
    setIsSyncingManual(true);
    try {
      await onManualSync();
    } finally {
      setIsSyncingManual(false);
    }
  };

  // Header Info State
  const [branch, setBranch] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedAreaName, setSelectedAreaName] = useState('');
  const [pharmacist, setPharmacist] = useState('');
  const [manager, setManager] = useState('');

  // Data State
  const [masterProducts, setMasterProducts] = useState<Map<string, Product>>(new Map()); // Key: ReducedCode
  const [barcodeIndex, setBarcodeIndex] = useState<Map<string, string>>(new Map()); // Key: Barcode, Value: ReducedCode
  const [inventory, setInventory] = useState<Map<string, StockItem>>(new Map()); // Key: ReducedCode
  const [isControlledStock, setIsControlledStock] = useState(false); // New state for controlled products

  // Signatures State
  const [pharmSignature, setPharmSignature] = useState<string | null>(null);
  const [managerSignature, setManagerSignature] = useState<string | null>(null);

  // Recount State (Phase 2)
  const [recountTargets, setRecountTargets] = useState<Set<string>>(new Set());

  // UI State
  const [productFile, setProductFile] = useState<File | null>(null);
  const [stockFile, setStockFile] = useState<File | null>(null);
  const [globalProductFile, setGlobalProductFile] = useState<File | null>(null);
  const [globalProductMeta, setGlobalProductMeta] = useState<SupabaseService.DbGlobalBaseFile | null>(null);
  const [isLoadingGlobalProduct, setIsLoadingGlobalProduct] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Conference State
  const [scanInput, setScanInput] = useState('');
  const [activeItem, setActiveItem] = useState<Product | null>(null);
  const [countInput, setCountInput] = useState('');
  const [lastScanned, setLastScanned] = useState<{ item: StockItem, product: Product } | null>(null);
  const [accumulationMode, setAccumulationMode] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStatusMsg, setCameraStatusMsg] = useState('Posicione o código de barras dentro do quadro.');
  const [lightAssistEnabled, setLightAssistEnabled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const countRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraLoopRef = useRef<number | null>(null);
  const barcodeDetectorRef = useRef<any>(null);
  const lastDetectedCodeRef = useRef<string>('');
  const [isSavingStockReport, setIsSavingStockReport] = useState(false);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSync, setPendingSync] = useState(false);
  const [isDirty, setIsDirty] = useState(false); // Track if there are unsaved changes
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [lastSavedReportId, setLastSavedReportId] = useState<string | null>(null);
  const [lastSavedSummary, setLastSavedSummary] = useState<StockSummaryPayload | null>(null);
  const manualSessionStartedRef = useRef(false);
  const finalizeInFlightRef = useRef(false);
  const previousUserEmailRef = useRef<string | null>(null);
  const lastSyncTimestampRef = useRef<number>(0);
  const lastConflictCheckRef = useRef<number>(0);
  const signatureHashRef = useRef('');

  // --- Effects ---

  // Auto-save session periodically during conference
  useEffect(() => {
    if (step !== 'conference' && step !== 'divergence') return;
    if (!userEmail) return;
    if (masterProducts.size === 0 || inventory.size === 0) return;

    // Auto-save to Supabase when idle for 3 seconds
    const timer = setTimeout(() => {
      if (isDirty && !isSavingSession) {
        void persistSession().then(() => setIsDirty(false));
      }
    }, 3000);

    const handleWake = () => {
      if (!document.hidden && isDirty && !isSavingSession) {
        void persistSession().then(() => setIsDirty(false));
      }
    };
    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('focus', handleWake);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('focus', handleWake);
    };
  }, [step, userEmail, masterProducts.size, inventory, isDirty, isSavingSession]);

  // Limpeza de cache legado no mount
  useEffect(() => {
    StockStorage.cleanupLegacyStockStorage();
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const sync = () => setIsMobileViewport(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // --- Calculations (Memoized for performance and Hook Stability) ---

  const stats = useMemo(() => {
    // Phase 2 Recount Logic: Calculate 0-100% based ONLY on recount targets
    if (recountTargets.size > 0) {
      let counted = 0;
      recountTargets.forEach(key => {
        const item = inventory.get(key);
        // We check lastUpdated to ensure we only count items processed in this session
        if (item && item.lastUpdated !== null) counted++;
      });
      return {
        total: recountTargets.size,
        counted,
        percent: recountTargets.size === 0 ? 0 : Math.round((counted / recountTargets.size) * 100),
        isRecount: true
      };
    }

    // Standard Logic
    let total = 0;
    let counted = 0;
    inventory.forEach((val) => {
      total++;
      if (val.lastUpdated !== null) counted++;
    });
    return {
      total,
      counted,
      percent: total === 0 ? 0 : Math.round((counted / total) * 100),
      isRecount: false
    };
  }, [inventory, recountTargets]);

  const recountPendingList = useMemo(() => {
    if (!stats.isRecount) return [];
    const list: { code: string, barcode: string, desc: string }[] = [];
    recountTargets.forEach(key => {
      const item = inventory.get(key);
      if (item && item.lastUpdated === null) {
        const prod = masterProducts.get(key);
        list.push({
          code: key,
          barcode: prod?.barcode || '-',
          desc: prod?.description || key
        });
      }
    });
    return list;
  }, [inventory, recountTargets, stats.isRecount, masterProducts]);

  const restoreSessionFromData = (session: SupabaseService.DbStockConferenceSession): boolean => {
    if (!session) return false;
    const prodMap = new Map<string, Product>();
    const barcodeMap = new Map<string, string>();
    (session.products || []).forEach(prod => {
      if (!prod || !prod.reduced_code) return;
      prodMap.set(prod.reduced_code, {
        reducedCode: prod.reduced_code,
        barcode: prod.barcode || '',
        description: prod.description || 'Sem descrição'
      });
      if (prod.barcode) {
        barcodeMap.set(prod.barcode, prod.reduced_code);
      }
    });

    const inventoryMap = new Map<string, StockItem>();
    (session.inventory || []).forEach(entry => {
      if (!entry || !entry.reduced_code) return;
      inventoryMap.set(entry.reduced_code, {
        reducedCode: entry.reduced_code,
        systemQty: entry.system_qty,
        countedQty: entry.counted_qty,
        status: entry.status,
        lastUpdated: entry.last_updated ? new Date(entry.last_updated) : null
      });
    });

    if (!prodMap.size || !inventoryMap.size) return false;

    setMasterProducts(prodMap);
    setBarcodeIndex(barcodeMap);
    setInventory(inventoryMap);
    const branchValue = session.branch || '';
    let resolvedCompanyId = session.company_id || '';
    let resolvedAreaName = session.area || '';

    if ((!resolvedCompanyId || !resolvedAreaName) && branchValue) {
      const match = findCompanyAreaByBranch(branchValue, companies || []);
      if (match) {
        if (!resolvedCompanyId) resolvedCompanyId = match.companyId;
        if (!resolvedAreaName) resolvedAreaName = match.areaName;
      }
    }

    setSelectedCompanyId(resolvedCompanyId);
    setBranch(branchValue);
    setSelectedAreaName(resolvedAreaName);
    setPharmacist(session.pharmacist || '');
    setManager(session.manager || '');
    setRecountTargets(new Set(session.recount_targets || []));
    const restoredStep = session.step === 'report' ? 'divergence' : (session.step as AppStep || 'conference');
    setStep(restoredStep);
    setSessionId(session.id || null);
    setPendingSync(!!session.pending_sync);
    const ts = getSessionTimestamp(session);
    lastSyncTimestampRef.current = ts;
    manualSessionStartedRef.current = true;

    stockDebugLog('✅ Session restored from data:', { id: session.id, products: prodMap.size, inventory: inventoryMap.size });
    return true;
  };

  useEffect(() => {
    if (!userEmail) {
      stockDebugLog("⚠️ No userEmail, skipping session load");
      return;
    }

    let isMounted = true;
    const loadSession = async () => {
      stockDebugLog("🔍 Attempting to load session for:", userEmail, "manualStarted:", manualSessionStartedRef.current);

      if (manualSessionStartedRef.current) {
        const hasInMemorySession = Boolean(sessionId) || masterProducts.size > 0 || inventory.size > 0;
        if (hasInMemorySession) {
          stockDebugLog("ℹ️ Skipping load - manual session already started with in-memory data");
          return;
        }
        stockDebugLog("⚠️ Manual session flag was set without in-memory data. Unlocking auto-restore.");
        manualSessionStartedRef.current = false;
      }

      let supabaseSession: SupabaseService.DbStockConferenceSession | null = null;
      try {
        stockDebugLog("🔄 Fetching session from Supabase...");
        supabaseSession = await SupabaseService.fetchStockConferenceSession(userEmail);
        if (!isMounted) {
          stockDebugLog("⚠️ Component unmounted, aborting load");
          return;
        }
      } catch (error) {
        console.error("❌ Error loading session from Supabase:", error);
      }

      if (!isMounted) return;

      // Mudança para IndexedDB (Async)
      const localSession = await StockStorage.loadLocalStockSession(userEmail || '');
      const supabaseTimestamp = getSessionTimestamp(supabaseSession);
      const localTimestamp = getSessionTimestamp(localSession);
      const supabaseScore = getSessionProgressScore(supabaseSession);
      const localScore = getSessionProgressScore(localSession);

      const supabaseCandidate = {
        session: supabaseSession,
        source: "supabase" as const,
        timestamp: supabaseTimestamp,
        score: supabaseScore
      };
      const localCandidate = {
        session: localSession,
        source: "local" as const,
        timestamp: localTimestamp,
        score: localScore
      };

      const orderedCandidates =
        localScore > supabaseScore || (localScore === supabaseScore && localTimestamp > supabaseTimestamp)
          ? [localCandidate, supabaseCandidate]
          : [supabaseCandidate, localCandidate];

      for (const candidate of orderedCandidates) {
        if (!candidate.session) continue;
        if (!isMounted) break;

        // --- NOVA LÓGICA DE AUTO-DETECÇÃO DE SALVAMENTO ---
        // Verifica se já existe um relatório finalizado para esta sessão
        if (candidate.session.branch) {
          try {
            const recentReports = await SupabaseService.fetchUserStockReportsSummary(userEmail || '', 5);
            const isAlreadySaved = recentReports.some(report => {
              const reportBranch = (report.branch || '').trim().toLowerCase();
              const sessionBranch = (candidate.session!.branch || '').trim().toLowerCase();
              const reportArea = (report.area || '').trim().toLowerCase();
              const sessionArea = (candidate.session!.area || '').trim().toLowerCase();
              
              if (reportBranch !== sessionBranch || reportArea !== sessionArea) return false;

              // Compara timestamps
              const sessionUpdate = new Date(candidate.session!.updated_at || candidate.session!.created_at || 0).getTime();
              const reportCreation = new Date(report.created_at || 0).getTime();
              
              // Se o relatório foi criado nos últimos 60 minutos e DEPOIS da última atualização da sessão
              // ou muito próximo (buffer de 5 min para clocks diferentes), consideramos que já foi salvo.
              const isRecent = (Date.now() - reportCreation) < 3600000;
              const isAfterSession = reportCreation > (sessionUpdate - 300000);
              
              return isRecent && isAfterSession;
            });

            if (isAlreadySaved) {
              stockDebugLog("✨ Auto-discarding session: A matching report was found in the database.");
              if (candidate.source === "local") {
                await StockStorage.clearLocalStockSession(userEmail || '');
              }
              await SupabaseService.deleteStockConferenceSession(userEmail || '');
              continue; // Tenta o próximo candidato ou encerra
            }
          } catch (e) {
            console.error("Erro na auto-detecção de salvamento:", e);
          }
        }
        // ------------------------------------------------

        const restored = restoreSessionFromData(candidate.session);
        if (!restored) continue;
        stockDebugLog(`✅ Session restored from ${candidate.source === "local" ? "IndexedDB" : "Supabase"}`);
        if (candidate.source === "local") {
          stockDebugLog("🔁 Local session has priority, syncing it back to Supabase...");
          await persistSession();
        } else {
          await StockStorage.saveLocalStockSession(userEmail || '', candidate.session);
        }
        return;
      }

      stockDebugLog("⚠️ No session found in Supabase or IndexedDB.");
    };

    loadSession();

    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) {
        stockDebugLog("🌐 Network back online, triggering sync...");
        void persistSession();
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      isMounted = false;
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, [userEmail, companies]);

  const persistSession = async (options?: {
    step?: AppStep;
    inventoryOverride?: Map<string, StockItem>;
    productOverride?: Map<string, Product>;
    recountOverride?: Set<string>;
    skipSupabase?: boolean;
  }) => {
    if (!userEmail) {
      console.error('❌ persistSession blocked: userEmail is missing.');
      return;
    }
    const currentStep = options?.step || step;
    if (currentStep === 'report') {
      return;
    }
    const productSource = options?.productOverride || masterProducts;
    const inventorySource = options?.inventoryOverride || inventory;

    // Allow saving empty session if step implies we are setting up, or prevent saving nothing?
    // If clearing, we might want to save an empty state. But here we check size > 0.
    if (productSource.size === 0 && inventorySource.size === 0) {
      stockDebugLog('⚠️ persistSession ignored: No products or inventory to save.');
      return;
    }

    setIsSavingSession(true);
    const now = new Date().toISOString();
    const payload: SupabaseService.DbStockConferenceSession = {
      id: sessionId || undefined,
      user_email: userEmail,
      branch: branch || 'Filial não informada',
      area: selectedAreaName || null,
      company_id: selectedCompanyId || null,
      pharmacist: pharmacist || 'Farmacêutico não informado',
      manager: manager || 'Gestor não informado',
      products: Array.from(productSource.values()).map((prod: Product) => ({
        reduced_code: prod.reducedCode,
        barcode: prod.barcode || null,
        description: prod.description || null
      })),
      inventory: Array.from(inventorySource.values()).map((item: StockItem) => ({
        reduced_code: item.reducedCode,
        system_qty: item.systemQty,
        counted_qty: item.countedQty,
        status: item.status,
        last_updated: item.lastUpdated ? item.lastUpdated.toISOString() : null
      })),
      recount_targets: Array.from(options?.recountOverride || recountTargets),
      step: options?.step || step,
      updated_at: now
    };

    // Save to IndexedDB (Async)
    await StockStorage.saveLocalStockSession(userEmail, payload);
    stockDebugLog('💾 Session saved to IndexedDB');

    if (options?.skipSupabase) {
      setIsSavingSession(false);
      return; // Fast return to save bandwidth
    }

    stockDebugLog('🔄 Persisting stock session to Supabase...', {
      email: userEmail,
      id: sessionId,
      products: payload.products.length,
      inventory: payload.inventory.length
    });

    try {
      const nowMs = Date.now();
      const isOnlineNow = typeof navigator !== 'undefined' && navigator.onLine;
      
      if (!isOnlineNow) {
        stockDebugLog('📡 Offline mode: Saving ONLY to IndexedDB with pendingSync flag');
        await StockStorage.saveLocalStockSession(userEmail, payload, true);
        setPendingSync(true);
        setIsSavingSession(false);
        return;
      }

      setIsSyncing(true);
      const shouldCheckConflict = nowMs - lastConflictCheckRef.current > 20000;
      let isConflict = false;
      if (shouldCheckConflict) {
        lastConflictCheckRef.current = nowMs;
        const remoteSession = await SupabaseService.fetchStockConferenceSession(userEmail);
        const remoteTs = getSessionTimestamp(remoteSession);

        // Buffer para evitar falsos positivos por latência/clock drift
        const SYNC_BUFFER_MS = 5000;
        isConflict = remoteTs > (lastSyncTimestampRef.current + SYNC_BUFFER_MS);
      }

      if (isConflict) {
        const proceed = window.confirm(
          '⚠️ Conflito de Sincronização:\n\n' +
          'Esta sessão foi atualizada em outro dispositivo (ou aba).\n' +
          'Deseja sobrescrever as alterações remotas com o que você tem agora?'
        );
        if (!proceed) {
          setIsSavingSession(false);
          setIsSyncing(false);
          return;
        }
      }

      const saved = await SupabaseService.upsertStockConferenceSession(payload);
      if (saved?.id) {
        setSessionId(saved.id);
        const newTs = getSessionTimestamp(saved);
        lastSyncTimestampRef.current = newTs;
        setPendingSync(false);
        // Limpa flag de pendência no local também
        await StockStorage.saveLocalStockSession(userEmail, payload, false);
        stockDebugLog('✅ Stock session saved to Supabase! ID:', saved.id);
      } else {
        console.error('❌ Supabase returned null - check error details');
      }
    } catch (error: any) {
      console.error('❌ Error persisting session to Supabase (possibly network drop):', error);
      // Em caso de erro de rede, garante salvamento local com flag
      await StockStorage.saveLocalStockSession(userEmail, payload, true);
      setPendingSync(true);
    } finally {
      setIsSavingSession(false);
      setIsSyncing(false);
    }
  };



  useEffect(() => {
    const currentUser = userEmail || null;
    const previousUser = previousUserEmailRef.current;
    if (previousUser === null) {
      previousUserEmailRef.current = currentUser;
      return;
    }

    if (previousUser !== currentUser) {
      resetConferenceState();
      setIsLoading(false);
      setIsSavingSession(false);
      setIsDirty(false);
      setErrorMsg('');
      lastSyncTimestampRef.current = 0;
      lastConflictCheckRef.current = 0;
      signatureHashRef.current = '';
    }

    previousUserEmailRef.current = currentUser;
  }, [userEmail]);

  const handleRestartSession = async () => {
    if (!window.confirm('Atenção: recomeçar a contagem perderá todos os itens bipados. Deseja continuar?')) {
      return;
    }

    await resetConferenceState();
    if (userEmail) {
      SupabaseService.insertAppEventLog({
        company_id: selectedCompanyId || null,
        branch: branch || null,
        area: selectedAreaName || null,
        user_email: userEmail,
        user_name: userName || null,
        app: 'conferencia',
        event_type: 'stock_conference_restarted',
        entity_type: 'stock_session',
        entity_id: branch || null,
        status: 'success',
        success: true,
        source: 'web'
      }).catch(() => { });
    }
  };

  // --- Handlers: File Upload ---

  const processFile = async (file: File): Promise<any[]> => {
    const name = file.name.toLowerCase();

    if (name.endsWith('.html') || name.endsWith('.htm')) {
      const text = await file.text();
      return parseHTML(text);
    } else if (name.endsWith('.xls') || name.endsWith('.xlsx')) {
      return parseExcel(file);
    } else {
      // Default to CSV
      const text = await file.text();
      return parseCSV(text);
    }
  };

  const handleFileUpload = async () => {
    const productSourceFile = effectiveProductFile;
    if (!productSourceFile || !stockFile) {
      setErrorMsg("Selecione o arquivo de estoque e utilize um cadastro de produtos (upload local ou base global).");
      return;
    }

    // Validate Header Info
    if (!branch.trim() || !pharmacist.trim() || !manager.trim()) {
      setErrorMsg("Por favor, preencha as informações da Filial e Responsáveis.");
      return;
    }

    // Start Loading
    setIsLoading(true);
    setErrorMsg('');
    manualSessionStartedRef.current = true;

    // Small timeout to allow UI to render the loading state before heavy processing
    setTimeout(async () => {
      try {
        // --- 1. PRODUCT FILE ---
        const pData = await processFile(productSourceFile);
        if (!pData || pData.length === 0) throw new Error("Arquivo de Produtos vazio ou inválido.");

        const pMap = new Map<string, Product>();
        const bMap = new Map<string, string>();

        const isProdExcel = productSourceFile.name.match(/\.(xls|xlsx)$/i);

        pData.forEach(row => {
          let reduced = '', barcode = '', desc = '';

          if (isProdExcel) {
            reduced = String(row['C'] || '').trim();
            barcode = String(row['K'] || '').trim();
            if (row['D']) desc = String(row['D']).trim();
            else if (row['B']) desc = String(row['B']).trim();
            else if (row['A']) desc = String(row['A']).trim();

            if (!/[0-9]/.test(reduced)) return;
            if (reduced.toLowerCase().includes('reduz') || reduced.toLowerCase().includes('cod')) return;

          } else {
            Object.keys(row).forEach(k => {
              const norm = normalizeHeader(k);
              const val = row[k];
              if (norm === 'reducedCode') reduced = String(val).trim();
              if (norm === 'barcode') barcode = String(val).trim();
              if (norm === 'description') desc = String(val).trim();
            });
          }

          if (reduced && reduced !== 'undefined' && reduced !== '') {
            pMap.set(reduced, { reducedCode: reduced, barcode, description: desc || 'Sem descrição' });
            if (barcode && barcode !== 'undefined' && barcode !== '') bMap.set(barcode, reduced);
          }
        });

        // --- 2. STOCK FILE ---
        const sData = await processFile(stockFile);
        if (!sData || sData.length === 0) throw new Error("Arquivo de Estoque vazio ou inválido.");

        const iMap = new Map<string, StockItem>();
        const isStockExcel = stockFile.name.match(/\.(xls|xlsx)$/i);

        sData.forEach(row => {
          let reduced = '', qty = 0, stockDesc = '';

          if (isStockExcel) {
            reduced = String(row['B'] || '').trim();
            // CONDITIONAL LOGIC FOR CONTROLLED PRODUCTS
            const val = isControlledStock ? row['L'] : row['O'];
            qty = safeParseFloat(val);

            if (row['C']) stockDesc = String(row['C']).trim();

            if (!/[0-9]/.test(reduced)) return;
            if (reduced.length > 20) return;
            if (reduced.toLowerCase().includes('cod')) return;

          } else {
            Object.keys(row).forEach(k => {
              const norm = normalizeHeader(k);
              const val = row[k];
              if (norm === 'reducedCode') reduced = String(val).trim();
              if (norm === 'qty') {
                qty = safeParseFloat(val);
              }
            });
          }

          if (reduced && reduced !== 'undefined' && reduced !== '') {
            // Update Master Product description if missing and present in stock file
            if (stockDesc && pMap.has(reduced)) {
              const prod = pMap.get(reduced)!;
              if (prod.description === 'Sem descrição' || prod.description === '') {
                prod.description = stockDesc;
                pMap.set(reduced, prod);
              }
            } else if (stockDesc && !pMap.has(reduced)) {
              pMap.set(reduced, { reducedCode: reduced, barcode: '', description: stockDesc });
            }

            const existingItem = iMap.get(reduced);
            if (existingItem) {
              existingItem.systemQty += qty;
              existingItem.systemQty = Math.round(existingItem.systemQty * 100) / 100;
            } else {
              iMap.set(reduced, {
                reducedCode: reduced,
                systemQty: qty,
                countedQty: 0,
                lastUpdated: null,
                status: 'pending'
              });
            }
          }
        });

        if (pMap.size === 0) throw new Error("Sem produtos válidos. Verifique as colunas (C=Reduzido, K=Barras).");
        if (iMap.size === 0) throw new Error("Sem estoque válido. Verifique as colunas (B=Reduzido, O=Qtd).");

        setMasterProducts(pMap);
        setBarcodeIndex(bMap);
        setInventory(iMap);
        setRecountTargets(new Set()); // Clear recount on new upload
        setStep('conference');
        await persistSession({
          step: 'conference',
          inventoryOverride: iMap,
          productOverride: pMap,
          recountOverride: new Set()
        });
        if (userEmail) {
          SupabaseService.insertAppEventLog({
            company_id: selectedCompanyId || null,
            branch: branch || null,
            area: selectedAreaName || null,
            user_email: userEmail,
            user_name: userName || null,
            app: 'conferencia',
            event_type: 'stock_conference_started',
            entity_type: 'stock_session',
            entity_id: branch || null,
            status: 'success',
            success: true,
            source: 'web',
            event_meta: {
              product_file: productSourceFile?.name || null,
              product_source: productFile ? 'local_upload' : 'global_base',
              stock_file: stockFile?.name || null
            }
          }).catch(() => { });
        }
      } catch (e: any) {
        console.error("Erro:", e);
        setErrorMsg(e.message || "Erro desconhecido.");
        manualSessionStartedRef.current = false;
      } finally {
        setIsLoading(false);
      }
    }, 100);
  };

  // --- Handlers: Conference ---

  const findProduct = (code: string): Product | undefined => {
    if (masterProducts.has(code)) return masterProducts.get(code);
    if (barcodeIndex.has(code)) {
      const reduced = barcodeIndex.get(code);
      if (reduced) return masterProducts.get(reduced);
    }
    return undefined;
  };

  const processScannedCode = (rawCode: string, notifyErrors = true): 'accumulated' | 'quantity' | 'invalid' => {
    const code = rawCode.trim();
    if (!code) return 'invalid';

    const product = findProduct(code);
    if (product) {
      if (!inventory.has(product.reducedCode)) {
        playSound('error');
        if (notifyErrors) {
          alert(`O produto "${product.description}" (Red: ${product.reducedCode}) não consta na lista de estoque carregada. Contagem não permitida para itens fora da lista.`);
        } else {
          alert(`Produto fora da contagem: "${product.description}" (Red: ${product.reducedCode}).`);
          setCameraStatusMsg('Produto fora da lista de estoque desta conferência.');
        }
        setScanInput('');
        return 'invalid';
      }

      if (accumulationMode) {
        void applyAccumulation(product);
        setActiveItem(null);
        setCountInput('');
        setScanInput('');
        setTimeout(() => inputRef.current?.focus(), 50);
        return 'accumulated';
      }

      setActiveItem(product);
      setScanInput('');
      setCountInput('');
      setTimeout(() => countRef.current?.focus(), 50);
      return 'quantity';
    }

    playSound('error');
    if (notifyErrors) {
      alert("Produto não encontrado na base de cadastro!");
    } else {
      setCameraStatusMsg('Código não encontrado. Ajuste foco/iluminação e tente novamente.');
    }
    setScanInput('');
    return 'invalid';
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processScannedCode(scanInput, true);
  };

  const clearCameraResources = useCallback((closeModal = false) => {
    if (cameraLoopRef.current !== null) {
      window.clearInterval(cameraLoopRef.current);
      cameraLoopRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }
    if (closeModal) {
      setIsCameraOpen(false);
      setLightAssistEnabled(false);
      setCameraStatusMsg('Posicione o código de barras dentro do quadro.');
    }
    lastDetectedCodeRef.current = '';
  }, []);

  const stopCameraScanner = useCallback(() => {
    clearCameraResources(true);
  }, [clearCameraResources]);

  const startCameraScanner = useCallback(async () => {
    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      setCameraStatusMsg('Seu navegador não suporta leitura direta por câmera. Use scanner físico ou digitação.');
      setIsCameraOpen(true);
      return;
    }

    try {
      clearCameraResources(false);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      }

      cameraStreamRef.current = stream;
      setIsCameraOpen(true);
      setCameraStatusMsg('Câmera ativa. Mire no código para bipar.');

      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {
            setCameraStatusMsg('Não foi possível iniciar a reprodução da câmera.');
          });
        }
      }, 50);

      if (!barcodeDetectorRef.current) {
        barcodeDetectorRef.current = new BarcodeDetectorCtor({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e']
        });
      }
      const lastDetectedAtRef = { current: 0 };

      cameraLoopRef.current = window.setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2 || !barcodeDetectorRef.current) return;

        try {
          const detections = await barcodeDetectorRef.current.detect(video);
          const firstCode = String(detections?.[0]?.rawValue || '').trim();
          if (!firstCode) return;
          const now = Date.now();
          if (firstCode === lastDetectedCodeRef.current && now - lastDetectedAtRef.current < 1200) return;

          lastDetectedCodeRef.current = firstCode;
          lastDetectedAtRef.current = now;
          const result = processScannedCode(firstCode, false);
          if (result === 'accumulated') {
            setCameraStatusMsg(`Somado via acúmulo (${firstCode}). Pode bipar o próximo.`);
            window.setTimeout(() => {
              // Libera novo bip em sequência (inclusive mesmo SKU) sem duplicar leitura instantânea.
              lastDetectedCodeRef.current = '';
            }, 700);
            return;
          }

          if (result === 'quantity') {
            setCameraStatusMsg(`Código lido: ${firstCode}`);
            stopCameraScanner();
          }
        } catch {
          // Ignora falhas pontuais de detecção para manter loop leve.
        }
      }, 250);
    } catch {
      setIsCameraOpen(true);
      setCameraStatusMsg('Permissão de câmera negada ou indisponível neste dispositivo.');
    }
  }, [clearCameraResources, processScannedCode, stopCameraScanner]);

  useEffect(() => {
    return () => {
      if (cameraLoopRef.current !== null) {
        window.clearInterval(cameraLoopRef.current);
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (step !== 'conference' && isCameraOpen) {
      stopCameraScanner();
    }
  }, [isCameraOpen, step, stopCameraScanner]);

  useEffect(() => {
    if (!isCameraOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [isCameraOpen]);

  const ensureSessionStart = () => {
    if (!sessionStartTime) {
      setSessionStartTime(Date.now());
    }
  };

  const applyAccumulation = async (product: Product) => {
    ensureSessionStart();
    const currentStock = inventory.get(product.reducedCode);
    if (!currentStock) return;

    const nextQty = (currentStock.countedQty || 0) + 1;
    const status = nextQty === currentStock.systemQty ? 'matched' : 'divergent';

    const updatedItem: StockItem = {
      ...currentStock,
      countedQty: nextQty,
      status,
      lastUpdated: new Date()
    };

    const updatedInventory = new Map(inventory);
    updatedInventory.set(product.reducedCode, updatedItem);

    setInventory(updatedInventory);
    setIsDirty(true);
    setLastScanned({ item: updatedItem, product });
    playAccumulationBeep();

    // Check if phase 1 is complete
    let pendingCount = 0;
    updatedInventory.forEach(i => { if (i.status === 'pending') pendingCount++; });
    const isComplete = pendingCount === 0;

    if (isComplete) {
      setStep('divergence');
    }

    // Auto-save after accumulation (IndexedDB only, Supabase is debounced globally)
    await persistSession({ inventoryOverride: updatedInventory, step: isComplete ? 'divergence' : 'conference', skipSupabase: true });
    if (userEmail) {
      SupabaseService.insertAppEventLog({
        company_id: selectedCompanyId || null,
        branch: branch || null,
        area: selectedAreaName || null,
        user_email: userEmail,
        user_name: userName || null,
        app: 'conferencia',
        event_type: 'stock_item_count_updated',
        entity_type: 'stock_item',
        entity_id: product.reducedCode,
        status: 'success',
        success: true,
        source: 'web',
        event_meta: {
          reduced_code: product.reducedCode,
          counted_qty: updatedItem.countedQty,
          system_qty: updatedItem.systemQty
        }
      }).catch(() => { });
    }
  };

  const handleQuantitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;

    ensureSessionStart();
    const qty = parseFloat(countInput);
    if (isNaN(qty)) return;

    const currentInv = inventory.get(activeItem.reducedCode);
    const systemQty = currentInv ? currentInv.systemQty : 0;
    const status = qty === systemQty ? 'matched' : 'divergent';

    // Play sound based on status
    playSound(status === 'matched' ? 'success' : 'error');

    const newItem: StockItem = {
      reducedCode: activeItem.reducedCode,
      systemQty: systemQty,
      countedQty: qty,
      lastUpdated: new Date(),
      status: status
    };
    const updatedInventory = new Map(inventory);
    updatedInventory.set(activeItem.reducedCode, newItem);
    setInventory(updatedInventory);
    setIsDirty(true);
    setLastScanned({ item: newItem, product: activeItem });

    setActiveItem(null);
    setCountInput('');

    // Check if phase 1 is complete
    let pendingCount = 0;
    updatedInventory.forEach(i => { if (i.status === 'pending') pendingCount++; });
    const isComplete = pendingCount === 0;

    if (isComplete) {
      setStep('divergence');
    }

    // Auto-save after each item counted (IndexedDB only, Supabase is debounced globally)
    await persistSession({ inventoryOverride: updatedInventory, step: isComplete ? 'divergence' : 'conference', skipSupabase: true });
    if (userEmail) {
      SupabaseService.insertAppEventLog({
        company_id: selectedCompanyId || null,
        branch: branch || null,
        area: selectedAreaName || null,
        user_email: userEmail,
        user_name: userName || null,
        app: 'conferencia',
        event_type: 'stock_item_count_updated',
        entity_type: 'stock_item',
        entity_id: activeItem.reducedCode,
        status: 'success',
        success: true,
        source: 'web',
        event_meta: {
          reduced_code: activeItem.reducedCode,
          counted_qty: newItem.countedQty,
          system_qty: newItem.systemQty
        }
      }).catch(() => { });
    }

    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleZeroPending = () => {
    alert('Ação bloqueada! Não é permitido zerar a 1ª fase.');
    playSound('error');
  };

  const handleRecountAllDivergences = () => {
    // 1. Check for pending items (Rule: Cannot recount if pending items exist)
    let pendingCount = 0;
    inventory.forEach(i => { if (i.status === 'pending') pendingCount++; });

    if (pendingCount > 0) {
      playSound('error');
      alert(`Ação Bloqueada!\n\nAinda existem ${pendingCount} itens pendentes de contagem.\n\nRegra: Não é permitido iniciar recontagens sem terminar a contagem inicial de todos os produtos.\n\nSolução: Bipe os itens faltantes ou use a opção "Zerar Itens Pendentes" para encerrar a 1ª fase.`);
      return;
    }

    // 2. Identify divergent items
    const divergentKeys = new Set<string>();
    inventory.forEach((item, key) => {
      if (item.status === 'divergent') {
        divergentKeys.add(key);
      }
    });

    if (divergentKeys.size === 0) {
      alert("Não há itens divergentes para recontar.");
      return;
    }

    // 3. Reset those items in the inventory map
    const newInventory = new Map<string, StockItem>(inventory);
    divergentKeys.forEach(key => {
      const item = newInventory.get(key);
      if (item) {
        newInventory.set(key, {
          ...item,
          countedQty: 0,
          status: 'pending',
          lastUpdated: null // This ensures they show up as "pending" in stats
        });
      }
    });

    // 4. Update all states
    setInventory(newInventory);
    setIsDirty(true);
    setRecountTargets(divergentKeys);
    setLastScanned(null); // Clear history for fresh start
    setActiveItem(null);
    setScanInput('');
    setStep('conference');
    void persistSession({ inventoryOverride: newInventory, step: 'conference', recountOverride: divergentKeys });

    // 5. Focus
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleFinalize = async () => {
    // 1. Strict Check: Phase 1 Completion (No Pending items allowed)
    const pendingCount = Array.from(inventory.values()).filter((i: StockItem) => i.status === 'pending').length;

    if (pendingCount > 0) {
      playSound('error');
      alert(`Ação Bloqueada!\n\nExistem ${pendingCount} itens com status pendente.\n\nRegra: Não é permitido finalizar com itens não contados.\nSe estiver na Fase 1: Termine de contar ou zere os pendentes.\nSe estiver na Fase 2: Termine a recontagem de todos os itens.`);
      return;
    }

    // 2. Strict Check: Phase 2 Requirement (If Divergences exist, Recount must have been initiated)
    const divergentCount = Array.from(inventory.values()).filter((i: StockItem) => i.status === 'divergent').length;

    if (divergentCount > 0 && !stats.isRecount) {
      playSound('error');
      alert("Ação Bloqueada!\n\nForam encontradas divergências após a contagem inicial.\n\nRegra: É obrigatório iniciar e concluir a recontagem (2ª Fase) das divergências antes de finalizar.\n\nClique em 'Recontar Todas as Divergências' para prosseguir.");
      return;
    }

    // If passed all checks, simply go to report screen to collect signatures.
    // The actual save will happen when they download the definite report.
    setStep('report');
  };

  const saveDefinitiveReport = async (): Promise<boolean> => {
    if (lastSavedReportId) return true; // Já salvo corretamente
    if (isSavingStockReport) return false;

    setIsSavingStockReport(true);
    let reportSaved = false;

    // Define all variables outside try so catch can use them
    const allItems = Array.from(inventory.values());
    const matched = allItems.filter(item => item.status === 'matched').length;
    const divergent = allItems.filter(item => item.status === 'divergent').length;
    const pending = allItems.filter(item => item.status === 'pending').length;
    const finalizedAt = new Date();
    const startTimestamp = sessionStartTime ? new Date(sessionStartTime).toISOString() : null;
    const endTimestamp = finalizedAt.toISOString();
    const durationMs = sessionStartTime ? Math.max(0, finalizedAt.getTime() - sessionStartTime) : 0;

    const summary = {
      total: allItems.length,
      matched,
      divergent,
      pending,
      percent: stats.percent,
      duration_ms: durationMs,
      durationMs,
      started_at: startTimestamp,
      startedAt: startTimestamp,
      ended_at: endTimestamp,
      endedAt: endTimestamp,
      signatures: {
        pharmacist: pharmSignature,
        manager: managerSignature
      }
    };

    const inventorySnapshot = allItems.map(item => {
      const product = masterProducts.get(item.reducedCode);
      return {
        reduced_code: item.reducedCode,
        barcode: product?.barcode || null,
        description: product?.description || null,
        system_qty: item.systemQty,
        counted_qty: item.countedQty,
        status: item.status,
        difference: item.countedQty - item.systemQty,
        last_updated: item.lastUpdated ? item.lastUpdated.toISOString() : null
      };
    });

    const payload = {
      user_email: userEmail?.trim() || 'desconhecido@empresa.com',
      user_name: userName?.trim() || 'Operador',
      branch: branch || 'Filial não informada',
      area: selectedAreaName || 'Área não informada',
      pharmacist: pharmacist || 'Farmacêutico não informado',
      manager: manager || 'Gestor não informado',
      summary,
      items: inventorySnapshot
    };

    try {
      const isOnlineNow = typeof navigator !== 'undefined' && navigator.onLine;

      if (!isOnlineNow) {
        stockDebugLog('📡 Offline mode: Saving report to Pending Queue');
        const pendingId = await StockStorage.savePendingStockReport(payload);
        setLastSavedReportId(pendingId);
        setLastSavedSummary(summary);
        reportSaved = true;

        alert('⚠️ RELATÓRIO SALVO LOCALMENTE\n\nIdentificamos que você está sem internet. Sua conferência foi salva no computador e será enviada automaticamente para o banco de dados assim que a conexão voltar.');
        
        if (onReportSaved) {
          await onReportSaved();
        }

        await StockStorage.clearLocalStockSession(userEmail || '');
        return true;
      }

      const saved = await SupabaseService.createStockConferenceReport(payload);
      if (!saved) {
        throw new Error('Falha ao salvar no servidor (Status 530/502/Timeout)');
      }

      reportSaved = true;
      setLastSavedReportId(saved.id || null);
      setLastSavedSummary(summary);

      if (onReportSaved) {
        await onReportSaved();
      }

      if (userEmail) {
        SupabaseService.insertAppEventLog({
          company_id: selectedCompanyId || null,
          branch: branch || null,
          area: selectedAreaName || null,
          user_email: userEmail,
          user_name: userName || null,
          app: 'conferencia',
          event_type: 'stock_conference_finished',
          entity_type: 'stock_report',
          entity_id: saved.id || null,
          status: 'success',
          success: true,
          source: 'web',
          event_meta: { total: summary.total, matched: summary.matched, divergent: summary.divergent }
        }).catch(() => { });

        await StockStorage.clearLocalStockSession(userEmail);
        try {
          await SupabaseService.deleteStockConferenceSession(userEmail);
        } catch (deleteError) { }
      }
    } catch (error) {
      console.error('Erro ao salvar conferência de estoque definitivo:', error);
      
      // Fallback para salvamento local em caso de erro de rede (502, 530, timeout)
      stockDebugLog('⚠️ Network error during finalization, falling back to local storage');
      
      const pendingId = await StockStorage.savePendingStockReport(payload);
      setLastSavedReportId(pendingId);
      setLastSavedSummary(summary);
      reportSaved = true;
      
      alert('⚠️ RELATÓRIO SALVO COM SUCESSO (LOCAL)\n\nHouve uma falha na comunicação com o servidor, mas não se preocupe: seus dados foram salvos com segurança neste computador. O envio para o banco de dados será concluído automaticamente em instantes.');
      
      if (onReportSaved) {
        await onReportSaved();
      }

      if (userEmail) {
        await StockStorage.clearLocalStockSession(userEmail);
      }
    } finally {
      setIsSavingStockReport(false);
      if (reportSaved) {
        setIsDirty(false);
        manualSessionStartedRef.current = false;
        setSessionId(null);
      }
    }
    return reportSaved;
  };

  // Helper to determine display color for divergence
  const getDivergenceColor = (system: number, counted: number, status: string) => {
    if (status === 'matched') return 'text-green-600';
    if (counted > system) return 'text-blue-600'; // Positive
    return 'text-red-600'; // Negative
  };

  const branchOptions = useMemo(() => {
    if (!selectedCompanyId) return [];
    const company = companies.find(c => c.id === selectedCompanyId);
    if (!company || !company.areas) return [];
    const options: { branch: string; area: string }[] = [];
    company.areas.forEach(area => {
      (area.branches || []).forEach(branchName => {
        const normalized = branchName?.trim();
        if (!normalized) return;
        if (!options.some(opt => opt.branch === normalized)) {
          options.push({ branch: normalized, area: area.name });
        }
      });
    });
    return options;
  }, [companies, selectedCompanyId]);

  const effectiveProductFile = productFile || globalProductFile;

  const formatGlobalTimestamp = useCallback((value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR');
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) {
      setGlobalProductMeta(null);
      setGlobalProductFile(null);
      return;
    }

    let cancelled = false;
    const loadGlobalCadastro = async () => {
      setIsLoadingGlobalProduct(true);
      try {
        const globalCadastro = await CadastrosBaseService.getGlobalBaseFileCached(selectedCompanyId, GLOBAL_CADASTRO_MODULE_KEY);
        if (cancelled) return;
        setGlobalProductMeta(globalCadastro);
        if (globalCadastro) {
          const decoded = decodeGlobalFileToBrowserFile(globalCadastro);
          setGlobalProductFile(decoded);
        } else {
          setGlobalProductFile(null);
        }
      } catch (error) {
        console.error('Erro ao carregar base global da conferência:', error);
        if (!cancelled) {
          setGlobalProductMeta(null);
          setGlobalProductFile(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingGlobalProduct(false);
        }
      }
    };

    loadGlobalCadastro();
    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId]);

  const handleBranchValueChange = (value: string) => {
    setBranch(value);
    const match = branchOptions.find(opt => opt.branch === value);
    setSelectedAreaName(match?.area || '');
  };

  // --- Render Helpers ---

  const renderSetup = () => (
    <div className="flex flex-col items-center justify-center min-h-full max-w-2xl mx-auto p-6 overflow-y-auto w-full">
      {pendingReportsCount > 0 && (
        <div className="w-full mb-8 bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 shadow-sm animate-pulse-subtle">
          <div className="flex items-start gap-4">
            <div className="bg-amber-100 p-3 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-amber-900 font-black text-lg uppercase tracking-tight mb-1">
                AÇÃO NECESSÁRIA: SINCRONIZAÇÃO PENDENTE ({pendingReportsCount})
              </h4>
              <p className="text-amber-800 text-sm leading-relaxed mb-4">
                Você possui {pendingReportsCount === 1 ? 'um relatório' : `${pendingReportsCount} relatórios`} que já foi finalizado mas ainda não foi enviado ao servidor principal.
                <br /><br />
                Para garantir a integridade dos dados, <strong>você deve sincronizar</strong> esses dados abaixo antes de iniciar um novo trabalho.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleManualSyncClick}
                  disabled={isSyncingManual}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isSyncingManual ? (
                    <Clock className="w-3 h-3 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3" />
                  )}
                  {isSyncingManual ? 'SINCRONIZANDO...' : 'SINCRONIZAR AGORA'}
                </button>
                <div className="bg-amber-100/50 px-4 py-2 rounded-lg border border-amber-200 text-amber-800 text-[10px] font-bold flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping" />
                  AGUARDANDO CONEXÃO AUTOMÁTICA
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-blue-900 mb-2">Conferência de Farmácia</h1>
        <p className="text-gray-500">Informe os dados e importe os arquivos para iniciar.</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full mb-8">
        <h3 className="font-semibold text-gray-700 mb-4 flex items-center border-b pb-2">
          <User className="w-5 h-5 mr-2 text-blue-500" />
          Responsáveis pela Conferência
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Empresa</label>
              <select
                value={selectedCompanyId}
                disabled={pendingReportsCount > 0}
                onChange={(e) => {
                const companyId = e.target.value;
                setSelectedCompanyId(companyId);
                setProductFile(null);
                setBranch('');
                setSelectedAreaName('');
              }}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring focus:ring-blue-100 outline-none bg-white text-gray-900 transition-all"
            >
              <option value="">-- Selecione uma empresa --</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Selecione a empresa para carregar as filiais cadastradas.</p>
          </div>
          {selectedCompanyId && branchOptions.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Filial</label>
              <select
                value={branchOptions.some(opt => opt.branch === branch) ? branch : ''}
                disabled={pendingReportsCount > 0}
                onChange={(e) => handleBranchValueChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring focus:ring-blue-100 outline-none bg-white text-gray-900 transition-all"
              >
                <option value="">-- Escolha uma filial --</option>
                {branchOptions.map(option => (
                  <option key={option.branch} value={option.branch}>
                    {option.branch}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Área</label>
            <input
              type="text"
              value={selectedAreaName}
              disabled
              placeholder="Selecione uma filial para preencher a área automaticamente"
              className="w-full border border-gray-300 rounded-lg p-3 text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Farmacêutico(a)</label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={pharmacist}
                  disabled={pendingReportsCount > 0}
                  onChange={(e) => setPharmacist(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring focus:ring-blue-100 outline-none bg-white text-gray-900"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Gestor(a)</label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={manager}
                  disabled={pendingReportsCount > 0}
                  onChange={(e) => setManager(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring focus:ring-blue-100 outline-none bg-white text-gray-900"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mb-8">
        <div className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-colors ${effectiveProductFile ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-400'}`}>
          <FileSpreadsheet className={`w-10 h-10 mb-3 ${effectiveProductFile ? 'text-green-500' : 'text-gray-400'}`} />
          <h3 className="font-semibold text-gray-700 mb-1 text-sm">Arquivo de Produtos</h3>
          <p className="text-[10px] text-gray-500 text-center mb-3">Base (Excel: C=Red, K=Barra, D=Desc)</p>
          <label className={`cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-xs font-bold transition ${pendingReportsCount > 0 ? 'pointer-events-none opacity-50' : ''}`}>
            {productFile ? productFile.name : effectiveProductFile ? effectiveProductFile.name : 'Selecionar Arquivo'}
            <input 
              type="file" 
              accept=".csv,.txt,.html,.htm,.xls,.xlsx" 
              className="hidden" 
              disabled={pendingReportsCount > 0}
              onChange={(e) => setProductFile(e.target.files?.[0] || null)} 
            />
          </label>
          {isLoadingGlobalProduct && !productFile && (
            <p className="mt-2 text-[10px] text-blue-600 font-semibold">Verificando base global...</p>
          )}
          {!productFile && globalProductMeta && (
            <p className="mt-2 text-[10px] text-emerald-700 font-semibold text-center">
              Já carregado em Cadastros Base Globais
              {formatGlobalTimestamp(globalProductMeta.updated_at || globalProductMeta.uploaded_at) ? ` • ${formatGlobalTimestamp(globalProductMeta.updated_at || globalProductMeta.uploaded_at)}` : ''}
            </p>
          )}
          {productFile && globalProductMeta && (
            <p className="mt-2 text-[10px] text-amber-700 font-semibold text-center">
              Base global também disponível. Este upload local será usado apenas nesta conferência.
            </p>
          )}
        </div>

        <div className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-colors ${stockFile ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-400'}`}>
          <FileSpreadsheet className={`w-12 h-12 mb-4 ${stockFile ? 'text-green-500' : 'text-gray-400'}`} />
          <h3 className="font-semibold text-gray-700 mb-2">Arquivo de Estoque</h3>

          <div className="flex items-center mb-4 bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm w-full max-w-[250px] justify-center">
            <input
              type="checkbox"
              id="controlledStock"
              checked={isControlledStock}
              onChange={(e) => setIsControlledStock(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300 mr-2"
            />
            <label htmlFor="controlledStock" className="text-xs text-gray-600 font-medium cursor-pointer select-none flex items-center">
              <Pill className="w-3 h-3 mr-1 text-blue-500" />
              Produtos Controlados?
            </label>
          </div>

          <p className="text-xs text-gray-500 text-center mb-4">Estoque (Excel: B=Red, {isControlledStock ? 'L' : 'O'}=Qtd)</p>
          <label className={`cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm transition ${pendingReportsCount > 0 ? 'pointer-events-none opacity-50' : ''}`}>
            {stockFile ? stockFile.name : 'Selecionar Arquivo'}
            <input 
              type="file" 
              accept=".csv,.txt,.html,.htm,.xls,.xlsx" 
              className="hidden" 
              disabled={pendingReportsCount > 0}
              onChange={(e) => setStockFile(e.target.files?.[0] || null)} 
            />
          </label>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg flex items-center w-full">
          <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
          <span className="text-sm">{errorMsg}</span>
        </div>
      )}

      <button
        onClick={handleFileUpload}
        disabled={isLoading || pendingReportsCount > 0}
        className={`w-full py-4 rounded-xl text-lg font-bold shadow-lg transition transform active:scale-95 flex items-center justify-center ${isLoading || pendingReportsCount > 0
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
          : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
      >
        {isLoading ? 'Processando...' : 'Iniciar Conferência'}
        {!isLoading && <ArrowRight className="ml-2 w-5 h-5" />}
      </button>

      <div className="mt-8 text-xs text-gray-400 text-center">
        <p>Formatos suportados: CSV, HTML, Excel (.xls, .xlsx)</p>
      </div>
    </div>
  );

  const renderConference = () => {
    // Get System Qty for active item
    const activeSystemQty = activeItem ? (inventory.get(activeItem.reducedCode)?.systemQty || 0) : 0;

    return (
      <div className="flex flex-col h-full bg-gray-100">
        {/* Header Bar */}
        <header className="bg-white shadow-sm p-3 md:p-4 z-10 sticky top-0">
          <div className="flex items-center mb-3 md:mb-0">
            <ClipboardList className="w-6 h-6 text-blue-600 mr-2" />
            <h1 className="font-bold text-gray-800 hidden md:block">Conferência</h1>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            {/* Progress Bar Section - Enhanced */}
            <div className="w-full md:flex-1 md:max-w-xl md:mr-4">
              <div className="flex justify-between text-[11px] md:text-xs text-gray-500 uppercase font-semibold mb-1 gap-2">
                <span className={`${stats.isRecount ? "text-orange-600" : "text-blue-600"} leading-4`}>
                  {stats.isRecount ? 'Progresso Recontagem' : 'Progresso Geral'}
                </span>
                <span className="font-mono text-gray-700 whitespace-nowrap">{stats.counted} / {stats.total} SKUs ({stats.percent}%)</span>
              </div>
              <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden shadow-inner border border-gray-300">
                <div
                  className={`h-full transition-all duration-500 ease-out flex items-center justify-center text-[9px] font-bold text-white uppercase ${stats.isRecount ? 'bg-orange-500' : (stats.percent === 100 ? 'bg-green-500' : 'bg-blue-600')}`}
                  style={{ width: `${stats.percent}%` }}
                >
                  {stats.percent > 10 && `${stats.percent}%`}
                </div>
              </div>
              <p className="text-[11px] md:text-[10px] text-gray-500 mt-1 leading-4">
                Contagem por SKU (produto único), não por unidades.
              </p>
              {/* Auto-save indicator */}
              <div className="flex items-center justify-start md:justify-end mt-1">
                {isSavingSession || isSyncing ? (
                  <span className="text-[10px] text-blue-600 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Sincronizando...
                  </span>
                ) : !isOnline ? (
                  <span className="text-[10px] text-red-600 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    MODO OFFLINE
                  </span>
                ) : pendingSync ? (
                  <span className="text-[10px] text-amber-600 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    PENDENTE DE ENVIO
                  </span>
                ) : (
                  <span className="text-[10px] text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Sincronizado
                  </span>
                )}
              </div>
            </div>

            <div className="w-full md:w-auto md:min-w-[320px]">
              <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleRestartSession}
                  className="bg-red-50 text-red-600 border border-red-200 px-2.5 py-2 rounded-lg text-[11px] md:text-xs font-bold uppercase tracking-wide hover:bg-red-100 transition disabled:opacity-70 text-center"
              >
                Recomeçar contagem
              </button>
              <button
                onClick={() => setStep('divergence')}
                  className="bg-indigo-50 text-indigo-700 px-2.5 py-2 rounded-lg text-[12px] md:text-sm font-medium hover:bg-indigo-100 transition border border-indigo-200 text-center whitespace-nowrap"
              >
                Ver Conferência
              </button>
              </div>
              <p className="text-[10px] text-red-500 uppercase tracking-wide mt-2 md:text-right">
                Aviso: tudo que foi bipado será perdido ao reiniciar.
              </p>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 max-w-5xl mx-auto w-full flex flex-col">

          <div className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col md:flex-row min-h-[400px]">

            {/* Left: Input Section */}
            <div className="p-8 flex-1 flex flex-col justify-center border-b md:border-b-0 md:border-r border-gray-100">

              {!activeItem ? (
                // State: Scan Product
                <div className="flex flex-col h-full justify-center">
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="text-gray-500 text-sm font-semibold uppercase">Bipar Codigo de Barras ou Reduzido</label>
                    <div className="flex items-center gap-2">
                      {stats.isRecount && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-orange-200">Modo Recontagem</span>}
                      <button
                        type="button"
                        onClick={() => setAccumulationMode(prev => !prev)}
                        className={`text-[10px] font-bold uppercase tracking-wide px-3 py-1 rounded-full border transition focus:outline-none ${accumulationMode ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-200 hover:text-blue-600'}`}
                      >
                        {accumulationMode ? 'ACUMULO ATIVO' : 'ATIVAR ACUMULO'}
                      </button>
                    </div>
                  </div>
                  <form onSubmit={handleScanSubmit} className="relative">
                    <Barcode className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-6 h-6" />
                    <input
                      ref={inputRef}
                      autoFocus
                      type="text"
                      value={scanInput}
                      onChange={(e) => setScanInput(e.target.value)}
                      placeholder="Aguardando leitura..."
                      className={`w-full pl-12 pr-4 py-6 text-2xl font-mono border-2 rounded-xl focus:ring transition outline-none text-gray-800 placeholder-gray-300 ${stats.isRecount ? 'border-orange-200 bg-orange-50/30 focus:border-orange-500 focus:ring-orange-200' : 'border-blue-100 bg-blue-50/30 focus:border-blue-500 focus:ring-blue-200'}`}
                    />
                  </form>
                  {isMobileViewport && (
                    <button
                      type="button"
                      onClick={() => void startCameraScanner()}
                      className="mt-3 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                    >
                      <Camera className="w-4 h-4" />
                      Bipar com câmera (celular)
                    </button>
                  )}
                  {isMobileViewport && (
                    <p className="mt-2 text-xs text-gray-500">
                      No celular: ative <strong>ACUMULO</strong> antes para inserir direto e já bipar o próximo.
                    </p>
                  )}
                  {accumulationMode && (
                    <p className="mt-3 text-center text-xs text-emerald-600">
                      Cada bip soma 1 unidade ao produto atual automaticamente.
                    </p>
                  )}
                  <p className="mt-4 text-center text-gray-400 text-sm">
                    Pressione Enter após digitar se não estiver usando scanner.
                  </p>
                </div>
              ) : (
                // State: Enter Quantity
                <div className="flex flex-col h-full justify-center animate-fade-in">
                  <div className="mb-6">
                    <span className={`inline-block px-2 py-1 text-xs font-bold rounded mb-2 ${stats.isRecount ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                      {stats.isRecount ? 'RECONTAGEM' : 'PRODUTO IDENTIFICADO'}
                    </span>
                    <h2 className="text-2xl md:text-3xl font-bold text-gray-800 leading-tight mb-2">{activeItem.description}</h2>
                    <div className="flex flex-wrap items-center gap-2 mt-4">
                      <div className="flex items-center bg-gray-100 border border-gray-200 px-3 py-2 rounded-lg">
                        <Tag className="w-4 h-4 text-gray-500 mr-2" />
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase text-gray-400 font-bold leading-none">Reduzido</span>
                          <span className="font-mono font-bold text-gray-700 text-lg leading-tight">{activeItem.reducedCode}</span>
                        </div>
                      </div>
                      <div className="flex items-center bg-gray-100 border border-gray-200 px-3 py-2 rounded-lg">
                        <Barcode className="w-4 h-4 text-gray-500 mr-2" />
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase text-gray-400 font-bold leading-none">Cód. Barras</span>
                          <span className="font-mono font-bold text-gray-700 text-lg leading-tight">{activeItem.barcode || '-'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleQuantitySubmit} className="mb-4">
                    <div className="grid grid-cols-2 gap-4 mb-2">
                      <div>
                        <label className="text-gray-400 text-xs font-bold uppercase mb-1 block">Estoque Sistema</label>
                        <div className="px-4 py-4 bg-gray-100 rounded-xl text-2xl font-bold text-gray-500 text-center font-mono border border-gray-200">
                          {activeSystemQty}
                        </div>
                      </div>
                      <div>
                        <label className="text-blue-600 text-xs font-bold uppercase mb-1 block">Contagem Física</label>
                        <input
                          ref={countRef}
                          type="number"
                          step="0.01"
                          value={countInput}
                          onChange={(e) => setCountInput(e.target.value)}
                          placeholder="?"
                          className="w-full px-4 py-4 text-3xl font-bold border-2 border-blue-500 rounded-xl focus:ring focus:ring-blue-200 outline-none text-center bg-white text-blue-900 shadow-inner"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition shadow-lg mt-2 flex items-center justify-center"
                    >
                      Confirmar Contagem <CheckCircle className="ml-2 w-5 h-5" />
                    </button>
                  </form>

                  <button
                    onClick={() => { setActiveItem(null); setScanInput(''); setTimeout(() => inputRef.current?.focus(), 50); }}
                    className="text-gray-400 hover:text-red-500 text-sm underline text-center"
                  >
                    Cancelar / Escanear outro
                  </button>
                </div>
              )}
            </div>

            {/* Right: Info / History Section */}
            <div className="bg-gray-50 w-full md:w-1/3 p-6 flex flex-col border-l border-gray-100">

              {/* Conditional: Recount Queue OR History */}
              {stats.isRecount && !activeItem ? (
                <div className="flex-1 flex flex-col">
                  <h3 className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-4 flex items-center">
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Itens para Recontar ({recountPendingList.length})
                  </h3>
                  {recountPendingList.length === 0 ? (
                    <div className="text-center py-10 text-green-600">
                      <CheckCircle className="w-8 h-8 mx-auto mb-2" />
                      <p className="font-bold">Recontagem Finalizada!</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto pr-1">
                      <div className="space-y-2">
                        {recountPendingList.map(item => (
                          <div
                            key={item.code}
                            className="bg-white p-3 rounded-lg border border-orange-100 shadow-sm hover:border-orange-300 cursor-pointer transition"
                            onClick={() => {
                              const prod = masterProducts.get(item.code);
                              if (prod) {
                                setActiveItem(prod);
                                setCountInput('');
                                setTimeout(() => countRef.current?.focus(), 50);
                              }
                            }}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded font-mono border border-gray-200">Red: {item.code}</span>
                              <span className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded font-mono border border-gray-200">EAN: {item.barcode}</span>
                            </div>
                            <p className="text-sm font-medium text-gray-700 line-clamp-2">{item.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mb-8">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Última Conferência</h3>
                  {lastScanned ? (
                    <div className={`p-4 rounded-xl border ${lastScanned.item.status === 'matched' ? 'bg-green-50 border-green-200' : (lastScanned.item.countedQty > lastScanned.item.systemQty ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200')}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className={`p-1 rounded-full ${lastScanned.item.status === 'matched' ? 'bg-green-200 text-green-700' : (lastScanned.item.countedQty > lastScanned.item.systemQty ? 'bg-blue-200 text-blue-700' : 'bg-red-200 text-red-700')}`}>
                          {lastScanned.item.status === 'matched' ? <CheckCircle className="w-5 h-5" /> : (lastScanned.item.countedQty > lastScanned.item.systemQty ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />)}
                        </div>
                        <span className="text-xs font-mono text-gray-500">{new Date().toLocaleTimeString()}</span>
                      </div>
                      <p className="font-semibold text-gray-800 text-sm line-clamp-2 mb-2">{lastScanned.product.description}</p>
                      <div className="flex justify-between text-sm border-t border-gray-200/50 pt-2">
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500">Sistema</span>
                          <span className="font-mono font-bold">{lastScanned.item.systemQty}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-xs text-gray-500">Contagem</span>
                          <span className={`font-mono font-bold ${getDivergenceColor(lastScanned.item.systemQty, lastScanned.item.countedQty, lastScanned.item.status)}`}>
                            {lastScanned.item.countedQty}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-400 text-sm italic text-center py-4">Nenhum item conferido ainda.</div>
                  )}
                </div>
              )}

              <div className="mt-auto pt-4 border-t border-gray-200">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                    <span className="text-xs text-gray-400">Total de SKUs</span>
                    <p className="text-xl font-bold text-gray-700">{stats.total}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                    <span className="text-xs text-gray-400">SKUs Conferidos</span>
                    <p className="text-xl font-bold text-emerald-600">
                      {stats.counted}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                    <span className="text-xs text-gray-400">SKUs Faltando</span>
                    <p className="text-xl font-bold text-orange-500">
                      {stats.total - stats.counted}
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </main>
      </div>
    );
  };

  const renderDivergence = () => {
    // Explicitly type items to prevent "unknown" errors
    const allStockItems: StockItem[] = Array.from(inventory.values());

    const divergentItems = allStockItems
      .filter(item => item.status === 'divergent')
      .map(item => ({
        item,
        product: masterProducts.get(item.reducedCode)
      }));

    const matchedItems = allStockItems
      .filter(item => item.status === 'matched')
      .map(item => ({
        item,
        product: masterProducts.get(item.reducedCode)
      }));

    const pendingItems = allStockItems.filter(i => i.status === 'pending');

    // Determine blocking state for Finalize
    const isPendingBlocking = pendingItems.length > 0;
    const isRecountBlocking = divergentItems.length > 0 && !stats.isRecount;
    const isFinalizeBlocked = isPendingBlocking || isRecountBlocking;

    const handleReturnToConference = () => {
      setStep('conference');
      setActiveItem(null);
      setScanInput('');
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    return (
      <div className="flex flex-col h-full bg-gray-50">
        <header className="bg-white shadow-sm p-4">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReturnToConference}
                  className="flex items-center gap-2 rounded-2xl px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold shadow-lg hover:from-indigo-700 hover:to-blue-700 transition"
                >
                  <RotateCcw className="w-5 h-5" />
                  Voltar para Contagem
                </button>
                <h1 className="font-bold text-gray-800 text-lg">Fase 2: Divergências & Conferência</h1>
              </div>
              <p className="text-xs text-gray-500 max-w-xl">
                Este botão leva de volta à etapa de conferência para ajustar manualmente os itens com divergência antes de finalizar.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {divergentItems.length > 0 && (
                <button
                  onClick={handleRecountAllDivergences}
                  className={`flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-bold transition shadow-lg ${pendingItems.length > 0
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : 'bg-gradient-to-r from-amber-500 to-amber-600 text-white border-transparent hover:from-amber-600 hover:to-amber-700'
                    }`}
                  title={pendingItems.length > 0 ? "Termine os itens pendentes antes de recontar" : "Iniciar recontagem"}
                >
                  {!pendingItems.length ? <RefreshCw className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                  Recontar Todas as Divergências
                </button>
              )}
              <button
                onClick={handleFinalize}
                disabled={isFinalizeBlocked || isSavingStockReport}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm flex items-center ${isFinalizeBlocked || isSavingStockReport
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed hover:bg-gray-300'
                  : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                title={isFinalizeBlocked ? "Conclua todas as pendências e recontagens para liberar" : (isSavingStockReport ? "Salvando relatório..." : "Gerar Relatório Final")}
              >
                {!isSavingStockReport && (isFinalizeBlocked ? <Lock className="w-4 h-4 mr-2" /> : <Unlock className="w-4 h-4 mr-2" />)}
                {isSavingStockReport ? 'Salvando relatório...' : 'Finalizar e Gerar Relatório'}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 max-w-6xl mx-auto w-full">

          <div className="grid grid-cols-1 gap-6">

            {/* 1. Divergences */}
            {divergentItems.length > 0 && (
              <div className="bg-white rounded-xl shadow overflow-hidden">
                <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center">
                  <h2 className="font-bold text-red-800 flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    Itens com Divergência ({divergentItems.length})
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                      <tr>
                        <th className="p-4">Produto</th>
                        <th className="p-4 text-center">Sistema</th>
                        <th className="p-4 text-center">Contagem</th>
                        <th className="p-4 text-center">Dif</th>
                        <th className="p-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {divergentItems.map(({ item, product }) => {
                        const diff = item.countedQty - item.systemQty;
                        const isPositive = diff > 0;
                        return (
                          <tr key={item.reducedCode} className="hover:bg-gray-50">
                            <td className="p-4">
                              <div className="font-semibold text-gray-800">{product?.description || 'Item Desconhecido'}</div>
                              <div className="text-xs text-gray-400 font-mono">Red: {item.reducedCode}</div>
                            </td>
                            <td className="p-4 text-center font-mono">{item.systemQty}</td>
                            <td className={`p-4 text-center font-mono font-bold ${isPositive ? 'text-blue-600' : 'text-red-600'}`}>{item.countedQty}</td>
                            <td className={`p-4 text-center font-mono ${isPositive ? 'text-blue-600' : 'text-red-600'}`}>
                              {isPositive ? '+' : ''}{diff}
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => {
                                  // Can only allow individual recount if phase 1 complete, or just let them count?
                                  // User logic implies strictness, but individual manual fix might be ok.
                                  // Let's stick to global rule for simplicity or check pending.
                                  if (pendingItems.length > 0) {
                                    alert("Atenção: Finalize os itens pendentes antes de recontar.");
                                    return;
                                  }
                                  setActiveItem(product || null);
                                  setScanInput('');
                                  setStep('conference');
                                  setTimeout(() => countRef.current?.focus(), 100);
                                }}
                                className="text-blue-600 hover:text-blue-800 font-medium text-xs border border-blue-200 px-3 py-1 rounded hover:bg-blue-50"
                              >
                                Recontar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2. Pending Items */}
            {pendingItems.length > 0 && (
              <div className="bg-white rounded-xl shadow overflow-hidden border border-orange-100">
                <div className="bg-orange-50 p-4 border-b border-orange-100 flex justify-between items-center">
                  <h2 className="font-bold text-orange-800 flex items-center">
                    <Package className="w-5 h-5 mr-2" />
                    Itens Pendentes ({pendingItems.length})
                  </h2>
                  <button
                    disabled
                    className="text-xs font-bold text-orange-400 bg-gray-200 border border-gray-100 px-3 py-1.5 rounded cursor-not-allowed flex items-center"
                  >
                    <Eraser className="w-3 h-3 mr-1" />
                    Zerar Pendentes (Finalizar 1ª Fase)
                  </button>
                </div>
                <div className="p-4">
                  <p className="text-sm text-gray-500 mb-4">Estes itens constam no estoque mas ainda não foram bipados. Você deve bipá-los ou zerá-los para prosseguir.</p>
                  <div className="max-h-60 overflow-y-auto border rounded bg-gray-50 p-2">
                    {pendingItems.map(item => {
                      const prod = masterProducts.get(item.reducedCode);
                      return (
                        <div key={item.reducedCode} className="flex justify-between items-center p-2 border-b border-gray-200 last:border-0 text-xs hover:bg-gray-100">
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-700">{prod?.description || item.reducedCode}</span>
                            <span className="text-gray-400 text-[10px]">{item.reducedCode}</span>
                          </div>
                          <span className="font-mono bg-gray-200 px-2 py-0.5 rounded text-gray-600">Qtd: {item.systemQty}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 3. Matched Items (New Section) */}
            {matchedItems.length > 0 && (
              <div className="bg-white rounded-xl shadow overflow-hidden border border-green-100">
                <div className="bg-green-50 p-4 border-b border-green-100 cursor-pointer" onClick={() => { }}>
                  <h2 className="font-bold text-green-800 flex items-center">
                    <ThumbsUp className="w-5 h-5 mr-2" />
                    Itens Conferidos e Corretos ({matchedItems.length})
                  </h2>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b sticky top-0">
                      <tr>
                        <th className="p-4">Produto</th>
                        <th className="p-4 text-center">Quantidade</th>
                        <th className="p-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {matchedItems.map(({ item, product }) => (
                        <tr key={item.reducedCode} className="hover:bg-gray-50">
                          <td className="p-3 pl-4">
                            <div className="font-medium text-gray-700">{product?.description || 'Item Desconhecido'}</div>
                            <div className="text-xs text-gray-400 font-mono">Red: {item.reducedCode}</div>
                          </td>
                          <td className="p-3 text-center font-mono text-green-700 font-bold">{item.countedQty}</td>
                          <td className="p-3 pr-4 text-right">
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-semibold">OK</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {divergentItems.length === 0 && pendingItems.length === 0 && matchedItems.length === 0 && (
              <div className="text-center py-20">
                <p className="text-gray-400">Nenhum dado carregado.</p>
              </div>
            )}

          </div>
        </main>
      </div>
    );
  };
  const handleResetSession = () => {
    setStep('setup');
    setInventory(new Map());
    setMasterProducts(new Map());
    setRecountTargets(new Set());
    setPharmSignature(null);
    setManagerSignature(null);
    setBranch('');
    setSelectedCompanyId('');
    setSelectedAreaName('');
    setProductFile(null);
    setStockFile(null);
    setSessionId(null);
    manualSessionStartedRef.current = false;
    setIsDirty(false);
  };

  useEffect(() => {
    if (step !== 'report') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleResetSession();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step]);

  const renderReport = () => {
    const allItems: StockItem[] = Array.from(inventory.values());
    const matched = allItems.filter(i => i.status === 'matched').length;
    const divergent = allItems.filter(i => i.status === 'divergent').length;
    const pending = allItems.filter(i => i.status === 'pending').length;

    const signaturesComplete = pharmSignature && managerSignature;

    const exportCSV = async () => {
      const saved = await saveDefinitiveReport();
      if (!saved) return;

      if (userEmail) {
        SupabaseService.insertAppEventLog({
          company_id: selectedCompanyId || null,
          branch: branch || null,
          area: selectedAreaName || null,
          user_email: userEmail,
          user_name: userName || null,
          app: 'conferencia',
          event_type: 'stock_conference_export_csv',
          entity_type: 'stock_report',
          entity_id: branch || null,
          status: 'success',
          success: true,
          source: 'web'
        }).catch(() => { });
      }
      const headers = "Codigo Reduzido;Descricao;Estoque Sistema;Contagem;Diferenca;Status\n";
      const rows = allItems.map((item: StockItem) => {
        const prod = masterProducts.get(item.reducedCode);
        const diff = item.countedQty - item.systemQty;
        return `${item.reducedCode};"${prod?.description || ''}";${item.systemQty};${item.countedQty};${diff};${item.status}`;
      }).join("\n");

      const blob = new Blob([headers + rows], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conferencia_${branch.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    };

    const handleSaveAndFinish = async () => {
      const saved = await saveDefinitiveReport();
      if (!saved) return;

      const wantsPDF = window.confirm("Relatório salvo com sucesso no sistema!\n\nDeseja baixar o arquivo PDF agora?");
      if (wantsPDF) {
        exportPDF();
      }
      
      // Limpa tudo para permitir nova conferência
      await resetConferenceState();
    };

    const exportPDF = () => {
      if (userEmail) {
        SupabaseService.insertAppEventLog({
          company_id: selectedCompanyId || null,
          branch: branch || null,
          area: selectedAreaName || null,
          user_email: userEmail,
          user_name: userName || null,
          app: 'conferencia',
          event_type: 'stock_conference_printed',
          entity_type: 'stock_report',
          entity_id: branch || null,
          status: 'success',
          success: true,
          source: 'web'
        }).catch(() => { });
      }
      const doc = new jsPDF();
      const dateStr = new Date().toLocaleDateString('pt-BR');

      // Header
      doc.setFontSize(18);
      doc.text("Relatório de Conferência de Estoque", 14, 20);

      doc.setFontSize(10);
      doc.text(`Filial: ${branch}`, 14, 28);
      doc.text(`Data: ${dateStr}`, 14, 33);
      doc.text(`Farmacêutico(a): ${pharmacist}`, 14, 38);
      doc.text(`Gestor(a): ${manager}`, 14, 43);

      // Statistics
      doc.text(`Total Itens: ${allItems.length}`, 14, 53);
      doc.setTextColor(0, 128, 0);
      doc.text(`Corretos: ${matched}`, 14, 58);
      doc.setTextColor(200, 0, 0);
      doc.text(`Divergentes: ${divergent}`, 60, 58);
      doc.setTextColor(100, 100, 100);
      doc.text(`Não Contados: ${pending}`, 110, 58);
      doc.setTextColor(0, 0, 0);

      // Table Data
      const tableColumn = ["Reduzido", "Descrição", "Sistema", "Contagem", "Diferença", "Status"];
      const tableRows: any[] = [];

      // Sort: Divergent first, then pending, then matched
      const sortedItems = [...allItems].sort((a, b) => {
        const order = { divergent: 0, pending: 1, matched: 2 };
        return order[a.status] - order[b.status];
      });

      sortedItems.forEach(item => {
        const prod = masterProducts.get(item.reducedCode);
        const diff = item.countedQty - item.systemQty;
        const statusMap = {
          'matched': 'OK',
          'divergent': 'DIVERGENTE',
          'pending': 'PENDENTE'
        };

        const rowData = [
          item.reducedCode,
          prod?.description || '',
          item.systemQty.toString(),
          item.countedQty.toString(),
          diff.toString(),
          (statusMap as any)[item.status]
        ];
        tableRows.push(rowData);
      });

      autoTable(doc, {
        startY: 65,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        styles: { fontSize: 8, overflow: 'linebreak' },
        headStyles: { fillColor: [66, 133, 244] },
        columnStyles: {
          0: { cellWidth: 24 },
          1: { cellWidth: 72 },
          2: { cellWidth: 20, halign: 'right' },
          3: { cellWidth: 20, halign: 'right' },
          4: { cellWidth: 20, halign: 'right' },
          5: { cellWidth: 26, halign: 'center' }
        },
        didParseCell: (data: any) => {
          if (data.section === 'body') {
            const diffVal = parseFloat(data.row.raw[4]);
            if (data.column.index === 4 || data.column.index === 5) {
              if (diffVal > 0) {
                data.cell.styles.textColor = [0, 0, 255];
                data.cell.styles.fontStyle = 'bold';
              } else if (diffVal < 0) {
                data.cell.styles.textColor = [200, 0, 0];
                data.cell.styles.fontStyle = 'bold';
              } else {
                data.cell.styles.textColor = [0, 128, 0];
              }
            }
          }
        }
      });

      // Signatures Footer
      const finalY = (doc as any).lastAutoTable.finalY + 20;

      // Page break if needed
      if (finalY > 250) {
        doc.addPage();
        doc.text("Assinaturas", 14, 20);
      }

      const sigY = finalY > 250 ? 30 : finalY;

      // Add Pharmacist Sig
      if (pharmSignature) {
        doc.addImage(pharmSignature, 'PNG', 20, sigY, 60, 30);
        doc.line(20, sigY + 30, 80, sigY + 30);
        doc.setFontSize(8);
        doc.text("Farmacêutico(a) Responsável", 20, sigY + 35);
        doc.text(pharmacist, 20, sigY + 39);
      }

      // Add Manager Sig
      if (managerSignature) {
        doc.addImage(managerSignature, 'PNG', 110, sigY, 60, 30);
        doc.line(110, sigY + 30, 170, sigY + 30);
        doc.setFontSize(8);
        doc.text("Gestor(a) Responsável", 110, sigY + 35);
        doc.text(manager, 110, sigY + 39);
      }

      doc.save(`relatorio_${branch.replace(/\s+/g, '_')}.pdf`);
    };

    return (
      <div className="flex flex-col h-full bg-white overflow-y-auto w-full relative">
        {isSavingStockReport && (
          <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col justify-center items-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mb-4"></div>
            <p className="text-xl font-bold text-gray-800">Salvando Relatório Definitivo...</p>
            <p className="text-sm text-gray-500 mt-2">Por favor, não feche a página.</p>
          </div>
        )}
        <div className="max-w-4xl mx-auto w-full p-8 flex flex-col items-center">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
            <FileText className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Conferência Finalizada</h1>
          <p className="text-gray-500 mb-8">Resumo da operação de estoque.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-8">
            <div className="p-4 bg-green-50 rounded-xl border border-green-100 text-center">
              <span className="text-green-600 font-semibold uppercase text-xs tracking-wider">Corretos</span>
              <p className="text-3xl font-bold text-gray-800 mt-2">{matched}</p>
            </div>
            <div className="p-4 bg-red-50 rounded-xl border border-red-100 text-center">
              <span className="text-red-600 font-semibold uppercase text-xs tracking-wider">Divergentes</span>
              <p className="text-3xl font-bold text-gray-800 mt-2">{divergent}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-center">
              <span className="text-gray-500 font-semibold uppercase text-xs tracking-wider">Não Contados</span>
              <p className="text-3xl font-bold text-gray-800 mt-2">{pending}</p>
            </div>
          </div>

          <div className="w-full bg-gray-50 p-6 rounded-xl border border-gray-100 mb-8">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center">
              <PenTool className="w-5 h-5 mr-2" />
              Coleta de Assinaturas
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <p className="text-sm font-semibold text-gray-600 mb-2">Farmacêutico: {pharmacist}</p>
                {pharmSignature ? (
                  <div className="relative border rounded-lg overflow-hidden bg-white h-40 flex items-center justify-center">
                    <img src={pharmSignature} alt="Assinatura Farmacêutico" className="max-h-full" style={{ background: '#fff' }} />
                    <button
                      onClick={() => setPharmSignature(null)}
                      className="absolute top-2 right-2 bg-red-100 text-red-600 p-1 rounded hover:bg-red-200"
                      title="Apagar assinatura"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <SignaturePad label="Farmacêutico(a)" onEnd={async (dataUrl) => {
                    const compressed = await ImageUtils.compressImage(dataUrl, { maxWidth: 600, quality: 0.6 });
                    setPharmSignature(compressed);
                  }} />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-600 mb-2">Gestor: {manager}</p>
                {managerSignature ? (
                  <div className="relative border rounded-lg overflow-hidden bg-white h-40 flex items-center justify-center">
                    <img src={managerSignature} alt="Assinatura Gestor" className="max-h-full" style={{ background: '#fff' }} />
                    <button
                      onClick={() => setManagerSignature(null)}
                      className="absolute top-2 right-2 bg-red-100 text-red-600 p-1 rounded hover:bg-red-200"
                      title="Apagar assinatura"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <SignaturePad label="Gestor(a)" onEnd={async (dataUrl) => {
                    const compressed = await ImageUtils.compressImage(dataUrl, { maxWidth: 600, quality: 0.6 });
                    setManagerSignature(compressed);
                  }} />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 w-full md:w-auto">
            {!signaturesComplete && (
              <div className="text-center text-red-500 font-medium mb-2 bg-red-50 p-2 rounded">
                Colete ambas as assinaturas para liberar o salvamento.
              </div>
            )}
            <button
              onClick={handleSaveAndFinish}
              disabled={!signaturesComplete}
              className={`flex items-center justify-center space-x-2 px-8 py-4 rounded-xl text-lg font-bold shadow-lg transition w-full ${signaturesComplete ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
            >
              <Printer className="w-5 h-5" />
              <span>Salvar Relatório e Finalizar</span>
            </button>

            <button
              onClick={exportCSV}
              disabled={!signaturesComplete}
              className={`flex items-center justify-center space-x-2 px-8 py-3 rounded-xl text-md font-semibold shadow-sm transition w-full ${signaturesComplete ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
            >
              <Download className="w-4 h-4" />
              <span>Baixar CSV</span>
            </button>
          </div>

          <button
            onClick={handleResetSession}
            className="mt-6 px-6 py-3 rounded-xl bg-gray-100 text-gray-700 border border-gray-300 font-bold shadow hover:bg-gray-200 transition"
          >
            Iniciar Nova Conferência (Esc)
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full w-full">
      {step === 'setup' && renderSetup()}
      {step === 'conference' && renderConference()}
      {step === 'divergence' && renderDivergence()}
      {step === 'report' && renderReport()}

      {isCameraOpen && typeof document !== 'undefined' && createPortal((
        <div className="fixed inset-0 z-[2147483647] bg-black/80 p-4 flex items-center justify-center">
          <div className="w-full max-w-md bg-gray-950 rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div className="flex items-center gap-2 text-gray-100 font-semibold">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                Leitor por Câmera
              </div>
              <button
                type="button"
                onClick={stopCameraScanner}
                className="text-gray-300 hover:text-white transition"
                aria-label="Fechar leitor por câmera"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setLightAssistEnabled(prev => !prev)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${lightAssistEnabled
                    ? 'border-yellow-300 bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                    : 'border-gray-700 bg-gray-900 text-gray-200 hover:bg-gray-800'}`}
                >
                  {lightAssistEnabled ? 'Desativar iluminação' : 'Modo iluminação'}
                </button>
              </div>
              <div className="relative rounded-xl border border-emerald-400/40 overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full aspect-[3/4] object-cover"
                />
                <div className="pointer-events-none absolute inset-5 border-2 border-emerald-400/70 rounded-xl" />
                <div className="pointer-events-none absolute left-8 right-8 top-1/2 -translate-y-1/2">
                  <div className="h-[2px] bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
                </div>
                {lightAssistEnabled && (
                  <>
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.38)_0%,rgba(255,255,255,0.12)_45%,rgba(0,0,0,0.28)_100%)]" />
                    <div className="pointer-events-none absolute inset-0 backdrop-contrast-125 backdrop-brightness-110" />
                    <div className="pointer-events-none absolute inset-x-5 top-[35%] h-[30%] border border-yellow-300/80 rounded-lg shadow-[0_0_20px_rgba(253,224,71,0.35)]" />
                  </>
                )}
              </div>
              <p className="mt-3 text-xs text-emerald-300 leading-5">{cameraStatusMsg}</p>
              <p className="mt-1 text-[11px] text-gray-400">
                Dica: mantenha boa iluminação e enquadre um único código por vez. Use o modo iluminação em ambiente escuro.
              </p>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
};
