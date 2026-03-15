
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PVRecord, SalesRecord, PVSaleClassification, SalesUploadRecord, SessionInfo } from '../../preVencidos/types';
import { buildAnalysisReportHtml, buildAnalysisReportPayload } from '../../preVencidos/analysisReport';
import { FileSearch, Users, ShoppingCart, TrendingUp, AlertCircle, CheckCircle, FlaskConical, Repeat, Search, Package, Trophy, CheckSquare, XCircle, Save, MinusCircle, HelpCircle, Lock, Printer } from 'lucide-react';
import { insertAppEventLog } from '../../supabaseService';

const MONTH_NAMES_PT_BR = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const DCB_UNCLASSIFIED_LABEL = 'SEM DCB';

const getExpiryMonthLabel = (expiryDate?: string) => {
  if (!expiryDate) return 'MÊS NÃO INFORMADO';

  const [monthPart, yearPart] = expiryDate.split('/');
  if (!monthPart || !yearPart) return 'MÊS NÃO INFORMADO';

  const monthIndex = Number(monthPart);
  if (Number.isNaN(monthIndex) || monthIndex < 1 || monthIndex > 12) return 'MÊS NÃO INFORMADO';

  const normalizedYear = yearPart.length === 2 ? `20${yearPart}` : yearPart;
  const monthLabel = MONTH_NAMES_PT_BR[monthIndex - 1];

  return `${monthLabel}/${normalizedYear}`;
};

const parseExpiryMonthStartTs = (expiryDate?: string): number | null => {
  if (!expiryDate) return null;
  const [monthPart, yearPart] = String(expiryDate).split('/');
  const month = Number(monthPart);
  if (Number.isNaN(month) || month < 1 || month > 12) return null;
  const rawYear = String(yearPart || '').trim();
  const year = rawYear.length === 2 ? Number(`20${rawYear}`) : Number(rawYear);
  if (Number.isNaN(year) || year < 2000) return null;
  return new Date(year, month - 1, 1).getTime();
};

interface AnalysisViewProps {
  pvRecords: PVRecord[];
  salesRecords: SalesRecord[];
  confirmedPVSales: Record<string, PVSaleClassification>;
  finalizedREDSByPeriod: Record<string, string[]>;
  currentSalesPeriod: string;
  sessionInfo?: SessionInfo | null;
  lastUpload?: SalesUploadRecord | null;
  barcodeByReduced?: Record<string, string>;
  inventoryCostByBarcode?: Record<string, number>;
  inventoryStockByBarcode?: Record<string, number>;
  labByReduced?: Record<string, string>;
  userEmail?: string;
  userName?: string;
  onUpdatePVSale: (saleId: string, classification: PVSaleClassification) => void;
  onFinalizeSale: (reducedCode: string, period: string) => void;
}

const AnalysisView: React.FC<AnalysisViewProps> = ({
  pvRecords,
  salesRecords,
  confirmedPVSales,
  finalizedREDSByPeriod,
  currentSalesPeriod,
  sessionInfo,
  lastUpload,
  barcodeByReduced = {},
  inventoryCostByBarcode = {},
  inventoryStockByBarcode = {},
  labByReduced = {},
  userEmail,
  userName,
  onUpdatePVSale,
  onFinalizeSale
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expanded, setExpanded] = useState<{ id: string, type: 'sku' | 'similar' } | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'finalized' | 'similar'>('all');
  const analysisSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleFindShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        analysisSearchInputRef.current?.focus();
        analysisSearchInputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleFindShortcut);
    return () => window.removeEventListener('keydown', handleFindShortcut);
  }, []);

  const salesUploadCutoff = useMemo(() => {
    if (!lastUpload?.uploaded_at) return null;
    const date = new Date(lastUpload.uploaded_at);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }, [lastUpload?.uploaded_at]);

  const currentMonthStartTs = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }, []);

  const eligiblePVRecords = useMemo(() => {
    return pvRecords.filter(record => {
      const expiryTs = parseExpiryMonthStartTs(record.expiryDate);
      if (expiryTs === null) return false;
      if (expiryTs < currentMonthStartTs) return false;
      if (!salesUploadCutoff || !record.entryDate) return true;
      const entryDate = new Date(record.entryDate);
      if (Number.isNaN(entryDate.getTime())) return true;
      return entryDate.getTime() <= salesUploadCutoff.getTime();
    });
  }, [pvRecords, salesUploadCutoff, currentMonthStartTs]);

  const handleFilterClick = (filter: 'pending' | 'finalized' | 'similar') => {
    setActiveFilter(prev => (prev === filter ? 'all' : filter));
  };

  const results = useMemo(() => {
    const normalizeReducedCode = (value?: string) => {
      if (!value) return '';
      const digits = String(value).replace(/\D/g, '');
      if (!digits) return '';
      return digits.replace(/^0+/, '') || digits;
    };

    const getLabByReducedCode = (code?: string, fallback?: string) => {
      if (!code) return fallback || 'N/A';
      const direct = labByReduced[code];
      if (direct) return direct;

      const normalized = normalizeReducedCode(code);
      if (!normalized) return fallback || 'N/A';

      const normalizedDirect = labByReduced[normalized];
      if (normalizedDirect) return normalizedDirect;

      const matchedKey = Object.keys(labByReduced).find(key => normalizeReducedCode(key) === normalized);
      if (matchedKey) return labByReduced[matchedKey];

      return fallback || 'N/A';
    };

    const normalizedPeriod = (currentSalesPeriod || '').trim();
    const periodFinalizedList = finalizedREDSByPeriod[normalizedPeriod]
      || finalizedREDSByPeriod[currentSalesPeriod]
      || [];

    const resolveCostUnit = (reducedCode?: string, _fallbackCostUnit?: number, _allowFallback = false) => {
      if (!reducedCode) return 0;
      const normalizedReduced = normalizeReducedCode(reducedCode);
      const reducedKey = normalizedReduced ? `red:${normalizedReduced}` : '';
      const reducedCost = reducedKey ? inventoryCostByBarcode[reducedKey] : undefined;
      if (reducedCost !== undefined) return Number(reducedCost || 0);
      const raw = barcodeByReduced[String(reducedCode)] || (normalizedReduced ? barcodeByReduced[normalizedReduced] : '') || '';
      const normalized = String(raw || '').replace(/\D/g, '');
      if (!normalized) return 0;

      const noZeros = normalized.replace(/^0+/, '') || normalized;
      const value = inventoryCostByBarcode[normalized] ?? inventoryCostByBarcode[noZeros];
      return Number(value || 0);
    };
    const getInventoryStock = (reducedCode?: string) => {
      if (!reducedCode) return null;
      const normalizedReduced = normalizeReducedCode(reducedCode);
      const reducedKey = normalizedReduced ? `red:${normalizedReduced}` : '';
      const reducedStock = reducedKey ? inventoryStockByBarcode[reducedKey] : undefined;
      if (reducedStock !== undefined) return Number(reducedStock || 0);
      const raw = barcodeByReduced[String(reducedCode)] || (normalizedReduced ? barcodeByReduced[normalizedReduced] : '') || '';
      const normalized = String(raw || '').replace(/\D/g, '');
      if (!normalized) return null;
      const noZeros = normalized.replace(/^0+/, '') || normalized;
      const value = inventoryStockByBarcode[normalized] ?? inventoryStockByBarcode[noZeros];
      if (value === undefined) return null;
      return Number(value || 0);
    };

    const existingCodes = new Set(eligiblePVRecords.map(pv => pv.reducedCode));
    const missingFinalized = periodFinalizedList.filter(code => !existingCodes.has(code));
    const placeholderRecords: PVRecord[] = missingFinalized.map(code => {
      const saleMatch = salesRecords.find(s => s.reducedCode === code);
      return {
        id: `finalized-${normalizedPeriod || currentSalesPeriod}-${code}`,
        reducedCode: code,
        name: saleMatch?.productName || `Produto ${code}`,
        quantity: 0,
        originBranch: '',
        sectorResponsible: '',
        expiryDate: '',
        entryDate: new Date().toISOString(),
        dcb: saleMatch?.dcb || 'N/A',
        barcode: undefined,
        lab: getLabByReducedCode(code, saleMatch?.lab)
      };
    });

    const baseRecords = [...eligiblePVRecords, ...placeholderRecords];

    const enriched = baseRecords.map(pv => {
      const isFinalized = periodFinalizedList.includes(pv.reducedCode);
      const directSales = salesRecords.filter(s => s.reducedCode === pv.reducedCode);
      const directSoldQty = directSales.reduce((acc, s) => acc + s.quantity, 0);

      const directSalesDetails = directSales.map((s, idx) => {
        const resolvedCostUnit = resolveCostUnit(s.reducedCode, s.costUnit, false);
        return {
          name: s.productName,
          totalSoldInReport: s.quantity,
          seller: s.salesperson,
          code: s.reducedCode,
          unitPrice: s.unitPrice || 0,
          totalValue: s.totalValue || 0,
          costUnit: s.costUnit || 0,
          costTotal: s.costTotal || 0,
          inventoryCostUnit: resolvedCostUnit,
          inventoryCostTotal: resolvedCostUnit * s.quantity,
          lab: getLabByReducedCode(s.reducedCode, s.lab),
          id: `${normalizedPeriod || currentSalesPeriod}-${s.salesperson}-${s.reducedCode}-${s.quantity}-${idx}`
        };
      });

      const isValidDCB = (dcb?: string) => {
        const normalized = String(dcb || '').trim().toUpperCase();
        return normalized !== '' && normalized !== 'N/A' && normalized !== DCB_UNCLASSIFIED_LABEL;
      };
      const similarSales = isValidDCB(pv.dcb)
        ? salesRecords.filter(s => s.dcb === pv.dcb && s.reducedCode !== pv.reducedCode)
        : [];
      const similarSoldQty = similarSales.reduce((acc, s) => acc + s.quantity, 0);

      const similarSalesDetails = similarSales.map((s, idx) => {
        const resolvedCostUnit = resolveCostUnit(s.reducedCode, s.costUnit, false);
        return {
          name: s.productName,
          qty: s.quantity,
          seller: s.salesperson,
          code: s.reducedCode,
          unitPrice: s.unitPrice || 0,
          totalValue: s.totalValue || 0,
          costUnit: s.costUnit || 0,
          costTotal: s.costTotal || 0,
          inventoryCostUnit: resolvedCostUnit,
          inventoryCostTotal: resolvedCostUnit * s.quantity,
          lab: getLabByReducedCode(s.reducedCode, s.lab),
          id: `${normalizedPeriod || currentSalesPeriod}-sim-${s.salesperson}-${s.reducedCode}-${s.quantity}-${idx}`
        };
      });

      let status: 'sold' | 'replaced' | 'lost' = 'lost';
      if (directSoldQty > 0) status = 'sold';
      else if (similarSoldQty > 0) status = 'replaced';

      const directSalesValue = directSales.reduce((acc, s) => acc + (s.totalValue || 0), 0);
      const similarSalesValue = similarSales.reduce((acc, s) => acc + (s.totalValue || 0), 0);
      const pvInventoryCostUnit = resolveCostUnit(pv.reducedCode, undefined, false);
      const pvInventoryCostTotal = pvInventoryCostUnit * (pv.quantity || 0);
      const directInventoryCostTotal = directSales.reduce((acc, s) => acc + resolveCostUnit(s.reducedCode, s.costUnit, false) * s.quantity, 0);
      const similarInventoryCostTotal = similarSales.reduce((acc, s) => acc + resolveCostUnit(s.reducedCode, s.costUnit, false) * s.quantity, 0);
      const pvInventoryStock = getInventoryStock(pv.reducedCode);

      const pvLab = getLabByReducedCode(pv.reducedCode, pv.lab);
      const firstDirectLab = directSalesDetails[0]?.lab || '';
      const firstSimilarLab = similarSalesDetails[0]?.lab || '';

      return {
        ...pv,
        directSoldQty,
        directSalesDetails,
        similarSoldQty,
        similarSalesDetails,
        directSalesValue,
        similarSalesValue,
        pvInventoryCostUnit,
        pvInventoryCostTotal,
        directInventoryCostTotal,
        similarInventoryCostTotal,
        pvInventoryStock,
        pvLab,
        firstDirectLab,
        firstSimilarLab,
        status,
        isFinalized,
        expiryMonthLabel: getExpiryMonthLabel(pv.expiryDate),
        lab: directSalesDetails[0]?.lab || similarSalesDetails[0]?.lab || pvLab || 'N/A'
      };
    });
    // Hide "Sem Movimento" items from the analysis list.
    return enriched.filter(item => item.status !== 'lost');
  }, [eligiblePVRecords, salesRecords, finalizedREDSByPeriod, currentSalesPeriod, barcodeByReduced, inventoryCostByBarcode, inventoryStockByBarcode, labByReduced]);

  const reportPayload = useMemo(() => {
    const normalizedPeriod = (currentSalesPeriod || '').trim();
    const finalizedCodes = finalizedREDSByPeriod[normalizedPeriod] || finalizedREDSByPeriod[currentSalesPeriod] || [];
    return buildAnalysisReportPayload({
      pvRecords: eligiblePVRecords,
      salesRecords,
      periodLabel: normalizedPeriod || 'Período não identificado',
      finalizedCodes,
      meta: {
        company: sessionInfo?.company,
        branch: sessionInfo?.filial,
        area: sessionInfo?.area,
        file_name: lastUpload?.file_name || null,
        uploaded_at: lastUpload?.uploaded_at || null
      }
    });
  }, [eligiblePVRecords, salesRecords, currentSalesPeriod, finalizedREDSByPeriod, sessionInfo, lastUpload]);

  const reportPayloadForPrint = useMemo(() => {
    const finalizedSet = new Set(reportPayload.finalized_codes || []);
    let items = reportPayload.items;

    if (activeFilter === 'finalized') {
      items = items.filter(item => finalizedSet.has(item.reducedCode));
    } else if (activeFilter === 'pending') {
      items = items.filter(item => !finalizedSet.has(item.reducedCode) && item.status === 'sold');
    } else if (activeFilter === 'similar') {
      items = items.filter(item => !finalizedSet.has(item.reducedCode) && item.status === 'replaced');
    }

    return {
      ...reportPayload,
      summary: {
        total_items: items.length,
        total_direct: items.filter(item => item.status === 'sold').length,
        total_similar: items.filter(item => item.status === 'replaced').length
      },
      items
    };
  }, [reportPayload, activeFilter]);

  const handlePrint = () => {
    if (!reportPayloadForPrint.items.length) {
      alert('Nenhum item para imprimir nesta análise.');
      return;
    }
    const filterLabel =
      activeFilter === 'all'
        ? 'todos'
        : activeFilter === 'pending'
          ? 'falta_lancar'
          : activeFilter === 'finalized'
            ? 'finalizados'
            : 'similar_vendido';

    if (sessionInfo?.companyId && sessionInfo?.filial) {
      insertAppEventLog({
        company_id: sessionInfo.companyId,
        branch: sessionInfo.filial,
        area: sessionInfo.area || null,
        user_email: userEmail || null,
        user_name: userName || null,
        app: 'pre_vencidos',
        event_type: 'pv_analysis_printed',
        entity_type: 'sales_analysis',
        entity_id: currentSalesPeriod || null,
        status: 'success',
        success: true,
        source: 'web',
        event_meta: {
          period_label: currentSalesPeriod,
          total_items: reportPayloadForPrint.items.length,
          print_filter: filterLabel
        }
      }).catch(() => { });
    }
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) {
      alert('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildAnalysisReportHtml(reportPayloadForPrint));
    printWindow.document.close();
  };

  const toggleExpand = (id: string, type: 'sku' | 'similar') => {
    if (expanded?.id === id && expanded?.type === type) setExpanded(null);
    else setExpanded({ id, type });
  };

  const filteredResults = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    const parseExpiryToTs = (expiry?: string) => {
      if (!expiry) return Number.POSITIVE_INFINITY;
      const [monthPart, yearPart] = String(expiry).split('/');
      const month = Number(monthPart);
      if (Number.isNaN(month) || month < 1 || month > 12) return Number.POSITIVE_INFINITY;
      const yearRaw = String(yearPart || '').trim();
      const year = yearRaw.length === 2 ? Number(`20${yearRaw}`) : Number(yearRaw);
      if (Number.isNaN(year) || year < 2000) return Number.POSITIVE_INFINITY;
      return new Date(year, month - 1, 1).getTime();
    };

    const filtered = results.filter(r => {
      const matchesSearch = r.name.toLowerCase().includes(searchLower) || r.reducedCode.includes(searchTerm);
      if (!matchesSearch) return false;
      if (activeFilter === 'all') return true;
      if (activeFilter === 'finalized') return r.isFinalized;
      if (activeFilter === 'similar') return !r.isFinalized && r.status === 'replaced';
      return !r.isFinalized && r.status === 'sold';
    });

    return filtered.sort((a, b) => {
      const ta = parseExpiryToTs(a.expiryDate);
      const tb = parseExpiryToTs(b.expiryDate);
      if (ta !== tb) return ta - tb;
      return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    });
  }, [results, searchTerm, activeFilter]);

  const formatCurrency = (value: number) => {
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
    } catch {
      return `R$ ${Number(value || 0).toFixed(2)}`;
    }
  };
  const formatStock = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'N/D';
    return Number(value || 0).toLocaleString('pt-BR');
  };

  const handleClassificationChange = (saleId: string, field: keyof PVSaleClassification, val: number, maxSale: number, reducedCode: string, sellerName: string, unitPrice?: number) => {
    const periodFinalizedList = finalizedREDSByPeriod[currentSalesPeriod] || [];
    if (periodFinalizedList.includes(reducedCode)) return;

    const current = confirmedPVSales[saleId] || { confirmed: false, qtyPV: 0, qtyNeutral: 0, qtyIgnoredPV: 0 };
    const nextVal = Math.max(0, val);

    const pvStock = pvRecords.find(r => r.reducedCode === reducedCode)?.quantity || 0;

    // Outros vendedores no MESMO período
    const otherSellersPVInPeriod = Object.keys(confirmedPVSales)
      .filter(k => k !== saleId && k.startsWith(`${currentSalesPeriod}-`) && k.includes(`-${reducedCode}-`))
      .reduce((acc, k) => acc + confirmedPVSales[k].qtyPV + confirmedPVSales[k].qtyIgnoredPV, 0);

    const availablePVForThisSeller = Math.max(0, pvStock - otherSellersPVInPeriod);

    let updated = { ...current, [field]: nextVal };

    if (field === 'qtyPV' || field === 'qtyIgnoredPV') {
      const sellerPVRequest = updated.qtyPV + updated.qtyIgnoredPV;
      if (sellerPVRequest > Math.min(maxSale, availablePVForThisSeller)) {
        alert(`O total de PV (Vendido + Ignorado) não pode exceder ${Math.min(maxSale, availablePVForThisSeller)} un para este vendedor no período atual.`);
        return;
      }
      updated.qtyNeutral = maxSale - sellerPVRequest;
    } else if (field === 'qtyNeutral') {
      if (updated.qtyPV + updated.qtyIgnoredPV + nextVal > maxSale) {
        updated.qtyIgnoredPV = Math.max(0, maxSale - nextVal - updated.qtyPV);
      }
    }

    const isCategorized = (updated.qtyPV + updated.qtyNeutral + updated.qtyIgnoredPV) > 0;
    // Include metadata in the stored record to avoid fragile parsing later
    onUpdatePVSale(saleId, {
      ...updated,
      confirmed: isCategorized,
      sellerName: sellerName,
      reducedCode: reducedCode,
      unitPrice
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 min-w-0">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 uppercase text-[10px] tracking-widest">
              <FileSearch size={18} className="text-blue-500" /> Análise de Vendas
            </h3>
            <div className="h-4 w-[1px] bg-slate-200"></div>
            <div className="flex flex-wrap items-center gap-3 text-[9px] font-bold uppercase tracking-tighter">
              <button
                type="button"
                onClick={() => handleFilterClick('pending')}
                aria-pressed={activeFilter === 'pending'}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${activeFilter === 'pending'
                  ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-200 scale-[1.02]'
                  : 'bg-white text-slate-400 border-slate-200 hover:text-blue-600 hover:border-blue-200 hover:shadow-sm'
                  }`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${activeFilter === 'pending' ? 'bg-white' : 'bg-blue-500'}`}></div>
                Falta Lançar no Período
              </button>
              <button
                type="button"
                onClick={() => handleFilterClick('finalized')}
                aria-pressed={activeFilter === 'finalized'}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${activeFilter === 'finalized'
                  ? 'bg-green-600 text-white border-green-500 shadow-lg shadow-green-200 scale-[1.02]'
                  : 'bg-white text-slate-400 border-slate-200 hover:text-green-600 hover:border-green-200 hover:shadow-sm'
                  }`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${activeFilter === 'finalized' ? 'bg-white' : 'bg-green-500'}`}></div>
                Lançamento Finalizado
              </button>
              <button
                type="button"
                onClick={() => handleFilterClick('similar')}
                aria-pressed={activeFilter === 'similar'}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${activeFilter === 'similar'
                  ? 'bg-amber-500 text-white border-amber-400 shadow-lg shadow-amber-200 scale-[1.02]'
                  : 'bg-white text-slate-400 border-slate-200 hover:text-amber-600 hover:border-amber-200 hover:shadow-sm'
                  }`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${activeFilter === 'similar' ? 'bg-white' : 'bg-amber-500'}`}></div>
                Similar Vendido
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-200 hover:shadow-blue-300 hover:from-blue-500 hover:to-indigo-500 active:scale-95 transition-all border border-blue-400/30"
              title="Imprimir análise de vendas"
            >
              <Printer size={18} /> Imprimir
            </button>
            <div className="relative w-full sm:w-64 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                ref={analysisSearchInputRef}
                type="text" placeholder="Buscar item..."
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4 max-h-[800px] overflow-y-auto custom-scrollbar">
          {filteredResults.map(res => (
            <div
              key={res.id}
              className={`p-5 rounded-2xl border transition-all ${res.isFinalized ? 'border-green-100 bg-green-50/20' : 'border-slate-100 bg-white hover:shadow-sm'}`}
            >
              <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_280px_180px] gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {res.isFinalized ? (
                      <span className="text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter bg-green-600 text-white flex items-center gap-1">
                        <CheckCircle size={10} /> FINALIZADO EM {currentSalesPeriod}
                      </span>
                    ) : (
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase ${res.status === 'sold' ? 'bg-blue-600 text-white animate-pulse' : res.status === 'replaced' ? 'bg-amber-500 text-white' : 'bg-slate-400 text-white'}`}>
                        {res.status === 'sold' ? 'Pendência SKU' : res.status === 'replaced' ? 'Similar Vendido' : 'Sem Movimento'}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-slate-400 font-bold">RED: {res.reducedCode}</span>
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 uppercase flex flex-wrap items-center gap-2 break-words">
                    {res.name}
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      • {res.pvLab || 'N/D'}
                    </span>
                  </h4>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    <div className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 flex items-start gap-1 max-w-full min-w-0 leading-snug">
                      <FlaskConical size={12} className="mt-0.5" />
                      <span className="min-w-0 break-all"> {res.dcb}</span>
                    </div>
                    <div className="text-[10px] font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-100 flex items-start gap-1 max-w-full min-w-0 leading-snug">
                      <Package size={12} className="mt-0.5" />
                      <span className="min-w-0 break-all">LAB PV: {res.pvLab || 'N/A'}</span>
                    </div>
                    {res.status === 'sold' && res.firstDirectLab && (
                      <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 flex items-start gap-1 max-w-full min-w-0 leading-snug">
                        <Package size={12} className="mt-0.5" />
                        <span className="min-w-0 break-all">LAB PV VENDIDO: {res.firstDirectLab}</span>
                      </div>
                    )}
                    {res.status === 'replaced' && res.firstSimilarLab && (
                      <div className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100 flex items-start gap-1 max-w-full min-w-0 leading-snug">
                        <Package size={12} className="mt-0.5" />
                        <span className="min-w-0 break-all">LAB SIMILAR: {res.firstSimilarLab}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full lg:w-[280px] xl:w-[300px] min-w-0">
                  <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                    <div>PV EM ESTOQUE</div>
                    <div className="text-slate-700">{res.quantity}</div>
                    <div>ESTOQUE FILIAL (ARQ)</div>
                    <div className="text-slate-700">{formatStock(res.pvInventoryStock)}</div>
                    <div>VENCIMENTO</div>
                    <div className="text-slate-700">{res.expiryMonthLabel}</div>
                    <div>CUSTO PV UNITÁRIO</div>
                    <div className="text-slate-700">{formatCurrency(res.pvInventoryCostUnit || 0)}</div>
                    <div>CUSTO PV (ESTOQUE)</div>
                    <div className="text-slate-700">{formatCurrency(res.pvInventoryCostTotal || 0)}</div>
                    {res.status !== 'replaced' && (
                      <>
                        <div>CUSTO PV VENDIDO</div>
                        <div className="text-slate-700">{formatCurrency(res.directInventoryCostTotal || 0)}</div>
                      </>
                    )}
                    {res.status === 'replaced' && (
                      <>
                        <div>CUSTO SIMILAR (TOTAL)</div>
                        <div className="text-slate-700">{formatCurrency(res.similarInventoryCostTotal || 0)}</div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 shrink-0 h-fit justify-end lg:col-span-2 xl:col-span-1 xl:justify-start">
                  <button onClick={() => toggleExpand(res.id, 'sku')} className={`p-3 rounded-xl border text-center min-w-[85px] transition-all ${res.directSoldQty > 0 ? (expanded?.id === res.id && expanded?.type === 'sku' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white border-blue-100 text-blue-600 hover:bg-blue-50') : 'opacity-20'}`}>
                    <p className="text-[8px] font-bold uppercase leading-none mb-1">Saída SKU</p>
                    <p className="text-xl font-black">{res.directSoldQty}</p>
                  </button>
                  <button onClick={() => toggleExpand(res.id, 'similar')} className={`p-3 rounded-xl border text-center min-w-[85px] transition-all ${res.similarSoldQty > 0 ? (expanded?.id === res.id && expanded?.type === 'similar' ? 'bg-amber-600 text-white shadow-lg' : 'bg-white border-amber-100 text-amber-600 hover:bg-amber-50') : 'opacity-20'}`}>
                    <p className="text-[8px] font-bold uppercase leading-none mb-1">Similar</p>
                    <p className="text-xl font-black">{res.similarSoldQty}</p>
                  </button>
                </div>
              </div>

              {expanded?.id === res.id && (
                <div className="mt-4 pt-4 border-t border-slate-100 animate-in slide-in-from-top-2">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      {expanded.type === 'sku' ? <Package size={14} /> : <Repeat size={14} />} {res.isFinalized ? 'Lançamentos Confirmados' : 'Distribuição por Vendedor'}
                    </p>
                    <button onClick={() => setExpanded(null)} className="text-[10px] font-bold text-slate-300 uppercase hover:text-red-500">Fechar Detalhes</button>
                  </div>

                  <div className="space-y-3">
                    {(expanded.type === 'sku' ? res.directSalesDetails : res.similarSalesDetails).map((sale) => {
                      const data = confirmedPVSales[sale.id] || { confirmed: false, qtyPV: 0, qtyNeutral: 0, qtyIgnoredPV: 0 };
                      const max = (sale as any).totalSoldInReport || (sale as any).qty;

                      return (
                        <div key={sale.id} className={`p-4 rounded-2xl border flex flex-col md:flex-row justify-between items-center gap-4 ${res.isFinalized ? 'border-green-100 bg-white/50' : 'border-slate-50 bg-slate-50/50'}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 uppercase truncate">{sale.name}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-[10px] text-blue-600 font-bold uppercase tracking-tight">Vendedor: {sale.seller}</span>
                              <span className="text-[10px] text-slate-400 font-mono font-bold">RED: {sale.code}</span>
                              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Lab: {(sale as any).lab || 'N/D'}</span>
                            </div>
                            <p className="text-[10px] font-black text-slate-800 mt-1 uppercase">TOTAL VENDIDO NESTA NOTA: {max}</p>
                          </div>

                          {expanded.type === 'sku' ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                                {res.isFinalized && (
                                  <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                                    <Lock size={16} className="text-green-600" />
                                  </div>
                                )}
                                <div className="flex flex-col items-center">
                                  <span className="text-[7px] font-black text-green-600 uppercase mb-1">Vendeu PV (+)</span>
                                  <input
                                    type="number" min="0" max={max}
                                    value={data.qtyPV || ''}
                                    disabled={res.isFinalized}
                                    onChange={(e) => handleClassificationChange(sale.id, 'qtyPV', Number(e.target.value), max, res.reducedCode, sale.seller, sale.unitPrice)}
                                    className="w-12 h-9 text-center text-xs font-black bg-green-50 text-green-700 rounded-lg outline-none border border-green-100 focus:ring-1 focus:ring-green-400"
                                  />
                                </div>
                                <div className="flex flex-col items-center">
                                  <span className="text-[7px] font-black text-red-600 uppercase mb-1">Ignorou PV (-)</span>
                                  <input
                                    type="number" min="0" max={max}
                                    value={data.qtyIgnoredPV || ''}
                                    disabled={res.isFinalized}
                                    onChange={(e) => handleClassificationChange(sale.id, 'qtyIgnoredPV', Number(e.target.value), max, res.reducedCode, sale.seller, sale.unitPrice)}
                                    className="w-12 h-9 text-center text-xs font-black bg-red-50 text-red-700 rounded-lg outline-none border border-red-100 focus:ring-1 focus:ring-red-400"
                                  />
                                </div>
                                <div className="flex flex-col items-center">
                                  <span className="text-[7px] font-black text-slate-400 uppercase mb-1">Não era PV (/)</span>
                                  <input
                                    type="number" min="0" max={max}
                                    value={data.qtyNeutral || ''}
                                    disabled={res.isFinalized}
                                    onChange={(e) => handleClassificationChange(sale.id, 'qtyNeutral', Number(e.target.value), max, res.reducedCode, sale.seller, sale.unitPrice)}
                                    className="w-12 h-9 text-center text-xs font-black bg-slate-100 text-slate-600 rounded-lg outline-none border border-slate-200 focus:ring-1 focus:ring-slate-400"
                                  />
                                </div>
                                <div className="h-10 w-[1px] bg-slate-100 mx-1"></div>
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${data.qtyPV + data.qtyNeutral + data.qtyIgnoredPV === max ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-50 text-slate-300 border border-slate-100'}`}>
                                  <CheckSquare size={20} />
                                </div>
                              </div>
                              <p className="text-[7px] font-black text-slate-400 uppercase text-center bg-slate-50 py-1 rounded-lg border border-slate-100">
                                PV Disponível p/ este Vendedor: {Math.max(0, res.quantity - (Object.keys(confirmedPVSales).filter(k => k !== sale.id && k.startsWith(`${currentSalesPeriod}-`) && k.includes(`-${res.reducedCode}-`)).reduce((acc, k) => acc + confirmedPVSales[k].qtyPV + confirmedPVSales[k].qtyIgnoredPV, 0)))} un
                              </p>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2 px-4 py-3 bg-amber-50 rounded-xl border border-amber-100 text-amber-600 text-[10px] font-bold uppercase">
                              <div className="flex items-center gap-2">
                                <Repeat size={16} /> Venda de Similar (Código RED: {sale.code})
                              </div>
                              <div className="text-[9px] font-black text-amber-700 uppercase tracking-widest">
                                CUSTO UNITÁRIO: {formatCurrency((sale as any).inventoryCostUnit || 0)}
                              </div>
                              <div className="text-[9px] font-black text-amber-700 uppercase tracking-widest">
                                CUSTO TOTAL: {formatCurrency((sale as any).inventoryCostTotal || 0)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {expanded.type === 'sku' && !res.isFinalized && (
                    <div className="mt-8 flex justify-end">
                      <button
                        onClick={() => { onFinalizeSale(res.reducedCode, currentSalesPeriod); setExpanded(null); }}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs px-8 py-4 rounded-2xl shadow-xl shadow-blue-200 transition-all active:scale-95"
                      >
                        <Save size={18} /> SALVAR LANÇAMENTOS DO PERÍODO
                      </button>
                    </div>
                  )}

                  {res.isFinalized && (
                    <div className="mt-6 flex justify-center">
                      <div className="flex items-center gap-2 px-6 py-3 bg-green-100 text-green-700 rounded-xl border border-green-200 text-xs font-black uppercase tracking-widest">
                        <Lock size={14} /> Finalizado para o Período {currentSalesPeriod}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AnalysisView;
