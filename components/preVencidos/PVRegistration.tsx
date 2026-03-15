
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Product, PVRecord, SessionInfo } from '../../preVencidos/types';
import { insertAppEventLog } from '../../supabaseService';
import ScannerInput from './ScannerInput';
import { Trash2, Calendar, Hash, FileUp, CheckCircle2, User, Building, Search, FlaskConical, ChevronRight, Info, X } from 'lucide-react';

interface PVRegistrationProps {
  masterProducts: Product[];
  pvRecords: PVRecord[];
  sessionInfo: SessionInfo | null;
  pvEventSummary?: {
    edited: number;
    deleted: number;
    lastUpdatedAt: string | null;
  };
  barcodeByReduced?: Record<string, string>;
  inventoryCostByBarcode?: Record<string, number>;
  originBranches?: string[];
  userEmail?: string;
  userName?: string;
  onUpdatePV?: (id: string, updates: Partial<PVRecord>) => void;
  onAddPV: (record: PVRecord) => void;
  onRemovePV: (id: string) => void;
  onRefresh?: () => void;
}

const DCB_UNCLASSIFIED_LABEL = 'SEM DCB';

const PVRegistration: React.FC<PVRegistrationProps> = ({
  masterProducts,
  pvRecords,
  sessionInfo,
  pvEventSummary,
  barcodeByReduced = {},
  inventoryCostByBarcode = {},
  originBranches = [],
  userEmail,
  userName,
  onUpdatePV,
  onAddPV,
  onRemovePV,
  onRefresh
}) => {
  const [scanningProduct, setScanningProduct] = useState<Product | null>(null);
  const [searchMethod, setSearchMethod] = useState<'C' | 'K' | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [originBranch, setOriginBranch] = useState<string>('');
  const [sectorResponsible, setSectorResponsible] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [drafts, setDrafts] = useState<Record<string, { quantity?: string; sectorResponsible?: string }>>({});
  const updateTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const qtyInputRef = useRef<HTMLInputElement>(null);
  const originInputRef = useRef<HTMLSelectElement>(null);
  const sectorInputRef = useRef<HTMLInputElement>(null);
  const expiryInputRef = useRef<HTMLInputElement>(null);
  const historySearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scanningProduct) {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }
  }, [scanningProduct]);

  useEffect(() => {
    return () => {
      Object.values(updateTimers.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    setDrafts(prev => {
      const ids = new Set(pvRecords.map(r => r.id));
      const next: Record<string, { quantity?: string; sectorResponsible?: string }> = {};
      Object.entries(prev).forEach(([id, data]) => {
        if (ids.has(id)) next[id] = data;
      });
      return next;
    });
  }, [pvRecords]);

  useEffect(() => {
    if (!scanningProduct || originBranch) return;
    if (sessionInfo?.filial) {
      setOriginBranch(sessionInfo.filial);
    } else if (originBranches.length > 0) {
      setOriginBranch(originBranches[0]);
    }
  }, [scanningProduct, originBranch, sessionInfo?.filial, originBranches]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && scanningProduct) {
        setScanningProduct(null);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [scanningProduct]);

  useEffect(() => {
    const handleFindShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        historySearchInputRef.current?.focus();
        historySearchInputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleFindShortcut);
    return () => window.removeEventListener('keydown', handleFindShortcut);
  }, []);

  const normalizeBarcode = (value?: string) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return String(Math.trunc(value));
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/e\+?/i.test(raw)) {
      const num = Number(raw.replace(',', '.'));
      if (Number.isFinite(num)) return String(Math.trunc(num));
    }
    return raw.replace(/\D/g, '');
  };

  const normalizeReducedCode = (value?: string) => {
    if (value === null || value === undefined) return '';
    const digits = String(value).replace(/\D/g, '');
    if (!digits) return '';
    return digits.replace(/^0+/, '') || digits;
  };

  const dcbByReduced = useMemo(() => {
    const map: Record<string, string> = {};
    masterProducts.forEach((product) => {
      const rawReduced = String(product.reducedCode || '').trim();
      const normalizedReduced = normalizeReducedCode(rawReduced);
      const rawDcb = String(product.dcb || '').trim();
      const normalizedDcb = rawDcb.toUpperCase();
      if (!rawDcb || normalizedDcb === 'N/A' || normalizedDcb === DCB_UNCLASSIFIED_LABEL) return;
      if (rawReduced && !map[rawReduced]) map[rawReduced] = rawDcb;
      if (normalizedReduced && !map[normalizedReduced]) map[normalizedReduced] = rawDcb;
    });
    return map;
  }, [masterProducts]);

  const resolveDcbByReduced = useCallback((reducedCode?: string, fallback?: string) => {
    const rawReduced = String(reducedCode || '').trim();
    const normalizedReduced = normalizeReducedCode(rawReduced);
    const fromMaster = dcbByReduced[rawReduced] || (normalizedReduced ? dcbByReduced[normalizedReduced] : '');
    if (fromMaster) return fromMaster;
    const fallbackText = String(fallback || '').trim();
    const normalizedFallback = fallbackText.toUpperCase();
    if (fallbackText && normalizedFallback !== 'N/A' && normalizedFallback !== DCB_UNCLASSIFIED_LABEL) {
      return fallbackText;
    }
    return DCB_UNCLASSIFIED_LABEL;
  }, [dcbByReduced]);

  const productsLookup = useMemo(() => {
    const byBarcode: Record<string, Product> = {};
    const byReduced: Record<string, Product> = {};

    masterProducts.forEach((product) => {
      const rawBarcode = String(product.barcode || '').trim();
      const normalizedBarcode = normalizeBarcode(rawBarcode);
      const barcodeNoZeros = normalizedBarcode.replace(/^0+/, '') || normalizedBarcode;
      const rawReduced = String(product.reducedCode || '').trim();
      const normalizedReduced = normalizeReducedCode(rawReduced);

      [rawBarcode, normalizedBarcode, barcodeNoZeros].filter(Boolean).forEach((key) => {
        if (!byBarcode[key]) byBarcode[key] = product;
      });
      [rawReduced, normalizedReduced].filter(Boolean).forEach((key) => {
        if (!byReduced[key]) byReduced[key] = product;
      });
    });

    return { byBarcode, byReduced };
  }, [masterProducts]);

  const resolveLabFromCadastro = (product?: Product | null) => {
    if (!product) return '';
    if (product.lab) return product.lab;
    const normalizedReduced = normalizeReducedCode(product.reducedCode);
    if (!normalizedReduced) return '';
    const fromMaster = masterProducts.find(p => normalizeReducedCode(p.reducedCode) === normalizedReduced);
    return fromMaster?.lab || '';
  };

  const handleScan = (code: string) => {
    const rawCode = String(code || '').trim();
    const normalizedBarcode = normalizeBarcode(rawCode);
    const barcodeNoZeros = normalizedBarcode.replace(/^0+/, '') || normalizedBarcode;
    const normalizedReduced = normalizeReducedCode(rawCode);

    const foundByBarcode =
      productsLookup.byBarcode[rawCode] ||
      productsLookup.byBarcode[normalizedBarcode] ||
      productsLookup.byBarcode[barcodeNoZeros];
    const foundByReduced =
      productsLookup.byReduced[rawCode] ||
      productsLookup.byReduced[normalizedReduced];

    let found = foundByBarcode || foundByReduced;
    let foundFromRecords = false;
    let fallbackMatchedByBarcode = false;

    if (!found) {
      const fallbackRecord = pvRecords.find((record) => {
        const recordReduced = String(record.reducedCode || '').trim();
        const recordReducedNormalized = normalizeReducedCode(recordReduced);
        const recordBarcodeRaw = String(record.barcode || '').trim();
        const recordBarcodeNormalized = normalizeBarcode(recordBarcodeRaw);
        const recordBarcodeNoZeros = recordBarcodeNormalized.replace(/^0+/, '') || recordBarcodeNormalized;

        const matchedByReduced =
          recordReduced === rawCode ||
          (recordReducedNormalized && recordReducedNormalized === normalizedReduced);
        const matchedByBarcode =
          recordBarcodeRaw === rawCode ||
          (recordBarcodeNormalized && recordBarcodeNormalized === normalizedBarcode) ||
          (recordBarcodeNoZeros && recordBarcodeNoZeros === barcodeNoZeros);

        if (matchedByBarcode) {
          fallbackMatchedByBarcode = true;
        }

        return matchedByReduced || matchedByBarcode;
      });

      if (fallbackRecord) {
        found = {
          id: `pv-${fallbackRecord.id}`,
          name: fallbackRecord.name || 'Produto',
          barcode: fallbackRecord.barcode || '',
          reducedCode: String(fallbackRecord.reducedCode || ''),
          dcb: resolveDcbByReduced(fallbackRecord.reducedCode, fallbackRecord.dcb),
          lab: fallbackRecord.lab
        };
        foundFromRecords = true;
      }
    }

    if (found) {
      const resolvedLab = resolveLabFromCadastro(found);
      setScanningProduct({ ...found, lab: resolvedLab || found.lab });
      setSearchMethod((foundByBarcode || (foundFromRecords && fallbackMatchedByBarcode)) ? 'K' : 'C');
      setQuantity(1);
    } else {
      alert(`Código "${code}" não localizado. Verifique se o relatório DCB de produtos foi carregado corretamente.`);
    }
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 4) val = val.substring(0, 4);
    if (val.length > 2) {
      val = val.substring(0, 2) + '/' + val.substring(2);
    }
    setExpiryDate(val);
  };

  const handleConfirm = () => {
    if (scanningProduct && quantity > 0 && expiryDate.length === 5 && originBranch && sectorResponsible.trim()) {
      const [m, a] = expiryDate.split('/');
      const month = parseInt(m);
      if (month < 1 || month > 12) {
        alert('Mês inválido (01-12)');
        return;
      }

      onAddPV({
        id: Math.random().toString(36).substr(2, 9),
        reducedCode: scanningProduct.reducedCode,
        name: scanningProduct.name,
        barcode: scanningProduct.barcode || '',
        lab: scanningProduct.lab,
        quantity,
        originBranch,
        sectorResponsible: sectorResponsible.trim(),
        expiryDate,
        entryDate: new Date().toISOString(),
        dcb: scanningProduct.dcb
      });
      setScanningProduct(null);
      setSearchMethod(null);
      setExpiryDate('');
      setQuantity(1);
      setSectorResponsible('');
    } else if (scanningProduct) {
      alert('Preencha a quantidade, origem, responsável e vencimento (MM/AA).');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
  };

  const similarProducts = useMemo(() => {
    return scanningProduct
      ? masterProducts.filter(p => p.dcb === scanningProduct.dcb && p.reducedCode !== scanningProduct.reducedCode).slice(0, 10)
      : [];
  }, [scanningProduct, masterProducts]);

  const originOptions = useMemo(() => {
    return Array.from(new Set(
      (originBranches.length > 0 ? originBranches : (sessionInfo?.filial ? [sessionInfo.filial] : []))
        .filter(Boolean)
    ));
  }, [originBranches, sessionInfo?.filial]);

  const setDraftField = (id: string, field: 'quantity' | 'sectorResponsible', value: string) => {
    setDrafts(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }));
  };

  const clearDraftField = (id: string, field: 'quantity' | 'sectorResponsible') => {
    setDrafts(prev => {
      const current = { ...(prev[id] || {}) };
      delete current[field];
      if (Object.keys(current).length === 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: current };
    });
  };

  const clearUpdateTimer = (key: string) => {
    const timer = updateTimers.current[key];
    if (timer) {
      clearTimeout(timer);
      delete updateTimers.current[key];
    }
  };

  const scheduleUpdate = (key: string, fn: () => void) => {
    clearUpdateTimer(key);
    updateTimers.current[key] = setTimeout(() => {
      fn();
      clearUpdateTimer(key);
    }, 400);
  };

  const commitQuantity = (id: string, raw: string, currentValue: number) => {
    if (!onUpdatePV) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      clearDraftField(id, 'quantity');
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      clearDraftField(id, 'quantity');
      return;
    }
    if (parsed === currentValue) {
      clearDraftField(id, 'quantity');
      return;
    }
    onUpdatePV(id, { quantity: parsed });
    clearDraftField(id, 'quantity');
  };

  const commitSector = (id: string, raw: string, currentValue?: string) => {
    if (!onUpdatePV) return;
    const next = raw.trim();
    if ((currentValue || '') === next) {
      clearDraftField(id, 'sectorResponsible');
      return;
    }
    onUpdatePV(id, { sectorResponsible: next });
    clearDraftField(id, 'sectorResponsible');
  };

  const [filterText, setFilterText] = useState('');
  const [filterMonthInput, setFilterMonthInput] = useState('');
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const labByReduced = useMemo(() => {
    const map: Record<string, string> = {};
    masterProducts.forEach(prod => {
      if (!prod.reducedCode || !prod.lab) return;
      const raw = String(prod.reducedCode);
      const normalized = normalizeReducedCode(raw);
      map[raw] = prod.lab;
      if (normalized) map[normalized] = prod.lab;
    });
    return map;
  }, [masterProducts]);

  const resolveLabByReduced = (reducedCode?: string, fallbackLab?: string) => {
    if (!reducedCode) return fallbackLab || 'N/D';
    const raw = String(reducedCode);
    const normalized = normalizeReducedCode(raw);
    const direct = labByReduced[raw] || (normalized ? labByReduced[normalized] : '');
    if (direct) return direct;
    const matchedKey = Object.keys(labByReduced).find(key => normalizeReducedCode(key) === normalized);
    if (matchedKey && labByReduced[matchedKey]) return labByReduced[matchedKey];
    return fallbackLab || 'N/D';
  };

  const formatCurrency = (value: number) => {
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
    } catch {
      return `R$ ${Number(value || 0).toFixed(2)}`;
    }
  };

  const getInventoryCostUnitByReduced = useCallback((reducedCode?: string) => {
    if (!reducedCode) return 0;
    const normalizedReduced = normalizeReducedCode(reducedCode);
    const reducedKey = normalizedReduced ? `red:${normalizedReduced}` : '';
    const reducedCost = reducedKey ? inventoryCostByBarcode[reducedKey] : undefined;
    if (reducedCost !== undefined) return Number(reducedCost || 0);
    const barcode = barcodeByReduced[String(reducedCode)] || (normalizedReduced ? barcodeByReduced[normalizedReduced] : '') || '';
    if (!barcode) return 0;
    const normalized = String(barcode || '').replace(/\D/g, '');
    const noZeros = normalized.replace(/^0+/, '') || normalized;
    const value = inventoryCostByBarcode[normalized] ?? inventoryCostByBarcode[noZeros];
    return Number(value || 0);
  }, [inventoryCostByBarcode, barcodeByReduced]);

  const totalCostPredicted = useMemo(() => {
    return pvRecords.reduce((acc, rec) => {
      const unit = getInventoryCostUnitByReduced(rec.reducedCode);
      return acc + unit * rec.quantity;
    }, 0);
  }, [pvRecords, inventoryCostByBarcode, barcodeByReduced]);

  // PDF Export
  const handleExportPDF = () => {
    if (sessionInfo?.companyId && sessionInfo?.filial) {
      insertAppEventLog({
        company_id: sessionInfo.companyId,
        branch: sessionInfo.filial,
        area: sessionInfo.area || null,
        user_email: userEmail || null,
        user_name: userName || null,
        app: 'pre_vencidos',
        event_type: 'pv_registration_printed',
        entity_type: 'pv_report',
        entity_id: sessionInfo.filial,
        status: 'success',
        success: true,
        source: 'web',
        event_meta: { total_records: pvRecords.length }
      }).catch(() => { });
    }
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFontSize(16);
    doc.text('Relatório de Pré-Vencidos', 10, 20);
    doc.setFontSize(10);
    doc.text(`Filial: ${sessionInfo?.filial || 'N/A'} - Gerado em: ${new Date().toLocaleString()}`, 10, 28);

    // Legend in PDF
    doc.setFontSize(8);
    doc.setTextColor(200, 0, 0);
    doc.text('Legenda: Vermelho = Vencido, Vinho = < 30 dias', 10, 35);
    doc.setTextColor(0, 0, 0);

    const tableColumn = ['Reduzido', 'Descrição', 'Origem', 'Resp. Setor', 'Qtd', 'Custo Unit.', 'Custo Total', 'Vencimento', 'Status', 'Dias', 'Resp.', 'Cadastro'];
    const tableRows: any[] = [];

    filteredRecords.forEach(rec => {
      const status = getExpiryStatus(rec.expiryDate);
      const unitCost = getInventoryCostUnitByReduced(rec.reducedCode);
      tableRows.push([
        rec.reducedCode,
        rec.name,
        rec.originBranch || '-',
        rec.sectorResponsible || '-',
        rec.quantity,
        formatCurrency(unitCost),
        formatCurrency(unitCost * rec.quantity),
        rec.expiryDate,
        status.label,
        status.days + ' dias',
        rec.userName || rec.userEmail || '-',
        new Date(rec.entryDate).toLocaleString('pt-BR')
      ]);
    });

    autoTable(doc, {
      startY: 40,
      head: [tableColumn],
      body: tableRows,
      theme: 'grid',
      tableWidth: 190,
      margin: { left: 10, right: 10 },
      headStyles: {
        fillColor: [20, 184, 166],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'left',
        overflow: 'ellipsize'
      },
      styles: {
        fontSize: 6.3,
        cellPadding: 1.1,
        overflow: 'ellipsize',
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
        valign: 'middle',
        textColor: [51, 65, 85]
      },
      columnStyles: {
        0: { cellWidth: 13 }, // Reduzido
        1: { cellWidth: 27 }, // Descrição
        2: { cellWidth: 14 }, // Origem
        3: { cellWidth: 16 }, // Resp. Setor
        4: { cellWidth: 8, halign: 'center' }, // Qtd
        5: { cellWidth: 15, halign: 'right' }, // Custo Unit.
        6: { cellWidth: 15, halign: 'right' }, // Custo Total
        7: { cellWidth: 12, halign: 'center' }, // Vencimento
        8: { cellWidth: 11, halign: 'center' }, // Status
        9: { cellWidth: 10, halign: 'center' }, // Dias
        10: { cellWidth: 27 }, // Resp.
        11: { cellWidth: 22 } // Cadastro
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 8) {
          const statusLabel = data.cell.raw;
          if (statusLabel === 'VENCIDO') data.cell.styles.textColor = [220, 38, 38]; // Red
          if (statusLabel === 'CRÍTICO') data.cell.styles.textColor = [159, 18, 57]; // Rose/Wine
          if (statusLabel === 'NO PRAZO') data.cell.styles.textColor = [37, 99, 235]; // Blue
        }
      }
    });

    doc.save(`pre_vencidos_${sessionInfo?.filial || 'geral'}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const getExpiryStatus = (expiry: string) => {
    if (!expiry || expiry.length !== 5) return { label: '-', color: 'slate', days: 0, bg: 'bg-slate-50' };

    const [m, y] = expiry.split('/').map(Number);
    const expiryDateObj = new Date(2000 + y, m, 0);
    expiryDateObj.setHours(23, 59, 59, 999);

    const now = new Date();
    const diffTime = expiryDateObj.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: 'VENCIDO', color: 'text-red-600', days: diffDays, bg: 'bg-red-50 border-red-100' };
    if (diffDays <= 30) return { label: 'CRÍTICO', color: 'text-rose-800', days: diffDays, bg: 'bg-rose-50 border-rose-100' };
    return { label: 'NO PRAZO', color: 'text-blue-600', days: diffDays, bg: 'bg-blue-50 border-blue-100' };
  };

  const [sortConfig, setSortConfig] = useState<{ key: keyof PVRecord, direction: 'asc' | 'desc' } | null>(null);

  const handleSort = (key: keyof PVRecord) => {
    if (sortConfig && sortConfig.key === key) {
      if (sortConfig.direction === 'asc') {
        setSortConfig({ key, direction: 'desc' });
      } else {
        setSortConfig(null);
      }
    } else {
      setSortConfig({ key, direction: 'asc' });
    }
  };

  const getSortIcon = (key: keyof PVRecord) => {
    if (!sortConfig || sortConfig.key !== key) return <div className="w-3 h-3 ml-1 text-slate-300"><ChevronRight className="rotate-90" size={12} /></div>;
    return sortConfig.direction === 'asc'
      ? <div className="w-3 h-3 ml-1 text-amber-500 ring-2 ring-amber-100 rounded-full"><ChevronRight className="-rotate-90" size={12} /></div>
      : <div className="w-3 h-3 ml-1 text-amber-500 ring-2 ring-amber-100 rounded-full"><ChevronRight className="rotate-90" size={12} /></div>;
  };

  const filteredRecords = useMemo(() => {
    const search = filterText.trim().toLowerCase();
    let result = pvRecords.filter(rec => {
      const matchText = !search
        ? true
        : rec.name.toLowerCase().includes(search)
        || rec.reducedCode.toLowerCase().includes(search);
      const matchMonth = selectedMonths.length > 0
        ? selectedMonths.includes(rec.expiryDate)
        : (filterMonthInput ? rec.expiryDate.includes(filterMonthInput) : true);

      let matchStatus = true;
      if (filterStatus) {
        const status = getExpiryStatus(rec.expiryDate);
        matchStatus = status.label === filterStatus;
      }

      return matchText && matchMonth && matchStatus;
    });

    if (sortConfig) {
      result.sort((a, b) => {
        if (sortConfig.key === 'expiryDate') {
          const [m1, y1] = a.expiryDate.split('/').map(Number);
          const [m2, y2] = b.expiryDate.split('/').map(Number);
          const v1 = (y1 * 12) + m1;
          const v2 = (y2 * 12) + m2;
          return sortConfig.direction === 'asc' ? v1 - v2 : v2 - v1;
        }

        const v1 = a[sortConfig.key];
        const v2 = b[sortConfig.key];

        if (typeof v1 === 'number' && typeof v2 === 'number') {
          return sortConfig.direction === 'asc' ? v1 - v2 : v2 - v1;
        }

        const s1 = String(v1 ?? '');
        const s2 = String(v2 ?? '');
        return sortConfig.direction === 'asc'
          ? s1.localeCompare(s2)
          : s2.localeCompare(s1);
      });
    }

    return result;
  }, [pvRecords, filterText, filterMonthInput, selectedMonths, filterStatus, sortConfig]);

  const { launchesLast30, lastLaunchDate, lastLaunchLabel } = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const validLaunchDates = pvRecords
      .map(rec => ({ rec, date: new Date(rec.entryDate) }))
      .filter(item => !Number.isNaN(item.date.getTime()));
    const launchesLast30 = validLaunchDates.filter(item => item.date >= thirtyDaysAgo).length;
    const lastLaunchDate = validLaunchDates.reduce<Date | null>((latest, item) => {
      if (!latest || item.date > latest) return item.date;
      return latest;
    }, null);
    const lastLaunchLabel = lastLaunchDate
      ? `${lastLaunchDate.toLocaleDateString('pt-BR')} ${lastLaunchDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
      : 'Sem lançamentos';

    return { launchesLast30, lastLaunchDate, lastLaunchLabel };
  }, [pvRecords]);

  const lastEditDate = pvEventSummary?.lastUpdatedAt ? new Date(pvEventSummary.lastUpdatedAt) : null;
  const lastEditLabel = lastEditDate && !Number.isNaN(lastEditDate.getTime())
    ? `${lastEditDate.toLocaleDateString('pt-BR')} ${lastEditDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    : 'Sem alterações';
  const editedCount = pvEventSummary?.edited || 0;
  const deletedCount = pvEventSummary?.deleted || 0;

  return (
    <div className="space-y-6">
      {/* GRID DE MÉTRICAS E INFO (HORIZONTAL TOTAL) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Info da Sessão */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
            <Building size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sessão Ativa</p>
            <p className="text-sm font-bold text-slate-800 truncate">{sessionInfo?.company || 'GERAL'}</p>
            <p className="text-[9px] text-slate-500 font-bold truncate">Filial: {sessionInfo?.filial || '-'}</p>
          </div>
        </div>

        {/* Card 2: Itens Totais */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
            <Hash size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Itens Totais</p>
            <p className="text-2xl font-black text-indigo-700 leading-none mt-1">{pvRecords.reduce((acc, r) => acc + r.quantity, 0)}</p>
            <p className="text-[9px] text-slate-500 font-bold mt-1">Lançados (30d): {launchesLast30}</p>
          </div>
        </div>

        {/* Card 3: SKUs Únicos */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
            <Search size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SKUs Únicos</p>
            <p className="text-2xl font-black text-amber-700 leading-none mt-1">{new Set(pvRecords.map(r => r.reducedCode)).size}</p>
            <p className="text-[9px] text-slate-500 font-bold mt-1">Último: {lastLaunchDate ? lastLaunchDate.toLocaleDateString() : '-'}</p>
          </div>
        </div>

        {/* Card 4: Total Previsto */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
            <FileUp size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Custo p/ Vencer</p>
            <p className="text-xl font-black text-emerald-700 leading-none mt-1">{formatCurrency(totalCostPredicted)}</p>
            <div className="flex items-center gap-1 mt-1 font-bold">
              <span className="text-[9px] text-slate-500">Saldo Previsto</span>
              <Info size={10} className="text-slate-300" />
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO PRINCIPAL: SCANNER E RESUMO POR VALIDADE */}
      <div className="grid grid-cols-1 gap-6">
        {/* SCANNER */}
        <div>
          <div className="bg-white p-6 md:p-10 rounded-3xl shadow-md border border-slate-100 min-h-[300px] flex flex-col justify-center transition-all relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-2 h-full bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>

            {!scanningProduct ? (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">Cadastro de Pré-Vencido</h3>
                  <p className="text-xs text-slate-400 font-medium">Bipe os produtos ou digite o código reduzido para iniciar</p>
                </div>
                <ScannerInput onScan={handleScan} />
              </div>
            ) : (
              <div className="animate-in zoom-in-[0.98] fade-in duration-300">
                <div className="flex justify-between items-start mb-6 bg-slate-50/80 p-5 rounded-2xl border border-slate-100">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded tracking-tighter ${searchMethod === 'K' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}>
                        {searchMethod === 'K' ? 'BIPADO (K)' : 'DIGITADO (C)'}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Identificado</span>
                    </div>
                    <h3 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight tracking-tight">{scanningProduct.name}</h3>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="bg-white border border-slate-200 px-3 py-1 rounded-lg text-xs font-bold text-slate-600 shadow-sm">RED: {scanningProduct.reducedCode}</span>
                      <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold border border-blue-100 flex items-center gap-1.5 shadow-sm">
                        <FlaskConical size={14} className="shrink-0 text-blue-400" /> <span className="truncate">DCB: {scanningProduct.dcb}</span>
                      </span>
                    </div>
                  </div>
                  <button onClick={() => setScanningProduct(null)} className="p-2.5 bg-white rounded-xl text-slate-300 hover:text-red-500 hover:shadow-lg transition-all shadow-sm border border-slate-100">
                    <Trash2 size={24} />
                  </button>
                </div>

                {similarProducts.length > 0 && (
                  <div className="mb-8 p-4 bg-amber-50/50 rounded-2xl border border-amber-100/50">
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <FlaskConical size={14} /> Sugestão de Similares no Grupo
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {similarProducts.map(p => (
                        <span key={p.reducedCode} className="text-[10px] bg-white border border-amber-200/50 text-amber-700 px-3 py-1.5 rounded-xl shadow-sm font-bold transition-transform hover:scale-105">
                          {p.name} <span className="text-amber-300 ml-1">({p.reducedCode})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantidade</label>
                    <div className="relative group/input">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within/input:text-blue-500 transition-colors" size={20} />
                      <input
                        ref={qtyInputRef}
                        type="number"
                        value={quantity}
                        min="1"
                        onChange={(e) => setQuantity(Number(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            originInputRef.current?.focus();
                          }
                        }}
                        className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 focus:ring-0 outline-none text-xl font-bold text-slate-700 transition-all bg-slate-50 focus:bg-white"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Origem do Item</label>
                    <div className="relative group/input">
                      <Building className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within/input:text-blue-500 transition-colors" size={20} />
                      <select
                        ref={originInputRef}
                        value={originBranch}
                        onChange={(e) => setOriginBranch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            sectorInputRef.current?.focus();
                          }
                        }}
                        disabled={originOptions.length === 0}
                        className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 focus:ring-0 outline-none text-sm font-black text-slate-700 transition-all bg-slate-50 focus:bg-white custom-select"
                      >
                        <option value="">{originOptions.length === 0 ? 'Sem filiais' : 'Filial...'}</option>
                        {originOptions.map(branch => (
                          <option key={branch} value={branch}>{branch}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Responsável</label>
                    <div className="relative group/input">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within/input:text-blue-500 transition-colors" size={20} />
                      <input
                        ref={sectorInputRef}
                        type="text"
                        value={sectorResponsible}
                        onChange={(e) => setSectorResponsible(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            expiryInputRef.current?.focus();
                          }
                        }}
                        placeholder="Nome..."
                        className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 focus:ring-0 outline-none text-sm font-black text-slate-700 transition-all bg-slate-50 focus:bg-white"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Validade (MM/AA)</label>
                    <div className="relative group/input">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within/input:text-blue-500 transition-colors" size={20} />
                      <input
                        ref={expiryInputRef}
                        type="text"
                        value={expiryDate}
                        onChange={handleExpiryChange}
                        onKeyDown={handleKeyDown}
                        placeholder="MM/AA"
                        maxLength={5}
                        className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 focus:ring-0 outline-none text-xl font-bold text-slate-700 transition-all bg-slate-50 focus:bg-white"
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleConfirm}
                  className="w-full bg-blue-600 text-white py-4 md:py-5 rounded-2xl font-black text-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-500/20 active:scale-[0.98] border-b-4 border-blue-800"
                >
                  <CheckCircle2 size={24} /> CONFIRMAR LANÇAMENTO (ENTER)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RESUMO POR VALIDADE (FULL WIDTH HORIZONTAL) */}
        <div>
          <div className="bg-white p-5 rounded-3xl shadow-md border border-slate-100">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={18} className="text-blue-500" />
              <h3 className="font-black text-slate-800 text-xs uppercase tracking-widest">Resumo / Validade</h3>
            </div>

            <div className="flex flex-wrap gap-3 overflow-x-auto custom-scrollbar pb-2">
              {(() => {
                const { sortedDates, grouped } = useMemo(() => {
                  const currentGrouped = pvRecords.reduce((acc, rec) => {
                    const key = rec.expiryDate;
                    if (!acc[key]) acc[key] = { items: 0, skus: new Set<string>(), costTotal: 0 };
                    const unit = getInventoryCostUnitByReduced(rec.reducedCode);
                    acc[key].items += rec.quantity;
                    acc[key].skus.add(rec.reducedCode);
                    acc[key].costTotal += unit * rec.quantity;
                    return acc;
                  }, {} as Record<string, { items: number; skus: Set<string>; costTotal: number }>);

                  const currentSortedDates = Object.keys(currentGrouped).sort((a, b) => {
                    const [m1, y1] = a.split('/').map(Number);
                    const [m2, y2] = b.split('/').map(Number);
                    return (y1 * 12 + m1) - (y2 * 12 + m2);
                  });
                  return { sortedDates: currentSortedDates, grouped: currentGrouped };
                }, [pvRecords, inventoryCostByBarcode, barcodeByReduced]);

                return sortedDates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-300 gap-3 border-2 border-dashed border-slate-50 rounded-2xl w-full">
                    <Calendar size={32} className="opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-tighter italic">Vazio</p>
                  </div>
                ) : (
                  sortedDates.map(date => {
                    const data = grouped[date];
                    const status = getExpiryStatus(date);
                    const isActive = selectedMonths.includes(date);

                    return (
                      <button
                        key={date}
                        onClick={() =>
                          setSelectedMonths(prev =>
                            prev.includes(date) ? prev.filter(m => m !== date) : [...prev, date]
                          )
                        }
                        className={`w-[240px] p-3 rounded-2xl border-2 transition-all flex flex-col gap-2 relative overflow-hidden group/item flex-none
                          ${isActive
                            ? 'border-amber-400 bg-amber-50 shadow-inner ring-1 ring-amber-100'
                            : `${status.bg} border-transparent hover:border-slate-200`
                          }`}
                      >
                        <div className="flex items-center justify-between gap-2 relative z-10">
                          <span className={`text-sm font-black ${isActive ? 'text-amber-700' : status.color}`}>{date}</span>
                          <span className="text-[10px] font-black text-slate-700">{formatCurrency(data.costTotal)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 relative z-10 text-[8px] font-black uppercase tracking-widest">
                          <span className={`${isActive ? 'text-amber-600' : 'text-slate-400'}`}>
                            {data.items} unidades · {data.skus.size} skus
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-white ${status.label === 'VENCIDO' ? 'bg-red-500' :
                            status.label === 'CRÍTICO' ? 'bg-rose-500' : 'bg-blue-500'
                            }`}>
                            {status.label}
                          </span>
                        </div>
                        {isActive && <div className="absolute right-0 top-0 h-full w-1 bg-amber-500"></div>}
                      </button>
                    );
                  })
                );
              })()}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-50">
              <div className="bg-slate-50 p-3 rounded-xl">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Total da Sessão</p>
                <p className="text-sm font-black text-slate-800">{formatCurrency(totalCostPredicted)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Histórico em Largura Total */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800">Histórico de Lançamentos</h3>
            <div className="flex gap-2">
              <button
                onClick={onRefresh}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-all"
                title="Forçar Atualização"
              >
                <CheckCircle2 size={14} /> Atualizar
              </button>
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all"
                title="Baixar PDF"
              >
                <FileUp size={14} /> PDF
              </button>
              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center">
                TOTAL: {filteredRecords.length}
              </span>
            </div>
          </div>

          <div className="relative max-w-xl">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={historySearchInputRef}
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Buscar por código reduzido ou descrição..."
              className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>

          <div className="flex flex-col md:flex-row gap-4 pt-4 border-t border-slate-100 justify-end">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterStatus(filterStatus === 'NO PRAZO' ? '' : 'NO PRAZO')}
                className={`px-3 py-2 rounded-xl border text-[10px] font-bold uppercase transition-all flex items-center gap-2 ${filterStatus === 'NO PRAZO' ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200'}`}
              >
                <div className={`w-2 h-2 rounded-full ${filterStatus === 'NO PRAZO' ? 'bg-white' : 'bg-blue-500'}`}></div>
                No Prazo
              </button>
              <button
                onClick={() => setFilterStatus(filterStatus === 'CRÍTICO' ? '' : 'CRÍTICO')}
                className={`px-3 py-2 rounded-xl border text-[10px] font-bold uppercase transition-all flex items-center gap-2 ${filterStatus === 'CRÍTICO' ? 'bg-rose-700 border-rose-700 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200'}`}
              >
                <div className={`w-2 h-2 rounded-full ${filterStatus === 'CRÍTICO' ? 'bg-white' : 'bg-rose-700'}`}></div>
                Crítico
              </button>
              <button
                onClick={() => setFilterStatus(filterStatus === 'VENCIDO' ? '' : 'VENCIDO')}
                className={`px-3 py-2 rounded-xl border text-[10px] font-bold uppercase transition-all flex items-center gap-2 ${filterStatus === 'VENCIDO' ? 'bg-red-600 border-red-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200'}`}
              >
                <div className={`w-2 h-2 rounded-full ${filterStatus === 'VENCIDO' ? 'bg-white' : 'bg-red-600'}`}></div>
                Vencido
              </button>

              {(filterText || filterMonthInput || selectedMonths.length > 0 || filterStatus) && (
                <button
                  onClick={() => { setFilterText(''); setFilterMonthInput(''); setSelectedMonths([]); setFilterStatus(''); }}
                  className="ml-2 flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-bold uppercase hover:bg-red-100 hover:text-red-600 transition-all border border-slate-200"
                >
                  <X size={12} /> Limpar Filtros
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-[9px] font-bold text-slate-400 uppercase tracking-tight pt-2">
            <Info size={12} />
            <span>Legenda: utilize os botões acima para filtrar por status. Você pode combinar a busca com o filtro de mês na tabela.</span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
          <table className="w-full relative border-separate border-spacing-0">
            <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-bold tracking-widest border-b border-slate-100 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left w-24 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('reducedCode')}>
                  <div className="flex items-center">
                    Reduzido (C) {getSortIcon('reducedCode')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('name')}>
                  <div className="flex items-center">
                    Descrição (D) {getSortIcon('name')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left w-28">
                  Laboratório (F)
                </th>
                <th className="px-4 py-3 text-left w-32 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('originBranch')}>
                  <div className="flex items-center">
                    Origem {getSortIcon('originBranch')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left w-32 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('sectorResponsible')}>
                  <div className="flex items-center">
                    Resp. Setor {getSortIcon('sectorResponsible')}
                  </div>
                </th>
                <th className="px-2 py-3 text-center w-16 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('quantity')}>
                  <div className="flex items-center justify-center">
                    Qtd {getSortIcon('quantity')}
                  </div>
                </th>
                <th className="px-4 py-3 text-right w-28">
                  Custo Unit.
                </th>
                <th className="px-4 py-3 text-right w-28">
                  Custo Total
                </th>
                <th className="px-4 py-3 text-center w-28 border-l border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('expiryDate')}>
                  <div className="space-y-1">
                    <div className="flex items-center justify-center">
                      Venc. {getSortIcon('expiryDate')}
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Mês"
                        maxLength={5}
                        value={filterMonthInput}
                        onChange={(e) => {
                          let v = e.target.value.replace(/\D/g, '');
                          if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2, 4);
                          setFilterMonthInput(v);
                        }}
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 text-[10px] text-slate-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none font-medium normal-case"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                </th>
                <th className="px-4 py-3 text-left w-32">Status / Cad.</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-20 text-center text-slate-400 italic">
                    <div className="flex flex-col items-center gap-3">
                      <Search size={40} className="text-slate-200" />
                      <p className="text-sm">Nenhum item encontrado.</p>
                      {filterText || filterMonthInput || selectedMonths.length > 0 ? <p className="text-xs text-blue-500 cursor-pointer hover:underline" onClick={() => { setFilterText(''); setFilterMonthInput(''); setSelectedMonths([]); }}>Limpar filtros</p> : null}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => {
                  const status = getExpiryStatus(rec.expiryDate);
                  return (
                    <tr key={rec.id} className={`hover:brightness-95 transition-all group ${status.bg}`}>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500 font-bold">{rec.reducedCode}</td>
                      <td className="px-4 py-2">
                        <div className="font-bold text-slate-800 text-sm leading-tight">{rec.name}</div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                          <FlaskConical size={8} className="shrink-0 text-blue-400" /> <span className="truncate max-w-[180px]">{resolveDcbByReduced(rec.reducedCode, rec.dcb)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-[10px] font-bold text-slate-600 uppercase">
                        {resolveLabByReduced(rec.reducedCode, rec.lab)}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={rec.originBranch || ''}
                          onChange={(e) => onUpdatePV?.(rec.id, { originBranch: e.target.value })}
                          className="w-full min-w-[120px] bg-white/80 text-slate-700 px-2 py-1 rounded-lg font-bold text-[10px] border border-slate-200 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none custom-select"
                        >
                          <option value="">-</option>
                          {(rec.originBranch && !originOptions.includes(rec.originBranch) ? [rec.originBranch, ...originOptions] : originOptions).map(branch => (
                            <option key={branch} value={branch}>{branch}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={drafts[rec.id]?.sectorResponsible ?? (rec.sectorResponsible || '')}
                          onChange={(e) => setDraftField(rec.id, 'sectorResponsible', e.target.value)}
                          onBlur={(e) => {
                            clearUpdateTimer(`${rec.id}-sector`);
                            commitSector(rec.id, e.target.value, rec.sectorResponsible);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.currentTarget as HTMLInputElement).blur();
                            }
                          }}
                          onInput={(e) => {
                            const value = (e.currentTarget as HTMLInputElement).value;
                            scheduleUpdate(`${rec.id}-sector`, () => commitSector(rec.id, value, rec.sectorResponsible));
                          }}
                          placeholder="-"
                          className="w-full min-w-[120px] bg-white/80 text-slate-700 px-2 py-1 rounded-lg font-bold text-[10px] border border-slate-200 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={drafts[rec.id]?.quantity ?? String(rec.quantity)}
                          onChange={(e) => setDraftField(rec.id, 'quantity', e.target.value)}
                          onBlur={(e) => {
                            clearUpdateTimer(`${rec.id}-qty`);
                            commitQuantity(rec.id, e.target.value, rec.quantity);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.currentTarget as HTMLInputElement).blur();
                            }
                          }}
                          onInput={(e) => {
                            const value = (e.currentTarget as HTMLInputElement).value;
                            scheduleUpdate(`${rec.id}-qty`, () => commitQuantity(rec.id, value, rec.quantity));
                          }}
                          className="w-12 text-center bg-white/80 text-slate-800 px-1 py-0.5 rounded-lg font-bold text-xs border border-slate-200 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formatCurrency(getInventoryCostUnitByReduced(rec.reducedCode))}
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-slate-700">
                        {formatCurrency(getInventoryCostUnitByReduced(rec.reducedCode) * rec.quantity)}
                      </td>
                      <td className="px-4 py-2 text-center border-l border-slate-100/50">
                        <div className="text-sm font-black text-slate-700">{rec.expiryDate}</div>
                        <div className={`text-[9px] font-bold ${status.color} mt-0.5`}>{status.days} dias</div>
                      </td>
                      <td className="px-4 py-2">
                        <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase mb-0.5 ${status.label === 'VENCIDO' ? 'bg-red-200 text-red-800' : status.label === 'CRÍTICO' ? 'bg-rose-200 text-rose-900' : 'bg-blue-200 text-blue-800'}`}>
                          {status.label}
                        </div>
                        <div className="text-[9px] text-slate-500 flex flex-col leading-tight">
                          <span className="font-bold text-slate-600">{rec.userName?.split(' ')[0] || rec.userEmail?.split('@')[0] || 'Unknown'}</span>
                          <span className="opacity-75">{new Date(rec.entryDate).toLocaleDateString('pt-BR')} {new Date(rec.entryDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => onRemovePV(rec.id)} className="text-slate-400 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-white hover:shadow-sm">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PVRegistration;
