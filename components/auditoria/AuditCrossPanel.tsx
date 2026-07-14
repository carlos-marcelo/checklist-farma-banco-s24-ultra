import React, { useDeferredValue, useMemo, useState } from 'react';
import {
    AlertTriangle,
    ArrowDownUp,
    Building2,
    Check,
    ChevronLeft,
    ChevronRight,
    FileSpreadsheet,
    Filter,
    Layers3,
    LineChart,
    Loader2,
    RefreshCw,
    Search,
    ShieldAlert,
    Store,
    TrendingDown,
    TrendingUp,
    X
} from 'lucide-react';

export type AuditCrossStatus = 'open' | 'completed';

export type AuditCrossItem = {
    reducedCode: string;
    barcode?: string;
    description: string;
    groupName: string;
    deptName: string;
    catName: string;
    sysQty: number;
    countedQty: number;
    diffQty: number;
    diffCost: number;
};

export type AuditCrossRow = {
    key: string;
    status: AuditCrossStatus;
    branch: string;
    area: string;
    city?: string;
    auditNumber: number;
    progressPct: number;
    countedUnits: number;
    diffQty: number;
    countedCost: number;
    diffCost: number;
    divergencePct: number;
    updatedAt: string;
    companyId?: string;
    companyName?: string;
    items: AuditCrossItem[];
};

type AuditCrossPanelProps = {
    rows: AuditCrossRow[];
    loading?: boolean;
    onRefresh: () => void;
    onExport: (status: AuditCrossStatus) => void;
    onOpenAudit: (row: AuditCrossRow) => void;
};

type AuditSignalEvent = {
    key: string;
    branch: string;
    area: string;
    city?: string;
    auditNumber: number;
    status: AuditCrossStatus;
    updatedAt: string;
    sysQty: number;
    countedQty: number;
    diffQty: number;
    diffCost: number;
};

type AuditProductSignal = {
    reducedCode: string;
    barcode?: string;
    description: string;
    groupName: string;
    deptName: string;
    catName: string;
    events: AuditSignalEvent[];
    shortageCount: number;
    surplusCount: number;
    reversalCount: number;
    branchCount: number;
    netQty: number;
    netCost: number;
    absoluteCost: number;
    score: number;
    priority: 'high' | 'medium' | 'review';
};

type AuditHierarchySignal = {
    key: string;
    type: 'Grupo' | 'Departamento' | 'Categoria';
    name: string;
    occurrences: number;
    shortages: number;
    surpluses: number;
    netCost: number;
    absoluteCost: number;
    skus: Set<string>;
    audits: Set<string>;
};

type AuditTransferMatch = {
    key: string;
    reducedCode: string;
    description: string;
    groupName: string;
    deptName: string;
    catName: string;
    shortage: AuditSignalEvent;
    surplus: AuditSignalEvent;
    matchedQty: number;
    correlatedCost: number;
    crossStatus: boolean;
    sameArea: boolean;
    sameCity: boolean | null;
};

type AuditFlowSummary = {
    key: string;
    label: string;
    subtitle: string;
    matchedQty: number;
    correlatedCost: number;
    products: Set<string>;
    matches: AuditTransferMatch[];
};

const formatCurrency = (value: number) => value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
});

const formatSignedCurrency = (value: number) => `${value > 0 ? '+' : ''}${formatCurrency(value)}`;

const formatPercent = (value: number) => `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
})}%`;

const formatSignedQuantity = (value: number) => `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR', {
    maximumFractionDigits: 0
})}`;

const formatAuditStatus = (status: AuditCrossStatus) => status === 'open' ? 'Aberta' : 'Concluída';

const formatShortDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Data não informada';
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const getBranchOrder = (branch: string) => {
    const value = Number(String(branch || '').match(/\d+/)?.[0] || Number.MAX_SAFE_INTEGER);
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
};

const EMPTY_AUDIT_CROSS_ROWS: AuditCrossRow[] = [];

const AuditCrossPanel: React.FC<AuditCrossPanelProps> = ({
    rows,
    loading = false,
    onRefresh,
    onExport,
    onOpenAudit
}) => {
    const [expanded, setExpanded] = useState(() =>
        typeof window === 'undefined' || !window.matchMedia('(max-width: 1279px)').matches
    );
    const [statusFilter, setStatusFilter] = useState<'all' | AuditCrossStatus>('all');
    const [areaFilter, setAreaFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
    const [panelView, setPanelView] = useState<'audits' | 'signals'>('audits');
    const [signalView, setSignalView] = useState<'transfers' | 'reversals' | 'recurrence' | 'hierarchy'>('transfers');
    const [flowView, setFlowView] = useState<'branch' | 'area' | 'city'>('branch');
    const [expandedSignal, setExpandedSignal] = useState<string | null>(null);

    const areas = useMemo(
        () => Array.from(new Set(rows.map(row => row.area).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        [rows]
    );
    const statusCounts = useMemo(() => ({
        all: rows.length,
        open: rows.filter(row => row.status === 'open').length,
        completed: rows.filter(row => row.status === 'completed').length
    }), [rows]);

    const filteredRows = useMemo(() => {
        const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
        return rows
            .filter(row => statusFilter === 'all' || row.status === statusFilter)
            .filter(row => areaFilter === 'all' || row.area === areaFilter)
            .filter(row => {
                if (!normalizedSearch) return true;
                return `${row.branch} ${row.area} ${row.auditNumber}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch);
            })
            .sort((a, b) => {
                const areaOrder = a.area.localeCompare(b.area, 'pt-BR');
                if (areaOrder !== 0) return areaOrder;
                const branchOrder = getBranchOrder(a.branch) - getBranchOrder(b.branch);
                if (branchOrder !== 0) return branchOrder;
                if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
                return b.auditNumber - a.auditNumber;
            });
    }, [areaFilter, rows, search, statusFilter]);

    const selectedRows = useMemo(() => {
        const selected = new Set(selectedKeys);
        return rows.filter(row => selected.has(row.key));
    }, [rows, selectedKeys]);

    const scopeRows = selectedRows.length > 0 ? selectedRows : filteredRows;
    const shouldAnalyzeSignals = expanded && panelView === 'signals';
    const deferredSignalRows = useDeferredValue(shouldAnalyzeSignals ? scopeRows : EMPTY_AUDIT_CROSS_ROWS);
    const signalAnalysisPending = shouldAnalyzeSignals && deferredSignalRows !== scopeRows;
    const scopeSummary = useMemo(() => scopeRows.reduce((summary, row) => {
        summary.units += row.countedUnits;
        summary.diffQty += row.diffQty;
        summary.diffCost += row.diffCost;
        summary.progress += row.progressPct;
        summary.areas.add(row.area);
        return summary;
    }, {
        units: 0,
        diffQty: 0,
        diffCost: 0,
        progress: 0,
        areas: new Set<string>()
    }), [scopeRows]);

    const areaSummaries = useMemo(() => {
        const map = new Map<string, { area: string; audits: number; units: number; diffCost: number }>();
        filteredRows.forEach(row => {
            const current = map.get(row.area) || { area: row.area, audits: 0, units: 0, diffCost: 0 };
            current.audits += 1;
            current.units += row.countedUnits;
            current.diffCost += row.diffCost;
            map.set(row.area, current);
        });
        return Array.from(map.values()).sort((a, b) => a.area.localeCompare(b.area, 'pt-BR'));
    }, [filteredRows]);

    const toggleSelection = (key: string) => {
        setSelectedKeys(current => current.includes(key)
            ? current.filter(item => item !== key)
            : [...current, key]);
    };

    const averageProgress = scopeRows.length > 0 ? scopeSummary.progress / scopeRows.length : 0;
    const pairDelta = selectedRows.length === 2 ? {
        units: selectedRows[1].countedUnits - selectedRows[0].countedUnits,
        diffCost: selectedRows[1].diffCost - selectedRows[0].diffCost,
        progress: selectedRows[1].progressPct - selectedRows[0].progressPct
    } : null;

    const auditSignals = useMemo(() => {
        type ProductAccumulator = Omit<AuditProductSignal, 'events' | 'shortageCount' | 'surplusCount' | 'reversalCount' | 'branchCount' | 'netQty' | 'netCost' | 'absoluteCost' | 'score' | 'priority'> & {
            events: Map<string, AuditSignalEvent>;
        };
        const products = new Map<string, ProductAccumulator>();
        const hierarchy = new Map<string, AuditHierarchySignal>();
        const normalizeCode = (value: unknown) => String(value ?? '').trim().replace(/\D/g, '').replace(/^0+/, '');
        const hierarchyValue = (value: unknown, fallback: string) => String(value || fallback).trim() || fallback;

        deferredSignalRows.forEach(row => {
            (row.items || []).forEach(item => {
                const reducedCode = normalizeCode(item.reducedCode);
                const diffQty = Number(item.diffQty || 0);
                const diffCost = Number(item.diffCost || 0);
                if (!reducedCode || (Math.abs(diffQty) <= 0.01 && Math.abs(diffCost) <= 0.01)) return;

                const product = products.get(reducedCode) || {
                    reducedCode,
                    barcode: item.barcode,
                    description: item.description || 'PRODUTO SEM DESCRIÇÃO',
                    groupName: hierarchyValue(item.groupName, 'DIVERSOS (SEM GRUPO)'),
                    deptName: hierarchyValue(item.deptName, 'DIVERSOS (SEM DEPARTAMENTO)'),
                    catName: hierarchyValue(item.catName, 'DIVERSOS (SEM CATEGORIA)'),
                    events: new Map<string, AuditSignalEvent>()
                };
                if ((!product.barcode || product.barcode === product.reducedCode) && item.barcode) product.barcode = item.barcode;
                if (item.description && item.description.length > product.description.length) product.description = item.description;

                const currentEvent = product.events.get(row.key) || {
                    key: row.key,
                    branch: row.branch,
                    area: row.area,
                    city: row.city,
                    auditNumber: row.auditNumber,
                    status: row.status,
                    updatedAt: row.updatedAt,
                    sysQty: 0,
                    countedQty: 0,
                    diffQty: 0,
                    diffCost: 0
                };
                currentEvent.sysQty += Number(item.sysQty || 0);
                currentEvent.countedQty += Number(item.countedQty || 0);
                currentEvent.diffQty += diffQty;
                currentEvent.diffCost += diffCost;
                product.events.set(row.key, currentEvent);
                products.set(reducedCode, product);

                ([
                    ['Grupo', product.groupName],
                    ['Departamento', product.deptName],
                    ['Categoria', product.catName]
                ] as const).forEach(([type, name]) => {
                    const key = `${type}|${name}`;
                    const current = hierarchy.get(key) || {
                        key,
                        type,
                        name,
                        occurrences: 0,
                        shortages: 0,
                        surpluses: 0,
                        netCost: 0,
                        absoluteCost: 0,
                        skus: new Set<string>(),
                        audits: new Set<string>()
                    };
                    current.occurrences += 1;
                    if (diffQty < 0 || (diffQty === 0 && diffCost < 0)) current.shortages += 1;
                    if (diffQty > 0 || (diffQty === 0 && diffCost > 0)) current.surpluses += 1;
                    current.netCost += diffCost;
                    current.absoluteCost += Math.abs(diffCost);
                    current.skus.add(reducedCode);
                    current.audits.add(row.key);
                    hierarchy.set(key, current);
                });
            });
        });

        const productSignals = Array.from(products.values()).map(product => {
            const events = Array.from(product.events.values())
                .map(event => ({ ...event, diffCost: Math.round(event.diffCost * 100) / 100 }))
                .sort((a, b) => {
                    const timeOrder = (Date.parse(a.updatedAt) || 0) - (Date.parse(b.updatedAt) || 0);
                    if (timeOrder !== 0) return timeOrder;
                    if (a.auditNumber !== b.auditNumber) return a.auditNumber - b.auditNumber;
                    return getBranchOrder(a.branch) - getBranchOrder(b.branch);
                });
            const getSign = (event: AuditSignalEvent) => Math.sign(Math.abs(event.diffQty) > 0.01 ? event.diffQty : event.diffCost);
            const shortageCount = events.filter(event => getSign(event) < 0).length;
            const surplusCount = events.filter(event => getSign(event) > 0).length;
            let reversalCount = 0;
            for (let index = 1; index < events.length; index += 1) {
                const previousSign = getSign(events[index - 1]);
                const currentSign = getSign(events[index]);
                if (previousSign !== 0 && currentSign !== 0 && previousSign !== currentSign) reversalCount += 1;
            }
            const branches = new Set(events.map(event => event.branch));
            const netQty = events.reduce((sum, event) => sum + event.diffQty, 0);
            const netCost = events.reduce((sum, event) => sum + event.diffCost, 0);
            const absoluteCost = events.reduce((sum, event) => sum + Math.abs(event.diffCost), 0);
            const score = Math.round(
                reversalCount * 35 +
                Math.max(0, shortageCount - 1) * 24 +
                (branches.size > 1 ? 10 : 0) +
                Math.min(25, Math.log10(absoluteCost + 1) * 8)
            );
            const priority: AuditProductSignal['priority'] = score >= 70 || shortageCount >= 3 || reversalCount >= 2
                ? 'high'
                : score >= 35 || shortageCount >= 2 || reversalCount >= 1
                    ? 'medium'
                    : 'review';
            return {
                reducedCode: product.reducedCode,
                barcode: product.barcode,
                description: product.description,
                groupName: product.groupName,
                deptName: product.deptName,
                catName: product.catName,
                events,
                shortageCount,
                surplusCount,
                reversalCount,
                branchCount: branches.size,
                netQty,
                netCost: Math.round(netCost * 100) / 100,
                absoluteCost: Math.round(absoluteCost * 100) / 100,
                score,
                priority
            } satisfies AuditProductSignal;
        }).sort((a, b) => b.score - a.score || b.absoluteCost - a.absoluteCost);

        const reversals = productSignals.filter(item => item.reversalCount > 0);
        const reversalNetQty = reversals.reduce((sum, item) => sum + item.netQty, 0);
        const reversalNetCost = Math.round(reversals.reduce((sum, item) => sum + item.netCost, 0) * 100) / 100;
        const recurrentShortages = productSignals
            .filter(item => item.shortageCount >= 2)
            .sort((a, b) => b.shortageCount - a.shortageCount || b.absoluteCost - a.absoluteCost);
        const hierarchySignals = Array.from(hierarchy.values())
            .sort((a, b) => b.absoluteCost - a.absoluteCost || b.occurrences - a.occurrences);

        const transferMatches: AuditTransferMatch[] = [];
        productSignals.forEach(product => {
            const shortages = product.events.filter(event => event.diffQty < -0.01);
            const surpluses = product.events.filter(event => event.diffQty > 0.01);
            if (shortages.length === 0 || surpluses.length === 0) return;
            const shortageRemaining = new Map(shortages.map(event => [event.key, Math.abs(event.diffQty)]));
            const surplusRemaining = new Map(surpluses.map(event => [event.key, event.diffQty]));
            const candidates = shortages.flatMap(shortage => surpluses
                .filter(surplus => surplus.branch !== shortage.branch)
                .map(surplus => {
                    const hoursApart = Math.abs((Date.parse(shortage.updatedAt) || 0) - (Date.parse(surplus.updatedAt) || 0)) / 3_600_000;
                    const crossStatus = shortage.status !== surplus.status;
                    const score =
                        (shortage.auditNumber === surplus.auditNumber ? 0 : 1_000) +
                        (shortage.area === surplus.area ? 0 : 100) +
                        (crossStatus ? 0 : 25) +
                        Math.min(hoursApart, 10_000);
                    return { shortage, surplus, score, crossStatus };
                }))
                .sort((a, b) => a.score - b.score);

            candidates.forEach(({ shortage, surplus, crossStatus }) => {
                const shortageQty = shortageRemaining.get(shortage.key) || 0;
                const surplusQty = surplusRemaining.get(surplus.key) || 0;
                if (shortageQty <= 0.01 || surplusQty <= 0.01) return;
                const matchedQty = Math.min(shortageQty, surplusQty);
                const shortageUnitImpact = Math.abs(shortage.diffCost) / Math.max(Math.abs(shortage.diffQty), 1);
                const surplusUnitImpact = Math.abs(surplus.diffCost) / Math.max(Math.abs(surplus.diffQty), 1);
                const validUnitImpacts = [shortageUnitImpact, surplusUnitImpact].filter(value => Number.isFinite(value) && value > 0);
                const correlatedCost = matchedQty * (validUnitImpacts.length > 0 ? Math.min(...validUnitImpacts) : 0);
                const shortageCity = String(shortage.city || '').trim();
                const surplusCity = String(surplus.city || '').trim();
                transferMatches.push({
                    key: `${product.reducedCode}|${shortage.key}|${surplus.key}`,
                    reducedCode: product.reducedCode,
                    description: product.description,
                    groupName: product.groupName,
                    deptName: product.deptName,
                    catName: product.catName,
                    shortage,
                    surplus,
                    matchedQty,
                    correlatedCost: Math.round(correlatedCost * 100) / 100,
                    crossStatus,
                    sameArea: shortage.area === surplus.area,
                    sameCity: shortageCity && surplusCity ? shortageCity === surplusCity : null
                });
                shortageRemaining.set(shortage.key, shortageQty - matchedQty);
                surplusRemaining.set(surplus.key, surplusQty - matchedQty);
            });
        });

        const summarizeFlows = (
            keyFor: (match: AuditTransferMatch) => string,
            labelFor: (match: AuditTransferMatch) => string,
            subtitleFor: (match: AuditTransferMatch) => string
        ) => {
            const map = new Map<string, AuditFlowSummary>();
            transferMatches.forEach(match => {
                const key = keyFor(match);
                const current = map.get(key) || {
                    key,
                    label: labelFor(match),
                    subtitle: subtitleFor(match),
                    matchedQty: 0,
                    correlatedCost: 0,
                    products: new Set<string>(),
                    matches: []
                };
                current.matchedQty += match.matchedQty;
                current.correlatedCost += match.correlatedCost;
                current.products.add(match.reducedCode);
                current.matches.push(match);
                map.set(key, current);
            });
            return Array.from(map.values())
                .map(flow => ({ ...flow, correlatedCost: Math.round(flow.correlatedCost * 100) / 100 }))
                .sort((a, b) => b.products.size - a.products.size || b.correlatedCost - a.correlatedCost);
        };

        const branchFlows = summarizeFlows(
            match => `${match.shortage.branch}|${match.surplus.branch}`,
            match => `${match.shortage.branch} → ${match.surplus.branch}`,
            match => `${match.shortage.area} → ${match.surplus.area}`
        );
        const areaFlows = summarizeFlows(
            match => `${match.shortage.area}|${match.surplus.area}`,
            match => match.sameArea ? `Dentro de ${match.shortage.area}` : `${match.shortage.area} → ${match.surplus.area}`,
            match => match.sameArea ? 'Possível divergência de transferência ou entrega interna' : 'Possível divergência de distribuição entre áreas'
        );
        const cityFlows = summarizeFlows(
            match => `${match.shortage.city || 'Cidade não informada'}|${match.surplus.city || 'Cidade não informada'}`,
            match => `${match.shortage.city || 'Cidade não informada'} → ${match.surplus.city || 'Cidade não informada'}`,
            match => match.sameCity === true
                ? 'Movimentação dentro da mesma cidade'
                : match.sameCity === false
                    ? 'Possível divergência logística entre cidades'
                    : 'Correlação parcial; cidade ausente em uma ou ambas as filiais'
        );
        const rowsWithCity = scopeRows.filter(row => !!String(row.city || '').trim()).length;
        return {
            analyzedSkus: productSignals.length,
            events: productSignals.reduce((sum, item) => sum + item.events.length, 0),
            highPriority: productSignals.filter(item => item.priority === 'high').length,
            reversals,
            reversalNetQty,
            reversalNetCost,
            recurrentShortages,
            hierarchy: hierarchySignals,
            products: productSignals,
            transferMatches: transferMatches.sort((a, b) => b.correlatedCost - a.correlatedCost),
            crossStatusMatches: transferMatches.filter(match => match.crossStatus),
            crossStatusProducts: new Set(transferMatches.filter(match => match.crossStatus).map(match => match.reducedCode)).size,
            branchFlows,
            areaFlows,
            cityFlows,
            rowsWithCity
        };
    }, [deferredSignalRows]);

    const renderProductSignal = (signal: AuditProductSignal, context: 'reversal' | 'recurrence') => {
        const expandedSignalKey = `${context}|${signal.reducedCode}`;
        const isSignalExpanded = expandedSignal === expandedSignalKey;
        const priorityStyle = signal.priority === 'high'
            ? 'border-red-500/40 bg-red-500/5'
            : signal.priority === 'medium'
                ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-white/10 bg-white/[0.02]';
        return (
            <div key={expandedSignalKey} className={`border ${priorityStyle}`}>
                <button
                    type="button"
                    onClick={() => setExpandedSignal(current => current === expandedSignalKey ? null : expandedSignalKey)}
                    className="w-full p-3 text-left cursor-pointer hover:bg-white/[0.03]"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate text-[10px] font-black text-white">{signal.description}</p>
                            <p className="mt-0.5 text-[9px] font-bold text-indigo-300">Red. {signal.reducedCode}</p>
                        </div>
                        <span className={`shrink-0 px-1.5 py-1 text-[8px] font-black uppercase ${signal.priority === 'high' ? 'bg-red-500/15 text-red-300' : signal.priority === 'medium' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-700 text-slate-300'}`}>
                            {signal.priority === 'high' ? 'Alta' : signal.priority === 'medium' ? 'Média' : 'Revisar'}
                        </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[8px] font-bold uppercase leading-relaxed text-slate-500">
                        {signal.groupName} / {signal.deptName} / {signal.catName}
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/10 pt-2 text-[8px] font-bold">
                        <span className="text-red-300">{signal.shortageCount} falta(s)</span>
                        <span className="text-emerald-300">{signal.surplusCount} sobra(s)</span>
                        <span className={`text-right ${signal.netCost < 0 ? 'text-red-300' : signal.netCost > 0 ? 'text-emerald-300' : 'text-slate-300'}`}>Saldo {formatSignedCurrency(signal.netCost)}</span>
                    </div>
                    <div className={`mt-1 text-right text-[8px] font-black ${signal.netQty < 0 ? 'text-red-300' : signal.netQty > 0 ? 'text-emerald-300' : 'text-slate-400'}`}>
                        Divergência final: {formatSignedQuantity(signal.netQty)} un.
                    </div>
                </button>
                {isSignalExpanded && (
                    <div className="border-t border-white/10 px-3 pb-3">
                        <div className="py-2 text-[8px] font-bold leading-relaxed text-slate-400">
                            {context === 'reversal'
                                ? `${signal.reversalCount} inversão(ões) de sinal em ${signal.branchCount} filial(is). Conferir sequência de contagem, movimentações e ajustes.`
                                : `${signal.shortageCount} registros de falta. A repetição indica necessidade de apuração operacional e documental.`}
                        </div>
                        <div className="divide-y divide-white/10 border-y border-white/10">
                            {signal.events.map(event => {
                                const isShortage = event.diffQty < 0 || (event.diffQty === 0 && event.diffCost < 0);
                                return (
                                    <div key={`${expandedSignalKey}|${event.key}`} className="py-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[9px] font-black text-white">{event.branch} · N{event.auditNumber} · {formatAuditStatus(event.status)}</span>
                                            <span className={`inline-flex items-center gap-1 text-[8px] font-black uppercase ${isShortage ? 'text-red-300' : 'text-emerald-300'}`}>
                                                {isShortage ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                                                {isShortage ? 'Falta' : 'Sobra'}
                                            </span>
                                        </div>
                                        <div className="mt-1 grid grid-cols-2 gap-2 text-[8px] font-bold text-slate-400">
                                            <span>Sist. {event.sysQty.toLocaleString('pt-BR')} → Fís. {event.countedQty.toLocaleString('pt-BR')}</span>
                                            <span className="text-right">{formatSignedQuantity(event.diffQty)} un. · {formatCurrency(event.diffCost)}</span>
                                        </div>
                                        <p className="mt-1 text-[8px] font-bold text-slate-600">{event.area} · {formatShortDate(event.updatedAt)}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderFlowSummary = (flow: AuditFlowSummary, context: 'branch' | 'area' | 'city') => {
        const flowKey = `flow|${context}|${flow.key}`;
        const isFlowExpanded = expandedSignal === flowKey;
        return (
            <div key={flowKey} className="border border-cyan-400/20 bg-cyan-500/[0.04]">
                <button
                    type="button"
                    onClick={() => setExpandedSignal(current => current === flowKey ? null : flowKey)}
                    className="w-full p-3 text-left cursor-pointer hover:bg-white/[0.03]"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[10px] font-black text-white">{flow.label}</p>
                            <p className="mt-1 text-[8px] font-bold leading-relaxed text-slate-500">{flow.subtitle}</p>
                        </div>
                        <ArrowDownUp className="h-4 w-4 shrink-0 text-cyan-300" />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/10 pt-2 text-[8px] font-bold">
                        <span className="text-white">{flow.products.size} SKU(s)</span>
                        <span className="text-cyan-200">{flow.matchedQty.toLocaleString('pt-BR')} un. correl.</span>
                        <span className="text-right text-slate-300">{formatCurrency(flow.correlatedCost)}</span>
                    </div>
                </button>
                {isFlowExpanded && (
                    <div className="border-t border-white/10 px-3 pb-3">
                        <p className="py-2 text-[8px] font-bold leading-relaxed text-slate-400">
                            Mesmos reduzidos com falta de um lado e sobra do outro. Verificar transferências, separação, recebimento, devoluções e lançamentos antes de concluir a causa.
                        </p>
                        <div className="max-h-[300px] divide-y divide-white/10 overflow-y-auto border-y border-white/10">
                            {flow.matches.slice(0, 30).map(match => (
                                <div key={`${flowKey}|${match.key}`} className="py-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-[9px] font-black text-white">{match.description}</p>
                                            <p className="mt-0.5 text-[8px] font-bold text-indigo-300">Red. {match.reducedCode}</p>
                                        </div>
                                        <span className="shrink-0 text-[8px] font-black text-cyan-200">{match.matchedQty.toLocaleString('pt-BR')} un.</span>
                                    </div>
                                    <div className="mt-1 grid grid-cols-2 gap-2 text-[8px] font-black">
                                        <span className="text-red-300">Falta: {match.shortage.branch} ({formatAuditStatus(match.shortage.status)}) {formatSignedQuantity(match.shortage.diffQty)}</span>
                                        <span className="text-right text-emerald-300">Sobra: {match.surplus.branch} ({formatAuditStatus(match.surplus.status)}) {formatSignedQuantity(match.surplus.diffQty)}</span>
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-[8px] font-bold uppercase leading-relaxed text-slate-600">
                                        {match.groupName} / {match.deptName} / {match.catName}
                                    </p>
                                    {match.crossStatus && (
                                        <p className="mt-1 text-[8px] font-black uppercase text-cyan-300">Correlação entre auditoria aberta e concluída</p>
                                    )}
                                    <div className="mt-1 flex items-center justify-between gap-2 text-[8px] font-bold text-slate-500">
                                        <span>{match.sameArea ? `Mesma área: ${match.shortage.area}` : `${match.shortage.area} → ${match.surplus.area}`}</span>
                                        <span>{formatCurrency(match.correlatedCost)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    if (!expanded) {
        return (
            <aside className="w-full xl:w-14 shrink-0 bg-slate-950 border border-slate-800 xl:min-h-[720px]">
                <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="w-full h-14 xl:h-20 inline-flex items-center justify-center text-indigo-300 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
                    title="Abrir cruzamento de auditorias"
                >
                    <LineChart className="h-5 w-5" />
                </button>
            </aside>
        );
    }

    return (
        <aside className="w-full xl:w-[420px] shrink-0 bg-slate-950 text-white border border-slate-800 xl:min-h-[720px]">
            <div className="xl:sticky xl:top-3 max-h-none xl:max-h-[calc(100vh-24px)] overflow-y-auto p-4">
                <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-300">Auditoria de estoque</p>
                        <h2 className="mt-1 text-lg font-black leading-tight">Cruzamento de auditorias</h2>
                    </div>
                    <button
                        type="button"
                        onClick={() => setExpanded(false)}
                        className="h-9 w-9 inline-flex items-center justify-center border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                        title="Recolher cruzamento"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                </div>

                <div className="mt-4 grid grid-cols-2 border border-white/10" aria-label="Modo do cruzamento">
                    <button
                        type="button"
                        onClick={() => setPanelView('audits')}
                        className={`h-10 inline-flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer ${panelView === 'audits' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                    >
                        <Building2 className="h-3.5 w-3.5" />
                        Auditorias
                    </button>
                    <button
                        type="button"
                        onClick={() => setPanelView('signals')}
                        className={`h-10 inline-flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer ${panelView === 'signals' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                    >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Sinais e padrões
                    </button>
                </div>

                <div className="mt-3 grid grid-cols-3 border border-white/10" aria-label="Filtrar por situação">
                    {([
                        ['all', `Todas ${statusCounts.all}`],
                        ['open', `Abertas ${statusCounts.open}`],
                        ['completed', `Concluídas ${statusCounts.completed}`]
                    ] as const).map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setStatusFilter(value)}
                            className={`h-9 px-2 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer ${statusFilter === value ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                    <label className="relative">
                        <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        <select
                            value={areaFilter}
                            onChange={event => setAreaFilter(event.target.value)}
                            className="h-10 w-full appearance-none border border-white/10 bg-slate-900 pl-10 pr-8 text-xs font-bold text-white outline-none focus:border-indigo-400 cursor-pointer"
                        >
                            <option value="all">Todas as áreas</option>
                            {areas.map(area => <option key={area} value={area}>{area}</option>)}
                        </select>
                        <Filter className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    </label>
                    <label className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        <input
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder="Buscar filial ou inventário"
                            className="h-10 w-full border border-white/10 bg-slate-900 pl-10 pr-9 text-xs font-bold text-white placeholder:text-slate-600 outline-none focus:border-indigo-400"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 inline-flex items-center justify-center text-slate-500 hover:text-white cursor-pointer"
                                title="Limpar busca"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </label>
                </div>

                <div className="mt-3 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={loading}
                        className="h-9 flex-1 inline-flex items-center justify-center gap-2 border border-white/10 text-[9px] font-black uppercase tracking-wider text-slate-300 hover:bg-white/10 disabled:opacity-50 cursor-pointer"
                    >
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Atualizar
                    </button>
                    <button
                        type="button"
                        onClick={() => onExport(statusFilter === 'completed' ? 'completed' : 'open')}
                        className="h-9 flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 text-[9px] font-black uppercase tracking-wider hover:bg-emerald-500 cursor-pointer"
                        title={statusFilter === 'completed' ? 'Excel detalhado das concluídas' : 'Excel detalhado das abertas'}
                    >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        Excel {statusFilter === 'completed' ? 'concl.' : 'abertas'}
                    </button>
                </div>

                {panelView === 'audits' && (
                    <>
                <div className="mt-4 grid grid-cols-3 border-y border-white/10 py-3 text-center">
                    <div>
                        <p className="text-[8px] font-black uppercase tracking-wider text-slate-500">Auditorias</p>
                        <p className="mt-1 text-lg font-black tabular-nums">{scopeRows.length}</p>
                    </div>
                    <div className="border-x border-white/10">
                        <p className="text-[8px] font-black uppercase tracking-wider text-slate-500">Unidades</p>
                        <p className="mt-1 text-sm font-black tabular-nums">{scopeSummary.units.toLocaleString('pt-BR')}</p>
                    </div>
                    <div>
                        <p className="text-[8px] font-black uppercase tracking-wider text-slate-500">Divergência</p>
                        <p className={`mt-1 text-xs font-black tabular-nums ${scopeSummary.diffCost < 0 ? 'text-red-400' : scopeSummary.diffCost > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                            {formatCurrency(scopeSummary.diffCost)}
                        </p>
                    </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[9px] font-bold text-slate-500">
                    <span>{scopeSummary.areas.size} área(s)</span>
                    <span>Progresso médio {formatPercent(averageProgress)}</span>
                </div>

                {areaSummaries.length > 1 && areaFilter === 'all' && (
                    <div className="mt-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Comparação por área</p>
                        <div className="mt-2 divide-y divide-white/10 border-y border-white/10">
                            {areaSummaries.map(area => (
                                <button
                                    key={area.area}
                                    type="button"
                                    onClick={() => setAreaFilter(area.area)}
                                    className="w-full py-2 flex items-center justify-between gap-3 text-left hover:bg-white/5 cursor-pointer"
                                    title={`Filtrar ${area.area}`}
                                >
                                    <div>
                                        <p className="text-xs font-black">{area.area}</p>
                                        <p className="text-[9px] font-bold text-slate-500">{area.audits} auditoria(s) · {area.units.toLocaleString('pt-BR')} un.</p>
                                    </div>
                                    <span className={`text-[10px] font-black tabular-nums ${area.diffCost < 0 ? 'text-red-400' : area.diffCost > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                        {formatCurrency(area.diffCost)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Filiais e inventários</p>
                    {selectedKeys.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setSelectedKeys([])}
                            className="text-[9px] font-black uppercase tracking-wider text-indigo-300 hover:text-white cursor-pointer"
                        >
                            Limpar {selectedKeys.length}
                        </button>
                    )}
                </div>

                <div className="mt-2 max-h-[340px] overflow-y-auto border-y border-white/10 divide-y divide-white/10">
                    {filteredRows.length === 0 ? (
                        <div className="py-8 text-center text-xs font-bold text-slate-500">
                            {loading ? 'Carregando auditorias...' : 'Nenhuma auditoria neste recorte.'}
                        </div>
                    ) : filteredRows.map(row => {
                        const selected = selectedKeys.includes(row.key);
                        return (
                            <div key={row.key} className={`py-2.5 px-1 transition-colors ${selected ? 'bg-indigo-500/10' : ''}`}>
                                <div className="flex items-start gap-2">
                                    <button
                                        type="button"
                                        onClick={() => toggleSelection(row.key)}
                                        className={`mt-0.5 h-5 w-5 shrink-0 inline-flex items-center justify-center border cursor-pointer ${selected ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-slate-600 text-transparent hover:border-indigo-400'}`}
                                        title={selected ? 'Remover do cruzamento' : 'Adicionar ao cruzamento'}
                                    >
                                        <Check className="h-3 w-3" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => toggleSelection(row.key)}
                                        className="min-w-0 flex-1 text-left cursor-pointer"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-black">{row.branch}</p>
                                                <p className="truncate text-[9px] font-bold text-slate-500">{row.area} · Inv. {row.auditNumber}</p>
                                            </div>
                                            <span className={`shrink-0 px-1.5 py-1 text-[8px] font-black uppercase tracking-wider ${row.status === 'open' ? 'bg-blue-500/15 text-blue-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                                                {row.status === 'open' ? 'Aberta' : 'Concluída'}
                                            </span>
                                        </div>
                                        <div className="mt-1.5 grid grid-cols-2 gap-2 text-[9px] font-bold">
                                            <span className="text-slate-400">{row.countedUnits.toLocaleString('pt-BR')} un.</span>
                                            <span className={`text-right tabular-nums ${row.diffCost < 0 ? 'text-red-400' : row.diffCost > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                                {formatCurrency(row.diffCost)}
                                            </span>
                                        </div>
                                        <div className="mt-1.5 h-1 bg-slate-800 overflow-hidden">
                                            <div className={`h-full ${row.status === 'open' ? 'bg-blue-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(0, Math.min(100, row.progressPct))}%` }} />
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onOpenAudit(row)}
                                        className="h-8 w-8 shrink-0 inline-flex items-center justify-center text-slate-500 hover:bg-white/10 hover:text-white cursor-pointer"
                                        title={`Abrir ${row.branch}`}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {selectedRows.length > 0 && (
                    <div className="mt-4 border-t border-indigo-400/30 pt-3">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-300">Cruzamento selecionado</p>
                            <span className="text-[9px] font-bold text-slate-500">{selectedRows.length} registro(s)</span>
                        </div>
                        <div className="mt-2 space-y-1.5">
                            {selectedRows.map(row => (
                                <div key={`selected-${row.key}`} className="flex items-center justify-between gap-3 text-[10px] font-bold">
                                    <span className="truncate text-slate-300">{row.branch} · N{row.auditNumber}</span>
                                    <span className={row.diffCost < 0 ? 'text-red-400' : row.diffCost > 0 ? 'text-emerald-400' : 'text-slate-400'}>{formatCurrency(row.diffCost)}</span>
                                </div>
                            ))}
                        </div>
                        {pairDelta && (
                            <div className="mt-3 grid grid-cols-3 border-y border-white/10 py-2 text-center">
                                <div>
                                    <p className="text-[8px] font-black uppercase text-slate-600">Δ Un.</p>
                                    <p className="mt-1 text-[10px] font-black">{pairDelta.units > 0 ? '+' : ''}{pairDelta.units.toLocaleString('pt-BR')}</p>
                                </div>
                                <div className="border-x border-white/10">
                                    <p className="text-[8px] font-black uppercase text-slate-600">Δ Div.</p>
                                    <p className="mt-1 text-[10px] font-black">{formatCurrency(pairDelta.diffCost)}</p>
                                </div>
                                <div>
                                    <p className="text-[8px] font-black uppercase text-slate-600">Δ Prog.</p>
                                    <p className="mt-1 text-[10px] font-black">{pairDelta.progress > 0 ? '+' : ''}{formatPercent(pairDelta.progress)}</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-4 flex items-center gap-2 text-[9px] font-bold text-slate-600">
                    <Store className="h-3.5 w-3.5" />
                    Selecione lojas para cruzar os resultados.
                </div>
                    </>
                )}

                {panelView === 'signals' && (
                    <div className="mt-4">
                        <div className="border-y border-white/10 py-3">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-wider text-white">Análise indicativa</p>
                                    <p className="mt-1 text-[8px] font-bold leading-relaxed text-slate-500">
                                        {signalAnalysisPending
                                            ? 'Preparando os cruzamentos em segundo plano...'
                                            : 'Sinais baseados nos termos do recorte atual. Servem para orientar conferência e apuração; não constituem conclusão de fraude.'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 border-b border-white/10 text-center">
                            <div className="py-3">
                                <p className="text-[8px] font-black uppercase text-slate-500">Reduzidos analisados</p>
                                <p className="mt-1 text-lg font-black text-white tabular-nums">{auditSignals.analyzedSkus}</p>
                            </div>
                            <div className="border-l border-white/10 py-3">
                                <p className="text-[8px] font-black uppercase text-slate-500">Prioridade alta</p>
                                <p className={`mt-1 text-lg font-black tabular-nums ${auditSignals.highPriority > 0 ? 'text-red-300' : 'text-slate-300'}`}>{auditSignals.highPriority}</p>
                            </div>
                            <div className="border-t border-white/10 py-3">
                                <p className="text-[8px] font-black uppercase text-slate-500">SKUs (mix) com inversão</p>
                                <p className={`mt-1 text-lg font-black tabular-nums ${auditSignals.reversals.length > 0 ? 'text-amber-300' : 'text-slate-300'}`}>{auditSignals.reversals.length}</p>
                            </div>
                            <div className="border-l border-t border-white/10 py-3">
                                <p className="text-[8px] font-black uppercase text-slate-500">Faltas recorrentes</p>
                                <p className={`mt-1 text-lg font-black tabular-nums ${auditSignals.recurrentShortages.length > 0 ? 'text-red-300' : 'text-slate-300'}`}>{auditSignals.recurrentShortages.length}</p>
                            </div>
                            <div className="col-span-2 flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2">
                                <span className="text-[8px] font-black uppercase text-slate-500">Reduzidos correlacionados entre filiais</span>
                                <span className={`text-sm font-black tabular-nums ${auditSignals.transferMatches.length > 0 ? 'text-cyan-200' : 'text-slate-300'}`}>{new Set(auditSignals.transferMatches.map(match => match.reducedCode)).size}</span>
                            </div>
                            {statusFilter === 'all' && (
                                <div className="col-span-2 flex items-center justify-between gap-3 border-t border-cyan-400/20 bg-cyan-500/[0.04] px-3 py-2">
                                    <span className="text-[8px] font-black uppercase text-cyan-200">Abertas × concluídas</span>
                                    <span className={`text-sm font-black tabular-nums ${auditSignals.crossStatusProducts > 0 ? 'text-cyan-200' : 'text-slate-300'}`}>{auditSignals.crossStatusProducts} reduzido(s)</span>
                                </div>
                            )}
                            <div className="col-span-2 border-t border-white/10 px-3 py-2.5">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[8px] font-black uppercase text-slate-500">Saldo final dos SKUs com inversão</span>
                                    <span className={`text-[8px] font-black uppercase ${auditSignals.reversalNetCost < 0 ? 'text-red-300' : auditSignals.reversalNetCost > 0 ? 'text-emerald-300' : 'text-slate-400'}`}>
                                        {auditSignals.reversalNetCost < 0 ? 'Negativo' : auditSignals.reversalNetCost > 0 ? 'Positivo' : 'Zerado'}
                                    </span>
                                </div>
                                <div className="mt-1 flex items-center justify-between gap-3 text-[11px] font-black tabular-nums">
                                    <span className={auditSignals.reversalNetQty < 0 ? 'text-red-300' : auditSignals.reversalNetQty > 0 ? 'text-emerald-300' : 'text-slate-300'}>
                                        {formatSignedQuantity(auditSignals.reversalNetQty)} un.
                                    </span>
                                    <span className={auditSignals.reversalNetCost < 0 ? 'text-red-300' : auditSignals.reversalNetCost > 0 ? 'text-emerald-300' : 'text-slate-300'}>
                                        {formatSignedCurrency(auditSignals.reversalNetCost)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-3 grid grid-cols-4 border border-white/10">
                            {([['transfers', 'Filiais/áreas'], ['reversals', 'Inversões'], ['recurrence', 'Recorrências'], ['hierarchy', 'Hierarquia']] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => {
                                        setSignalView(value);
                                        setExpandedSignal(null);
                                    }}
                                    className={`h-9 px-1 text-[8px] font-black uppercase tracking-wider cursor-pointer ${signalView === value ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {selectedRows.length > 0 && (
                            <div className="mt-3 flex items-center justify-between gap-3 border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-[8px] font-bold text-indigo-200">
                                <span>Analisando seleção manual</span>
                                <button type="button" onClick={() => setSelectedKeys([])} className="font-black uppercase text-white cursor-pointer">Limpar {selectedRows.length}</button>
                            </div>
                        )}

                        <div className="mt-3 max-h-[500px] overflow-y-auto space-y-2 pr-1">
                            {signalView === 'transfers' && (
                                <>
                                    <div className="grid grid-cols-3 border border-white/10">
                                        {([['branch', 'Por filial'], ['area', 'Por área'], ['city', 'Por cidade']] as const).map(([value, label]) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => {
                                                    setFlowView(value);
                                                    setExpandedSignal(null);
                                                }}
                                                className={`h-8 px-1 text-[8px] font-black uppercase cursor-pointer ${flowView === value ? 'bg-cyan-500/15 text-cyan-200' : 'text-slate-600 hover:bg-white/5 hover:text-white'}`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    {flowView === 'city' && (
                                        <div className={`px-3 py-2 text-[8px] font-bold leading-relaxed ${auditSignals.rowsWithCity < scopeRows.length ? 'border border-amber-400/20 bg-amber-500/5 text-amber-200' : 'border border-emerald-400/20 bg-emerald-500/5 text-emerald-200'}`}>
                                            Cidade identificada em {auditSignals.rowsWithCity} de {scopeRows.length} auditoria(s). Registros sem cidade permanecem como “Cidade não informada”.
                                        </div>
                                    )}
                                    {(flowView === 'branch' ? auditSignals.branchFlows : flowView === 'area' ? auditSignals.areaFlows : auditSignals.cityFlows).length > 0
                                        ? (flowView === 'branch' ? auditSignals.branchFlows : flowView === 'area' ? auditSignals.areaFlows : auditSignals.cityFlows)
                                            .slice(0, 30)
                                            .map(flow => renderFlowSummary(flow, flowView))
                                        : <div className="border-y border-white/10 py-8 text-center text-[10px] font-bold text-slate-500">Nenhuma correlação de falta e sobra entre filiais neste recorte.</div>}
                                </>
                            )}

                            {signalView === 'reversals' && (
                                auditSignals.reversals.length > 0
                                    ? auditSignals.reversals.slice(0, 30).map(signal => renderProductSignal(signal, 'reversal'))
                                    : <div className="border-y border-white/10 py-8 text-center text-[10px] font-bold text-slate-500">Nenhuma inversão de falta para sobra neste recorte.</div>
                            )}

                            {signalView === 'recurrence' && (
                                auditSignals.recurrentShortages.length > 0
                                    ? auditSignals.recurrentShortages.slice(0, 30).map(signal => renderProductSignal(signal, 'recurrence'))
                                    : <div className="border-y border-white/10 py-8 text-center text-[10px] font-bold text-slate-500">Nenhuma falta recorrente neste recorte.</div>
                            )}

                            {signalView === 'hierarchy' && (
                                auditSignals.hierarchy.length > 0
                                    ? auditSignals.hierarchy.slice(0, 40).map(item => (
                                        <div key={item.key} className="border border-white/10 bg-white/[0.02] p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-[8px] font-black uppercase tracking-wider text-indigo-300">{item.type}</p>
                                                    <p className="mt-1 text-[10px] font-black leading-tight text-white">{item.name}</p>
                                                </div>
                                                <Layers3 className="h-4 w-4 shrink-0 text-slate-600" />
                                            </div>
                                            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/10 pt-2 text-[8px] font-bold text-slate-400">
                                                <span>{item.skus.size} SKU(s)</span>
                                                <span>{item.audits.size} auditoria(s)</span>
                                                <span className="text-right">{item.occurrences} ocorrência(s)</span>
                                            </div>
                                            <div className="mt-2 flex items-center justify-between gap-3 text-[8px] font-black">
                                                <span><span className="text-red-300">{item.shortages} faltas</span> · <span className="text-emerald-300">{item.surpluses} sobras</span></span>
                                                <span className={item.netCost < 0 ? 'text-red-300' : item.netCost > 0 ? 'text-emerald-300' : 'text-slate-300'}>{formatCurrency(item.netCost)}</span>
                                            </div>
                                            <div className="mt-1 flex items-center justify-between text-[8px] font-bold text-slate-600">
                                                <span>Movimentação absoluta</span>
                                                <span>{formatCurrency(item.absoluteCost)}</span>
                                            </div>
                                        </div>
                                    ))
                                    : <div className="border-y border-white/10 py-8 text-center text-[10px] font-bold text-slate-500">Sem hierarquias divergentes neste recorte.</div>
                            )}
                        </div>

                        <div className="mt-4 flex items-start gap-2 border-t border-white/10 pt-3 text-[8px] font-bold leading-relaxed text-slate-600">
                            <ArrowDownUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            Selecione auditorias na aba Auditorias para isolar lojas, áreas ou períodos antes de analisar os padrões.
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
};

export default AuditCrossPanel;
