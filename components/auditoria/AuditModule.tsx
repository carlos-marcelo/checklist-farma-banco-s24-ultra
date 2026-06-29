
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    AuditData,
    ViewState,
    AuditStatus,
    Group,
    Department,
    Category,
    Product,
    PostAuditAdjustment
} from './types';
import {
    fetchLatestAudit,
    fetchAuditSession,
    fetchAuditsHistory,
    upsertAuditSession,
    deleteAuditSession,
    insertAppEventLog,
    fetchLatestAuditMetadata,
    fetchGlobalBaseFileMeta,
    type DbGlobalBaseFile,
    type DbAuditSession
} from '../../supabaseService';
import { CadastrosBaseService } from '../../src/cadastrosBase/cadastrosBaseService';
import { CacheService } from '../../src/cacheService';
import * as AuditStorage from '../../src/auditoria/storage';
import ProgressBar from './ProgressBar';
import Breadcrumbs from './Breadcrumbs';
import SignaturePad from '../SignaturePad';
import { ImageUtils } from '../../src/utils/imageUtils';
import {
    ClipboardList,
    FileBox,
    FileSpreadsheet,
    Power,
    ChevronRight,
    CheckCircle2,
    CheckSquare,
    FileSignature,
    ArrowLeft,
    Boxes,
    Activity,
    Search,
    RefreshCw,
    X,
    Upload,
    Download,
    Save,
    Check,
    Loader2,
    Plus,
    Trash2
} from 'lucide-react';

const GROUP_UPLOAD_IDS = ['2000', '3000', '4000', '8000', '10000', '66', '67'] as const;
type GroupUploadId = typeof GROUP_UPLOAD_IDS[number];
const GROUP_GLOBAL_BASE_KEYS: Record<GroupUploadId, string> = {
    '2000': 'audit_cadastro_2000',
    '3000': 'audit_cadastro_3000',
    '4000': 'audit_cadastro_4000',
    '8000': 'audit_cadastro_8000',
    '10000': 'audit_cadastro_10000',
    '66': 'audit_cadastro_66',
    '67': 'audit_cadastro_67'
};

const buildSharedStockModuleKey = (branchRaw: string) => {
    const raw = String(branchRaw || '').trim();
    const digits = raw.match(/\d+/g)?.join('') || '';
    const token = digits || raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'sem_filial';
    return `shared_stock_branch_${token}`;
};

const AUDIT_DEPT_IDS_GLOBAL_KEY = 'audit_ids_departamento';
const AUDIT_CAT_IDS_GLOBAL_KEY = 'audit_ids_categoria';
const ALLOWED_IDS = GROUP_UPLOAD_IDS.map(id => Number(id));
const FILIAIS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18];

const normalizeAreaName = (value?: string | null) =>
    String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');

const toAuditBranchValue = (value?: string | number | null) => {
    const raw = String(value || '').trim();
    const digits = raw.match(/\d+/g)?.join('') || '';
    return digits || raw;
};

const compareAuditBranchValues = (a: string, b: string) => {
    const numA = Number(toAuditBranchValue(a));
    const numB = Number(toAuditBranchValue(b));
    const hasNumA = Number.isFinite(numA) && numA > 0;
    const hasNumB = Number.isFinite(numB) && numB > 0;
    if (hasNumA && hasNumB && numA !== numB) return numA - numB;
    if (hasNumA && !hasNumB) return -1;
    if (!hasNumA && hasNumB) return 1;
    return String(a).localeCompare(String(b), 'pt-BR');
};

const GROUP_CONFIG_DEFAULTS: Record<string, string> = {
    "2000": "Medicamentos Similar",
    "3000": "Medicamentos RX",
    "4000": "Medicamentos Genérico",
    "66": "Genérico + Similar sem margem",
    "67": "Genérico + Similar sem margem",
    "8000": "Higiene e Beleza",
    "10000": "Conveniência"
};

const PRODUCT_CLASSIFICATION_FIXES_BY_CODE: Record<string, { groupId: string; groupName: string; deptId: string; deptName: string; catId: string; catName: string }> = {
    '86703': {
        groupId: '10000',
        groupName: 'Conveniência',
        deptId: '114',
        deptName: 'ELETRONICOS',
        catId: '77',
        catName: 'BAZAR'
    },
    '26542': {
        groupId: '3000',
        groupName: 'Medicamentos RX',
        deptId: '121',
        deptName: 'MEDICAMENTO TARJADO',
        catId: '89',
        catName: 'DIABETES'
    }
};

// Classificação manual emergencial por código reduzido (prioridade máxima no termo).
// Mantida aqui para evitar perda de classificação em casos de divergência entre fontes.
const TERM_MANUAL_CLASSIFICATION_BY_CODE: Record<string, { groupId: string; deptId: string; catId: string }> = {
    '86703': { groupId: '10000', deptId: '114', catId: '77' },
    '42609': { groupId: '3000', deptId: '120', catId: '111' },
    '50928': { groupId: '3000', deptId: '120', catId: '116' },
    '62148': { groupId: '2000', deptId: '120', catId: '129' },
    '68400': { groupId: '3000', deptId: '120', catId: '129' },
    '83798': { groupId: '2000', deptId: '120', catId: '184' },
    '65519': { groupId: '3000', deptId: '121', catId: '173' },
    '24492': { groupId: '3000', deptId: '120', catId: '106' },
    '74069': { groupId: '3000', deptId: '121', catId: '106' },
    '77900': { groupId: '3000', deptId: '120', catId: '129' },
    '16184': { groupId: '3000', deptId: '121', catId: '103' },
    '40719': { groupId: '3000', deptId: '121', catId: '124' },
    '81982': { groupId: '4000', deptId: '120', catId: '114' },
    '82039': { groupId: '2000', deptId: '120', catId: '129' },
    '59209': { groupId: '4000', deptId: '121', catId: '109' },
    '49578': { groupId: '4000', deptId: '121', catId: '129' },
    '84591': { groupId: '4000', deptId: '121', catId: '124' },
    '84489': { groupId: '4000', deptId: '121', catId: '106' },
    '26542': { groupId: '3000', deptId: '121', catId: '89' },
    '18621': { groupId: '3000', deptId: '121', catId: '124' },
    '35497': { groupId: '3000', deptId: '121', catId: '103' },
    '45637': { groupId: '3000', deptId: '121', catId: '119' },
    '57237': { groupId: '3000', deptId: '121', catId: '110' },
    '60528': { groupId: '3000', deptId: '121', catId: '124' },
    '68823': { groupId: '3000', deptId: '121', catId: '123' },
    '72550': { groupId: '3000', deptId: '121', catId: '129' },
    '82553': { groupId: '3000', deptId: '121', catId: '165' },
    '5189': { groupId: '4000', deptId: '121', catId: '118' },
    '79995': { groupId: '4000', deptId: '121', catId: '180' },
    '84092': { groupId: '4000', deptId: '121', catId: '124' }
};

const AuditTermInput = React.memo(({ 
    value, 
    onCommit, 
    onImmediateChange,
    onBlurAction,
    placeholder, 
    className, 
    readOnly, 
    maxLength, 
    dataField 
}: { 
    value: string; 
    onCommit: (val: string) => void; 
    onImmediateChange?: (val: string) => void;
    onBlurAction?: (val: string) => void;
    placeholder?: string; 
    className?: string; 
    readOnly?: boolean; 
    maxLength?: number; 
    dataField?: string; 
}) => {
    const [local, setLocal] = React.useState(value);
    React.useEffect(() => { setLocal(value); }, [value]);

    return (
        <input
            type="text"
            value={local}
            onChange={(e) => {
                setLocal(e.target.value);
                if (onImmediateChange) onImmediateChange(e.target.value);
            }}
            onBlur={() => {
                if (local !== value) onCommit(local);
                if (onBlurAction) onBlurAction(local);
            }}
            placeholder={placeholder}
            className={className}
            readOnly={readOnly}
            maxLength={maxLength}
            data-term-field={dataField}
        />
    );
});

const isDiversosLabel = (value?: string) => {
    const t = String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    return t.includes('sem departamento') || t.includes('sem categoria') || t.includes('diversos');
};

const pickBestHierarchyEntry = (
    entries: Array<{ groupId?: string; groupName: string; deptId?: string; deptName: string; catId?: string; catName: string }>,
    preferredGroupId?: string
) => {
    if (!entries || entries.length === 0) return null;
    const pref = normalizeScopeId(preferredGroupId);
    const ranked = [...entries].sort((a, b) => {
        const aGroupPref = pref && normalizeScopeId(a.groupId) === pref ? 1 : 0;
        const bGroupPref = pref && normalizeScopeId(b.groupId) === pref ? 1 : 0;
        if (aGroupPref !== bGroupPref) return bGroupPref - aGroupPref;
        const aQuality = (a.deptId ? 1 : 0) + (a.catId ? 1 : 0) + (isDiversosLabel(a.deptName) ? 0 : 1) + (isDiversosLabel(a.catName) ? 0 : 1);
        const bQuality = (b.deptId ? 1 : 0) + (b.catId ? 1 : 0) + (isDiversosLabel(b.deptName) ? 0 : 1) + (isDiversosLabel(b.catName) ? 0 : 1);
        return bQuality - aQuality;
    });
    return ranked[0];
};

const createInitialGroupFiles = (): Record<GroupUploadId, File | null> => ({
    "2000": null,
    "3000": null,
    "4000": null,
    "8000": null,
    "10000": null,
    "66": null,
    "67": null
});

const createInitialGroupMeta = (): Record<GroupUploadId, DbGlobalBaseFile | null> => ({
    "2000": null,
    "3000": null,
    "4000": null,
    "8000": null,
    "10000": null,
    "66": null,
    "67": null
});

const decodeGlobalFileToBrowserFile = (file: DbGlobalBaseFile): File | null => {
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
        const fileName = originalName.startsWith('[GLOBAL] ') ? originalName : `[GLOBAL] ${originalName}`;
        return new File([bytes], fileName, { type: mimeType });
    } catch (error) {
        console.error('Erro ao decodificar arquivo global da auditoria:', error);
        return null;
    }
};

const TRIER_API_BASE =
    ((import.meta as any).env?.VITE_TRIER_INTEGRATION_URL as string) || "http://localhost:8000";

const normalizeAuditStatus = (status: unknown): AuditStatus => {
    if (status === AuditStatus.DONE || status === 'DONE' || status === 'concluido') return AuditStatus.DONE;
    if (status === AuditStatus.IN_PROGRESS || status === 'IN_PROGRESS' || status === 'iniciado') return AuditStatus.IN_PROGRESS;
    return AuditStatus.TODO;
};

const parseNumericToken = (token: string): number | null => {
    if (!token) return null;

    const hasDot = token.includes('.');
    const hasComma = token.includes(',');
    let normalized = token;

    if (hasDot && hasComma) {
        if (token.lastIndexOf(',') > token.lastIndexOf('.')) {
            normalized = token.replace(/\./g, '').replace(',', '.');
        } else {
            normalized = token.replace(/,/g, '');
        }
    } else if (hasComma) {
        normalized = /,\d{1,2}$/.test(token) ? token.replace(',', '.') : token.replace(/,/g, '');
    } else if (hasDot) {
        const dotCount = (token.match(/\./g) || []).length;
        normalized = (dotCount === 1 && /\.\d{1,2}$/.test(token)) ? token : token.replace(/\./g, '');
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed);
};

const extractSheetNumericCodes = (value: unknown): number[] => {
    if (value === null || value === undefined) return [];
    if (typeof value === 'number' && Number.isFinite(value)) return [Math.round(value)];

    const raw = String(value).trim();
    if (!raw) return [];

    const tokens = raw.match(/\d[\d.,]*/g) || [];
    const parsed = tokens
        .map(parseNumericToken)
        .filter((v): v is number => v !== null);

    return Array.from(new Set(parsed));
};

const parseSheetNumericCode = (value: unknown): number | null => {
    const values = extractSheetNumericCodes(value);
    return values.length ? values[0] : null;
};

const normalizeLookupText = (value: unknown) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

const normalizeProductLookupCode = (value: unknown) =>
    String(value ?? '')
        .trim()
        .replace(/\D/g, '')
        .replace(/^0+/, '');

const roundPostAuditMoney = (value: unknown) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const parseSignedAuditNumber = (value: unknown): number => {
    const raw = String(value ?? '').trim();
    if (!raw) return 0;
    const normalized = raw
        .replace(/\s+/g, '')
        .replace(/\.(?=\d{3}(?:\D|$))/g, '')
        .replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePostAuditAdjustments = (value: unknown): PostAuditAdjustment[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((item: any): PostAuditAdjustment | null => {
            const quantity = Number(item?.quantity || 0);
            const unitCost = roundPostAuditMoney(item?.unitCost);
            if (!Number.isFinite(quantity) || Math.abs(quantity) <= 0) return null;
            if (!Number.isFinite(unitCost)) return null;
            const totalCost = roundPostAuditMoney(item?.totalCost ?? (quantity * unitCost));
            return {
                id: String(item?.id || `${Date.now()}_${Math.random().toString(36).slice(2)}`),
                code: String(item?.code || item?.reducedCode || item?.barcode || '').trim(),
                barcode: String(item?.barcode || '').trim() || undefined,
                reducedCode: String(item?.reducedCode || '').trim() || undefined,
                description: String(item?.description || item?.name || 'Produto sem descrição').trim(),
                mode: item?.mode === 'replace' ? 'replace' : 'delta',
                previousAuditedQty: Number.isFinite(Number(item?.previousAuditedQty)) ? Number(item.previousAuditedQty) : undefined,
                replacementQuantity: Number.isFinite(Number(item?.replacementQuantity)) ? Number(item.replacementQuantity) : undefined,
                quantity,
                unitCost,
                totalCost,
                groupId: item?.groupId ? String(item.groupId) : undefined,
                groupName: item?.groupName ? String(item.groupName) : undefined,
                deptId: item?.deptId ? String(item.deptId) : undefined,
                deptName: item?.deptName ? String(item.deptName) : undefined,
                catId: item?.catId ? String(item.catId) : undefined,
                catName: item?.catName ? String(item.catName) : undefined,
                note: item?.note ? String(item.note) : undefined,
                createdAt: String(item?.createdAt || new Date().toISOString()),
                createdBy: item?.createdBy ? String(item.createdBy) : undefined
            };
        })
        .filter((item): item is PostAuditAdjustment => !!item);
};

const isHierarchyPlaceholderName = (value: unknown, extraInvalid: string[] = []) => {
    const text = normalizeLookupText(value).replace(/\s+/g, ' ');
    if (!text) return false;
    if (
        text.includes('sem departamento') ||
        text.includes('sem categoria') ||
        text.includes('nao classificado')
    ) {
        return true;
    }
    return extraInvalid.some(invalid => text === normalizeLookupText(invalid));
};

const parseHierarchyCell = (value: unknown, fallbackName: string) => {
    const raw = (value ?? '').toString().trim();
    if (!raw) return { numericId: '', name: fallbackName };

    const numericId = parseSheetNumericCode(raw);
    const name = raw
        .replace(/^\s*\d[\d.,]*\s*(?:-|:|\/|\.)*\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();

    const isUnclassified = isHierarchyPlaceholderName(name, ['OUTROS']);

    return {
        numericId: (numericId !== null && !isUnclassified) ? String(numericId) : '',
        name: name || raw || fallbackName
    };
};

const parseHierarchyCells = (
    codeOrCombinedCell: unknown,
    nameCell: unknown,
    fallbackName: string,
    extraInvalid: string[] = []
) => {
    const first = parseHierarchyCell(codeOrCombinedCell, '');
    const second = parseHierarchyCell(nameCell, '');
    const invalidLabels = ['OUTROS', ...extraInvalid];
    const isUsefulName = (value: unknown) => {
        const text = String(value ?? '').trim();
        if (!text) return false;
        if (!/[A-Za-zÀ-ÿ]/.test(text)) return false;
        if (/^[\d\s.,:/-]+$/.test(text)) return false;
        return !isHierarchyPlaceholderName(text, invalidLabels);
    };

    const name = isUsefulName(second.name)
        ? second.name
        : isUsefulName(first.name)
            ? first.name
            : (second.name || first.name || fallbackName);
    const normalizedName = String(name || fallbackName).trim() || fallbackName;
    const isPlaceholder = isHierarchyPlaceholderName(normalizedName, invalidLabels);

    return {
        numericId: isPlaceholder ? '' : (first.numericId || second.numericId || ''),
        name: normalizedName
    };
};

const findBarcodeInRow = (row: any[]): string => {
    const normalize = (val: any) => {
        if (val === null || val === undefined) return '';
        let s = val.toString().trim();
        if (s.includes('E+') || s.includes('e+')) {
            s = Number(val).toLocaleString('fullwide', { useGrouping: false });
        }
        return s.replace(/\D/g, '').replace(/^0+/, '');
    };

    const fromMainCol = normalize(row?.[11]);
    if (fromMainCol) return fromMainCol;

    for (const cell of row || []) {
        const candidate = normalize(cell);
        if (candidate.length >= 8 && candidate.length <= 14) return candidate;
    }
    return '';
};

const isDoneStatus = (status?: AuditStatus | string) => normalizeAuditStatus(status) === AuditStatus.DONE;
const isInProgressStatus = (status?: AuditStatus | string) => normalizeAuditStatus(status) === AuditStatus.IN_PROGRESS;
const normalizeScopeId = (val?: string | number | null) => (val === undefined || val === null ? '' : String(val));
const normalizeAuditDataStructure = (input?: AuditData | null): { data: AuditData | null; changed: boolean } => {
    if (!input || !Array.isArray(input.groups)) return { data: input || null, changed: false };

    const raw = (v: unknown) => String(v ?? '').trim();
    const digits = (v: unknown) => raw(v).replace(/\D/g, '').replace(/^0+/, '');
    const label = (v: unknown) => normalizeLookupText(String(v ?? ''));
    const normalizeProductCode = (v: unknown) => {
        const s = String(v ?? '').trim();
        if (!s) return '';
        if (/^[0-9]+$/.test(s)) return s.replace(/^0+/, '');
        const n = Number(s);
        if (Number.isFinite(n) && /[Ee+]/.test(s)) {
            return n.toLocaleString('fullwide', { useGrouping: false }).replace(/\D/g, '').replace(/^0+/, '');
        }
        return s.replace(/\D/g, '').replace(/^0+/, '');
    };
    const groupIdKey = (g: Group) => digits(g.id) || raw(g.id);
    const groupKey = (g: Group) => groupIdKey(g) || label(g.name);
    const deptKey = (d: Department) => digits((d as any).numericId || d.id) || raw(d.id) || label(d.name);
    const catKey = (c: Category) => raw(c.id) || digits((c as any).numericId) || label(c.name);
    const productKey = (p: Product) => normalizeProductCode((p as any).reducedCode || p.code) || raw(p.name);
    const fixKey = (fix: { groupId: string; deptId: string; catId: string }) =>
        `${fix.groupId}|${fix.deptId}|${fix.catId}`;
    const isProductInFixedScope = (group: Group, dept: Department, cat: Category, fix: { groupId: string; deptId: string; deptName: string; catId: string; catName: string }) => {
        const gMatch = (digits(group.id) || raw(group.id)) === fix.groupId;
        const dMatch =
            digits((dept as any).numericId || dept.id) === fix.deptId ||
            label(dept.name) === label(fix.deptName);
        const cMatch =
            digits((cat as any).numericId || cat.id) === fix.catId ||
            label(cat.name) === label(fix.catName);
        return gMatch && dMatch && cMatch;
    };
    const recalcCategoryTotals = (cat: Category) => {
        const totalQuantity = (cat.products || []).reduce((sum, p) => sum + Number(p.quantity || 0), 0);
        const totalCost = (cat.products || []).reduce((sum, p) => sum + Number(p.quantity || 0) * Number(p.cost || 0), 0);
        return {
            ...cat,
            itemsCount: (cat.products || []).length,
            totalQuantity,
            totalCost
        };
    };
    const fixedProducts = new Map<string, { fix: typeof PRODUCT_CLASSIFICATION_FIXES_BY_CODE[string]; products: Product[] }>();
    const statusRank = (s: AuditStatus | string) => {
        const n = normalizeAuditStatus(s);
        if (n === AuditStatus.DONE) return 3;
        if (n === AuditStatus.IN_PROGRESS) return 2;
        return 1;
    };

    let changed = false;
    const nextGroups: Group[] = [];

    input.groups.forEach(group => {
        const gKey = groupKey(group);
        let targetGroup = nextGroups.find(g => {
            const leftId = groupIdKey(g);
            const rightId = groupIdKey(group);
            if (leftId && rightId) return leftId === rightId;
            return groupKey(g) === gKey;
        });
        if (!targetGroup) {
            targetGroup = { ...group, departments: [] };
            nextGroups.push(targetGroup);
        } else {
            changed = true;
        }

        (group.departments || []).forEach(dept => {
            const dKey = deptKey(dept);
            let targetDept = targetGroup!.departments.find(d => deptKey(d) === dKey || label(d.name) === label(dept.name));
            if (!targetDept) {
                targetDept = { ...dept, categories: [] };
                targetGroup!.departments.push(targetDept);
            } else {
                changed = true;
                if (!(targetDept as any).numericId && (dept as any).numericId) (targetDept as any).numericId = (dept as any).numericId;
            }

            (dept.categories || []).forEach(cat => {
                const cKey = catKey(cat);
                const existingIdx = (targetDept!.categories || []).findIndex(c => catKey(c) === cKey || label(c.name) === label(cat.name));
                const normalizedCat: Category = {
                    ...cat,
                    status: normalizeAuditStatus(cat.status),
                    products: (() => {
                        const seen = new Set<string>();
                        const deduped: Product[] = [];
                        (cat.products || []).forEach(p => {
                            const pKey = productKey(p);
                            if (!pKey || seen.has(pKey)) {
                                if (pKey) changed = true;
                                return;
                            }
                            const fixedScope = PRODUCT_CLASSIFICATION_FIXES_BY_CODE[pKey];
                            if (fixedScope && !isProductInFixedScope(group, dept, cat, fixedScope)) {
                                changed = true;
                                const key = fixKey(fixedScope);
                                const bucket = fixedProducts.get(key) || { fix: fixedScope, products: [] };
                                if (!bucket.products.some(existing => productKey(existing) === pKey)) {
                                    bucket.products.push({ ...p });
                                }
                                fixedProducts.set(key, bucket);
                                return;
                            }
                            seen.add(pKey);
                            deduped.push({ ...p });
                        });
                        return deduped;
                    })()
                };

                if (existingIdx < 0) {
                    targetDept!.categories.push(normalizedCat);
                } else {
                    changed = true;
                    const existing = targetDept!.categories[existingIdx];
                    const incomingRank = statusRank(normalizedCat.status);
                    const existingRank = statusRank(existing.status);
                    const keepIncoming =
                        incomingRank > existingRank ||
                        (incomingRank === existingRank &&
                            (normalizedCat.products?.length || 0) > (existing.products?.length || 0));
                    if (keepIncoming) {
                        targetDept!.categories[existingIdx] = normalizedCat;
                    }
                }
            });
        });
    });

    fixedProducts.forEach(({ fix, products }) => {
        let targetGroup = nextGroups.find(g => (digits(g.id) || raw(g.id)) === fix.groupId);
        if (!targetGroup) {
            targetGroup = { id: fix.groupId, name: fix.groupName, departments: [] };
            nextGroups.push(targetGroup);
        }
        let targetDept = targetGroup.departments.find(d =>
            digits((d as any).numericId || d.id) === fix.deptId ||
            label(d.name) === label(fix.deptName)
        );
        if (!targetDept) {
            targetDept = { id: fix.deptId, numericId: fix.deptId, name: fix.deptName, categories: [] };
            targetGroup.departments.push(targetDept);
        } else if (!(targetDept as any).numericId) {
            (targetDept as any).numericId = fix.deptId;
        }
        let targetCat = targetDept.categories.find(c =>
            digits((c as any).numericId || c.id) === fix.catId ||
            label(c.name) === label(fix.catName)
        );
        if (!targetCat) {
            targetCat = {
                id: `${fix.groupId}-${fix.deptId}-${fix.catId}`,
                numericId: fix.catId,
                name: fix.catName,
                itemsCount: 0,
                totalQuantity: 0,
                totalCost: 0,
                status: AuditStatus.TODO,
                products: []
            };
            targetDept.categories.push(targetCat);
        } else if (!targetCat.numericId) {
            targetCat.numericId = fix.catId;
        }

        products.forEach(product => {
            const pKey = productKey(product);
            if (!targetCat!.products.some(existing => productKey(existing) === pKey)) {
                targetCat!.products.push(product);
            }
        });
    });

    nextGroups.forEach(group => {
        group.departments.forEach(dept => {
            dept.categories = dept.categories
                .map(recalcCategoryTotals)
                .filter(cat => {
                    if ((cat.products || []).length > 0) return true;
                    return !isDiversosLabel(cat.name) && !isHierarchyPlaceholderName(cat.name, ['OUTROS', 'GERAL']);
                });
        });
        group.departments = group.departments.filter(dept => {
            if ((dept.categories || []).length > 0) return true;
            return !isDiversosLabel(dept.name) && !isHierarchyPlaceholderName(dept.name, ['OUTROS', 'GERAL']);
        });
    });

    if (!changed) return { data: input, changed: false };
    return { data: { ...input, groups: nextGroups }, changed: true };
};
const createBatchId = () => {
    const cryptoObj = (window as any)?.crypto;
    if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
    return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const getEntryBatchId = (entry: { batchId?: string; groupId?: string | number; deptId?: string | number; catId?: string | number }) =>
    entry.batchId || partialScopeKey(entry);

const partialCompletedKey = (entry: { batchId?: string; groupId?: string | number; deptId?: string | number; catId?: string | number }) =>
    `${getEntryBatchId(entry)}|${partialScopeKey(entry)}`;

const getLatestBatchId = (entries?: Array<{ completedAt?: string; startedAt?: string; batchId?: string; groupId?: string | number; deptId?: string | number; catId?: string | number }>) => {
    if (!entries || entries.length === 0) return undefined;
    let latest = entries[0];
    let latestTs = new Date(latest.completedAt || latest.startedAt || 0).getTime();
    entries.forEach(e => {
        const ts = new Date(e.completedAt || e.startedAt || 0).getTime();
        if (ts > latestTs) {
            latest = e;
            latestTs = ts;
        }
    });
    return getEntryBatchId(latest);
};

const partialScopeKey = (scope: { groupId?: string | number; deptId?: string | number; catId?: string | number } | undefined) => {
    if (!scope) return '';
    return [normalizeScopeId(scope.groupId), normalizeScopeId(scope.deptId), normalizeScopeId(scope.catId)].join('|');
};

const isPartialScopeMatch = (
    partial: { groupId?: string | number; deptId?: string | number; catId?: string | number } | undefined,
    groupId?: string | number,
    deptId?: string | number,
    catId?: string | number
) => {
    if (!partial) return false;
    const pGroup = normalizeScopeId(partial.groupId);
    const pDept = normalizeScopeId(partial.deptId);
    const pCat = normalizeScopeId(partial.catId);
    const g = normalizeScopeId(groupId);
    const d = normalizeScopeId(deptId);
    const c = normalizeScopeId(catId);
    if (g && pGroup && pGroup !== g) return false;
    if (d && pDept && pDept !== d) return false;
    if (c && pCat && pCat !== c) return false;
    return true;
};

const scopeContainsPartial = (
    partial: { groupId?: string | number; deptId?: string | number; catId?: string | number },
    groupId?: string | number,
    deptId?: string | number,
    catId?: string | number
) => {
    const pGroup = normalizeScopeId(partial.groupId);
    const pDept = normalizeScopeId(partial.deptId);
    const pCat = normalizeScopeId(partial.catId);
    const g = normalizeScopeId(groupId);
    const d = normalizeScopeId(deptId);
    const c = normalizeScopeId(catId);
    if (!g || pGroup !== g) return false;
    if (!d) return true;
    if (pDept !== d) return false;
    if (!c) return true;
    return pCat === c;
};

type TermScopeType = 'group' | 'department' | 'category' | 'custom';

interface TermScope {
    type: TermScopeType;
    groupId?: string;
    deptId?: string;
    catId?: string;
    customScopes?: Array<{ groupId?: string; deptId?: string; catId?: string }>;
    customLabel?: string;
    batchId?: string;
}

interface TermCollaborator {
    name: string;
    cpf: string;
    signature: string;
}

interface TermForm {
    inventoryNumber: string;
    date: string;
    managerName2: string;
    managerCpf2: string;
    managerSignature2: string;
    managerName: string;
    managerCpf: string;
    managerSignature: string;
    collaborators: TermCollaborator[];
    excelMetrics?: {
        sysQty: number;
        sysCost: number;
        countedQty: number;
        countedCost: number;
        diffQty: number;
        diffCost: number;
        items: any[];
        groupedDifferences?: any[];
        sourceRows?: any[][];
        sourceFileName?: string;
        sourceFileSize?: number;
        sourceUploadedAt?: string;
        officialDiffCost?: number;
        financialDiffSource?: string;
        financialDiffColumnIndex?: number;
    };
    excelMetricsRemovedAt?: string;
}

const getScopeGroupIds = (scope?: TermScope | null): string[] => {
    if (!scope) return [];
    const ids = new Set<string>();
    const addId = (value?: string | number) => {
        const normalized = normalizeScopeId(value);
        if (normalized) ids.add(normalized);
    };
    addId(scope.groupId);
    (scope.customScopes || []).forEach(s => addId(s.groupId));
    return Array.from(ids);
};

const mergeTermDraftMaps = (
    current: Record<string, TermForm> | undefined,
    incoming: Record<string, TermForm> | undefined
): Record<string, TermForm> => {
    const base = { ...(current || {}) };
    Object.entries(incoming || {}).forEach(([key, incomingDraft]) => {
        const currentDraft = base[key];
        if (!currentDraft) {
            base[key] = incomingDraft?.excelMetrics
                ? { ...incomingDraft, excelMetrics: normalizeTermMetricsToOfficial(incomingDraft.excelMetrics) }
                : incomingDraft;
            return;
        }
        const nextMetrics = normalizeTermMetricsToOfficial(pickPreferredTermMetrics(incomingDraft?.excelMetrics, currentDraft?.excelMetrics));
        let nextRemovedAt = incomingDraft?.excelMetricsRemovedAt ?? currentDraft?.excelMetricsRemovedAt;
        if (incomingDraft?.excelMetrics) nextRemovedAt = undefined;
        base[key] = nextMetrics
            ? { ...currentDraft, ...incomingDraft, excelMetrics: nextMetrics, excelMetricsRemovedAt: nextRemovedAt }
            : { ...currentDraft, ...incomingDraft, excelMetricsRemovedAt: nextRemovedAt };
    });
    return base;
};

const cloneTermCollaborators = (collaborators?: TermCollaborator[]) =>
    (collaborators || []).map(c => ({
        name: c?.name || '',
        cpf: c?.cpf || '',
        signature: c?.signature || ''
    }));

const applyTermSigners = (base: TermForm, source: TermForm): TermForm => ({
    ...base,
    managerName2: source.managerName2 || '',
    managerCpf2: source.managerCpf2 || '',
    managerSignature2: source.managerSignature2 || '',
    managerName: source.managerName || '',
    managerCpf: source.managerCpf || '',
    managerSignature: source.managerSignature || '',
    collaborators: cloneTermCollaborators(source.collaborators)
});

const replicateSignersToAllTermDrafts = (
    drafts: Record<string, TermForm>,
    source: TermForm
): Record<string, TermForm> => {
    const next: Record<string, TermForm> = {};
    Object.entries(drafts || {}).forEach(([key, draft]) => {
        next[key] = applyTermSigners(draft, source);
    });
    return next;
};

const mergeExcelMetricsPools = (pools: any[]): any | null => {
    const validPools = (pools || []).filter(Boolean);
    if (validPools.length === 0) return null;
    if (validPools.length === 1) return validPools[0];

    const mergedPoolDiffCostValues = validPools
        .map((pool: any) => {
            const raw = pool?.officialDiffCost ?? pool?.diffCost;
            if (raw === undefined || raw === null || raw === '') return null;
            const value = roundAuditMoney(raw);
            return Number.isFinite(value) ? value : null;
        })
        .filter((value): value is number => value !== null);
    const mergedPoolDiffCost = mergedPoolDiffCostValues.length === validPools.length
        ? roundAuditMoney(mergedPoolDiffCostValues.reduce((sum, value) => sum + value, 0))
        : null;

    const normText = (value: unknown) =>
        String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    const normCode = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');

    const uniqueItems = new Map<string, any>();
    validPools.forEach((pool) => {
        (Array.isArray(pool.items) ? pool.items : []).forEach((it: any) => {
            const keyObj = {
                code: normCode(it?.code),
                groupId: normalizeScopeId(it?.groupId),
                deptId: normalizeScopeId(it?.deptId),
                catId: normalizeScopeId(it?.catId),
                groupName: normText(it?.groupName),
                deptName: normText(it?.deptName),
                catName: normText(it?.catName),
                sysQty: Number(it?.sysQty || 0),
                countedQty: Number(it?.countedQty || 0),
                diffQty: Number(it?.diffQty || 0),
                sysCost: Number(it?.sysCost || 0),
                countedCost: Number(it?.countedCost || 0),
                diffCost: Number(it?.diffCost || 0)
            };
            const key = JSON.stringify(keyObj);
            if (!uniqueItems.has(key)) uniqueItems.set(key, it);
        });
    });

    if (uniqueItems.size > 0) {
        const items = Array.from(uniqueItems.values());
        const totals = items.reduce((acc: any, it: any) => ({
            sysQty: (acc.sysQty || 0) + Number(it?.sysQty || 0),
            sysCost: (acc.sysCost || 0) + Number(it?.sysCost || 0),
            countedQty: (acc.countedQty || 0) + Number(it?.countedQty || 0),
            countedCost: (acc.countedCost || 0) + Number(it?.countedCost || 0),
            diffQty: (acc.diffQty || 0) + Number(it?.diffQty || 0),
            diffCost: (acc.diffCost || 0) + Number(it?.diffCost || 0)
        }), { sysQty: 0, sysCost: 0, countedQty: 0, countedCost: 0, diffQty: 0, diffCost: 0 });

        const groupedMap: Record<string, any> = {};
        items.forEach((it: any) => {
            const gId = normalizeScopeId(it?.groupId);
            const dId = normalizeScopeId(it?.deptId);
            const cId = normalizeScopeId(it?.catId);
            const g = it?.groupName || '';
            const d = it?.deptName || '';
            const c = it?.catName || '';
            const gKey = `${gId || g}|${dId || d}|${cId || c}`;
            if (!groupedMap[gKey]) {
                groupedMap[gKey] = {
                    groupId: gId || undefined,
                    deptId: dId || undefined,
                    catId: cId || undefined,
                    groupName: g,
                    deptName: d,
                    catName: c,
                    sysQty: 0,
                    sysCost: 0,
                    countedQty: 0,
                    countedCost: 0,
                    diffQty: 0,
                    diffCost: 0
                };
            }
            groupedMap[gKey].sysQty += Number(it?.sysQty || 0);
            groupedMap[gKey].sysCost += Number(it?.sysCost || 0);
            groupedMap[gKey].countedQty += Number(it?.countedQty || 0);
            groupedMap[gKey].countedCost += Number(it?.countedCost || 0);
            groupedMap[gKey].diffQty += Number(it?.diffQty || 0);
            groupedMap[gKey].diffCost += Number(it?.diffCost || 0);
        });

        return {
            ...totals,
            ...(mergedPoolDiffCost !== null ? { diffCost: mergedPoolDiffCost, officialDiffCost: mergedPoolDiffCost, financialDiffSource: 'merged_term_pools' } : {}),
            items,
            groupedDifferences: Object.values(groupedMap)
        };
    }

    const fallback = validPools.reduce((acc: any, curr: any) => ({
        sysQty: (acc.sysQty || 0) + (curr.sysQty || 0),
        sysCost: (acc.sysCost || 0) + (curr.sysCost || 0),
        countedQty: (acc.countedQty || 0) + (curr.countedQty || 0),
        countedCost: (acc.countedCost || 0) + (curr.countedCost || 0),
        diffQty: (acc.diffQty || 0) + (curr.diffQty || 0),
        diffCost: (acc.diffCost || 0) + (curr.diffCost || 0),
        items: [...(acc.items || []), ...(curr.items || [])],
        groupedDifferences: [...(acc.groupedDifferences || []), ...(curr.groupedDifferences || [])]
    }), { sysQty: 0, sysCost: 0, countedQty: 0, countedCost: 0, diffQty: 0, diffCost: 0, items: [], groupedDifferences: [] });

    return {
        ...fallback,
        ...(mergedPoolDiffCost !== null ? { diffCost: mergedPoolDiffCost, officialDiffCost: mergedPoolDiffCost, financialDiffSource: 'merged_term_pools' } : {})
    };
};

const parseCustomDraftKeyMeta = (draftKey: string): null | { batchId?: string; scopesPart: string } => {
    const match = draftKey.match(/^custom\|([^|]*)(?:\|(.*))?$/);
    if (!match) return null;
    const hasNewFormat = typeof match[2] === 'string';
    if (hasNewFormat) return { batchId: (match[1] || '').trim() || undefined, scopesPart: match[2] || '' };
    return { batchId: undefined, scopesPart: match[1] || '' };
};

const normalizeCustomScopesPart = (scopesPart?: string) =>
    String(scopesPart || '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .sort()
        .join(',');

const getCustomDraftScopesPart = (draftKey: string) =>
    normalizeCustomScopesPart(parseCustomDraftKeyMeta(draftKey)?.scopesPart || '');

const getCompletedTermBatchIds = (sourceData: any) => {
    const set = new Set<string>();
    const completed = Array.isArray(sourceData?.partialCompleted) ? sourceData.partialCompleted : [];
    completed.forEach((entry: any) => {
        const batchId = normalizeScopeId(getEntryBatchId(entry));
        if (batchId) set.add(batchId);
    });
    return set;
};

const isTermDraftBatchActive = (sourceData: any, draftKey: string) => {
    if (!draftKey.startsWith('custom|')) return true;
    if (draftKey.includes(GLOBAL_UNIFIED_TERM_BATCH_ID)) return true;
    const activeBatchIds = getCompletedTermBatchIds(sourceData);
    if (activeBatchIds.size === 0) return true;
    const batchId = normalizeScopeId(parseCustomDraftKeyMeta(draftKey)?.batchId);
    return !batchId || activeBatchIds.has(batchId);
};

const makeTermScopeAliasSet = (values: unknown[]) => {
    const set = new Set<string>();
    values.forEach(value => {
        const raw = normalizeScopeId(value as any).trim();
        if (raw) {
            set.add(raw);
            const lastDashPart = raw.split('-').filter(Boolean).pop();
            if (lastDashPart) set.add(normalizeScopeId(lastDashPart));
        }
        const digits = String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
        if (digits) set.add(digits);
    });
    return set;
};

const termAliasSetsIntersect = (a: Set<string>, b: Set<string>) => {
    for (const value of a) {
        if (b.has(value)) return true;
    }
    return false;
};

const normalizeTermScopeText = (value: unknown) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

const parseCustomTermScopeEntries = (scopesPart?: string) =>
    String(scopesPart || '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .map(scopeKey => {
            const [groupId, deptId, catId] = scopeKey.split('|');
            return { groupId, deptId, catId };
        });

const buildTermScopeEntries = (
    sourceData: any,
    scopes: Array<{ groupId?: string; deptId?: string; catId?: string }>
) => {
    const groups = Array.isArray(sourceData?.groups) ? sourceData.groups : [];
    const entries: Array<{
        groupIds: Set<string>;
        groupName?: string;
        deptIds: Set<string>;
        deptName?: string;
        catIds: Set<string>;
        catName?: string;
    }> = [];

    scopes.forEach(scope => {
        const targetGroupIds = makeTermScopeAliasSet([scope.groupId]);
        const targetDeptIds = makeTermScopeAliasSet([scope.deptId]);
        const targetCatIds = makeTermScopeAliasSet([scope.catId]);
        let matched = false;

        groups.forEach((group: any) => {
            const groupIds = makeTermScopeAliasSet([group?.id, group?.numericId]);
            if (targetGroupIds.size > 0 && !termAliasSetsIntersect(targetGroupIds, groupIds)) return;

            (group?.departments || []).forEach((dept: any) => {
                const deptIds = makeTermScopeAliasSet([dept?.id, dept?.numericId]);
                if (targetDeptIds.size > 0 && !termAliasSetsIntersect(targetDeptIds, deptIds)) return;

                (dept?.categories || []).forEach((cat: any) => {
                    const catIds = makeTermScopeAliasSet([cat?.id, cat?.numericId]);
                    if (targetCatIds.size > 0 && !termAliasSetsIntersect(targetCatIds, catIds)) return;
                    matched = true;
                    entries.push({
                        groupIds,
                        groupName: group?.name,
                        deptIds,
                        deptName: dept?.name,
                        catIds,
                        catName: cat?.name
                    });
                });
            });
        });

        if (!matched) {
            entries.push({
                groupIds: targetGroupIds,
                deptIds: targetDeptIds,
                catIds: targetCatIds
            });
        }
    });

    return entries;
};

const rowMatchesTermScopeEntry = (row: any, entry: ReturnType<typeof buildTermScopeEntries>[number]) => {
    const matchPart = (
        rowId: unknown,
        rowName: unknown,
        targetIds: Set<string>,
        targetName?: string
    ) => {
        if (targetIds.size === 0) return true;
        const rowIds = makeTermScopeAliasSet([rowId]);
        if (rowIds.size > 0 && termAliasSetsIntersect(rowIds, targetIds)) return true;
        const rowText = normalizeTermScopeText(rowName || '');
        const targetText = normalizeTermScopeText(targetName || '');
        return !!rowText && !!targetText && rowText === targetText;
    };

    return (
        matchPart(row?.groupId, row?.groupName, entry.groupIds, entry.groupName) &&
        matchPart(row?.deptId, row?.deptName, entry.deptIds, entry.deptName) &&
        matchPart(row?.catId, row?.catName, entry.catIds, entry.catName)
    );
};

const buildGroupedTermRowsFromItems = (items: any[]) => {
    const groupedMap: Record<string, any> = {};
    items.forEach((item: any) => {
        const gId = normalizeScopeId(item?.groupId);
        const dId = normalizeScopeId(item?.deptId);
        const cId = normalizeScopeId(item?.catId);
        const key = `${gId || normalizeTermScopeText(item?.groupName)}|${dId || normalizeTermScopeText(item?.deptName)}|${cId || normalizeTermScopeText(item?.catName)}`;
        if (!groupedMap[key]) {
            groupedMap[key] = {
                groupId: gId || undefined,
                groupName: item?.groupName || 'DIVERSOS (SEM GRUPO)',
                deptId: dId || undefined,
                deptName: item?.deptName || 'DIVERSOS (SEM DEPARTAMENTO)',
                catId: cId || undefined,
                catName: item?.catName || 'DIVERSOS (SEM CATEGORIA)',
                sysQty: 0,
                sysCost: 0,
                countedQty: 0,
                countedCost: 0,
                diffQty: 0,
                diffCost: 0
            };
        }
        groupedMap[key].sysQty += Number(item?.sysQty || 0);
        groupedMap[key].sysCost += Number(item?.sysCost || 0);
        groupedMap[key].countedQty += Number(item?.countedQty || 0);
        groupedMap[key].countedCost += Number(item?.countedCost || 0);
        groupedMap[key].diffQty += Number(item?.diffQty || 0);
        groupedMap[key].diffCost += Number(item?.diffCost || 0);
    });
    return Object.values(groupedMap).sort((a: any, b: any) => Number(a.diffCost || 0) - Number(b.diffCost || 0));
};

const sanitizeTermMetricsForDraftScope = (sourceData: any, draftKey: string, metrics: any) => {
    const normalized = normalizeTermMetricsToOfficial(metrics);
    if (!normalized || !draftKey.startsWith('custom|')) return normalized;

    const meta = parseCustomDraftKeyMeta(draftKey);
    const scopes = parseCustomTermScopeEntries(meta?.scopesPart || '');
    if (scopes.length === 0) return normalized;

    const scopeEntries = buildTermScopeEntries(sourceData, scopes);
    if (scopeEntries.length === 0) return normalized;

    const matchesAnyScope = (row: any) => scopeEntries.some(entry => rowMatchesTermScopeEntry(row, entry));
    const cleanItems = (Array.isArray(normalized.items) ? normalized.items : []).filter((item: any) => !isTermMetadataRow(item));
    const groupedRows = Array.isArray(normalized.groupedDifferences) ? normalized.groupedDifferences : [];
    const scopedItems = cleanItems.filter(matchesAnyScope);
    const scopedGrouped = groupedRows.filter(matchesAnyScope);

    const itemCountChanged = cleanItems.length > 0 && scopedItems.length > 0 && scopedItems.length !== cleanItems.length;
    const groupedCountChanged = groupedRows.length > 0 && scopedGrouped.length > 0 && scopedGrouped.length !== groupedRows.length;
    if (!itemCountChanged && !groupedCountChanged) return normalized;

    const sourceRows = scopedItems.length > 0 ? scopedItems : scopedGrouped;
    if (sourceRows.length === 0) return normalized;

    const totals = summarizeTermRows(sourceRows);
    const baseMetrics = { ...normalized };
    delete (baseMetrics as any).officialDiffCost;
    delete (baseMetrics as any).financialDiffSource;
    return normalizeTermMetricsToOfficial({
        ...baseMetrics,
        ...totals,
        items: scopedItems.length > 0 ? scopedItems : [],
        groupedDifferences: scopedItems.length > 0 ? buildGroupedTermRowsFromItems(scopedItems) : scopedGrouped
    });
};

const GLOBAL_UNIFIED_TERM_BATCH_ID = '__global_unified_term__';

const roundAuditMoney = (value: unknown) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getStockFileSignature = (meta: any): string => {
    if (!meta) return '';
    const moduleKey = String(meta.module_key || meta.moduleKey || 'stock').trim().toLowerCase() || 'stock';
    const fileName = String(meta.file_name || meta.fileName || meta.name || '').trim().toLowerCase();
    const fileSizeRaw = meta.file_size ?? meta.fileSize ?? meta.size;
    const fileSize = Number.isFinite(Number(fileSizeRaw)) ? String(Number(fileSizeRaw)) : '';
    if (fileName || fileSize) return `${moduleKey}|${fileName}|${fileSize}`;

    const id = String(meta.id || '').trim();
    const uploadedAt = String(meta.uploaded_at || meta.uploadedAt || '').trim();
    const updatedAt = String(meta.updated_at || meta.updatedAt || '').trim();
    return (id || uploadedAt || updatedAt) ? `${moduleKey}|${id}|${uploadedAt || updatedAt}` : '';
};

const getAppliedStockSignature = (sourceFiles: any): string => {
    const explicit = String(
        sourceFiles?.globalStockSignature ||
        sourceFiles?.stockSignature ||
        sourceFiles?.stock?.signature ||
        ''
    ).trim();
    if (explicit) return explicit;

    return getStockFileSignature({
        module_key: sourceFiles?.stock?.module_key || sourceFiles?.stock?.moduleKey || 'stock',
        file_name: sourceFiles?.stock?.file_name || sourceFiles?.stock?.fileName || sourceFiles?.stock?.name,
        file_size: sourceFiles?.stock?.file_size ?? sourceFiles?.stock?.fileSize ?? sourceFiles?.stock?.size,
        id: sourceFiles?.stock?.id,
        uploaded_at: sourceFiles?.stock?.syncedAt || sourceFiles?.stock?.uploaded_at || sourceFiles?.stock?.uploadedAt,
        updated_at: sourceFiles?.stock?.updated_at || sourceFiles?.stock?.updatedAt
    });
};

const getAppliedStockTimestampRaw = (sourceFiles: any): string | null =>
    String(
        sourceFiles?.globalStockProcessedAt ||
        sourceFiles?.stock?.syncedAt ||
        sourceFiles?.lastStockUpdateAt ||
        ''
    ).trim() || null;

const getGlobalStockTimestampRaw = (globalStockMeta: any): string | null =>
    String(globalStockMeta?.uploaded_at || globalStockMeta?.updated_at || '').trim() || null;

const isGlobalStockDifferentFromApplied = (sourceFiles: any, globalStockMeta: any): boolean => {
    if (!globalStockMeta) return false;
    const globalRaw = getGlobalStockTimestampRaw(globalStockMeta);
    const appliedRaw = getAppliedStockTimestampRaw(sourceFiles);
    const globalTs = globalRaw ? new Date(globalRaw).getTime() : NaN;
    const appliedTs = appliedRaw ? new Date(appliedRaw).getTime() : NaN;
    if (!Number.isFinite(globalTs)) return false;
    if (Number.isFinite(appliedTs) && globalTs <= appliedTs + 1000) return false;

    const globalSignature = getStockFileSignature(globalStockMeta);
    const appliedSignature = getAppliedStockSignature(sourceFiles);
    if (globalSignature && appliedSignature && globalSignature === appliedSignature) return false;

    return true;
};

const getTermMetricsTimestamp = (metrics: any) => {
    const raw = metrics?.sourceUploadedAt || metrics?.financialDiffVerifiedAt || metrics?.updatedAt;
    const time = raw ? Date.parse(String(raw)) : 0;
    return Number.isFinite(time) ? time : 0;
};

const getTermMetricsQualityScore = (metrics: any) => {
    if (!metrics) return -1;
    let score = 0;
    if (Array.isArray(metrics.sourceRows) && metrics.sourceRows.length > 0) score += 1000;
    if (metrics.sourceUploadedAt) score += 250;
    if (metrics.officialDiffCost !== undefined && metrics.officialDiffCost !== null) score += 150;
    if (metrics.financialDiffSource === 'spreadsheet_column') score += 80;
    if (metrics.financialDiffSource === 'calculated_cost_delta') score += 40;
    if (Array.isArray(metrics.items) && metrics.items.length > 0) score += Math.min(metrics.items.length, 100);
    return score;
};

const pickPreferredTermMetrics = (...metricsList: any[]) => {
    return metricsList.filter(Boolean).reduce((best, candidate) => {
        if (!best) return candidate;
        const candidateScore = getTermMetricsQualityScore(candidate);
        const bestScore = getTermMetricsQualityScore(best);
        if (candidateScore !== bestScore) return candidateScore > bestScore ? candidate : best;
        return getTermMetricsTimestamp(candidate) >= getTermMetricsTimestamp(best) ? candidate : best;
    }, null as any);
};

const TERM_METADATA_KEYWORDS = [
    'filial:', 'grupo de produtos:', 'departamento:', 'categoria:',
    'tipo de produto:', 'grupo de preço:', 'início contagem:',
    'conferência de estoque', 'código', 'página 1 de', 'produto:'
];

const isTermMetadataRow = (item: any) => {
    const codigo = String(item?.code || '').trim().toLowerCase();
    const descricao = String(item?.description || item?.name || '').trim().toLowerCase();

    if (TERM_METADATA_KEYWORDS.some(keyword => codigo.startsWith(keyword) || descricao.startsWith(keyword))) {
        return true;
    }
    if ((!codigo && !descricao) || codigo === '-' || descricao === '-' || (codigo === '' && descricao === '-')) {
        return true;
    }
    return false;
};

const summarizeTermRows = (rows: any[]) => {
    const totals = rows.reduce((acc: any, item: any) => ({
        sysQty: acc.sysQty + Number(item?.sysQty || 0),
        sysCost: acc.sysCost + Number(item?.sysCost || 0),
        countedQty: acc.countedQty + Number(item?.countedQty || 0),
        countedCost: acc.countedCost + Number(item?.countedCost || 0),
        diffQty: acc.diffQty + Number(item?.diffQty || 0),
        diffCost: acc.diffCost + Number(item?.diffCost || 0)
    }), { sysQty: 0, sysCost: 0, countedQty: 0, countedCost: 0, diffQty: 0, diffCost: 0 });

    return {
        ...totals,
        sysCost: roundAuditMoney(totals.sysCost),
        countedCost: roundAuditMoney(totals.countedCost),
        diffCost: roundAuditMoney(totals.diffCost)
    };
};

const getOfficialTermDiffCost = (metrics: any): number | null => {
    if (!metrics) return null;
    const raw = metrics.officialDiffCost ?? (
        metrics.financialDiffSource ? metrics.diffCost : undefined
    );
    if (raw === undefined || raw === null || raw === '') return null;
    const value = roundAuditMoney(raw);
    return Number.isFinite(value) ? value : null;
};

const buildOfficialTermScale = (metrics: any) => {
    const officialDiffCost = getOfficialTermDiffCost(metrics);
    const officialDiffQty = Number(metrics?.diffQty || 0);
    const cleanItems = (Array.isArray(metrics?.items) ? metrics.items : []).filter((item: any) => !isTermMetadataRow(item));
    const groupedRows = Array.isArray(metrics?.groupedDifferences) ? metrics.groupedDifferences : [];
    const sourceRows = cleanItems.length > 0 ? cleanItems : groupedRows;
    const sourceTotals = summarizeTermRows(sourceRows);
    const rawDiffCost = roundAuditMoney(sourceTotals.diffCost);
    const rawDiffQty = Number(sourceTotals.diffQty || 0);
    const shouldScaleCost =
        officialDiffCost !== null &&
        Math.abs(rawDiffCost) > 0.01 &&
        Math.abs(rawDiffCost - officialDiffCost) > 0.01;
    const shouldScaleQty =
        Number.isFinite(officialDiffQty) &&
        Math.abs(rawDiffQty) > 0.01 &&
        Math.abs(rawDiffQty - officialDiffQty) > 0.01;

    return {
        cleanItems,
        groupedRows,
        officialDiffCost,
        officialDiffQty,
        shouldScaleCost,
        shouldScaleQty,
        costRatio: shouldScaleCost ? officialDiffCost! / rawDiffCost : 1,
        qtyRatio: shouldScaleQty ? officialDiffQty / rawDiffQty : 1
    };
};

const scaleTermMetricRows = (
    rows: any[],
    scale: ReturnType<typeof buildOfficialTermScale>,
    adjustResidual = false
) => {
    const scaled = (rows || []).map((row: any) => {
        const next = { ...row };
        if (scale.shouldScaleCost) {
            next.diffCost = roundAuditMoney(Number(row?.diffCost || 0) * scale.costRatio);
            next.countedCost = roundAuditMoney(Number(next.sysCost || 0) + Number(next.diffCost || 0));
        }
        if (scale.shouldScaleQty) {
            next.diffQty = Number(row?.diffQty || 0) * scale.qtyRatio;
            next.countedQty = Number(next.sysQty || 0) + Number(next.diffQty || 0);
        }
        return next;
    });

    if (adjustResidual && scaled.length > 0) {
        const last = scaled[scaled.length - 1];
        if (scale.shouldScaleCost && scale.officialDiffCost !== null) {
            const sumCost = roundAuditMoney(scaled.reduce((sum, row) => sum + Number(row?.diffCost || 0), 0));
            const residualCost = roundAuditMoney(scale.officialDiffCost - sumCost);
            if (Math.abs(residualCost) > 0.001) {
                last.diffCost = roundAuditMoney(Number(last.diffCost || 0) + residualCost);
                last.countedCost = roundAuditMoney(Number(last.sysCost || 0) + Number(last.diffCost || 0));
            }
        }
        if (scale.shouldScaleQty && Number.isFinite(scale.officialDiffQty)) {
            const sumQty = scaled.reduce((sum, row) => sum + Number(row?.diffQty || 0), 0);
            const residualQty = scale.officialDiffQty - sumQty;
            if (Math.abs(residualQty) > 0.001) {
                last.diffQty = Number(last.diffQty || 0) + residualQty;
                last.countedQty = Number(last.sysQty || 0) + Number(last.diffQty || 0);
            }
        }
    }

    return scaled;
};

const normalizeTermMetricsToOfficial = (metrics: any) => {
    if (!metrics) return metrics;
    const scale = buildOfficialTermScale(metrics);
    const items = scaleTermMetricRows(scale.cleanItems, scale, false);
    const groupedDifferences = scaleTermMetricRows(scale.groupedRows, scale, true);
    const diffCost = scale.officialDiffCost !== null ? scale.officialDiffCost : roundAuditMoney(metrics.diffCost);
    const sysCost = roundAuditMoney(metrics.sysCost);
    const countedCost = scale.officialDiffCost !== null
        ? roundAuditMoney(sysCost + diffCost)
        : roundAuditMoney(metrics.countedCost);
    const diffQty = Number(metrics.diffQty || 0);
    const countedQty = Number(metrics.sysQty || 0) + diffQty;

    return {
        ...metrics,
        sysCost,
        countedCost,
        diffCost,
        countedQty,
        items,
        groupedDifferences
    };
};

const getWholeTermMetricsTotals = (metrics: any) => {
    const normalized = normalizeTermMetricsToOfficial(metrics);
    if (!normalized) return null;
    return {
        sysQty: Number(normalized.sysQty || 0),
        sysCost: roundAuditMoney(normalized.sysCost),
        countedQty: Number(normalized.countedQty || 0),
        countedCost: roundAuditMoney(normalized.countedCost),
        diffQty: Number(normalized.diffQty || 0),
        diffCost: roundAuditMoney(normalized.diffCost),
        items: Array.isArray(normalized.items) ? normalized.items : [],
        groupedDifferences: Array.isArray(normalized.groupedDifferences) ? normalized.groupedDifferences : []
    };
};

const selectNonOverlappingTermMetricEntries = (
    sourceData: any,
    entries: Array<[string, any]>
): Array<[string, any]> => {
    if (!Array.isArray(entries) || entries.length <= 1) return entries || [];

    const globalUnifiedEntries = entries.filter(([draftKey]) =>
        draftKey.startsWith('custom|') && draftKey.includes(GLOBAL_UNIFIED_TERM_BATCH_ID)
    );
    if (globalUnifiedEntries.length > 0) return globalUnifiedEntries;

    const norm = (value: unknown) => normalizeScopeId(value as any).trim();
    const categoryKey = (g: any, d: any, c: any) => [norm(g?.id), norm(d?.id), norm(c?.id)].join('|');
    const groups = Array.isArray(sourceData?.groups) ? sourceData.groups : [];

    const expandScope = (scope: { groupId?: string; deptId?: string; catId?: string }) => {
        const keys = new Set<string>();
        const targetG = norm(scope.groupId);
        const targetD = norm(scope.deptId);
        const targetC = norm(scope.catId);
        groups.forEach((group: any) => {
            if (targetG && norm(group.id) !== targetG) return;
            (group.departments || []).forEach((dept: any) => {
                if (targetD && norm(dept.id) !== targetD && norm(dept.numericId) !== targetD) return;
                (dept.categories || []).forEach((cat: any) => {
                    if (targetC && norm(cat.id) !== targetC && norm(cat.numericId) !== targetC) return;
                    keys.add(categoryKey(group, dept, cat));
                });
            });
        });
        return keys;
    };

    const parseEntryScopes = (draftKey: string) => {
        if (draftKey.startsWith('custom|')) {
            const meta = parseCustomDraftKeyMeta(draftKey);
            return (meta?.scopesPart || '')
                .split(',')
                .map(part => part.trim())
                .filter(Boolean)
                .map(scopeKey => {
                    const [groupId, deptId, catId] = scopeKey.split('|');
                    return { groupId, deptId, catId };
                });
        }
        const [type, groupId, deptId, catId] = draftKey.split('|');
        if (!type || !groupId) return [];
        if (type === 'group') return [{ groupId }];
        if (type === 'department') return [{ groupId, deptId }];
        if (type === 'category') return [{ groupId, deptId, catId }];
        return [];
    };

    const getSpecificity = (draftKey: string) => {
        if (draftKey.startsWith('custom|')) {
            const scopes = parseEntryScopes(draftKey);
            if (scopes.length === 0) return 0;
            if (scopes.every(scope => norm(scope.catId))) return 3;
            if (scopes.every(scope => norm(scope.deptId))) return 2;
            return 1;
        }
        const [type] = draftKey.split('|');
        if (type === 'category') return 3;
        if (type === 'department') return 2;
        if (type === 'group') return 1;
        return 0;
    };

    const decorated = entries.map(([draftKey, metrics], index) => {
        const coverage = new Set<string>();
        parseEntryScopes(draftKey).forEach(scope => {
            expandScope(scope).forEach(key => coverage.add(key));
        });
        return {
            draftKey,
            metrics,
            index,
            coverage,
            specificity: getSpecificity(draftKey),
            quality: getTermMetricsQualityScore(metrics),
            timestamp: getTermMetricsTimestamp(metrics)
        };
    });

    decorated.sort((a, b) =>
        b.specificity - a.specificity ||
        b.quality - a.quality ||
        b.timestamp - a.timestamp ||
        a.index - b.index
    );

    const covered = new Set<string>();
    const selected: typeof decorated = [];
    decorated.forEach(entry => {
        if (entry.coverage.size === 0) {
            if (selected.length === 0) selected.push(entry);
            return;
        }
        const overlaps = Array.from(entry.coverage).some(key => covered.has(key));
        if (overlaps) return;
        selected.push(entry);
        entry.coverage.forEach(key => covered.add(key));
    });

    return selected
        .sort((a, b) => a.index - b.index)
        .map(entry => [entry.draftKey, entry.metrics] as [string, any]);
};

const getAuthoritativeTermMetrics = (
    sourceData: any,
    sourceDrafts?: Record<string, TermForm>
) => {
    const backupMetricsByKey = new Map<string, any>();
    Object.entries(((sourceData?.termExcelMetricsByKey || {}) as Record<string, any>)).forEach(([draftKey, metrics]) => {
        if (metrics) backupMetricsByKey.set(draftKey, metrics);
    });
    const mergedDrafts = {
        ...(((sourceData?.termDrafts || {}) as Record<string, TermForm>) || {}),
        ...((sourceDrafts || {}) as Record<string, TermForm>)
    };
    const metricsByKey = new Map<string, any>();
    const activeDraftKeys = new Set<string>();
    Object.entries(mergedDrafts || {}).forEach(([draftKey, draftValue]) => {
        if (draftValue && !(draftValue.excelMetricsRemovedAt && !draftValue.excelMetrics)) {
            activeDraftKeys.add(draftKey);
        }
    });
    backupMetricsByKey.forEach((metrics, draftKey) => {
        if (activeDraftKeys.has(draftKey)) metricsByKey.set(draftKey, metrics);
    });
    Object.entries(mergedDrafts || {}).forEach(([draftKey, draftValue]) => {
        if (draftValue?.excelMetricsRemovedAt && !draftValue?.excelMetrics) {
            metricsByKey.delete(draftKey);
            return;
        }
        if (draftValue?.excelMetrics) metricsByKey.set(draftKey, draftValue.excelMetrics);
    });
    if (metricsByKey.size === 0) {
        backupMetricsByKey.forEach((metrics, draftKey) => metricsByKey.set(draftKey, metrics));
        Object.entries(mergedDrafts || {}).forEach(([draftKey, draftValue]) => {
            if (draftValue?.excelMetricsRemovedAt && !draftValue?.excelMetrics) metricsByKey.delete(draftKey);
        });
    }

    const dedupedMetricsByKey = new Map<string, { draftKey: string; metrics: any }>();
    metricsByKey.forEach((metrics, draftKey) => {
        const dedupeKey = draftKey.startsWith('custom|')
            ? `custom|${getCustomDraftScopesPart(draftKey)}`
            : draftKey;
        const current = dedupedMetricsByKey.get(dedupeKey);
        const preferred = pickPreferredTermMetrics(metrics, current?.metrics);
        if (preferred) dedupedMetricsByKey.set(dedupeKey, {
            draftKey: preferred === metrics ? draftKey : (current?.draftKey || draftKey),
            metrics: preferred
        });
    });

    const metricEntries = Array.from(dedupedMetricsByKey.values())
        .filter(({ draftKey }) => isTermDraftBatchActive(sourceData, draftKey))
        .map(({ draftKey, metrics }) => [draftKey, sanitizeTermMetricsForDraftScope(sourceData, draftKey, metrics)] as [string, any])
        .filter(([, metrics]) => !!metrics);
    if (metricEntries.length === 0) return null;

    const selectedMetricEntries = selectNonOverlappingTermMetricEntries(sourceData, metricEntries);
    const globalUnifiedEntries = selectedMetricEntries.filter(([draftKey]) =>
        draftKey.startsWith('custom|') && draftKey.includes(GLOBAL_UNIFIED_TERM_BATCH_ID)
    );
    const pools = selectedMetricEntries.map(([, metrics]) => metrics);
    const merged = mergeExcelMetricsPools(pools);
    if (!merged) return null;

    const cleanItems = (Array.isArray(merged.items) ? merged.items : []).filter((item: any) => !isTermMetadataRow(item));
    const officialDiffCost = getOfficialTermDiffCost(merged);
    const totals = cleanItems.length > 0
        ? summarizeTermRows(cleanItems)
        : {
            sysQty: Number(merged.sysQty || 0),
            sysCost: roundAuditMoney(merged.sysCost),
            countedQty: Number(merged.countedQty || 0),
            countedCost: roundAuditMoney(merged.countedCost),
            diffQty: Number(merged.diffQty || 0),
            diffCost: roundAuditMoney(merged.diffCost)
        };
    if (officialDiffCost !== null) {
        totals.diffCost = officialDiffCost;
    }

    return {
        ...totals,
        items: cleanItems,
        source: globalUnifiedEntries.length > 0 ? 'global_unified' : 'terms'
    };
};

const draftKeyTouchesGroup = (draftKey: string, groupId?: string | number): boolean => {
    const target = normalizeScopeId(groupId);
    if (!target) return false;
    if (draftKey.startsWith('custom|')) {
        // Compatibilidade: formato novo "custom|<batchId>|<scopes>" e legado "custom|<scopes>"
        const meta = parseCustomDraftKeyMeta(draftKey);
        const scopesPart = meta?.scopesPart || '';
        const scopedKeys = scopesPart.split(',').filter(Boolean);
        return scopedKeys.some(scopeKey => normalizeScopeId(scopeKey.split('|')[0]) === target);
    }
    const parts = draftKey.split('|');
    return normalizeScopeId(parts[1]) === target;
};

const getExcelPoolsByGroupFromDrafts = (
    drafts: Record<string, TermForm> | undefined,
    groupId?: string | number,
    options?: { batchId?: string }
) => {
    const targetBatch = normalizeScopeId(options?.batchId);
    return Object.entries(drafts || {})
        .filter(([key, draft]) => {
            if (!draft?.excelMetrics || draft?.excelMetricsRemovedAt) return false;
            if (!draftKeyTouchesGroup(key, groupId)) return false;
            if (!targetBatch) return true;
            if (!key.startsWith('custom|')) return false;
            const meta = parseCustomDraftKeyMeta(key);
            const draftBatch = normalizeScopeId(meta?.batchId);
            return draftBatch === targetBatch;
        })
        .map(([, draft]) => draft!.excelMetrics)
        .filter(Boolean);
};

const getFinancialRepresentativity = (auditedBaseCost?: number, diffCost?: number): number | null => {
    const base = Math.abs(Number(auditedBaseCost || 0));
    if (!base || !Number.isFinite(base)) return null;
    const diff = Math.abs(Number(diffCost || 0));
    if (!Number.isFinite(diff)) return null;
    return (diff / base) * 100;
};

const getAuditNumberFromInventoryLabel = (value: unknown): number | null => {
    const parts = String(value ?? '').trim().match(/\d+/g);
    if (!parts || parts.length === 0) return null;
    const auditNumber = Number(parts[parts.length - 1]);
    return Number.isFinite(auditNumber) && auditNumber > 0 ? auditNumber : null;
};

const getAuditDataStrength = (auditData: AuditData | null | undefined): number => {
    if (!auditData) return 0;
    const groupsCount = Array.isArray(auditData.groups) ? auditData.groups.length : 0;
    let categoriesCount = 0;
    let productsCount = 0;
    let doneCategories = 0;
    (auditData.groups || []).forEach((g) => {
        g.departments.forEach((d) => {
            categoriesCount += d.categories.length;
            d.categories.forEach((c) => {
                productsCount += c.products.length;
                if (isDoneStatus(c.status)) doneCategories += 1;
            });
        });
    });
    const termDraftsCount = Object.keys(((auditData as any)?.termDrafts || {})).length;
    const partialStartsCount = Array.isArray((auditData as any)?.partialStarts) ? (auditData as any).partialStarts.length : 0;
    const partialCompletedCount = Array.isArray((auditData as any)?.partialCompleted) ? (auditData as any).partialCompleted.length : 0;
    return (
        groupsCount * 1000 +
        categoriesCount * 100 +
        doneCategories * 80 +
        productsCount +
        termDraftsCount * 30 +
        partialStartsCount * 20 +
        partialCompletedCount * 20
    );
};

const reconcileAuditStateFromCompletedScopes = (input: AuditData): AuditData => {
    const completed = Array.isArray((input as any)?.partialCompleted) ? (input as any).partialCompleted : [];
    if (!Array.isArray(input?.groups) || completed.length === 0) return input;

    const nextGroups = input.groups.map((g) => ({
        ...g,
        departments: g.departments.map((d) => ({
            ...d,
            categories: d.categories.map((c) => {
                const current = normalizeAuditStatus(c.status);
                if (current === AuditStatus.DONE) return { ...c, status: current };
                const doneByCompleted = completed.some((p: any) => isPartialScopeMatch(p, g.id, d.id, c.id));
                return { ...c, status: doneByCompleted ? AuditStatus.DONE : current };
            })
        }))
    }));

    return {
        ...input,
        groups: nextGroups
    };
};

const ExcelMetricsDashboard: React.FC<{
    metrics: {
        sysQty: number;
        sysCost: number;
        countedQty: number;
        countedCost: number;
        diffQty: number;
        diffCost: number;
    };
    auditedBaseCost?: number;
}> = ({ metrics, auditedBaseCost }) => {
    if (!metrics || typeof metrics.diffQty !== 'number') return null;
    const representativity = getFinancialRepresentativity(auditedBaseCost ?? metrics.countedCost, metrics.diffCost);

    return (
        <div className="mt-4 pt-4 border-t border-indigo-100/50">
            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest mb-3">
                <span className="text-indigo-800 flex items-center gap-1.5"><Boxes className="w-3.5 h-3.5" /> Planilha de Divergências</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 min-w-0">
                    <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest block mb-1">Est. Sist (Qtde)</span>
                    <span className="mobile-metric-number text-[11px] sm:text-[13px] 2xl:text-[14px] font-black text-slate-700 leading-tight whitespace-nowrap tracking-tighter block">{Math.round(metrics.sysQty).toLocaleString('pt-BR')} un.</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 min-w-0">
                    <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest block mb-1">Est. Físico (Qtde)</span>
                    <span className="mobile-metric-number text-[11px] sm:text-[13px] 2xl:text-[14px] font-black text-slate-700 leading-tight whitespace-nowrap tracking-tighter block">{Math.round(metrics.countedQty).toLocaleString('pt-BR')} un.</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 min-w-0">
                    <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest block mb-1">Diferença (Qtde)</span>
                    <span className={`mobile-metric-number text-[11px] sm:text-[13px] 2xl:text-[14px] font-black leading-tight whitespace-nowrap tracking-tighter block ${metrics.diffQty < 0 ? 'text-red-600' : metrics.diffQty > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {metrics.diffQty > 0 ? '+' : ''}{Math.round(metrics.diffQty).toLocaleString('pt-BR')} un.
                    </span>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 min-w-0">
                    <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest block mb-1">Custo Sist</span>
                    <span className="mobile-metric-number text-[12px] sm:text-[14px] font-black text-slate-700 leading-tight whitespace-nowrap tracking-tighter block">{metrics.sysCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 min-w-0">
                    <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest block mb-1">Custo Físico</span>
                    <span className="mobile-metric-number text-[12px] sm:text-[14px] font-black text-slate-700 leading-tight whitespace-nowrap tracking-tighter block">{metrics.countedCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className={`col-span-2 border rounded-lg p-3 min-w-0 ${metrics.diffCost < 0 ? 'bg-red-50 border-red-200' : metrics.diffCost > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                    <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest block mb-1">Resultado Fin.</span>
                    <span className={`mobile-metric-number text-[14px] sm:text-[16px] font-black leading-tight whitespace-nowrap tracking-tighter block ${metrics.diffCost < 0 ? 'text-red-700' : metrics.diffCost > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {metrics.diffCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                    <div className="flex items-center gap-3 mt-1">
                        {metrics.diffCost < 0 && <span className="text-[9px] font-black text-red-500 uppercase">Prejuízo</span>}
                        {metrics.diffCost > 0 && <span className="text-[9px] font-black text-emerald-600 uppercase">Sobra</span>}
                        {representativity !== null && (
                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                                Rep: {representativity.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

interface AuditModuleProps {
    userEmail: string;
    userName: string;
    userRole: string;
    userCompanyId?: string | null;
    userArea?: string | null;
    userFilial?: string | null;
    companies: any[];
    initialFilial?: string;
}

const AuditModule: React.FC<AuditModuleProps> = ({ userEmail, userName, userRole, userCompanyId, userArea, userFilial, companies, initialFilial }) => {
    const isMaster = userRole === 'MASTER';
    const isAdmin = userRole === 'ADMINISTRATIVO';
    const canUseAuditMasterTools = isMaster || isAdmin;
    const canManageAuditLifecycle = canUseAuditMasterTools;
    const [data, setData] = useState<AuditData | null>(null);
    const [view, setView] = useState<ViewState>({ level: 'groups' });
    const [isProcessing, setIsProcessing] = useState(false);
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [showOfflineAlert, setShowOfflineAlert] = useState(false);
    const [isTrierLoading, setIsTrierLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [trierError, setTrierError] = useState<string | null>(null);
    const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());
    const [initialDoneUnits, setInitialDoneUnits] = useState<number>(0);
    const [termModal, setTermModal] = useState<TermScope | null>(null);
    const [termForm, setTermForm] = useState<TermForm | null>(null);
    const [termDrafts, setTermDrafts] = useState<Record<string, TermForm>>({});
    const [termFieldErrors, setTermFieldErrors] = useState<Record<string, string>>({});
    const [termTouchedFields, setTermTouchedFields] = useState<Record<string, boolean>>({});
    const [termShakeFields, setTermShakeFields] = useState<Record<string, boolean>>({});
    const [isSavingTerm, setIsSavingTerm] = useState(false);
    const [showSavedFeedback, setShowSavedFeedback] = useState(false);
    const composeTermDraftsForPersist = useCallback((...maps: Array<Record<string, TermForm> | undefined | null>) => {
        return maps.reduce((acc, current) => mergeTermDraftMaps(acc, (current || {}) as Record<string, TermForm>), {} as Record<string, TermForm>);
    }, []);
    const [rawTermComparisonMetrics, setTermComparisonMetrics] = useState<{
        sysQty: number;
        sysCost: number;
        countedQty: number;
        countedCost: number;
        diffQty: number;
        diffCost: number;
        items: any[];
        groupedDifferences?: any[];
        sourceRows?: any[][];
        sourceFileName?: string;
        sourceFileSize?: number;
        sourceUploadedAt?: string;
        officialDiffCost?: number;
        financialDiffSource?: string;
        financialDiffColumnIndex?: number;
    } | null>(null);
    const termFormRef = useRef<TermForm | null>(null);
    const termDraftsRef = useRef<Record<string, TermForm>>({});
    const rawTermMetricsRef = useRef<typeof rawTermComparisonMetrics>(null);
    const termShakeTimeoutRef = useRef<number | null>(null);
    useEffect(() => { termFormRef.current = termForm; }, [termForm]);
    useEffect(() => { termDraftsRef.current = termDrafts; }, [termDrafts]);
    useEffect(() => { rawTermMetricsRef.current = rawTermComparisonMetrics; }, [rawTermComparisonMetrics]);
    useEffect(() => () => {
        if (termShakeTimeoutRef.current !== null && typeof window !== 'undefined') {
            window.clearTimeout(termShakeTimeoutRef.current);
        }
    }, []);

    const termComparisonMetrics = useMemo(() => {
        if (!rawTermComparisonMetrics) return null;

        const newItems = (rawTermComparisonMetrics.items || []).filter((item: any) => !isTermMetadataRow(item));

        return normalizeTermMetricsToOfficial({
            ...rawTermComparisonMetrics,
            items: newItems,
            // Não podar grupos aqui: preservar exatamente o que foi carregado/normalizado.
            groupedDifferences: rawTermComparisonMetrics.groupedDifferences || []
        });
    }, [rawTermComparisonMetrics]);

    const [expandedCatKeys, setExpandedCatKeys] = useState<Set<string>>(new Set());
    const [auditLookup, setAuditLookup] = useState('');
    const [auditLookupOpen, setAuditLookupOpen] = useState(false);
    const [postAdjustmentCode, setPostAdjustmentCode] = useState('');
    const [postAdjustmentQty, setPostAdjustmentQty] = useState('');
    const [postAdjustmentNote, setPostAdjustmentNote] = useState('');
    const [postAdjustmentMode, setPostAdjustmentMode] = useState<'delta' | 'replace'>('replace');
    const [postAdjustmentError, setPostAdjustmentError] = useState<string | null>(null);
    const [isSavingPostAdjustment, setIsSavingPostAdjustment] = useState(false);
    const lastAutoPostAdjustmentNoteRef = useRef('');
    const auditLookupInputRef = useRef<HTMLInputElement | null>(null);
    const removedExcelDraftKeysRef = useRef<Set<string>>(new Set());
    const [selectedEmpresa, setSelectedEmpresa] = useState("Drogaria Cidade");
    const [selectedFilial, setSelectedFilial] = useState(toAuditBranchValue(initialFilial || userFilial || ''));
    const allowedCompanies = useMemo(() => {
        if (isMaster || !userCompanyId) return companies;
        const scoped = companies.filter(c => c.id === userCompanyId);
        return scoped.length > 0 ? scoped : companies;
    }, [companies, isMaster, userCompanyId]);
    const selectedCompany = useMemo(() => allowedCompanies.find(c => c.name === selectedEmpresa) || allowedCompanies[0], [allowedCompanies, selectedEmpresa]);
    const allowedAuditBranches = useMemo(() => {
        if (isMaster) return FILIAIS.map(f => String(f));

        const allowed = new Set<string>();
        const normalizedUserArea = normalizeAreaName(userArea);
        (selectedCompany?.areas || []).forEach((area: any) => {
            if (normalizedUserArea && normalizeAreaName(area?.name) !== normalizedUserArea) return;
            (area?.branches || []).forEach((branch: string) => {
                const value = toAuditBranchValue(branch);
                if (value) allowed.add(value);
            });
        });

        const userBranch = toAuditBranchValue(userFilial || '');
        if (!normalizedUserArea && userBranch) allowed.add(userBranch);

        return Array.from(allowed).sort(compareAuditBranchValues);
    }, [isMaster, selectedCompany?.areas, userArea, userFilial]);
    const allowedAuditBranchSet = useMemo(() => new Set(allowedAuditBranches), [allowedAuditBranches]);
    const [branchAuditsHistory, setBranchAuditsHistory] = useState<DbAuditSession[]>([]);
    const [isLoadingBranchAudits, setIsLoadingBranchAudits] = useState(false);
    const [showCompletedAuditsModal, setShowCompletedAuditsModal] = useState(false);
    const [localPendingAudit, setLocalPendingAudit] = useState<AuditData | null>(null);
    const [isReadOnlyCompletedView, setIsReadOnlyCompletedView] = useState(false);
    const [consultingAuditNumber, setConsultingAuditNumber] = useState<number | null>(null);
    const [allowActiveAuditAutoOpen, setAllowActiveAuditAutoOpen] = useState(false);
    const [isTermsPanelCollapsed, setIsTermsPanelCollapsed] = useState(true);
    const [nextAuditNumber, setNextAuditNumber] = useState(1);
    // Persiste o ID da sessão no sessionStorage para sobreviver a refresh/troca de aba
    const CONFIRMED_SESSION_KEY = 'audit_confirmed_session_id';
    const CONFIRMED_SESSION_SET_KEY = 'audit_confirmed_session_ids';
    const [dbSessionId, setDbSessionId] = useState<string | undefined>(
        () => sessionStorage.getItem(CONFIRMED_SESSION_KEY) || undefined
    );
    const isAuditSessionConfirmed = useCallback((sessionId?: string | null) => {
        const id = String(sessionId || '').trim();
        if (!id || typeof window === 'undefined') return false;
        if (window.sessionStorage.getItem(CONFIRMED_SESSION_KEY) === id) return true;
        try {
            const raw = window.sessionStorage.getItem(CONFIRMED_SESSION_SET_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) && list.includes(id);
        } catch {
            return false;
        }
    }, []);
    const markAuditSessionConfirmed = useCallback((sessionId?: string | null) => {
        const id = String(sessionId || '').trim();
        if (!id || typeof window === 'undefined') return;
        window.sessionStorage.setItem(CONFIRMED_SESSION_KEY, id);
        try {
            const raw = window.sessionStorage.getItem(CONFIRMED_SESSION_SET_KEY);
            const list = raw ? JSON.parse(raw) : [];
            const next = Array.from(new Set([...(Array.isArray(list) ? list : []), id]));
            window.sessionStorage.setItem(CONFIRMED_SESSION_SET_KEY, JSON.stringify(next));
        } catch {
            window.sessionStorage.setItem(CONFIRMED_SESSION_SET_KEY, JSON.stringify([id]));
        }
    }, []);
    const [isUpdatingStock, setIsUpdatingStock] = useState(false);
    const PARTIAL_EXPIRED_ALERT_KEY = useMemo(
        () => `audit_partial_expired_alert_${dbSessionId || selectedFilial || 'unknown'}`,
        [dbSessionId, selectedFilial]
    );

    const lastAuditUpdateRef = useRef<string | null>(null);
    const activeFilialRef = useRef<string>('');
    const completedAuditConsultationRef = useRef(false);

    function enterStockUpdateMode(options?: { stockTsRaw?: string | null; syncKey?: string | null; showAlert?: boolean }) {
        const syncKey = String(options?.syncKey || '').trim();
        if (syncKey) {
            lastAutoStockSyncKeyRef.current = syncKey;
        }
        setIsUpdatingStock(true);
        setGroupFiles(createInitialGroupFiles());
        setFileDeptIds(null);
        setFileCatIds(null);
        setFileStock(null);
        setView({ level: 'groups' });

        if (options?.showAlert) {
            const stockTsLabel = options.stockTsRaw
                ? new Date(options.stockTsRaw).toLocaleString('pt-BR')
                : 'nao informada';
            window.setTimeout(() => {
                window.alert(
                    `Novo estoque detectado no Cadastro Base (${stockTsLabel}).\n\nVocê foi direcionado para a tela de atualização dos estoques.\nA reclassificação só será executada ao clicar no botão de atualização.`
                );
            }, 0);
        }
    }

    useEffect(() => {
        activeFilialRef.current = selectedFilial || '';
    }, [selectedFilial]);

    const normalizeRemoteAuditSnapshot = useCallback((snapshot: AuditData): AuditData => {
        const nextData = { ...((snapshot || {}) as any) } as AuditData;
        if ((nextData as any).partialStart && !(nextData as any).partialStarts) {
            (nextData as any).partialStarts = [(nextData as any).partialStart];
        }
        if (!(nextData as any).partialCompleted) {
            (nextData as any).partialCompleted = [];
        }
        (nextData as any).postAuditAdjustments = normalizePostAuditAdjustments((nextData as any).postAuditAdjustments);
        if ((nextData as any).partialCompleted) {
            const deduped = new Map<string, any>();
            (nextData as any).partialCompleted.forEach((p: any) => {
                deduped.set(partialCompletedKey(p), p);
            });
            (nextData as any).partialCompleted = Array.from(deduped.values());
        }
        if (nextData.groups) {
            nextData.groups.forEach((g: any) => {
                g.departments.forEach((d: any) => {
                    d.categories.forEach((c: any) => {
                        c.status = normalizeAuditStatus(c.status);
                        if (c.totalCost === undefined || c.totalCost === null || (c.totalCost === 0 && c.totalQuantity > 0)) {
                            let catCost = 0;
                            c.products.forEach((p: any) => { catCost += (p.quantity * (p.cost || 0)); });
                            c.totalCost = catCost;
                        }
                    });
                });
            });
        }
        const reconciled = reconcileAuditStateFromCompletedScopes(nextData);
        const normalized = normalizeAuditDataStructure(reconciled);
        return (normalized.data || reconciled) as AuditData;
    }, []);

    const fetchFreshOpenAuditSnapshot = useCallback(async (): Promise<{
        session: DbAuditSession;
        data: AuditData;
        drafts: Record<string, TermForm>;
    } | null> => {
        if (!selectedFilial) return null;
        const latest = await fetchLatestAudit(selectedFilial);
        if (!latest?.data || latest.status === 'completed') return null;
        const sameAudit =
            !dbSessionId ||
            latest.id === dbSessionId ||
            latest.audit_number === nextAuditNumber;
        if (!sameAudit) return null;

        const normalizedData = normalizeRemoteAuditSnapshot(latest.data as AuditData);
        const remoteDrafts = (((normalizedData as any).termDrafts || {}) as Record<string, TermForm>);
        const mergedDrafts = composeTermDraftsForPersist(remoteDrafts, termDraftsRef.current);
        const nextDataWithDrafts = { ...normalizedData, termDrafts: mergedDrafts } as AuditData;

        setData(nextDataWithDrafts);
        setTermDrafts(mergedDrafts);
        termDraftsRef.current = mergedDrafts;
        setDbSessionId(latest.id);
        setNextAuditNumber(latest.audit_number);
        lastAuditUpdateRef.current = latest.updated_at || lastAuditUpdateRef.current;
        await CacheService.set(`audit_session_${selectedFilial}`, { ...latest, data: nextDataWithDrafts } as any);
        if (getAuditDataStrength(nextDataWithDrafts) > 0) {
            await CacheService.set(`audit_session_lastgood_${selectedFilial}`, { ...latest, data: nextDataWithDrafts } as any);
        }

        return { session: latest, data: nextDataWithDrafts, drafts: mergedDrafts };
    }, [composeTermDraftsForPersist, dbSessionId, nextAuditNumber, normalizeRemoteAuditSnapshot, selectedFilial]);

    useEffect(() => {
        if (allowedCompanies.length === 0) return;
        if (allowedCompanies.some(c => c.name === selectedEmpresa)) return;
        setSelectedEmpresa(String(allowedCompanies[0]?.name || ''));
    }, [allowedCompanies, selectedEmpresa]);

    useEffect(() => {
        const normalized = toAuditBranchValue(initialFilial || '');
        if (!normalized) return;
        if (!isMaster && allowedAuditBranches.length > 0 && !allowedAuditBranchSet.has(normalized)) return;
        setSelectedFilial(prev => (prev === normalized ? prev : normalized));
    }, [initialFilial, isMaster, allowedAuditBranches.length, allowedAuditBranchSet]);

    useEffect(() => {
        if (isMaster || !selectedFilial || allowedAuditBranches.length === 0) return;
        if (allowedAuditBranchSet.has(toAuditBranchValue(selectedFilial))) return;
        setSelectedFilial('');
        setData(null);
        setDbSessionId(undefined);
        setAllowActiveAuditAutoOpen(false);
        setIsReadOnlyCompletedView(false);
        setConsultingAuditNumber(null);
    }, [isMaster, selectedFilial, allowedAuditBranches.length, allowedAuditBranchSet]);

    const loadAuditNum = useCallback(async (silent: boolean = false) => {
        if (!selectedFilial) return;
        const requestedFilial = selectedFilial;
        const isStaleRequest = () => activeFilialRef.current !== requestedFilial;
        try {
            let forceFreshFetch = false;
            // Se for polling silencioso, busca apenas metadados para economizar banda e processamento
            if (silent) {
                const meta = await fetchLatestAuditMetadata(selectedFilial);
                if (!meta || isStaleRequest()) return;

                // Se a data de atualização for a mesma, não faz nada
                if (lastAuditUpdateRef.current === meta.updated_at) {
                    return;
                }

                lastAuditUpdateRef.current = meta.updated_at;
                forceFreshFetch = true;
            }

            const localData = await AuditStorage.loadLocalAuditSession();
            const hasPendingSync = !!localData?.pendingSync;

            // Se temos dados pendentes localmente e estamos online, tentamos sincronizar antes de carregar.
            // Nunca cria um novo inventário nesse fluxo: criação deve passar pelo botão de iniciar/carregar.
            if (hasPendingSync && typeof navigator !== 'undefined' && navigator.onLine && localData && !silent) {
                try {
                    setIsSyncing(true);
                    const localBranch = String(localData.filial || selectedFilial || '').trim();
                    const localAuditNumber = getAuditNumberFromInventoryLabel((localData as any).inventoryNumber) || nextAuditNumber;
                    const existingTarget = localBranch
                        ? await fetchAuditSession(localBranch, localAuditNumber)
                        : null;
                    if (!dbSessionId && (!existingTarget || existingTarget.status === 'completed')) {
                        console.warn(
                            `Sincronização local pendente ignorada: não há inventário aberto Nº ${localAuditNumber} na filial ${localBranch || selectedFilial}.`
                        );
                        await AuditStorage.saveLocalAuditSession(localData, false);
                        setLocalPendingAudit(null);
                    } else {
                        const synced = await upsertAuditSession({
                            id: dbSessionId || existingTarget?.id,
                            branch: localBranch || selectedFilial,
                            audit_number: localAuditNumber,
                            status: 'open',
                            data: localData,
                            progress: calculateProgress(localData),
                            user_email: userEmail,
                            updated_at: lastAuditUpdateRef.current || undefined
                        });
                        if (synced) {
                            await AuditStorage.saveLocalAuditSession(localData, false);
                            console.log("Sincronização automática concluída com sucesso.");
                        }
                    }
                } catch (e) {
                    console.error("Falha na sincronização automática inicial:", e);
                } finally {
                    setIsSyncing(false);
                }
            }

            const cacheKey = `audit_session_${selectedFilial}`;
            const backupKey = `audit_session_lastgood_${selectedFilial}`;
            const latestFromDb = await fetchLatestAudit(selectedFilial);
            if (latestFromDb) {
                await CacheService.set(cacheKey, latestFromDb as any);
                if (latestFromDb.data && getAuditDataStrength(latestFromDb.data as AuditData) > 0) {
                    await CacheService.set(backupKey, latestFromDb as any);
                }
            }
            const cachedCurrent = !silent ? await CacheService.get<DbAuditSession>(cacheKey) : null;
            const cachedBackup = await CacheService.get<DbAuditSession>(backupKey);

            let latest: DbAuditSession | null = null;
            if (latestFromDb) {
                // Security-first: trust the latest server snapshot and use cache only as fallback.
                latest = latestFromDb;
            } else {
                const fallbackCandidates = [cachedCurrent, cachedBackup].filter(Boolean) as DbAuditSession[];
                if (fallbackCandidates.length > 0) {
                    const safeFallbackCandidates = fallbackCandidates.filter(candidate => {
                        if (candidate.status === 'completed') return true;
                        return isAuditSessionConfirmed(candidate.id);
                    });
                    const pool = safeFallbackCandidates.length > 0 ? safeFallbackCandidates : fallbackCandidates.filter(c => c.status === 'completed');
                    if (pool.length === 0) {
                        latest = null;
                    } else {
                        latest = pool.sort((a, b) => {
                        if (a.audit_number !== b.audit_number) return b.audit_number - a.audit_number;
                        const aTs = new Date(a.updated_at || 0).getTime();
                        const bTs = new Date(b.updated_at || 0).getTime();
                        if (aTs !== bTs) return bTs - aTs;
                        const aStrength = getAuditDataStrength((a.data as AuditData) || null);
                        const bStrength = getAuditDataStrength((b.data as AuditData) || null);
                        return bStrength - aStrength;
                        })[0];
                    }
                }
            }

            if (isStaleRequest()) return;
            if (silent && latest && dbSessionId === latest.id && latest.data) {
                lastAuditUpdateRef.current = latest.updated_at || null;
                // Normaliza e aplica os dados frescos do banco para todos os usuários
                if ((latest.data as any).partialStart && !(latest.data as any).partialStarts) {
                    (latest.data as any).partialStarts = [(latest.data as any).partialStart];
                }
                if (!(latest.data as any).partialCompleted) {
                    (latest.data as any).partialCompleted = [];
                }
                if ((latest.data as any).partialCompleted) {
                    const deduped = new Map<string, any>();
                    (latest.data as any).partialCompleted.forEach((p: any) => {
                        deduped.set(partialCompletedKey(p), p);
                    });
                    (latest.data as any).partialCompleted = Array.from(deduped.values());
                }
                if (latest.data.groups) {
                    latest.data.groups.forEach((g: any) => {
                        g.departments.forEach((d: any) => {
                            d.categories.forEach((c: any) => {
                                c.status = normalizeAuditStatus(c.status);
                                if (c.totalCost === undefined || c.totalCost === null || (c.totalCost === 0 && c.totalQuantity > 0)) {
                                    let catCost = 0;
                                    c.products.forEach((p: any) => { catCost += (p.quantity * (p.cost || 0)); });
                                    c.totalCost = catCost;
                                }
                            });
                        });
                    });
                }
                const reconciled = reconcileAuditStateFromCompletedScopes(latest.data as AuditData);
                const normalized = normalizeAuditDataStructure(reconciled);
                const normalizedData = (normalized.data || reconciled) as AuditData;
                setData(normalizedData);
                setTermDrafts(current =>
                    composeTermDraftsForPersist(
                        ((normalizedData as any).termDrafts || {}) as Record<string, TermForm>,
                        current
                    )
                );
                if (getAuditDataStrength(normalizedData) > 0) {
                    await CacheService.set(backupKey, { ...latest, data: normalizedData } as any);
                }
                return;
            }

            if (isStaleRequest()) return;
            if (latest && latest.status !== 'completed') {
                completedAuditConsultationRef.current = false;
                let canAutoOpenActive = allowActiveAuditAutoOpen;
                if (!canAutoOpenActive) {
                    if (silent) return;
                    canAutoOpenActive = true;
                    if (canUseAuditMasterTools) {
                        try {
                            const history = await fetchAuditsHistory(requestedFilial);
                            const completedCount = history.filter(item => item.status === 'completed').length;
                            const sourceFiles = ((latest.data as any)?.sourceFiles || {}) as any;
                            const hasNewerGlobalStockAtOpenChoice = isGlobalStockDifferentFromApplied(sourceFiles, globalStockMeta);
                            if (completedCount > 0 && !hasNewerGlobalStockAtOpenChoice) {
                                canAutoOpenActive = window.confirm(
                                    `Existe auditoria em aberto (Nº ${latest.audit_number}) e ${completedCount} inventário(s) concluído(s) nesta filial.\n\n` +
                                    `OK: prosseguir com a auditoria em aberto.\n` +
                                    `Cancelar: abrir a lista de inventários concluídos.`
                                );
                                if (canAutoOpenActive) {
                                    setAllowActiveAuditAutoOpen(true);
                                    markAuditSessionConfirmed(latest.id);
                                }
                                if (!canAutoOpenActive) {
                                    setShowCompletedAuditsModal(true);
                                }
                            }
                        } catch (error) {
                            console.warn('Falha ao carregar histórico para escolha de abertura:', error);
                        }
                    }
                    if (!canAutoOpenActive) {
                        setIsUpdatingStock(false);
                        setDbSessionId(undefined);
                        setNextAuditNumber(latest.audit_number + 1);
                        setData(null);
                        setTermDrafts({});
                        return;
                    }
                    setAllowActiveAuditAutoOpen(true);
                }
                setIsReadOnlyCompletedView(false);
                setConsultingAuditNumber(null);
                setNextAuditNumber(latest.audit_number);
                setDbSessionId(latest.id);

                if (latest.data) {
                    if (isStaleRequest()) return;
                    if ((latest.data as any).partialStart && !(latest.data as any).partialStarts) {
                        (latest.data as any).partialStarts = [(latest.data as any).partialStart];
                    }
                    if (!(latest.data as any).partialCompleted) {
                        (latest.data as any).partialCompleted = [];
                    }
                    if ((latest.data as any).partialCompleted) {
                        const deduped = new Map<string, any>();
                        (latest.data as any).partialCompleted.forEach((p: any) => {
                            deduped.set(partialCompletedKey(p), p);
                        });
                        (latest.data as any).partialCompleted = Array.from(deduped.values());
                    }

                    if (!(latest.data as any).lastPartialBatchId) {
                        (latest.data as any).lastPartialBatchId = getLatestBatchId((latest.data as any).partialCompleted);
                    }
                    if (latest.data.groups) {
                        latest.data.groups.forEach((g: any) => {
                            g.departments.forEach((d: any) => {
                                d.categories.forEach((c: any) => {
                                    c.status = normalizeAuditStatus(c.status);
                                    if (c.totalCost === undefined || c.totalCost === null || (c.totalCost === 0 && c.totalQuantity > 0)) {
                                        let catCost = 0;
                                        c.products.forEach((p: any) => {
                                            catCost += (p.quantity * (p.cost || 0));
                                        });
                                        c.totalCost = catCost;
                                    }
                                });
                            });
                        });
                    }
                    const reconciled = reconcileAuditStateFromCompletedScopes(latest.data as AuditData);
                    const normalized = normalizeAuditDataStructure(reconciled);
                    const normalizedData = (normalized.data || reconciled) as AuditData;
                    setData(normalizedData);
                    const draftsFromData = ((normalizedData as any).termDrafts || {}) as Record<string, TermForm>;
                    setTermDrafts(current => composeTermDraftsForPersist(draftsFromData, current));
                    setDbSessionId(latest.id);
                    if (getAuditDataStrength(normalizedData) > 0) {
                        await CacheService.set(backupKey, { ...latest, data: normalizedData } as any);
                    }

                    if (!silent) {
                        const isNewSession = dbSessionId !== latest.id;
                        const alreadyConfirmed = isAuditSessionConfirmed(latest.id);
                        const resolveLatestStockTimestampForPrompt = (sessionTsRaw?: string | null) => {
                            const officialUploadRaw = getGlobalStockTimestampRaw(globalStockMeta);
                            const bestRaw = officialUploadRaw || sessionTsRaw || latest.created_at || null;
                            const sourceFiles = ((latest.data as any)?.sourceFiles || {}) as any;
                            return {
                                latestStockTs: bestRaw,
                                hasNewerGlobalStock: isGlobalStockDifferentFromApplied(sourceFiles, globalStockMeta)
                            };
                        };

                        if (canUseAuditMasterTools) {
                            const { latestStockTs, hasNewerGlobalStock } = resolveLatestStockTimestampForPrompt(
                                latest.data?.sourceFiles?.stock?.syncedAt || latest.data?.sourceFiles?.lastStockUpdateAt || latest.created_at
                            );

                            // Estoque manual dentro do módulo foi descontinuado.
                            // Sempre que o Cadastro Base estiver mais novo que o estoque processado da auditoria,
                            // a auditoria em aberto deve voltar para a tela de atualização até o saldo ser aplicado.
                            if (hasNewerGlobalStock) {
                                const stockTs = latestStockTs ? new Date(latestStockTs).getTime() : NaN;
                                const syncKey = `${latest.id || 'no_session'}|${requestedFilial}|${globalStockMeta?.module_key || 'stock'}|${Number.isFinite(stockTs) ? stockTs : latestStockTs || 'pending'}`;
                                enterStockUpdateMode({ stockTsRaw: latestStockTs, syncKey, showAlert: true });
                            } else {
                                setIsUpdatingStock(false);
                            }
                            if (latest.id) markAuditSessionConfirmed(latest.id);
                            setView({ level: 'groups' });
                        } else {
                            setIsUpdatingStock(false);
                            setView({ level: 'groups' });
                            if ((isNewSession || !data) && !alreadyConfirmed) {
                                const { latestStockTs } = resolveLatestStockTimestampForPrompt(
                                    latest.data?.sourceFiles?.stock?.syncedAt || latest.data?.sourceFiles?.lastStockUpdateAt || latest.created_at
                                );
                                const lastLoadStr = latestStockTs
                                    ? new Date(latestStockTs).toLocaleString('pt-BR')
                                    : 'nao informada';
                                alert(`ENTRANDO EM MODO CONSULTA.\n\nAviso: O estoque exibido reflete a carga de estoque realizada pelo usuário Master em ${lastLoadStr}. As contagens em andamento são atualizadas em tempo real.`);
                            }
                            if (latest.id) markAuditSessionConfirmed(latest.id);
                        }

                        let done = 0;
                        if (latest.data.groups) {
                            latest.data.groups.forEach((g: any) =>
                                g.departments.forEach((d: any) =>
                                    d.categories.forEach((c: any) => {
                                        if (isDoneStatus(c.status)) done += c.totalQuantity;
                                    })
                                )
                            );
                        }
                        setInitialDoneUnits(done);
                    }
                }
            } else {
                if (latest !== undefined) {
                    if (isStaleRequest()) return;
                    if (isReadOnlyCompletedView && consultingAuditNumber !== null) {
                        setNextAuditNumber(consultingAuditNumber);
                        if (!silent) {
                            setDbSessionId(undefined);
                        }
                        return;
                    }
                    setIsReadOnlyCompletedView(false);
                    setConsultingAuditNumber(null);
                    setNextAuditNumber(latest ? latest.audit_number + 1 : 1);
                    setDbSessionId(undefined);
                    if (!silent) {
                        setData(null);
                        setTermDrafts({});
                    }
                }
            }
        } catch (error) {
            console.error('Error loading audit info:', error);
        }
    }, [selectedFilial, selectedCompany?.id, dbSessionId, canUseAuditMasterTools, data, isUpdatingStock, isReadOnlyCompletedView, consultingAuditNumber, allowActiveAuditAutoOpen, isAuditSessionConfirmed, markAuditSessionConfirmed]);

    // Carga Inicial
    useEffect(() => {
        setData(null);
        setTermDrafts({});
        setDbSessionId(undefined);
        setIsUpdatingStock(false);
        setIsTermsPanelCollapsed(true);
        setTermModal(null);
        setTermForm(null);
        setTermComparisonMetrics(null);
        completedAuditConsultationRef.current = false;
        setIsReadOnlyCompletedView(false);
        setConsultingAuditNumber(null);
        setAllowActiveAuditAutoOpen(false);
        removedExcelDraftKeysRef.current.clear();
        lastAuditUpdateRef.current = null;
        lastAutoStockSyncKeyRef.current = '';
        if (selectedFilial) {
            loadAuditNum();
        }
    }, [selectedFilial]);

    useEffect(() => {
        if (!selectedFilial) {
            setBranchAuditsHistory([]);
            setShowCompletedAuditsModal(false);
            return;
        }
        let cancelled = false;
        const loadBranchHistory = async () => {
            setIsLoadingBranchAudits(true);
            try {
                const history = await fetchAuditsHistory(selectedFilial);
                if (cancelled) return;
                const sorted = [...history].sort((a, b) => {
                    if (a.audit_number !== b.audit_number) return b.audit_number - a.audit_number;
                    const at = new Date(a.updated_at || a.created_at || 0).getTime();
                    const bt = new Date(b.updated_at || b.created_at || 0).getTime();
                    return bt - at;
                });
                setBranchAuditsHistory(sorted);
            } catch (error) {
                console.error("Erro ao carregar histórico de auditorias da filial:", error);
                if (!cancelled) setBranchAuditsHistory([]);
            } finally {
                if (!cancelled) setIsLoadingBranchAudits(false);
            }
        };
        void loadBranchHistory();
        return () => { cancelled = true; };
    }, [selectedFilial, dbSessionId, nextAuditNumber]);

    const latestOpenAudit = useMemo(
        () => branchAuditsHistory.find(item => item.status !== 'completed') || null,
        [branchAuditsHistory]
    );
    const completedAudits = useMemo(
        () => branchAuditsHistory.filter(item => item.status === 'completed'),
        [branchAuditsHistory]
    );
    // Polling de sincronização entre usuários
    useEffect(() => {
        if (!selectedFilial) return;
        const syncNow = () => loadAuditNum(true);

        const getIntervalMs = () => (document.hidden ? 12000 : 5000);
        let interval = setInterval(syncNow, getIntervalMs());

        const resetInterval = () => {
            clearInterval(interval);
            interval = setInterval(syncNow, getIntervalMs());
        };

        const handleVisibilityOrFocus = () => {
            resetInterval();
            if (!document.hidden) {
                syncNow();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityOrFocus);
        window.addEventListener('focus', handleVisibilityOrFocus);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
            window.removeEventListener('focus', handleVisibilityOrFocus);
        };
    }, [selectedFilial, loadAuditNum]);

    // Carrega rascunho pendente ao abrir o modal de histórico
    useEffect(() => {
        if (showCompletedAuditsModal) {
            void (async () => {
                const local = await AuditStorage.loadLocalAuditSession();
                if (local?.pendingSync) {
                    setLocalPendingAudit(local);
                } else {
                    setLocalPendingAudit(null);
                }
            })();
        }
    }, [showCompletedAuditsModal]);

    const handleManualSync = useCallback(async () => {
        const local = await AuditStorage.loadLocalAuditSession();
        if (!local?.pendingSync) return;
        
        try {
            setIsSyncing(true);
            const branch = local.filial || selectedFilial;
            const auditNum = getAuditNumberFromInventoryLabel((local as any).inventoryNumber) || nextAuditNumber;
            
            if (!branch || !auditNum) {
                alert("Dados de identificação ausentes no rascunho local.");
                return;
            }

            const existingTarget = await fetchAuditSession(branch, auditNum);
            if (!dbSessionId && (!existingTarget || existingTarget.status === 'completed')) {
                alert(
                    `O rascunho local não foi enviado porque não existe inventário aberto Nº ${auditNum} na filial ${branch}.\n\n` +
                    `Isso evita criar uma cópia indevida de inventário concluído. Inicie ou reabra o inventário correto antes de sincronizar.`
                );
                return;
            }

            const synced = await upsertAuditSession({
                id: dbSessionId || existingTarget?.id,
                branch: branch,
                audit_number: auditNum,
                status: 'open',
                data: local,
                progress: calculateProgress(local),
                user_email: userEmail,
                updated_at: lastAuditUpdateRef.current || undefined
            });
            
            if (synced) {
                await AuditStorage.saveLocalAuditSession(local, false);
                setLocalPendingAudit(null);
                alert("Sincronização manual concluída com sucesso!");
                void loadAuditNum(true);
            }
        } catch (e) {
            console.error("Erro na sincronização manual:", e);
            alert("Falha ao sincronizar. Verifique sua conexão.");
        } finally {
            setIsSyncing(false);
        }
    }, [selectedFilial, dbSessionId, nextAuditNumber, userEmail, loadAuditNum]);

    // Network Connectivity monitoring
    useEffect(() => {
        const updateOnlineStatus = () => {
            const online = navigator.onLine;
            setIsOnline(online);
            if (online) {
                void loadAuditNum(true);
            }
        };

        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);

        return () => {
            window.removeEventListener('online', updateOnlineStatus);
            window.removeEventListener('offline', updateOnlineStatus);
        };
    }, [loadAuditNum]);

    // Derived inventory number (Auto-generated)
    const accessedAuditNumber = isReadOnlyCompletedView && consultingAuditNumber !== null
        ? consultingAuditNumber
        : nextAuditNumber;
    const inventoryNumber = useMemo(() => {
        return selectedFilial ? `${new Date().getFullYear()}-${selectedFilial.padStart(4, '0')}-${String(accessedAuditNumber).padStart(4, '0')}` : '';
    }, [selectedFilial, accessedAuditNumber]);

    // Dummy setter to keep existing logic working without massive refactor
    const setInventoryNumber = (val: string) => { };

    const [, setGroupFiles] = useState<Record<GroupUploadId, File | null>>(createInitialGroupFiles);
    const [, setFileStock] = useState<File | null>(null);
    const [, setFileDeptIds] = useState<File | null>(null);
    const [, setFileCatIds] = useState<File | null>(null);
    const [globalGroupFiles, setGlobalGroupFiles] = useState<Record<GroupUploadId, File | null>>(createInitialGroupFiles);
    const [globalGroupMeta, setGlobalGroupMeta] = useState<Record<GroupUploadId, DbGlobalBaseFile | null>>(createInitialGroupMeta);
    const [globalDeptIdsFile, setGlobalDeptIdsFile] = useState<File | null>(null);
    const [globalCatIdsFile, setGlobalCatIdsFile] = useState<File | null>(null);
    const [globalDeptIdsMeta, setGlobalDeptIdsMeta] = useState<DbGlobalBaseFile | null>(null);
    const [globalCatIdsMeta, setGlobalCatIdsMeta] = useState<DbGlobalBaseFile | null>(null);
    const [globalStockFile, setGlobalStockFile] = useState<File | null>(null);
    const [globalStockMeta, setGlobalStockMeta] = useState<DbGlobalBaseFile | null>(null);
    const [stockCodeAliasesByReduced, setStockCodeAliasesByReduced] = useState<Record<string, string[]>>({});
    const [cadastroBarcodeAliasesByReduced, setCadastroBarcodeAliasesByReduced] = useState<Record<string, string[]>>({});
    const [isLoadingGlobalBases, setIsLoadingGlobalBases] = useState(false);
    const lastAutoStockSyncKeyRef = useRef('');

    const effectiveGroupFiles = useMemo(
        () =>
            GROUP_UPLOAD_IDS
                .map(groupId => ({ groupId, file: globalGroupFiles[groupId] }))
                .filter((entry): entry is { groupId: GroupUploadId; file: File } => !!entry.file),
        [globalGroupFiles]
    );

    const effectiveDeptIdsFile = globalDeptIdsFile;
    const effectiveCatIdsFile = globalCatIdsFile;
    const effectiveStockFile = globalStockFile;

    const formatGlobalTimestamp = useCallback((value?: string | null) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString('pt-BR');
    }, []);

    const stockHeaderInfo = useMemo(() => {
        const sourceFiles = ((data as any)?.sourceFiles || {}) as any;
        const appliedRaw = getAppliedStockTimestampRaw(sourceFiles);
        const baseRaw = getGlobalStockTimestampRaw(globalStockMeta);
        const appliedTs = appliedRaw ? new Date(appliedRaw).getTime() : NaN;
        const hasApplied = Number.isFinite(appliedTs);
        const hasPendingBase = isGlobalStockDifferentFromApplied(sourceFiles, globalStockMeta);
        return {
            appliedLabel: appliedRaw ? formatGlobalTimestamp(appliedRaw) : 'Nao aplicado',
            baseLabel: baseRaw ? formatGlobalTimestamp(baseRaw) : 'Sem data no Cadastro Base',
            fileName: globalStockMeta?.file_name || sourceFiles?.stock?.name || globalStockFile?.name || 'Estoque Base',
            statusLabel: hasPendingBase
                ? 'Estoque pendente'
                : hasApplied
                    ? 'Estoque atualizado'
                    : 'Estoque sem registro',
            hasPendingBase,
            hasApplied
        };
    }, [data, globalStockMeta, globalStockFile, formatGlobalTimestamp]);

    useEffect(() => {
        const companyId = selectedCompany?.id;
        if (!companyId) {
            setGlobalGroupFiles(createInitialGroupFiles());
            setGlobalGroupMeta(createInitialGroupMeta());
            setGlobalDeptIdsFile(null);
            setGlobalCatIdsFile(null);
            setGlobalDeptIdsMeta(null);
            setGlobalCatIdsMeta(null);
            setGlobalStockFile(null);
            setGlobalStockMeta(null);
            setIsLoadingGlobalBases(false);
            return;
        }

        let cancelled = false;
        const loadGlobalAuditBases = async () => {
            setIsLoadingGlobalBases(true);
            try {
                const staticKeys = [
                    ...GROUP_UPLOAD_IDS.map(groupId => GROUP_GLOBAL_BASE_KEYS[groupId]),
                    AUDIT_DEPT_IDS_GLOBAL_KEY,
                    AUDIT_CAT_IDS_GLOBAL_KEY
                ];

                // Carrega em paralelo para reduzir o tempo de espera do setup.
                const staticFiles = await Promise.all(
                    staticKeys.map(key => CadastrosBaseService.getGlobalBaseFileCached(companyId, key))
                );
                if (cancelled) return;

                const stockModuleKey = selectedFilial ? buildSharedStockModuleKey(selectedFilial) : '';
                const stockMeta = stockModuleKey
                    ? await CadastrosBaseService.getGlobalBaseFileCached(companyId, stockModuleKey, { forceFresh: true })
                    : null;
                if (cancelled) return;

                const byKey = new Map<string, DbGlobalBaseFile>();
                staticFiles.forEach(file => {
                    if (file) byKey.set(file.module_key, file as DbGlobalBaseFile);
                });
                if (stockMeta) {
                    byKey.set(stockMeta.module_key, stockMeta as DbGlobalBaseFile);
                }

                const nextGroupFiles = createInitialGroupFiles();
                const nextGroupMeta = createInitialGroupMeta();

                GROUP_UPLOAD_IDS.forEach(groupId => {
                    const moduleKey = GROUP_GLOBAL_BASE_KEYS[groupId];
                    const globalFile = byKey.get(moduleKey) || null;
                    nextGroupMeta[groupId] = globalFile;
                    if (globalFile) {
                        nextGroupFiles[groupId] = decodeGlobalFileToBrowserFile(globalFile);
                    }
                });

                const deptMeta = byKey.get(AUDIT_DEPT_IDS_GLOBAL_KEY) || null;
                const catMeta = byKey.get(AUDIT_CAT_IDS_GLOBAL_KEY) || null;

                setGlobalGroupFiles(nextGroupFiles);
                setGlobalGroupMeta(nextGroupMeta);
                setGlobalDeptIdsMeta(deptMeta);
                setGlobalCatIdsMeta(catMeta);
                setGlobalDeptIdsFile(deptMeta ? decodeGlobalFileToBrowserFile(deptMeta) : null);
                setGlobalCatIdsFile(catMeta ? decodeGlobalFileToBrowserFile(catMeta) : null);
                setGlobalStockMeta(stockMeta as DbGlobalBaseFile | null);
                setGlobalStockFile(stockMeta ? decodeGlobalFileToBrowserFile(stockMeta as DbGlobalBaseFile) : null);
            } catch (error) {
                console.error('Erro ao carregar bases globais da auditoria:', error);
                if (!cancelled) {
                    setGlobalGroupFiles(createInitialGroupFiles());
                    setGlobalGroupMeta(createInitialGroupMeta());
                    setGlobalDeptIdsMeta(null);
                    setGlobalCatIdsMeta(null);
                    setGlobalDeptIdsFile(null);
                    setGlobalCatIdsFile(null);
                    setGlobalStockMeta(null);
                    setGlobalStockFile(null);
                }
            } finally {
                if (!cancelled) setIsLoadingGlobalBases(false);
            }
        };

        loadGlobalAuditBases();
        return () => {
            cancelled = true;
        };
    }, [selectedCompany?.id, selectedFilial]);

    useEffect(() => {
        AuditStorage.cleanupLegacyAuditStorage();

        const loadLocal = async () => {
            const savedData = await AuditStorage.loadLocalAuditSession();
            if (savedData) {
                // Restoration of basic settings - but let loadAuditNum fetch full fresh context usually.
                // However, we can use savedData if Supabase fails.
                const forcedInitialFilial = String(initialFilial || '').trim();
                if (!forcedInitialFilial && savedData.filial) setSelectedFilial(savedData.filial);
                if (savedData.inventoryNumber) setInventoryNumber(savedData.inventoryNumber);
            }
        };
        loadLocal();
    }, [initialFilial]);

    useEffect(() => {
        if (data) {
            // Preserva a flag de pendingSync se ela já existir no data
            AuditStorage.saveLocalAuditSession(data, !!data.pendingSync);
        }
    }, [data]);

    const persistAuditSession = useCallback(async (
        session: DbAuditSession,
        options?: { allowProgressRegression?: boolean; allowCreate?: boolean; allowReopen?: boolean }
    ): Promise<DbAuditSession | null> => {
        const branch = String(session.branch || '');
        if (!branch || !session.audit_number) return null;

        const incomingData = (session.data as AuditData) || null;
        const incomingStrength = getAuditDataStrength(incomingData);
        const incomingProgress = Number(session.progress || 0);

        // Se estiver offline ou a conexão cair, salvamos apenas localmente com flag
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            if (incomingData) {
                await AuditStorage.saveLocalAuditSession(incomingData, true);
                setData(prev => prev ? { ...prev, pendingSync: true } : prev);
            }
            return { ...session, updated_at: new Date().toISOString() };
        }

        try {
            setIsSyncing(true);
            const latestMeta = await fetchLatestAuditMetadata(branch);
            const baseUpdatedAt = session.updated_at || lastAuditUpdateRef.current || null;
            const isSameAudit = !!latestMeta && latestMeta.audit_number === session.audit_number;
            const allowProgressRegression = !!options?.allowProgressRegression;
            const allowCreate = !!options?.allowCreate;
            const allowReopen = !!options?.allowReopen;

            const freshLatest = isSameAudit ? await fetchLatestAudit(branch) : null;
            const latestSession = freshLatest || (isSameAudit ? null : await fetchLatestAudit(branch));
            const exactSession = await fetchAuditSession(branch, session.audit_number);

            if (!session.id && exactSession?.id) {
                session = { ...session, id: exactSession.id };
            }

            if (!allowCreate && !session.id && session.status === 'open') {
                console.warn(
                    `Bloqueamos a criação automática do inventário Nº ${session.audit_number} na filial ${branch}.\n\n` +
                    `Para criar um inventário novo, use o botão de iniciar/carregar inventário.`
                );
                return null;
            }

            if (session.status === 'open' && exactSession?.status === 'completed' && !allowReopen) {
                alert(
                    `Inventário Nº ${session.audit_number} já está concluído.\n\n` +
                    `Abra em modo consulta ou use a opção Reabrir para alterar esse inventário.`
                );
                return null;
            }
            
            if (
                latestSession &&
                latestSession.status !== 'completed' &&
                latestSession.audit_number !== session.audit_number
            ) {
                setNextAuditNumber(latestSession.audit_number);
                setDbSessionId(latestSession.id);
                alert(
                    `Não é permitido criar/iniciar o inventário Nº ${session.audit_number} enquanto o inventário Nº ${latestSession.audit_number} estiver em aberto.\n\n` +
                    `Finalize, reabra o mesmo número ou exclua o inventário aberto para continuar.`
                );
                return null;
            }
            
            const remoteStrength = getAuditDataStrength((freshLatest?.data as AuditData) || null);
            const incomingGroupsCount = Array.isArray(incomingData?.groups) ? incomingData.groups.length : 0;
            const getAuditShapeStats = (auditData: AuditData | null | undefined) => {
                let groups = 0;
                let departments = 0;
                let categories = 0;
                let products = 0;
                let doneCategories = 0;
                (auditData?.groups || []).forEach(g => {
                    groups += 1;
                    (g.departments || []).forEach(d => {
                        departments += 1;
                        (d.categories || []).forEach(c => {
                            categories += 1;
                            products += Array.isArray(c.products) ? c.products.length : 0;
                            if (isDoneStatus(c.status)) doneCategories += 1;
                        });
                    });
                });
                return {
                    groups,
                    departments,
                    categories,
                    products,
                    doneCategories,
                    termDrafts: Object.keys(((auditData as any)?.termDrafts || {}) as Record<string, unknown>).length,
                    partialStarts: Array.isArray((auditData as any)?.partialStarts) ? (auditData as any).partialStarts.length : 0,
                    partialCompleted: Array.isArray((auditData as any)?.partialCompleted) ? (auditData as any).partialCompleted.length : 0
                };
            };
            const incomingShape = getAuditShapeStats(incomingData);
            const remoteShape = getAuditShapeStats((freshLatest?.data as AuditData) || null);
            const isSameStructureShape =
                incomingShape.groups === remoteShape.groups &&
                incomingShape.departments === remoteShape.departments &&
                incomingShape.categories === remoteShape.categories &&
                incomingShape.products === remoteShape.products &&
                incomingShape.products > 0;
            const isPartialMarkerOnlyChange =
                isSameStructureShape &&
                incomingShape.doneCategories >= remoteShape.doneCategories &&
                incomingShape.termDrafts >= remoteShape.termDrafts &&
                incomingShape.partialCompleted >= remoteShape.partialCompleted;
            
            if (
                !allowProgressRegression &&
                freshLatest &&
                freshLatest.audit_number === session.audit_number &&
                remoteStrength > 0 &&
                incomingStrength < remoteStrength &&
                !isPartialMarkerOnlyChange &&
                (incomingStrength <= 0 || incomingGroupsCount === 0 || incomingProgress <= 0.1)
            ) {
                const recovered = reconcileAuditStateFromCompletedScopes(freshLatest.data as AuditData);
                const normalizedRecovered = (normalizeAuditDataStructure(recovered).data || recovered) as AuditData;
                setData(normalizedRecovered);
                setTermDrafts(((normalizedRecovered as any).termDrafts || {}) as Record<string, TermForm>);
                setDbSessionId(freshLatest.id);
                setNextAuditNumber(freshLatest.audit_number);
                lastAuditUpdateRef.current = freshLatest.updated_at || latestMeta?.updated_at || null;
                await CacheService.set(`audit_session_${branch}`, { ...freshLatest, data: normalizedRecovered } as any);
                await CacheService.set(`audit_session_lastgood_${branch}`, { ...freshLatest, data: normalizedRecovered } as any);
                alert("Bloqueamos uma sobrescrita de dados parciais para proteger os dados já gravados.");
                return null;
            }
            if (
                !allowProgressRegression &&
                freshLatest &&
                freshLatest.audit_number === session.audit_number &&
                incomingProgress <= 0.1 &&
                Number(freshLatest.progress || 0) >= 1 &&
                incomingProgress + 0.001 < Number(freshLatest.progress || 0)
            ) {
                if (freshLatest?.data) {
                    const recovered = reconcileAuditStateFromCompletedScopes(freshLatest.data as AuditData);
                    const normalizedRecovered = (normalizeAuditDataStructure(recovered).data || recovered) as AuditData;
                    setData(normalizedRecovered);
                    setTermDrafts(((normalizedRecovered as any).termDrafts || {}) as Record<string, TermForm>);
                    setDbSessionId(freshLatest.id);
                    setNextAuditNumber(freshLatest.audit_number);
                    lastAuditUpdateRef.current = freshLatest.updated_at || latestMeta?.updated_at || null;
                    await CacheService.set(`audit_session_${branch}`, { ...freshLatest, data: normalizedRecovered } as any);
                }
                alert("Bloqueamos uma sobrescrita de progresso antigo para proteger contagens finalizadas.");
                return null;
            }

            if (isSameAudit && latestMeta?.updated_at && baseUpdatedAt) {
                const remoteTs = new Date(latestMeta.updated_at).getTime();
                const baseTs = new Date(baseUpdatedAt).getTime();
                if (Number.isFinite(remoteTs) && Number.isFinite(baseTs) && remoteTs > baseTs + 1000) {
                    const fresh = freshLatest || await fetchLatestAudit(branch);
                    if (fresh?.data) {
                        const recovered = reconcileAuditStateFromCompletedScopes(fresh.data as AuditData);
                        const normalizedRecovered = (normalizeAuditDataStructure(recovered).data || recovered) as AuditData;
                        setData(normalizedRecovered);
                        setTermDrafts(((normalizedRecovered as any).termDrafts || {}) as Record<string, TermForm>);
                        setDbSessionId(fresh.id);
                        setNextAuditNumber(fresh.audit_number);
                        lastAuditUpdateRef.current = fresh.updated_at || latestMeta.updated_at || null;
                        await CacheService.set(`audit_session_${branch}`, { ...fresh, data: normalizedRecovered } as any);
                        await CacheService.set(`audit_session_lastgood_${branch}`, { ...fresh, data: normalizedRecovered } as any);
                    }
                    alert("A auditoria foi atualizada por outro usuário/aba. Recarregamos os dados mais novos para evitar sobrescrita.");
                    return null;
                }
            }

            const normalizedIncoming = normalizeAuditDataStructure((session.data as AuditData) || null);
            const saved = await upsertAuditSession({
                ...session,
                data: (normalizedIncoming.data || session.data) as any,
                updated_at: baseUpdatedAt || undefined
            });
            
            if (saved?.updated_at) {
                lastAuditUpdateRef.current = saved.updated_at;
                const reconciled = saved.data ? reconcileAuditStateFromCompletedScopes(saved.data as AuditData) : null;
                if (reconciled && getAuditDataStrength(reconciled) > 0) {
                    await CacheService.set(`audit_session_lastgood_${branch}`, { ...saved, data: reconciled } as any);
                }
                // Limpa flag de pendência local ao sincronizar com sucesso
                if (incomingData) {
                    await AuditStorage.saveLocalAuditSession(incomingData, false);
                    setData(prev => prev ? { ...prev, pendingSync: false } : prev);
                }
            }
            return saved;
        } catch (err) {
            console.error("Erro ao persistir sessão (possível queda de rede):", err);
            if (incomingData) {
                await AuditStorage.saveLocalAuditSession(incomingData, true);
                setData(prev => prev ? { ...prev, pendingSync: true } : prev);
            }
            
            // Se for finalização ('completed'), não fingimos sucesso total
            if (session.status === 'completed') {
                throw err;
            }
            
            // Retorna um objeto simulando sucesso parcial para não travar a UI durante a contagem
            return { ...session, updated_at: new Date().toISOString() };
        } finally {
            setIsSyncing(false);
        }
    }, []);

    const handleSafeExit = async () => {
        const resetAuditUi = () => {
            sessionStorage.removeItem(CONFIRMED_SESSION_KEY);
            setData(null);
            setDbSessionId(undefined);
            setAllowActiveAuditAutoOpen(false);
            setSelectedFilial("");
            setGroupFiles(createInitialGroupFiles());
            setFileStock(null);
            setFileDeptIds(null);
            setFileCatIds(null);
            setInitialDoneUnits(0);
            setSessionStartTime(Date.now());
            setView({ level: 'groups' });
        };

        if (!selectedFilial) {
            resetAuditUi();
            return;
        }

        // Usuário não-master também pode preencher assinaturas/termos.
        // Faz persistência rápida em background antes de limpar a UI.
        if (!canUseAuditMasterTools) {
            if (!isReadOnlyCompletedView && data) {
                const snapshotData = ({ ...data, termDrafts: composeTermDraftsForPersist(((data as any)?.termDrafts || {}) as Record<string, TermForm>, termDrafts) } as any);
                const snapshotSessionId = dbSessionId;
                const snapshotBranch = selectedFilial;
                const snapshotAudit = nextAuditNumber;
                const snapshotProgress = calculateProgress(data);

                void (async () => {
                    try {
                        const savedSession = await persistAuditSession({
                            id: snapshotSessionId,
                            branch: snapshotBranch,
                            audit_number: snapshotAudit,
                            status: 'open',
                            data: snapshotData,
                            progress: snapshotProgress,
                            user_email: userEmail
                        });
                        if (savedSession) {
                            await CacheService.set(`audit_session_${snapshotBranch}`, savedSession as any);
                        }
                    } catch (err) {
                        console.error("Error saving session for non-master in background:", err);
                    }
                })();
            }
            resetAuditUi();
            void AuditStorage.clearLocalAuditSession();
            return;
        }

        if (window.confirm("Deseja sair da auditoria? Seu progresso será salvo automaticamente e você poderá retomar depois.")) {
            if (isReadOnlyCompletedView) {
                resetAuditUi();
                void AuditStorage.clearLocalAuditSession();
                return;
            }
            const snapshotData = data
                ? ({ ...data, termDrafts: composeTermDraftsForPersist(((data as any)?.termDrafts || {}) as Record<string, TermForm>, termDrafts) } as any)
                : null;
            const snapshotSessionId = dbSessionId;
            const snapshotBranch = selectedFilial;
            const snapshotAudit = nextAuditNumber;
            const snapshotProgress = data ? calculateProgress(data) : 0;

            // Fecha imediatamente; persistência roda em background.
            resetAuditUi();

            if (!snapshotData || !snapshotBranch) return;

            void (async () => {
                try {
                    const savedSession = await persistAuditSession({
                        id: snapshotSessionId,
                        branch: snapshotBranch,
                        audit_number: snapshotAudit,
                        status: 'open',
                        data: snapshotData,
                        progress: snapshotProgress,
                        user_email: userEmail
                    });
                    if (savedSession) {
                        await CacheService.set(`audit_session_${snapshotBranch}`, savedSession as any);
                        await AuditStorage.clearLocalAuditSession();
                    }
                } catch (err) {
                    console.error("Error saving session in background:", err);
                }
            })();
        }
    };

    const handleFinishAudit = async () => {
        if (!data) return;
        if (isReadOnlyCompletedView) {
            alert("Modo consulta ativo: reabra o inventário para editar/encerrar novamente.");
            return;
        }
        if (!dbSessionId) {
            alert("Nenhum inventário aberto ativo para encerrar.");
            return;
        }
        if (!canManageAuditLifecycle) {
            alert("Somente Master e Administrativo podem encerrar inventário.");
            return;
        }
        const progress = calculateProgress(data);
        const auditNumberToPersist = consultingAuditNumber ?? nextAuditNumber;
        let totalCategories = 0;
        let doneCategories = 0;
        const pendingSample: string[] = [];
        (data.groups || []).forEach(g => {
            (g.departments || []).forEach(d => {
                (d.categories || []).forEach(c => {
                    totalCategories += 1;
                    if (isDoneStatus(c.status)) {
                        doneCategories += 1;
                        return;
                    }
                    if (pendingSample.length < 6) {
                        pendingSample.push(`${g.name} > ${d.name} > ${c.name}`);
                    }
                });
            });
        });
        const pendingCategories = Math.max(0, totalCategories - doneCategories);
        const openPartials = Array.isArray(data.partialStarts) ? data.partialStarts.length : 0;
        const hasPendingWork = pendingCategories > 0 || openPartials > 0;

        const finishMessage = hasPendingWork
            ? `ATENÇÃO: Existem conferências pendentes na auditoria Nº ${auditNumberToPersist}.\n\n` +
            `Categorias não finalizadas: ${pendingCategories} de ${totalCategories}\n` +
            `Parciais abertas: ${openPartials}\n` +
            `${pendingSample.length > 0 ? `\nExemplos pendentes:\n- ${pendingSample.join('\n- ')}\n` : '\n'}` +
            `Essa ação encerrará a auditoria mesmo assim e salvará como CONCLUÍDA.\n\nDeseja encerrar mesmo assim?`
            : `ATENÇÃO: Você está prestes a FINALIZAR a auditoria Nº ${auditNumberToPersist}.\n\nEssa ação salvará a auditoria no Supabase como CONCLUÍDA.\nDepois você poderá iniciar a próxima auditoria da filial.\n\nDeseja continuar?`;

        if (window.confirm(finishMessage)) {
            try {
                setIsProcessing(true);
                const isOnlineNow = typeof navigator !== 'undefined' && navigator.onLine;
                
                const sessionToPersist: DbAuditSession = {
                    id: dbSessionId,
                    branch: selectedFilial,
                    audit_number: auditNumberToPersist,
                    status: 'completed',
                    data: { ...data, termDrafts: composeTermDraftsForPersist(((data as any)?.termDrafts || {}) as Record<string, TermForm>, termDrafts) } as any,
                    progress,
                    user_email: userEmail
                };

                let savedSession: DbAuditSession | null = null;
                
                if (isOnlineNow) {
                    try {
                        savedSession = await persistAuditSession(sessionToPersist);
                    } catch (syncErr) {
                        console.error("Falha ao sincronizar finalização:", syncErr);
                        // Se falhou mas salvou localmente como pendente (feito dentro do persistAuditSession)
                        savedSession = null;
                    }
                } else {
                    // Offline: salva localmente com flag
                    if (data) {
                        await AuditStorage.saveLocalAuditSession(data, true);
                        setData(prev => prev ? { ...prev, pendingSync: true } : prev);
                    }
                    savedSession = null;
                }

                if (savedSession) {
                    await CacheService.set(`audit_session_${selectedFilial}`, savedSession as any);
                    alert("Auditoria finalizada com sucesso e salva no servidor!");
                } else {
                    alert("AVISO: Auditoria finalizada LOCALMENTE.\n\nComo você está sem conexão estável, os dados foram salvos no seu computador. Eles serão enviados ao servidor automaticamente assim que a internet voltar.\n\nNÃO limpe o cache do navegador até ver o status 'LIVE' verde.");
                }

                // Se salvou no servidor, podemos limpar tudo. 
                // Se ficou pendente, limpamos o estado da tela mas o persistAuditSession já garantiu o backup no IndexedDB.
                // IMPORTANTE: Só limpamos o local se NÃO houver pendência de sync real (ou se o usuário confirmou que entendeu).
                
                if (savedSession || !isOnlineNow || data?.pendingSync) {
                    sessionStorage.removeItem(CONFIRMED_SESSION_KEY);
                    setData(null);
                    setDbSessionId(undefined);
                    setAllowActiveAuditAutoOpen(false);
                    setSelectedFilial("");
                    setGroupFiles(createInitialGroupFiles());
                    setFileStock(null);
                    setFileDeptIds(null);
                    setFileCatIds(null);
                    setInitialDoneUnits(0);
                    setSessionStartTime(Date.now());
                    setView({ level: 'groups' });
                    // Nota: AuditStorage.clearLocalAuditSession() NÃO deve ser chamado se estiver pendente.
                    if (savedSession) {
                        await AuditStorage.clearLocalAuditSession();
                    }
                }
            } catch (err) {
                console.error("Error finishing session:", err);
                alert("Erro crítico ao finalizar auditoria. Verifique sua conexão e tente novamente.");
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const reopenAuditByNumber = async (targetAuditNumber: number) => {
        if (!canUseAuditMasterTools) {
            alert("Somente Master ou Administrativo pode reabrir inventário.");
            return false;
        }
        if (!selectedFilial) {
            alert("Selecione a filial.");
            return false;
        }
        if (!Number.isFinite(targetAuditNumber) || targetAuditNumber <= 0) {
            alert("Número de inventário inválido.");
            return false;
        }

        try {
            const target = await fetchAuditSession(selectedFilial, targetAuditNumber);
            if (!target) {
                alert(`Inventário Nº ${targetAuditNumber} não encontrado na filial ${selectedFilial}.`);
                return false;
            }
            if (target.status !== 'completed') {
                alert(`Inventário Nº ${targetAuditNumber} já está em aberto.`);
                return false;
            }

            const latest = await fetchLatestAudit(selectedFilial);
            if (latest && latest.status !== 'completed' && latest.audit_number !== targetAuditNumber) {
                alert(
                    `Já existe um inventário em aberto (Nº ${latest.audit_number}) nesta filial.\n\n` +
                    `Finalize ou exclua o inventário aberto antes de reabrir outro número.`
                );
                return false;
            }

            const confirmed = window.confirm(
                `Você está reabrindo o inventário Nº ${targetAuditNumber}.\n\n` +
                `Isso mudará o status para EM ABERTO e permitirá novas alterações.\n` +
                `Deseja continuar?`
            );
            if (!confirmed) return false;

            setIsProcessing(true);
            const reopened = await persistAuditSession({
                id: target.id,
                branch: target.branch,
                audit_number: target.audit_number,
                status: 'open',
                data: target.data,
                progress: Number(target.progress || 0),
                user_email: userEmail
            }, { allowProgressRegression: true, allowReopen: true });

            if (!reopened) {
                alert("Não foi possível reabrir o inventário agora.");
                return false;
            }

            await CacheService.set(`audit_session_${selectedFilial}`, reopened as any);
            markAuditSessionConfirmed(reopened.id || '');
            const payload = ((reopened.data || {}) as AuditData);
            if (payload.groups) {
                payload.groups.forEach((g: any) => {
                    g.departments?.forEach((d: any) => {
                        d.categories?.forEach((c: any) => {
                            c.status = normalizeAuditStatus(c.status);
                            if (c.totalCost === undefined || c.totalCost === null || (c.totalCost === 0 && c.totalQuantity > 0)) {
                                let catCost = 0;
                                c.products?.forEach((p: any) => { catCost += (p.quantity * (p.cost || 0)); });
                                c.totalCost = catCost;
                            }
                        });
                    });
                });
            }
            const reconciled = reconcileAuditStateFromCompletedScopes(payload);
            completedAuditConsultationRef.current = false;
            setAllowActiveAuditAutoOpen(true);
            setConsultingAuditNumber(null);
            setIsReadOnlyCompletedView(false);
            setNextAuditNumber(reopened.audit_number);
            setDbSessionId(reopened.id);
            setData(reconciled);
            setTermDrafts(((reconciled as any)?.termDrafts || {}) as Record<string, TermForm>);
            setView({ level: 'groups' });
            setShowCompletedAuditsModal(false);
            alert(`Inventário Nº ${targetAuditNumber} reaberto com sucesso.`);
            return true;
        } catch (error) {
            console.error("Erro ao reabrir inventário:", error);
            alert("Erro ao reabrir inventário.");
            return false;
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReopenAudit = async () => {
        if (!canUseAuditMasterTools) {
            alert("Somente Master ou Administrativo pode reabrir inventário.");
            return;
        }
        if (!selectedFilial) {
            alert("Selecione a filial.");
            return;
        }

        const completed = completedAudits;
        if (completed.length === 0) {
            alert("Não há inventários concluídos para reabrir nesta filial.");
            return;
        }

        const options = completed
            .slice(0, 15)
            .map(h => `Nº ${h.audit_number} (${h.updated_at ? new Date(h.updated_at).toLocaleString('pt-BR') : 'sem data'})`)
            .join('\n');
        const input = window.prompt(
            `REABRIR INVENTÁRIO\n\nInventários concluídos recentes:\n${options}\n\nDigite o número do inventário que deseja reabrir:`
        );
        if (!input) return;
        const targetAuditNumber = Number(String(input).trim());
        await reopenAuditByNumber(targetAuditNumber);
    };

    const accessCompletedAuditByNumber = async (targetAuditNumber: number) => {
        if (!selectedFilial) {
            alert("Selecione a filial.");
            return false;
        }
        if (!Number.isFinite(targetAuditNumber) || targetAuditNumber <= 0) {
            alert("Número de inventário inválido.");
            return false;
        }

        try {
            setIsProcessing(true);
            const target = await fetchAuditSession(selectedFilial, targetAuditNumber);
            if (!target) {
                alert(`Inventário Nº ${targetAuditNumber} não encontrado na filial ${selectedFilial}.`);
                return false;
            }
            if (target.status !== 'completed') {
                alert(`Inventário Nº ${targetAuditNumber} não está concluído.`);
                return false;
            }

            const payload = (target.data || {}) as AuditData;
            completedAuditConsultationRef.current = true;
            if (payload.groups) {
                payload.groups.forEach((g: any) => {
                    g.departments?.forEach((d: any) => {
                        d.categories?.forEach((c: any) => {
                            c.status = normalizeAuditStatus(c.status);
                        });
                    });
                });
            }
            const reconciled = reconcileAuditStateFromCompletedScopes(payload);
            setIsReadOnlyCompletedView(true);
            setConsultingAuditNumber(target.audit_number);
            setNextAuditNumber(target.audit_number);
            setDbSessionId(target.id);
            setAllowActiveAuditAutoOpen(false);
            setIsUpdatingStock(false);
            setData(reconciled);
            setTermDrafts(((reconciled as any)?.termDrafts || {}) as Record<string, TermForm>);
            setView({ level: 'groups' });
            setShowCompletedAuditsModal(false);
            alert(
                canUseAuditMasterTools
                    ? `Inventário Nº ${targetAuditNumber} aberto. Você está no modo de consulta de inventário concluído.`
                    : `Inventário Nº ${targetAuditNumber} aberto em modo consulta (sem edição).`
            );
            return true;
        } catch (error) {
            console.error("Erro ao acessar inventário concluído:", error);
            alert("Erro ao acessar inventário concluído.");
            return false;
        } finally {
            setIsProcessing(false);
        }
    };

    const resumeLatestOpenAudit = async () => {
        if (!selectedFilial) {
            alert("Selecione a filial.");
            return;
        }
        const targetAuditNumber = latestOpenAudit?.audit_number;
        if (!targetAuditNumber) {
            alert("Não há inventário aberto para retomar nesta filial.");
            return;
        }

        try {
            setIsProcessing(true);
            const target = await fetchAuditSession(selectedFilial, targetAuditNumber);
            if (!target) {
                alert(`Inventário Nº ${targetAuditNumber} não encontrado na filial ${selectedFilial}.`);
                return;
            }
            if (target.status === 'completed') {
                alert(`Inventário Nº ${targetAuditNumber} já está concluído.`);
                return;
            }

            const payload = (target.data || {}) as AuditData;
            if (payload.groups) {
                payload.groups.forEach((g: any) => {
                    g.departments?.forEach((d: any) => {
                        d.categories?.forEach((c: any) => {
                            c.status = normalizeAuditStatus(c.status);
                            if (c.totalCost === undefined || c.totalCost === null || (c.totalCost === 0 && c.totalQuantity > 0)) {
                                let catCost = 0;
                                c.products?.forEach((p: any) => { catCost += (p.quantity * (p.cost || 0)); });
                                c.totalCost = catCost;
                            }
                        });
                    });
                });
            }
            const reconciled = reconcileAuditStateFromCompletedScopes(payload);
            completedAuditConsultationRef.current = false;
            setData(reconciled);
            setTermDrafts(((reconciled as any)?.termDrafts || {}) as Record<string, TermForm>);
            setNextAuditNumber(target.audit_number);
            setDbSessionId(target.id);
            setAllowActiveAuditAutoOpen(true);
            setIsUpdatingStock(false);
            setIsReadOnlyCompletedView(false);
            setConsultingAuditNumber(null);
            setView({ level: 'groups' });
        } catch (error) {
            console.error("Erro ao retomar inventário aberto:", error);
            alert("Erro ao retomar inventário.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteCurrentAudit = async () => {
        if (!canUseAuditMasterTools) {
            alert("Somente Master ou Administrativo pode excluir inventário.");
            return;
        }
        if (!selectedFilial) {
            alert("Selecione a filial.");
            return;
        }
        const suggestedNumber = Number.isFinite(Number(nextAuditNumber)) ? String(nextAuditNumber) : '';
        const input = window.prompt(
            `EXCLUIR INVENTÁRIO\n\nDigite o número do inventário que deseja excluir permanentemente da filial ${selectedFilial}:`,
            suggestedNumber
        );
        if (!input) return;
        const targetAuditNumber = Number(String(input).trim());
        if (!Number.isFinite(targetAuditNumber) || targetAuditNumber <= 0) {
            alert("Número de inventário inválido.");
            return;
        }

        const confirmed = window.confirm(
            `EXCLUSÃO PERMANENTE\n\n` +
            `Você está prestes a excluir definitivamente o inventário Nº ${targetAuditNumber} da filial ${selectedFilial}.\n` +
            `Essa ação não pode ser desfeita.\n\n` +
            `Deseja continuar?`
        );
        if (!confirmed) return;

        try {
            setIsProcessing(true);
            const target = await fetchAuditSession(selectedFilial, targetAuditNumber);
            if (!target) {
                alert(`Inventário Nº ${targetAuditNumber} não encontrado nesta filial.`);
                return;
            }

            const ok = await deleteAuditSession(selectedFilial, targetAuditNumber);
            if (!ok) {
                alert("Não foi possível excluir o inventário.");
                return;
            }

            await AuditStorage.clearLocalAuditSession();
            sessionStorage.removeItem(CONFIRMED_SESSION_KEY);
            await CacheService.remove(`audit_session_${selectedFilial}`);
            await CacheService.remove(`audit_session_lastgood_${selectedFilial}`);

            if (targetAuditNumber === nextAuditNumber || target.id === dbSessionId) {
                setData(null);
                setTermDrafts({});
                setDbSessionId(undefined);
                setAllowActiveAuditAutoOpen(false);
                setGroupFiles(createInitialGroupFiles());
                setFileStock(null);
                setFileDeptIds(null);
                setFileCatIds(null);
                setInitialDoneUnits(0);
                setSessionStartTime(Date.now());
                setView({ level: 'groups' });
            }

            await loadAuditNum(false);
            alert(`Inventário Nº ${targetAuditNumber} excluído permanentemente.`);
        } catch (error) {
            console.error("Erro ao excluir inventário:", error);
            alert("Erro ao excluir inventário.");
        } finally {
            setIsProcessing(false);
        }
    };

    const normalizeBarcode = (val: any): string => {
        if (val === null || val === undefined) return "";
        let s = String(val).trim().replace(/^'/, "");
        if (typeof val === 'number' && Number.isFinite(val)) {
            return String(Math.trunc(val)).replace(/^0+/, "");
        }
        if (s.includes('-')) {
            s = s.split('-')[0];
        }
        if (s.includes('E+') || s.includes('e+')) {
            s = Number(val).toLocaleString('fullwide', { useGrouping: false });
        }
        if (/^\d+[.,]0+$/.test(s)) s = s.split(/[.,]/)[0];
        return s.replace(/\D/g, "").replace(/^0+/, "");
    };

    const collectProductCodeCandidates = (row: any[], maxColumns = 12): string[] => {
        const candidates = new Set<string>();
        const add = (index: number) => {
            if (!row || index < 0 || index >= row.length) return;
            const raw = row[index];
            if (raw === null || raw === undefined || raw === '') return;
            const text = String(raw).trim().replace(/^'/, '');
            const looksNumericCode =
                typeof raw === 'number'
                    ? Number.isFinite(raw)
                    : /^\d+(?:-\d+)?(?:[.,]0+)?$/.test(text) || /[Ee+]/.test(text);
            if (!looksNumericCode) return;
            const code = normalizeBarcode(raw);
            const isReducedCodeColumn = index === 1;
            if (!code || code.length < (isReducedCodeColumn ? 1 : 3)) return;
            if (GROUP_UPLOAD_IDS.includes(code as GroupUploadId) && index !== 1) return;
            candidates.add(code);
        };

        const limit = Math.min(row?.length || 0, maxColumns);
        for (let i = 0; i < limit; i++) add(i);
        add(11);
        return Array.from(candidates);
    };

    const parseStockNumber = (val: any): number => {
        return Number(parseDecimalCell(val));
    };

    const hasNumericCellValue = (val: any) => {
        if (val === null || val === undefined) return false;
        if (typeof val === 'number') return Number.isFinite(val);
        return String(val).trim() !== '' && Number.isFinite(parseDecimalCell(val));
    };

    const normalizeHeaderText = (value: unknown) =>
        String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();

    const detectTermComparisonColumns = (rows: any[][]) => {
        const hasAny = (header: string, terms: string[]) => terms.some(term => header.includes(term));
        const hasDiff = (header: string) => hasAny(header, ['dif', 'diverg', 'resultado']);
        const hasMoney = (header: string) => hasAny(header, ['r$', 'financeir', 'valor', 'vlr', 'custo', 'total']);

        const maxRows = Math.min(rows.length, 80);
        let headerRowIndex = rows.slice(0, maxRows).findIndex(row => {
            const cells = (row || []).map(normalizeHeaderText);
            const hasCode = cells.some(cell => hasAny(cell, ['codigo reduzido', 'cod reduzido', 'codigo', 'cod.']) && !cell.includes('barras'));
            const hasDescription = cells.some(cell => hasAny(cell, ['descricao', 'descr produto', 'produto']));
            const hasStockColumns = cells.filter(cell => cell.includes('estoq') && !cell.includes('atual')).length >= 2;
            const hasCostColumns = cells.filter(cell => cell.includes('custo total')).length >= 2;
            return hasCode && hasDescription && (hasStockColumns || hasCostColumns);
        });
        if (headerRowIndex < 0) headerRowIndex = rows.slice(0, maxRows).findIndex(row => {
            const cells = (row || []).map(normalizeHeaderText);
            return cells.some(cell => cell.includes('codigo')) && cells.some(cell => cell.includes('descricao'));
        });

        const headerRow = headerRowIndex >= 0 ? rows[headerRowIndex] || [] : [];
        const groupRow = headerRowIndex > 0 ? rows[headerRowIndex - 1] || [] : [];
        const headers = headerRow.map(normalizeHeaderText);
        const groupHeaders = groupRow.map(normalizeHeaderText);
        const maxCols = Math.max(headerRow.length, groupRow.length, ...rows.slice(0, maxRows).map(row => row?.length || 0));
        const fullHeaderAt = (col: number) => `${groupHeaders[col] || ''} ${headers[col] || ''}`.trim();
        const findCol = (predicate: (header: string, col: number) => boolean) => {
            for (let col = 0; col < maxCols; col++) {
                if (predicate(fullHeaderAt(col), col)) return col;
            }
            return undefined;
        };
        const findHeaderCol = (predicate: (header: string, col: number) => boolean) => {
            for (let col = 0; col < maxCols; col++) {
                if (predicate(headers[col] || '', col)) return col;
            }
            return undefined;
        };

        const code = findHeaderCol(header => hasAny(header, ['codigo reduzido', 'cod reduzido', 'codigo', 'cod.']) && !header.includes('barras')) ?? 1;
        const description = findHeaderCol(header => hasAny(header, ['descricao', 'descr produto', 'produto'])) ?? 2;
        const lab = findHeaderCol(header => hasAny(header, ['laboratorio', 'lab'])) ?? 4;
        const diffQty = findCol(header => hasDiff(header) && header.includes('estoq') && !hasMoney(header)) ?? 13;

        const stockQtyCols = Array.from({ length: maxCols }, (_, col) => col)
            .filter(col => {
                const header = headers[col] || '';
                return header.includes('estoq') && !header.includes('atual') && !hasDiff(header);
            });
        const costTotalCols = Array.from({ length: maxCols }, (_, col) => col)
            .filter(col => (headers[col] || '').includes('custo total'));

        const sysQty =
            stockQtyCols.find(col => hasAny(groupHeaders[col] || '', ['anterior', 'sistema', 'sist'])) ??
            stockQtyCols.filter(col => col < diffQty).pop() ??
            10;
        const countedQty =
            stockQtyCols.find(col => hasAny(groupHeaders[col] || '', ['contagem', 'fisico', 'fis', 'confer'])) ??
            stockQtyCols.find(col => col > diffQty) ??
            14;
        const sysCost =
            costTotalCols.find(col => hasAny(groupHeaders[col] || '', ['anterior', 'sistema', 'sist'])) ??
            costTotalCols.filter(col => col < diffQty).pop() ??
            12;
        const countedCost =
            costTotalCols.find(col => hasAny(groupHeaders[col] || '', ['contagem', 'fisico', 'fis', 'confer'])) ??
            costTotalCols.find(col => col > diffQty) ??
            16;

        return {
            headerRowIndex,
            code,
            description,
            lab,
            sysQty,
            sysCost,
            diffQty,
            countedQty,
            countedCost,
            diffCost: findCol((header, col) =>
                col !== diffQty &&
                col !== sysCost &&
                col !== countedCost &&
                hasDiff(header) &&
                hasMoney(header) &&
                !hasAny(header, ['%'])
            )
        };
    };

    const normalizeText = (text?: string) => {
        if (!text) return '';
        return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    };

    const parseDecimalCell = (val: any): number => {
        if (val === null || val === undefined) return 0;
        if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
        const raw = String(val).trim();
        if (!raw) return 0;
        let s = raw.replace(/\s+/g, '');
        if (s.includes('.') && s.includes(',')) {
            s = s.lastIndexOf(',') > s.lastIndexOf('.')
                ? s.replace(/\./g, '').replace(',', '.')
                : s.replace(/,/g, '');
        } else if (s.includes(',')) {
            s = /,\d+$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
        } else if ((s.match(/\./g) || []).length > 1) {
            s = s.replace(/\./g, '');
        }
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    };

    const readExcel = (file: File): Promise<any[][]> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const ab = e.target?.result;
                    const workbook = XLSX.read(ab, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                    resolve(rows as any[][]);
                } catch (err) { reject(err); }
            };
            reader.readAsArrayBuffer(file);
        });
    };

    useEffect(() => {
        if (!globalStockFile) {
            setStockCodeAliasesByReduced({});
            return;
        }
        let cancelled = false;
        const loadStockAliases = async () => {
            try {
                const rows = await readExcel(globalStockFile);
                if (cancelled) return;
                const next: Record<string, string[]> = {};
                rows.forEach(row => {
                    if (!row) return;
                    const reduced = normalizeBarcode(row[1]);
                    if (!reduced) return;
                    const aliases = collectProductCodeCandidates(row, 12)
                        .filter(code => code && code !== reduced);
                    if (aliases.length === 0) return;
                    next[reduced] = Array.from(new Set([...(next[reduced] || []), ...aliases]));
                });
                setStockCodeAliasesByReduced(next);
            } catch (error) {
                console.warn('Falha ao indexar códigos de barras do estoque para ajustes:', error);
                if (!cancelled) setStockCodeAliasesByReduced({});
            }
        };
        void loadStockAliases();
        return () => { cancelled = true; };
    }, [globalStockFile]);

    useEffect(() => {
        const files = GROUP_UPLOAD_IDS
            .map(groupId => globalGroupFiles[groupId])
            .filter((file): file is File => !!file);
        if (files.length === 0) {
            setCadastroBarcodeAliasesByReduced({});
            return;
        }

        let cancelled = false;
        const addAlias = (target: Record<string, string[]>, reducedRaw: unknown, barcodeRaw: unknown) => {
            const reduced = normalizeBarcode(reducedRaw);
            const barcode = normalizeBarcode(barcodeRaw);
            if (!reduced || !barcode || reduced === barcode) return;
            if (barcode.length < 6) return;
            target[reduced] = Array.from(new Set([...(target[reduced] || []), barcode]));
        };

        const loadCadastroAliases = async () => {
            try {
                const allRows = await Promise.all(files.map(file => readExcel(file)));
                if (cancelled) return;
                const next: Record<string, string[]> = {};
                allRows.forEach(rows => {
                    rows.forEach(row => {
                        if (!row) return;
                        // Cadastro Global: coluna C = reduzido, coluna L = código de barras.
                        addAlias(next, row[2], row[11]);
                    });
                });
                setCadastroBarcodeAliasesByReduced(next);
            } catch (error) {
                console.warn('Falha ao indexar códigos de barras do Cadastro Global para ajustes:', error);
                if (!cancelled) setCadastroBarcodeAliasesByReduced({});
            }
        };

        void loadCadastroAliases();
        return () => { cancelled = true; };
    }, [globalGroupFiles]);

    const barcodeAliasToReduced = useMemo(() => {
        const next: Record<string, string> = {};
        const addAliases = (aliasesByReduced: Record<string, string[]>) => {
            Object.entries(aliasesByReduced || {}).forEach(([reducedRaw, aliases]) => {
                const reduced = normalizeProductLookupCode(reducedRaw);
                if (!reduced) return;
                (aliases || []).forEach(aliasRaw => {
                    const alias = normalizeProductLookupCode(aliasRaw);
                    if (!alias || alias === reduced) return;
                    next[alias] = reduced;
                });
            });
        };
        addAliases(stockCodeAliasesByReduced);
        addAliases(cadastroBarcodeAliasesByReduced);
        return next;
    }, [stockCodeAliasesByReduced, cadastroBarcodeAliasesByReduced]);

    const cleanDescription = (str: string) => {
        if (!str) return "";
        return str.toString().replace(/^[0-9\s\-\.]+/, "").trim().toUpperCase();
    };

    const toUploadedFileMeta = (file: File | null) => {
        if (!file) return null;
        return {
            name: file.name,
            size: file.size,
            type: file.type || null,
            lastModified: file.lastModified
        };
    };

    const buildStructureSourceMeta = (options?: { stockSyncedAt?: string | null }) => {
        const nowIso = new Date().toISOString();
        const stockSource = globalStockMeta ? 'global_base' : 'none';
        const prevSourceFiles = ((data as any)?.sourceFiles || {}) as any;
        const forcedStockSyncedAt = options?.stockSyncedAt || null;
        const previousGlobalStockProcessedAt = prevSourceFiles?.globalStockProcessedAt || null;
        const stockSignature = getStockFileSignature(globalStockMeta || effectiveStockFile);
        const globalStockProcessedAt = forcedStockSyncedAt
            ? forcedStockSyncedAt
            : (stockSource === 'global_base'
                ? (getGlobalStockTimestampRaw(globalStockMeta) || previousGlobalStockProcessedAt || nowIso)
                : previousGlobalStockProcessedAt);
        return {
            mode: 'initial-structure-import',
            importedAt: nowIso,
            lastStockUpdateAt: nowIso,
            globalStockProcessedAt,
            globalStockSignature: stockSignature,
            stockSignature,
            groups: effectiveGroupFiles.map(({ groupId, file }) => ({
                groupId,
                source: 'global_base',
                file: toUploadedFileMeta(file),
                syncedAt: globalGroupMeta[groupId]?.uploaded_at || globalGroupMeta[groupId]?.updated_at || null
            })),
            stock: effectiveStockFile ? {
                ...toUploadedFileMeta(effectiveStockFile),
                source: stockSource,
                syncedAt: forcedStockSyncedAt || getGlobalStockTimestampRaw(globalStockMeta),
                signature: stockSignature
            } : null,
            deptIds: effectiveDeptIdsFile ? {
                ...toUploadedFileMeta(effectiveDeptIdsFile),
                source: globalDeptIdsMeta ? 'global_base' : 'none',
                syncedAt: globalDeptIdsMeta?.uploaded_at || globalDeptIdsMeta?.updated_at || null
            } : null,
            catIds: effectiveCatIdsFile ? {
                ...toUploadedFileMeta(effectiveCatIdsFile),
                source: globalCatIdsMeta ? 'global_base' : 'none',
                syncedAt: globalCatIdsMeta?.uploaded_at || globalCatIdsMeta?.updated_at || null
            } : null
        };
    };

    const applyStockMergeToOpenAudit = async (
        stockFile: File,
        options?: {
            source?: 'local_upload' | 'global_base';
            syncedAt?: string | null;
            notify?: boolean;
        }
    ) => {
        if (!data) return false;
        if (isReadOnlyCompletedView || consultingAuditNumber !== null) {
            setIsUpdatingStock(false);
            if (options?.notify !== false) {
                alert("Inventário concluído em modo consulta não pode receber reclassificação de estoque.");
            }
            return false;
        }
        const source = options?.source || 'local_upload';
        const syncedAt = options?.syncedAt || null;
        const shouldNotify = options?.notify !== false;
        const safePartialStarts = Array.isArray(data?.partialStarts) ? data.partialStarts : [];

        const rowsStock = await readExcel(stockFile);
        const stockAcc: Record<string, { q: number; costAmount: number }> = {};
        rowsStock.forEach(row => {
            if (!row) return;
            const reduced = normalizeBarcode(row[1]); // B (reduzido)
            if (!reduced) return;
            const q = parseStockNumber(row[14]); // O
            const c = parseStockNumber(row[15]); // P
            if (q <= 0) return;
            const prev = stockAcc[reduced] || { q: 0, costAmount: 0 };
            stockAcc[reduced] = {
                q: prev.q + q,
                costAmount: prev.costAmount + (q * c)
            };
        });
        const stockMap: Record<string, { q: number; c: number }> = {};
        Object.entries(stockAcc).forEach(([reduced, acc]) => {
            stockMap[reduced] = {
                q: acc.q,
                c: acc.q > 0 ? (acc.costAmount / acc.q) : 0
            };
        });

        const newData = { ...data };
        let appliedUnits = 0;
        const matchedReduced = new Set<string>();
        newData.groups.forEach(g => {
            g.departments.forEach(d => {
                d.categories.forEach(c => {
                    if (!isDoneStatus(c.status)) {
                        c.totalQuantity = 0;
                        c.totalCost = 0;
                        c.products.forEach(p => {
                            const reduced = normalizeBarcode(p.reducedCode || p.code);
                            const entry = stockMap[reduced] || { q: 0, c: 0 };
                            p.quantity = entry.q;
                            p.cost = entry.c;
                            c.totalQuantity += entry.q;
                            c.totalCost += (entry.q * entry.c);
                            appliedUnits += entry.q;
                            if (entry.q > 0 && reduced) matchedReduced.add(reduced);
                        });
                    }
                });
            });
        });
        const stockUnits = Object.values(stockMap).reduce((sum, e) => sum + e.q, 0);
        let unmatchedUnits = 0;
        Object.entries(stockMap).forEach(([reduced, entry]) => {
            if (!matchedReduced.has(reduced)) unmatchedUnits += entry.q;
        });
        if (shouldNotify && (Math.abs(stockUnits - appliedUnits) > 0.01 || unmatchedUnits > 0.01)) {
            alert(`Reconciliação do estoque:\nArquivo: ${Math.round(stockUnits).toLocaleString()} unid.\nAplicado: ${Math.round(appliedUnits).toLocaleString()} unid.\nNão classificados: ${Math.round(unmatchedUnits).toLocaleString()} unid.`);
        }

        const nowIso = new Date().toISOString();
        const prevSourceFiles = ((data as any).sourceFiles || {}) as any;
        const stockMeta = toUploadedFileMeta(stockFile);
        const stockSignature = source === 'global_base'
            ? getStockFileSignature(globalStockMeta || stockFile)
            : getStockFileSignature(stockFile);
        const stockUpdates = Array.isArray(prevSourceFiles.stockUpdates) ? prevSourceFiles.stockUpdates : [];
        const nextSourceFiles = {
            ...prevSourceFiles,
            stock: {
                ...stockMeta,
                source,
                syncedAt,
                signature: stockSignature
            },
            lastStockUpdateAt: nowIso,
            globalStockProcessedAt: source === 'global_base'
                ? (syncedAt || nowIso)
                : (syncedAt || prevSourceFiles.globalStockProcessedAt || null),
            globalStockSignature: source === 'global_base'
                ? stockSignature
                : (prevSourceFiles.globalStockSignature || stockSignature || null),
            stockSignature,
            stockUpdates: [
                ...stockUpdates,
                { ...stockMeta, source, syncedAt, updatedAt: nowIso, signature: stockSignature }
            ]
        };
        const preservedTermDrafts = composeTermDraftsForPersist(((data as any).termDrafts || {}) as Record<string, TermForm>, termDrafts) as Record<string, any>;
        const preservedPostAuditAdjustments = normalizePostAuditAdjustments((data as any).postAuditAdjustments);
        const basePersistedData = {
            ...newData,
            postAuditAdjustments: preservedPostAuditAdjustments,
            termDrafts: preservedTermDrafts,
            sourceFiles: nextSourceFiles
        } as any;
        const persistedData = applyPartialScopes(basePersistedData, safePartialStarts);
        const progress = calculateProgress(persistedData as AuditData);
        const savedSession = await persistAuditSession({
            id: dbSessionId,
            branch: selectedFilial,
            audit_number: nextAuditNumber,
            status: 'open',
            data: persistedData,
            progress: progress,
            user_email: userEmail
        });
        if (!savedSession) {
            throw new Error("Falha ao salvar atualização de saldos no Supabase.");
        }

        setDbSessionId(savedSession.id);
        setNextAuditNumber(savedSession.audit_number);
        setTermDrafts(preservedTermDrafts as any);
        setData((savedSession.data as AuditData) || (persistedData as AuditData));
        setGroupFiles(createInitialGroupFiles());
        setFileDeptIds(null);
        setFileCatIds(null);
        setFileStock(null);
        setIsUpdatingStock(false);
        setView({ level: 'groups' });
        if (shouldNotify) {
            alert("Estoques atualizados (apenas para itens não finalizados).");
        }
        return true;
    };

    useEffect(() => {
        if (!selectedFilial || !data || isProcessing || isUpdatingStock) return;
        const currentInventoryAuditNumber = getAuditNumberFromInventoryLabel((data as any)?.inventoryNumber);
        const isCompletedLoadedFromHistory = branchAuditsHistory.some(item => {
            if (item.status !== 'completed') return false;
            if (dbSessionId && item.id === dbSessionId) return true;
            return !!currentInventoryAuditNumber && Number(item.audit_number || 0) === currentInventoryAuditNumber;
        });
        if (
            completedAuditConsultationRef.current ||
            isReadOnlyCompletedView ||
            consultingAuditNumber !== null ||
            isCompletedLoadedFromHistory
        ) {
            return;
        }
        if (!canUseAuditMasterTools) return;
        if (!globalStockFile || !globalStockMeta) return;

        const globalTsRaw = getGlobalStockTimestampRaw(globalStockMeta);
        const globalTs = globalTsRaw ? new Date(globalTsRaw).getTime() : NaN;
        if (!Number.isFinite(globalTs)) return;

        const sourceFiles = ((data as any).sourceFiles || {}) as any;
        const hasNewerGlobalStock = isGlobalStockDifferentFromApplied(sourceFiles, globalStockMeta);
        if (!hasNewerGlobalStock) return;

        const syncKey = `${dbSessionId || 'no_session'}|${selectedFilial}|${globalStockMeta.module_key}|${globalTs}`;
        if (lastAutoStockSyncKeyRef.current === syncKey) {
            enterStockUpdateMode({ syncKey, showAlert: false });
            return;
        }

        // Ao detectar estoque global novo, manter a tela de atualização aberta.
        // A reclassificação só deve ocorrer no clique do botão (handleStartAudit).
        enterStockUpdateMode({ stockTsRaw: globalTsRaw, syncKey, showAlert: true });
    }, [
        selectedFilial,
        data,
        isProcessing,
        isUpdatingStock,
        canUseAuditMasterTools,
        globalStockFile,
        globalStockMeta,
        dbSessionId,
        isReadOnlyCompletedView,
        consultingAuditNumber,
        branchAuditsHistory
    ]);

    const handleStartAudit = async () => {
        if (isReadOnlyCompletedView) {
            alert("Modo consulta ativo: este inventário concluído não pode ser editado.");
            return;
        }
        if (!data && latestOpenAudit) {
            alert(`Já existe um inventário aberto (Nº ${latestOpenAudit.audit_number}) nesta filial. Retome o inventário aberto antes de criar outro.`);
            return;
        }
        if (!selectedFilial) {
            alert("Selecione a filial.");
            return;
        }

        const hasStructureFiles = effectiveGroupFiles.length > 0;
        const hasOpenStructure = !!(data && data.groups && data.groups.length > 0);
        const shouldMergeStockOnly = hasOpenStructure;
        const sourceFiles = ((data as any)?.sourceFiles || {}) as any;
        const globalStockSyncedAt = getGlobalStockTimestampRaw(globalStockMeta);
        const hasNewerGlobalStock = isGlobalStockDifferentFromApplied(sourceFiles, globalStockMeta);
        const shouldReclassifyOpen = hasOpenStructure && hasStructureFiles && hasNewerGlobalStock;
        const mergePreservingDone = (
            baseData: AuditData,
            rebuiltData: AuditData
        ): {
            merged: AuditData;
            ignored: {
                closedGroups: number;
                closedDepartments: number;
                categories: number;
                skus: number;
                units: number;
            };
        } => {
            const cloneCategory = (cat: Category): Category => ({ ...cat, products: [...(cat.products || [])] });
            const cloneDepartment = (dept: Department): Department => ({
                ...dept,
                categories: (dept.categories || []).map(cloneCategory)
            });
            const cloneGroup = (group: Group): Group => ({
                ...group,
                departments: (group.departments || []).map(cloneDepartment)
            });

            const normalizeRawKey = (value: unknown) => String(value ?? '').trim();
            const normalizeDigitsKey = (value: unknown) =>
                normalizeRawKey(value).replace(/\D/g, '').replace(/^0+/, '');
            const normalizeLabelKey = (value: unknown) => normalizeLookupText(String(value ?? ''));

            const isSameGroup = (a: Group, b: Group) => {
                const aIdRaw = normalizeRawKey(a.id);
                const bIdRaw = normalizeRawKey(b.id);
                const aIdDigits = normalizeDigitsKey(a.id);
                const bIdDigits = normalizeDigitsKey(b.id);
                const byRawId = !!aIdRaw && !!bIdRaw && aIdRaw === bIdRaw;
                const byDigits = !!aIdDigits && !!bIdDigits && aIdDigits === bIdDigits;
                if ((aIdRaw || aIdDigits) && (bIdRaw || bIdDigits)) {
                    return byRawId || byDigits;
                }
                const byName = normalizeLabelKey(a.name) && normalizeLabelKey(a.name) === normalizeLabelKey(b.name);
                return byRawId || byDigits || byName;
            };

            const isSameDept = (a: Department, b: Department) => {
                const aIdRaw = normalizeRawKey(a.id);
                const bIdRaw = normalizeRawKey(b.id);
                const aNumRaw = normalizeRawKey((a as any).numericId);
                const bNumRaw = normalizeRawKey((b as any).numericId);
                const aNumDigits = normalizeDigitsKey(aNumRaw || aIdRaw);
                const bNumDigits = normalizeDigitsKey(bNumRaw || bIdRaw);
                const byRawId = !!aIdRaw && !!bIdRaw && aIdRaw === bIdRaw;
                const byNumeric = !!aNumDigits && !!bNumDigits && aNumDigits === bNumDigits;
                const byName = normalizeLabelKey(a.name) && normalizeLabelKey(a.name) === normalizeLabelKey(b.name);
                return byRawId || byNumeric || byName;
            };

            const findBaseGroup = (group: Group) =>
                (baseData.groups || []).find(bg => isSameGroup(bg, group));
            const findBaseDept = (baseGroup: Group | undefined, dept: Department) =>
                (baseGroup?.departments || []).find(bd => isSameDept(bd, dept));
            const isDeptClosed = (dept?: Department) =>
                !!dept && (dept.categories || []).length > 0 && (dept.categories || []).every(c => isDoneStatus(c.status));
            const isGroupClosed = (group?: Group) => {
                if (!group) return false;
                const cats = (group.departments || []).flatMap(d => d.categories || []);
                return cats.length > 0 && cats.every(c => isDoneStatus(c.status));
            };
            const summarizeCategories = (categories: Category[] = []) => categories.reduce((acc, cat) => {
                acc.categories += 1;
                acc.skus += Number(cat.itemsCount || 0);
                acc.units += Number(cat.totalQuantity || 0);
                return acc;
            }, { categories: 0, skus: 0, units: 0 });
            const summarizeDepartment = (dept?: Department) =>
                summarizeCategories((dept?.categories || []) as Category[]);
            const summarizeGroup = (group?: Group) => (group?.departments || []).reduce((acc, dept) => {
                const current = summarizeDepartment(dept);
                acc.categories += current.categories;
                acc.skus += current.skus;
                acc.units += current.units;
                return acc;
            }, { categories: 0, skus: 0, units: 0 });
            const ignored = {
                closedGroups: 0,
                closedDepartments: 0,
                categories: 0,
                skus: 0,
                units: 0
            };

            const rebuiltFilteredGroups = rebuiltData.groups.map(group => {
                const baseGroup = findBaseGroup(group);
                if (isGroupClosed(baseGroup)) {
                    // Grupo concluído: congela a estrutura inteira como estava.
                    const blockedGroup = summarizeGroup(group);
                    ignored.closedGroups += 1;
                    ignored.categories += blockedGroup.categories;
                    ignored.skus += blockedGroup.skus;
                    ignored.units += blockedGroup.units;
                    return cloneGroup(baseGroup!);
                }

                const nextDepartments = group.departments.map(dept => {
                    const baseDept = findBaseDept(baseGroup, dept);
                    if (isDeptClosed(baseDept)) {
                        // Departamento concluído: não aceita categoria nova.
                        const blockedDept = summarizeDepartment(dept);
                        ignored.closedDepartments += 1;
                        ignored.categories += blockedDept.categories;
                        ignored.skus += blockedDept.skus;
                        ignored.units += blockedDept.units;
                        return cloneDepartment(baseDept!);
                    }
                    return {
                        ...dept,
                        categories: (dept.categories || []).map(cloneCategory)
                    };
                });

                // Garante manutenção de departamentos já concluídos que não vieram no rebuild.
                (baseGroup?.departments || []).forEach(baseDept => {
                    if (!isDeptClosed(baseDept)) return;
                    const alreadyIncluded = nextDepartments.some(
                        d => d.id === baseDept.id || d.name === baseDept.name
                    );
                    if (!alreadyIncluded) nextDepartments.push(cloneDepartment(baseDept));
                });

                return {
                    ...group,
                    departments: nextDepartments
                };
            });

            const merged: AuditData = {
                ...rebuiltData,
                termDrafts: baseData.termDrafts,
                postAuditAdjustments: normalizePostAuditAdjustments((baseData as any).postAuditAdjustments),
                partialStarts: baseData.partialStarts,
                partialCompleted: baseData.partialCompleted,
                lastPartialBatchId: baseData.lastPartialBatchId,
                groups: rebuiltFilteredGroups
            };
            const ensureGroup = (groupId: string, groupName: string) => {
                const probe: Group = { id: groupId, name: groupName, departments: [] };
                let g = merged.groups.find(x => isSameGroup(x, probe));
                if (!g) {
                    g = { id: groupId, name: groupName, departments: [] };
                    merged.groups.push(g);
                }
                return g;
            };
            const ensureDept = (group: Group, dept: Department) => {
                let d = group.departments.find(x => isSameDept(x, dept));
                if (!d) {
                    d = { ...dept, categories: [] };
                    group.departments.push(d);
                }
                return d;
            };

            baseData.groups.forEach(oldGroup => {
                oldGroup.departments.forEach(oldDept => {
                    oldDept.categories.forEach(oldCat => {
                        if (!isDoneStatus(oldCat.status)) return;
                        const group = ensureGroup(String(oldGroup.id), oldGroup.name);
                        const dept = ensureDept(group, oldDept);
                        const catId = oldCat.id;
                        const idx = dept.categories.findIndex(c => c.id === catId || c.name === oldCat.name);
                        if (idx >= 0) dept.categories[idx] = { ...oldCat };
                        else dept.categories.push({ ...oldCat });
                    });
                });
            });
            const dedupedGroups: Group[] = [];
            merged.groups.forEach(group => {
                let targetGroup = dedupedGroups.find(existing => isSameGroup(existing, group));
                if (!targetGroup) {
                    dedupedGroups.push(cloneGroup(group));
                    return;
                }

                group.departments.forEach(dept => {
                    let targetDept = targetGroup!.departments.find(existing => isSameDept(existing, dept));
                    if (!targetDept) {
                        targetGroup!.departments.push(cloneDepartment(dept));
                        return;
                    }

                    (dept.categories || []).forEach(cat => {
                        const catIdx = (targetDept!.categories || []).findIndex(existing =>
                            existing.id === cat.id || existing.name === cat.name
                        );
                        if (catIdx >= 0) {
                            const existingCat = targetDept!.categories[catIdx];
                            const incomingStatus = normalizeAuditStatus(cat.status);
                            const existingStatus = normalizeAuditStatus(existingCat.status);
                            const statusRank = (s: AuditStatus) =>
                                s === AuditStatus.DONE ? 3 : s === AuditStatus.IN_PROGRESS ? 2 : 1;
                            const keepIncoming =
                                statusRank(incomingStatus) > statusRank(existingStatus) ||
                                (statusRank(incomingStatus) === statusRank(existingStatus) &&
                                    (cat.products?.length || 0) > (existingCat.products?.length || 0));
                            if (keepIncoming) {
                                targetDept!.categories[catIdx] = cloneCategory(cat);
                            }
                        } else {
                            targetDept!.categories.push(cloneCategory(cat));
                        }
                    });
                });
            });
            merged.groups = dedupedGroups;
            return { merged, ignored };
        };

        if (!effectiveStockFile) {
            alert("Arquivo de estoque não encontrado no Cadastro Base. Carregue o estoque no Cadastro Base e tente novamente.");
            return;
        }

        if (!shouldMergeStockOnly && !hasStructureFiles) {
            alert("Por favor, carregue ao menos um arquivo de CADASTRO por grupo para classificar a estrutura.");
            return;
        }

        if (shouldMergeStockOnly && !data) {
            alert("Não existe auditoria aberta para atualizar apenas saldos.");
            return;
        }

        if (shouldReclassifyOpen && data) {
            if (!window.confirm("Reclassificar a estrutura aberta com os novos arquivos carregados?")) {
                return;
            }
        } else if (!shouldMergeStockOnly) {
            if (!window.confirm(`ATENÇÃO: Você está prestes a criar um NOVO inventário (Nº ${nextAuditNumber}) para a Filial ${selectedFilial}.\n\nDeseja realmente prosseguir?`)) {
                return;
            }
        }

        setIsProcessing(true);
        try {
            const safePartialStarts = Array.isArray(data?.partialStarts) ? data.partialStarts : [];

            if (shouldMergeStockOnly && data && !shouldReclassifyOpen) {
                const stockSource = globalStockMeta ? 'global_base' : 'local_upload';
                const syncedAt = getGlobalStockTimestampRaw(globalStockMeta);
                await applyStockMergeToOpenAudit(effectiveStockFile!, {
                    source: stockSource,
                    syncedAt,
                    notify: true
                });
                return;
            }

            if (!hasStructureFiles) {
                alert("Carregue arquivos de CADASTRO por grupo para reclassificar.");
                return;
            }

            const rowsGroupsByFile = await Promise.all(effectiveGroupFiles.map(entry => readExcel(entry.file)));
            const rowsStock = await readExcel(effectiveStockFile);

            type ProductScope = { groupId: string; groupName: string; deptId: string; deptName: string; catId: string; catName: string };
            const productsByReduced: Record<string, ProductScope[]> = {};
            const productsByName: Record<string, ProductScope[]> = {};
            const catReportByReduced: Record<string, { catId: string; catName: string; deptName: string }> = {};
            const deptReportByReduced: Record<string, { deptId: string; deptName: string }> = {};
            const deptReportByName: Record<string, { deptId: string; deptName: string }> = {};
            const catReportByName: Record<string, { catId: string; catName: string; deptName: string }> = {};
            const deptIdByDescription: Record<string, string> = {};
            const catIdByDescription: Record<string, string> = {};
            const deptDescEntries: Array<{ key: string; id: string }> = [];
            const catDescEntries: Array<{ key: string; id: string }> = [];

            const normalizeDescriptionKey = (value: unknown) =>
                normalizeLookupText(cleanDescription(String(value ?? '')));

            const superClean = (str: unknown) => 
                normalizeDescriptionKey(str).replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

            const isStrictBarcode = (val: any, index?: number) => {
                if (val == null || val === '') return false;
                let s = String(val).trim().replace(/^'/, '');
                if (/^\d+(?:-\d+)?(?:[.,]0+)?$/.test(s)) {
                    const numOnly = s.replace(/\D/g, '');
                    return numOnly.length >= (index === 1 ? 1 : 3);
                }
                return false;
            };

            const fillIdByDescription = (
                rows: any[][],
                output: Record<string, string>,
                entries: Array<{ key: string; id: string }>
            ) => {
                rows.forEach(row => {
                    if (!row) return;
                    const idNum = parseSheetNumericCode(row[5]); // F = numero
                    const descKey = normalizeDescriptionKey(row[7]); // H = descricao
                    if (idNum === null || !descKey) return;
                    if (!output[descKey]) output[descKey] = String(idNum);
                    entries.push({ key: descKey, id: String(idNum) });
                });
            };

            const resolveIdByDescription = (
                rawDesc: unknown,
                map: Record<string, string>,
                entries: Array<{ key: string; id: string }>
            ) => {
                const key = normalizeDescriptionKey(rawDesc);
                if (!key) return '';
                if (map[key]) return map[key];
                // Fallback tolerante para descricoes com sufixos/prefixos nos relatorios.
                const candidates = entries.filter(e =>
                    e.key === key ||
                    e.key.includes(key) ||
                    key.includes(e.key)
                );
                if (candidates.length === 1) return candidates[0].id;
                return '';
            };

            if (effectiveDeptIdsFile) {
                const rowsDept = await readExcel(effectiveDeptIdsFile);
                fillIdByDescription(rowsDept, deptIdByDescription, deptDescEntries);
                let lastDeptId = "";
                let lastDeptName = "";
                rowsDept.forEach(row => {
                    if (!row) return;
                    const deptIdNow = parseSheetNumericCode(row[5]); // F
                    if (deptIdNow !== null) lastDeptId = String(deptIdNow);
                    const deptNameNowRaw = String(row[7] ?? '').trim(); // H
                    if (deptNameNowRaw) lastDeptName = deptNameNowRaw.replace(/^\s*(?:-|:|\/|\.)+\s*/, '').trim();

                    const firstCell = String(row[0] ?? '').trim();
                    if (firstCell.toUpperCase().startsWith("DEPARTAMENTO") || /^\d+\s*-\s*[A-Z]/.test(firstCell)) {
                        const parsed = parseHierarchyCell(firstCell.replace(/^DEPARTAMENTO:?\s*/i, ""), "");
                        if (parsed.name && parsed.name !== "OUTROS" && parsed.name !== "GERAL") {
                            lastDeptId = parsed.numericId || lastDeptId;
                            lastDeptName = parsed.name;
                        }
                    }
                    
                    let inlineDeptId = lastDeptId;
                    let inlineDeptName = lastDeptName;
                    
                    const cellId18 = parseSheetNumericCode(row[18]);
                    const cellName18 = parseHierarchyCell(row[18], "").name;
                    const cellName19 = String(row[19] || "").trim();

                    if (cellId18 !== null) {
                        inlineDeptId = String(cellId18);
                    }
                    if (cellName19 && cellName19.toUpperCase() !== "OUTROS") {
                        inlineDeptName = cellName19;
                    } else if (cellName18 && cellName18.toUpperCase() !== "OUTROS") {
                        inlineDeptName = cellName18;
                    }
                    
                    // Clear numeric ID if it's an unclassified bucket to prevent collision
                    if (inlineDeptName.toUpperCase().includes('SEM DEPARTAMENTO') || inlineDeptName.toUpperCase().includes('SEM CATEGORIA') || inlineDeptName.toUpperCase() === 'OUTROS') {
                        inlineDeptId = "";
                    }
                    
                    let rowName = "";
                    for (let i = 0; i < Math.min(row.length, 10); i++) {
                        const val = String(row[i] || "").trim().replace(/^'/, '');
                        if (val.length > 3 && /[a-zA-Z]/.test(val) && val.length > rowName.length) {
                            rowName = val;
                        }
                    }
                    const nameKey = superClean(rowName);

                    const deptData = { deptId: inlineDeptId, deptName: inlineDeptName };

                    for (let i = 0; i < Math.min(row.length, 20); i++) {
                        if (isStrictBarcode(row[i], i)) {
                            const red = normalizeBarcode(row[i]);
                            if (red) deptReportByReduced[red] = deptData;
                        }
                    }

                    if (nameKey) deptReportByName[nameKey] = deptData;
                });
            }

            if (effectiveCatIdsFile) {
                const rowsCat = await readExcel(effectiveCatIdsFile);
                fillIdByDescription(rowsCat, catIdByDescription, catDescEntries);
                let lastCatId = "";
                let lastCatName = "";
                rowsCat.forEach(row => {
                    if (!row) return;
                    const catIdNow = parseSheetNumericCode(row[5]); // F
                    if (catIdNow !== null) lastCatId = String(catIdNow);
                    const catNameNowRaw = String(row[7] ?? '').trim(); // H
                    if (catNameNowRaw) lastCatName = catNameNowRaw.replace(/^\s*(?:-|:|\/|\.)+\s*/, '').trim();
                    
                    const firstCell = String(row[0] ?? '').trim();
                    if (firstCell.toUpperCase().startsWith("CATEGORIA") || /^\d+\s*-\s*[A-Z]/.test(firstCell)) {
                        const parsed = parseHierarchyCell(firstCell.replace(/^CATEGORIA:?\s*/i, ""), "");
                        if (parsed.name && parsed.name !== "OUTROS" && parsed.name !== "GERAL") {
                            lastCatId = parsed.numericId || lastCatId;
                            lastCatName = parsed.name;
                        }
                    }

                    let inlineCatId = lastCatId;
                    let inlineCatName = lastCatName;
                    
                    const cellId22 = parseSheetNumericCode(row[22]);
                    const cellName22 = parseHierarchyCell(row[22], "").name;
                    const cellName23 = String(row[23] || "").trim();

                    if (cellId22 !== null) {
                        inlineCatId = String(cellId22);
                    }
                    if (cellName23 && cellName23.toUpperCase() !== "GERAL") {
                        inlineCatName = cellName23;
                    } else if (cellName22 && cellName22.toUpperCase() !== "GERAL") {
                        inlineCatName = cellName22;
                    }
                    
                    // Clear numeric ID if it's an unclassified bucket to prevent collision
                    if (inlineCatName.toUpperCase().includes('SEM DEPARTAMENTO') || inlineCatName.toUpperCase().includes('SEM CATEGORIA') || inlineCatName.toUpperCase() === 'OUTROS' || inlineCatName.toUpperCase() === 'GERAL') {
                        inlineCatId = "";
                    }

                    let rowName = "";
                    for (let i = 0; i < Math.min(row.length, 10); i++) {
                        const val = String(row[i] || "").trim().replace(/^'/, '');
                        if (val.length > 3 && /[a-zA-Z]/.test(val) && val.length > rowName.length) {
                            rowName = val;
                        }
                    }
                    const nameKey = superClean(rowName);

                    let deptName = String(row[19] ?? '').trim(); // T
                    if (!deptName && row[18]) {
                        deptName = parseHierarchyCell(row[18], "").name;
                    }

                    const catData = { catId: inlineCatId, catName: inlineCatName, deptName };

                    for (let i = 0; i < Math.min(row.length, 20); i++) {
                        if (isStrictBarcode(row[i], i)) {
                            const red = normalizeBarcode(row[i]);
                            if (red) catReportByReduced[red] = catData;
                        }
                    }

                    if (nameKey) catReportByName[nameKey] = catData;
                });
            }

            const addScope = (bucket: Record<string, ProductScope[]>, key: string, scope: ProductScope) => {
                if (!key) return;
                const deptKey = scope.deptId || scope.deptName;
                const catKey = scope.catId || scope.catName;
                const scopeKey = `${scope.groupId}|${deptKey}|${catKey}`;
                const list = bucket[key] || [];
                if (!list.some(s => {
                    const existingDeptKey = s.deptId || s.deptName;
                    const existingCatKey = s.catId || s.catName;
                    return `${s.groupId}|${existingDeptKey}|${existingCatKey}` === scopeKey;
                })) {
                    list.push(scope);
                    bucket[key] = list;
                }
            };

            const normalizeHierarchyLabel = (value: unknown) =>
                normalizeLookupText(String(value ?? ''));
            const isPlaceholderDeptName = (value: unknown) => {
                const label = normalizeHierarchyLabel(value);
                return !label || label === 'outros' || label === 'geral' || isDiversosLabel(String(value ?? ''));
            };
            const isPlaceholderCatName = (value: unknown) => {
                const label = normalizeHierarchyLabel(value);
                return !label || label === 'geral' || label === 'outros' || isDiversosLabel(String(value ?? ''));
            };
            const scopeFallbackBuckets = new Map<string, { scope: ProductScope; count: number }>();
            const deptFallbackBuckets = new Map<string, { scope: ProductScope; count: number }>();
            const groupFallbackScopeById: Record<string, ProductScope> = {};
            const deptFallbackScopeByKey: Record<string, ProductScope> = {};
            const upsertFallbackBucket = (
                bucket: Map<string, { scope: ProductScope; count: number }>,
                key: string,
                scope: ProductScope
            ) => {
                if (!key) return;
                const current = bucket.get(key);
                if (current) {
                    current.count += 1;
                } else {
                    bucket.set(key, { scope, count: 1 });
                }
            };
            const registerFallbackScope = (scope: ProductScope) => {
                if (!scope.groupId || isPlaceholderDeptName(scope.deptName) || isPlaceholderCatName(scope.catName)) return;
                const groupKey = normalizeScopeId(scope.groupId);
                if (!groupKey || !ALLOWED_IDS.includes(Number(groupKey))) return;
                const scopeKey = `${groupKey}|${normalizeScopeId(scope.deptId) || normalizeHierarchyLabel(scope.deptName)}|${normalizeScopeId(scope.catId) || normalizeHierarchyLabel(scope.catName)}`;
                upsertFallbackBucket(scopeFallbackBuckets, scopeKey, scope);
                const deptKey = `${groupKey}|${normalizeScopeId(scope.deptId) || normalizeHierarchyLabel(scope.deptName)}|${scopeKey}`;
                upsertFallbackBucket(deptFallbackBuckets, deptKey, scope);
            };
            const rebuildFallbackScopes = () => {
                const bestByGroup = new Map<string, { scope: ProductScope; count: number }>();
                scopeFallbackBuckets.forEach(entry => {
                    const groupKey = normalizeScopeId(entry.scope.groupId);
                    const current = bestByGroup.get(groupKey);
                    if (!current || entry.count > current.count) bestByGroup.set(groupKey, entry);
                });
                bestByGroup.forEach((entry, groupKey) => {
                    groupFallbackScopeById[groupKey] = entry.scope;
                });

                const bestByDept = new Map<string, { scope: ProductScope; count: number }>();
                deptFallbackBuckets.forEach((entry, key) => {
                    const [groupKey, deptKey] = key.split('|');
                    const bestKey = `${groupKey}|${deptKey}`;
                    const current = bestByDept.get(bestKey);
                    if (!current || entry.count > current.count) bestByDept.set(bestKey, entry);
                });
                bestByDept.forEach((entry, key) => {
                    deptFallbackScopeByKey[key] = entry.scope;
                });
            };
            const getHierarchyFallbackScope = (scope: ProductScope) => {
                const groupKey = normalizeScopeId(scope.groupId);
                if (!groupKey) return null;
                const deptKey = normalizeScopeId(scope.deptId) || normalizeHierarchyLabel(scope.deptName);
                if (deptKey) {
                    const deptFallback = deptFallbackScopeByKey[`${groupKey}|${deptKey}`];
                    if (deptFallback) return deptFallback;
                }
                return groupFallbackScopeById[groupKey] || null;
            };

            const groupFileRows = effectiveGroupFiles.map((entry, idx) => ({
                groupId: entry.groupId,
                rows: rowsGroupsByFile[idx] || []
            }));

            groupFileRows.forEach(({ groupId, rows }) => {
                const groupName = GROUP_CONFIG_DEFAULTS[groupId] || `Grupo ${groupId}`;

                rows.forEach((row) => {
                    if (!row || row.length < 4) return;

                    const productCodeCandidates = collectProductCodeCandidates(row, 12);
                    if (productCodeCandidates.length === 0) return;

                    let productNameKeyStr = "";
                    for (let i = 0; i < Math.min(row.length, 10); i++) {
                        const val = String(row[i] || "").trim().replace(/^'/, '');
                        if (val.length > 3 && /[a-zA-Z]/.test(val) && val.length > productNameKeyStr.length) {
                            productNameKeyStr = val;
                        }
                    }
                    const productNameKey = superClean(productNameKeyStr);

                    const deptCell = parseHierarchyCells(row[18], row[19], "OUTROS", ['GERAL']);
                    const catCell = parseHierarchyCells(row[22], row[23], "GERAL", ['GERAL']);
                    const deptResolvedId = deptCell.numericId || resolveIdByDescription(deptCell.name || row[19] || row[18], deptIdByDescription, deptDescEntries);
                    const catResolvedId = catCell.numericId || resolveIdByDescription(catCell.name || row[23] || row[22], catIdByDescription, catDescEntries);

                    const scope: ProductScope = {
                        groupId,
                        groupName,
                        deptId: deptResolvedId,
                        deptName: deptCell.name,
                        catId: catResolvedId,
                        catName: catCell.name
                    };

                    productCodeCandidates.forEach(codeCandidate => addScope(productsByReduced, codeCandidate, scope));
                    addScope(productsByName, productNameKey, scope);
                    registerFallbackScope(scope);
                });
            });

            rebuildFallbackScopes();

            const stockAcc: Record<string, { q: number; costAmount: number; name: string; groupId: string; barcodeAliases: string[] }> = {};
            const groupsMap: Record<string, Group> = {};
            rowsStock.forEach((row) => {
                if (!row) return;
                const reduced = normalizeBarcode(row[1]); // B
                if (!reduced) return;
                const barcodeAliases = collectProductCodeCandidates(row, 12).filter(code => code && code !== reduced);
                const productName = row[2]?.toString() || row[4]?.toString() || "Sem Descrição";
                const stockQty = parseStockNumber(row[14]); // O
                const stockCost = parseStockNumber(row[15]); // P
                const stockGroupNum = parseSheetNumericCode(row[6]); // G
                const stockGroupId = stockGroupNum !== null ? String(stockGroupNum) : '';
                if (stockQty <= 0) return;

                const prev = stockAcc[reduced] || { q: 0, costAmount: 0, name: productName, groupId: stockGroupId, barcodeAliases: [] };
                stockAcc[reduced] = {
                    q: prev.q + stockQty,
                    costAmount: prev.costAmount + (stockQty * stockCost),
                    name: prev.name || productName,
                    groupId: prev.groupId || stockGroupId,
                    barcodeAliases: Array.from(new Set([...prev.barcodeAliases, ...barcodeAliases]))
                };
            });

            const UNCLASSIFIED_GROUP_ID = '99999';
            const UNCLASSIFIED_GROUP_NAME = 'NAO CLASSIFICADO (SEM GRUPO)';
            const UNCLASSIFIED_DEPT_NAME = 'NAO CLASSIFICADO (SEM DEPARTAMENTO)';
            const UNCLASSIFIED_CAT_NAME = 'NAO CLASSIFICADO (SEM CATEGORIA)';
            const normalizeKeyRaw = (value: unknown) => String(value ?? '').trim();
            const normalizeKeyDigits = (value: unknown) =>
                normalizeKeyRaw(value).replace(/\D/g, '').replace(/^0+/, '');
            const normalizeKeyLabel = (value: unknown) => normalizeLookupText(String(value ?? ''));
            const resolveGroupKey = (groupId: unknown, groupName: unknown) =>
                normalizeKeyDigits(groupId) || normalizeKeyLabel(groupName) || normalizeKeyRaw(groupId);
            const resolveDeptKey = (deptId: unknown, deptName: unknown) =>
                normalizeKeyDigits(deptId) || normalizeKeyLabel(deptName) || normalizeKeyRaw(deptId);
            const closedGroupKeys = new Set<string>();
            const closedDeptKeys = new Set<string>();

            if (shouldReclassifyOpen && data) {
                (data.groups || []).forEach(oldGroup => {
                    const oldGroupKey = resolveGroupKey(oldGroup.id, oldGroup.name);
                    const oldGroupCats = (oldGroup.departments || []).flatMap(d => d.categories || []);
                    const isOldGroupClosed = oldGroupCats.length > 0 && oldGroupCats.every(c => isDoneStatus(c.status));
                    if (isOldGroupClosed) {
                        closedGroupKeys.add(oldGroupKey);
                    }

                    (oldGroup.departments || []).forEach(oldDept => {
                        const oldDeptCats = oldDept.categories || [];
                        const isOldDeptClosed = oldDeptCats.length > 0 && oldDeptCats.every(c => isDoneStatus(c.status));
                        if (!isOldDeptClosed) return;
                        const oldDeptKey = resolveDeptKey((oldDept as any).numericId || oldDept.id, oldDept.name);
                        closedDeptKeys.add(`${oldGroupKey}|${oldDeptKey}`);
                    });
                });
            }

            Object.entries(stockAcc).forEach(([reduced, acc]) => {
                const avgCost = acc.q > 0 ? (acc.costAmount / acc.q) : 0;
                const nameKey = superClean(acc.name || "");
                const scopesByReduced = productsByReduced[reduced] || [];
                const scopesByName = nameKey ? (productsByName[nameKey] || []) : [];
                const scopes = scopesByReduced.length > 0 ? scopesByReduced : scopesByName;
                const manualClassification = PRODUCT_CLASSIFICATION_FIXES_BY_CODE[reduced];

                let chosenScope: ProductScope | null = manualClassification
                    ? { ...manualClassification }
                    : null;
                if (!chosenScope) {
                    if (scopes.length > 0) {
                        chosenScope = scopes.find(s => String(s.groupId) === String(acc.groupId)) || scopes[0];
                    } else {
                        const catFallback = catReportByReduced[reduced] || (nameKey ? catReportByName[nameKey] : undefined);
                        if (catFallback && acc.groupId && ALLOWED_IDS.includes(Number(acc.groupId))) {
                            const deptFallback = parseHierarchyCell(catFallback.deptName, "OUTROS");
                            chosenScope = {
                                groupId: acc.groupId,
                                groupName: GROUP_CONFIG_DEFAULTS[acc.groupId] || `Grupo ${acc.groupId}`,
                                deptId: deptFallback.numericId,
                                deptName: deptFallback.name || "OUTROS",
                                catId: catFallback.catId || "",
                                catName: catFallback.catName || "GERAL"
                            };
                        }
                    }
                }
                if (!chosenScope) {
                    const hasAllowedStockGroup =
                        !!acc.groupId && ALLOWED_IDS.includes(Number(acc.groupId));
                    const fallbackGroupId = hasAllowedStockGroup ? acc.groupId : UNCLASSIFIED_GROUP_ID;
                    const groupFallback = hasAllowedStockGroup ? groupFallbackScopeById[normalizeScopeId(fallbackGroupId)] : null;
                    chosenScope = groupFallback
                        ? { ...groupFallback }
                        : {
                            groupId: fallbackGroupId,
                            groupName: hasAllowedStockGroup
                                ? (GROUP_CONFIG_DEFAULTS[fallbackGroupId] || `Grupo ${fallbackGroupId}`)
                                : UNCLASSIFIED_GROUP_NAME,
                            deptId: '',
                            deptName: UNCLASSIFIED_DEPT_NAME,
                            catId: '',
                            catName: UNCLASSIFIED_CAT_NAME
                        };
                }
                const resolvedScope: ProductScope = { ...chosenScope };
                const deptByReduced = deptReportByReduced[reduced] || (nameKey ? deptReportByName[nameKey] : undefined);
                const catByReduced = catReportByReduced[reduced] || (nameKey ? catReportByName[nameKey] : undefined);
                if (deptByReduced) {
                    if (!resolvedScope.deptId && deptByReduced.deptId) {
                        resolvedScope.deptId = deptByReduced.deptId;
                    }
                    if ((!resolvedScope.deptName || resolvedScope.deptName === 'OUTROS' || resolvedScope.deptName === UNCLASSIFIED_DEPT_NAME) && deptByReduced.deptName) {
                        resolvedScope.deptName = deptByReduced.deptName;
                    }
                }
                if (catByReduced) {
                    if (!resolvedScope.catId && catByReduced.catId) {
                        resolvedScope.catId = catByReduced.catId;
                    }
                    if ((!resolvedScope.catName || resolvedScope.catName === 'GERAL' || resolvedScope.catName === UNCLASSIFIED_CAT_NAME) && catByReduced.catName) {
                        resolvedScope.catName = catByReduced.catName;
                    }
                    if (catByReduced.deptName) {
                        if (!resolvedScope.deptId) {
                            resolvedScope.deptId = resolveIdByDescription(catByReduced.deptName, deptIdByDescription, deptDescEntries);
                        }
                        if ((!resolvedScope.deptName || resolvedScope.deptName === 'OUTROS' || resolvedScope.deptName === UNCLASSIFIED_DEPT_NAME)) {
                            const deptParsed = parseHierarchyCell(catByReduced.deptName, "OUTROS");
                            resolvedScope.deptName = deptParsed.name || resolvedScope.deptName;
                            if (!resolvedScope.deptId && deptParsed.numericId) {
                                resolvedScope.deptId = deptParsed.numericId;
                            }
                        }
                    }
                }
                const hierarchyFallback = getHierarchyFallbackScope(resolvedScope);
                if (hierarchyFallback && (isPlaceholderDeptName(resolvedScope.deptName) || isPlaceholderCatName(resolvedScope.catName))) {
                    if (isPlaceholderDeptName(resolvedScope.deptName)) {
                        resolvedScope.deptId = hierarchyFallback.deptId;
                        resolvedScope.deptName = hierarchyFallback.deptName;
                    }
                    if (isPlaceholderCatName(resolvedScope.catName)) {
                        resolvedScope.catId = hierarchyFallback.catId;
                        resolvedScope.catName = hierarchyFallback.catName;
                    }
                }

                const finalGroupId = resolvedScope.groupId;
                const finalGroupName = resolvedScope.groupName;
                const finalGroupKey = resolveGroupKey(finalGroupId, finalGroupName);
                const finalDeptKey = resolveDeptKey(resolvedScope.deptId || resolvedScope.deptName, resolvedScope.deptName);
                if (closedGroupKeys.has(finalGroupKey) || closedDeptKeys.has(`${finalGroupKey}|${finalDeptKey}`)) {
                    return;
                }
                if (!groupsMap[finalGroupId]) groupsMap[finalGroupId] = { id: finalGroupId, name: finalGroupName, departments: [] };

                const deptIdentity = resolvedScope.deptId || resolvedScope.deptName;
                let dept = groupsMap[finalGroupId].departments.find(d => d.id === deptIdentity || d.name === resolvedScope.deptName);
                if (!dept) {
                    dept = {
                        id: deptIdentity,
                        numericId: resolvedScope.deptId || undefined,
                        name: resolvedScope.deptName,
                        categories: []
                    };
                    groupsMap[finalGroupId].departments.push(dept);
                } else if (!dept.numericId && resolvedScope.deptId) {
                    dept.numericId = resolvedScope.deptId;
                }

                const catIdentity = resolvedScope.catId || resolvedScope.catName;
                const catNodeId = `${finalGroupId}-${deptIdentity}-${catIdentity}`;
                let cat = dept.categories.find(c => c.id === catNodeId || c.name === resolvedScope.catName);
                if (!cat) {
                    cat = {
                        id: catNodeId,
                        numericId: resolvedScope.catId || undefined,
                        name: resolvedScope.catName,
                        itemsCount: 0,
                        totalQuantity: 0,
                        totalCost: 0,
                        status: AuditStatus.TODO,
                        products: []
                    };
                    dept.categories.push(cat);
                } else if (!cat.numericId && resolvedScope.catId) {
                    cat.numericId = resolvedScope.catId;
                }

                cat.itemsCount++;
                cat.totalQuantity += acc.q;
                cat.totalCost += (acc.q * avgCost);
                const cadastroAliases = cadastroBarcodeAliasesByReduced[normalizeProductLookupCode(reduced)] || [];
                const allBarcodeAliases = Array.from(new Set([...acc.barcodeAliases, ...cadastroAliases]));
                const primaryBarcode = allBarcodeAliases.find(code => code.length >= 8) || allBarcodeAliases[0] || '';
                cat.products.push({
                    code: primaryBarcode || reduced,
                    reducedCode: reduced,
                    barcode: primaryBarcode || undefined,
                    barcodeAliases: allBarcodeAliases,
                    name: acc.name,
                    quantity: acc.q,
                    cost: avgCost
                });
            });

            const nextData: AuditData = {
                groups: Object.values(groupsMap).sort((a, b) => parseInt(a.id.split('+')[0]) - parseInt(b.id.split('+')[0])),
                empresa: selectedEmpresa,
                filial: selectedFilial,
                inventoryNumber: inventoryNumber.trim()
            };
            const mergeResult = (shouldReclassifyOpen && data) ? mergePreservingDone(data, nextData) : null;
            const finalData = mergeResult?.merged || nextData;
            const finalTermDrafts = (shouldReclassifyOpen && data)
                ? (composeTermDraftsForPersist(((data as any).termDrafts || {}) as Record<string, TermForm>, termDrafts) as Record<string, any>)
                : {};
            const finalPostAuditAdjustments = (shouldReclassifyOpen && data)
                ? normalizePostAuditAdjustments((data as any).postAuditAdjustments)
                : [];
            const basePersistedData = {
                ...finalData,
                postAuditAdjustments: finalPostAuditAdjustments,
                termDrafts: finalTermDrafts,
                sourceFiles: buildStructureSourceMeta({ stockSyncedAt: getGlobalStockTimestampRaw(globalStockMeta) })
            } as any;
            const persistedData = applyPartialScopes(
                basePersistedData,
                shouldReclassifyOpen ? safePartialStarts : []
            );
            const progress = calculateProgress(finalData);
            const savedSession = await persistAuditSession({
                id: dbSessionId,
                branch: selectedFilial,
                audit_number: nextAuditNumber,
                status: 'open',
                data: persistedData,
                progress: progress,
                user_email: userEmail
            }, { allowProgressRegression: !!shouldReclassifyOpen, allowCreate: !shouldReclassifyOpen });
            if (!savedSession) {
                throw new Error("Falha ao salvar auditoria inicial no Banco de Dados.");
            }

            setDbSessionId(savedSession.id);
            setNextAuditNumber(savedSession.audit_number);
            setAllowActiveAuditAutoOpen(true);
            setTermDrafts(finalTermDrafts as any);
            setData((savedSession.data as AuditData) || finalData);
            setGroupFiles(createInitialGroupFiles());
            setFileDeptIds(null);
            setFileCatIds(null);
            setFileStock(null);
            setIsUpdatingStock(false);
            setView({ level: 'groups' });
            if (mergeResult && (mergeResult.ignored.closedGroups > 0 || mergeResult.ignored.closedDepartments > 0)) {
                alert(
                    `Reclassificação concluída com bloqueio de escopo finalizado.\n\n` +
                    `Grupos concluídos bloqueados: ${mergeResult.ignored.closedGroups}\n` +
                    `Departamentos concluídos bloqueados: ${mergeResult.ignored.closedDepartments}\n` +
                    `Categorias ignoradas: ${mergeResult.ignored.categories.toLocaleString('pt-BR')}\n` +
                    `SKUs ignorados: ${mergeResult.ignored.skus.toLocaleString('pt-BR')}\n` +
                    `Unidades ignoradas: ${Math.round(mergeResult.ignored.units).toLocaleString('pt-BR')}`
                );
            }
        } catch (err) {
            const detail = err instanceof Error
                ? err.message
                : (typeof err === 'string' ? err : 'Falha desconhecida');
            alert(`Erro ao processar/salvar arquivos da auditoria.\n\nDetalhe: ${detail}`);
            console.error('Erro detalhado em handleStartAudit:', {
                detail,
                selectedFilial,
                nextAuditNumber,
                hasOpenStructure: !!(data && data.groups && data.groups.length > 0),
                hasStructureFiles: effectiveGroupFiles.length > 0
            }, err);
        }
        finally { setIsProcessing(false); }
    };

    const handleLoadFromTrier = async () => {
        if (isReadOnlyCompletedView) {
            alert("Modo consulta ativo: este inventário concluído não pode ser editado.");
            return;
        }
        if (!selectedFilial) {
            alert("Selecione a filial antes de carregar do Trier.");
            return;
        }
        if (!inventoryNumber.trim()) {
            alert("Informe o número do inventário.");
            return;
        }
        setIsTrierLoading(true);
        setTrierError(null);
        try {
            const params = new URLSearchParams({
                filial: selectedFilial,
                empresa: selectedEmpresa
            });
            const response = await fetch(`${TRIER_API_BASE}/audit/bootstrap?${params.toString()}`);
            if (!response.ok) {
                let detail = "";
                try {
                    const body = await response.json();
                    detail = body?.detail || body?.message || "";
                } catch {
                    detail = "";
                }
                throw new Error(buildTrierErrorMessage(response.status, detail));
            }
            const payload = await response.json();
            if (!payload || !payload.groups) {
                throw new Error("Resposta invalida do servidor Trier.");
            }
            const preservedTermDrafts = composeTermDraftsForPersist((((data as any)?.termDrafts || {}) as Record<string, TermForm>), termDrafts) as Record<string, any>;
            const nextData = {
                ...payload,
                inventoryNumber: inventoryNumber.trim() || payload.inventoryNumber || "",
                termDrafts: preservedTermDrafts
            };
            const progress = calculateProgress(nextData as AuditData);
            const savedSession = await persistAuditSession({
                id: dbSessionId,
                branch: selectedFilial,
                audit_number: nextAuditNumber,
                status: 'open',
                data: { ...nextData, termDrafts: composeTermDraftsForPersist((((nextData as any)?.termDrafts || {}) as Record<string, TermForm>), (((data as any)?.termDrafts || {}) as Record<string, TermForm>), termDrafts) } as any,
                progress: progress,
                user_email: userEmail
            }, { allowCreate: !dbSessionId });
            if (!savedSession) {
                throw new Error("Falha ao salvar dados iniciais do Trier no Supabase.");
            }

            setDbSessionId(savedSession.id);
            setNextAuditNumber(savedSession.audit_number);
            setAllowActiveAuditAutoOpen(true);
            setTermDrafts(preservedTermDrafts as any);
            setData((savedSession.data as AuditData) || (nextData as AuditData));
            setView({ level: 'groups' });
            setInitialDoneUnits(0);
            setSessionStartTime(Date.now());
            setGroupFiles(createInitialGroupFiles());
            setFileStock(null);
            setFileDeptIds(null);
            setFileCatIds(null);
        } catch (err: any) {
            setTrierError(mapFetchError(err));
        } finally {
            setIsTrierLoading(false);
        }
    };

    const buildTrierErrorMessage = (status: number, detail?: string) => {
        if (status === 401 || status === 498) return "Token invalido ou expirado.";
        if (status === 404) return "Endpoint do backend nao encontrado.";
        if (status === 502) {
            if (detail?.includes("ConnectTimeout")) return "Timeout ao conectar no Trier.";
            return "SGF offline ou nao acessivel no momento.";
        }
        if (detail) return `Erro Trier (${status}): ${detail}`;
        return `Erro Trier (${status}).`;
    };

    const mapFetchError = (err: any) => {
        const message = String(err?.message || err || "");
        if (
            message.includes("Failed to fetch") ||
            message.includes("NetworkError") ||
            message.includes("ERR_CONNECTION_REFUSED")
        ) {
            return `Backend offline ou bloqueado (${TRIER_API_BASE}).`;
        }
        return message || "Falha ao carregar dados do Trier.";
    };

    const branchMetrics = useMemo(() => {
        if (!data) return { skus: 0, units: 0, cost: 0, doneSkus: 0, doneUnits: 0, doneCost: 0, progress: 0, pendingUnits: 0, pendingSkus: 0, pendingCost: 0, totalCategories: 0, doneCategories: 0 };
        let fallbackSkus = 0, fallbackDoneSkus = 0, units = 0, cost = 0, doneUnits = 0, doneCost = 0, totalCats = 0, doneCats = 0;
        const skuCodes = new Set<string>();
        const doneSkuCodes = new Set<string>();
        const normalizeProductCodeLocal = (value: unknown) =>
            String(value ?? '')
                .trim()
                .replace(/\D/g, '')
                .replace(/^0+/, '');
        data.groups.forEach(g => g.departments.forEach(d => d.categories.forEach(c => {
            const done = isDoneStatus(c.status);
            const products = Array.isArray(c.products) ? c.products : [];
            if (products.length > 0) {
                products.forEach((product: any) => {
                    const code = normalizeProductCodeLocal(product?.reducedCode || product?.code);
                    if (!code) {
                        fallbackSkus += 1;
                        if (done) fallbackDoneSkus += 1;
                        return;
                    }
                    skuCodes.add(code);
                    if (done) doneSkuCodes.add(code);
                });
            } else {
                fallbackSkus += Number(c.itemsCount || 0);
                if (done) fallbackDoneSkus += Number(c.itemsCount || 0);
            }
            units += c.totalQuantity;
            cost += (c.totalCost || 0);
            totalCats++;
            if (done) {
                doneUnits += c.totalQuantity;
                doneCost += (c.totalCost || 0);
                doneCats++;
            }
        })));
        const skus = skuCodes.size + fallbackSkus;
        const doneSkus = doneSkuCodes.size + fallbackDoneSkus;
        return {
            skus, units, cost, doneSkus, doneUnits, doneCost,
            pendingUnits: units - doneUnits,
            pendingSkus: skus - doneSkus,
            pendingCost: cost - doneCost,
            totalCategories: totalCats,
            doneCategories: doneCats,
            progress: skus > 0 ? (doneSkus / skus) * 100 : 0,
            progressUnits: units > 0 ? (doneUnits / units) * 100 : 0,
            progressCost: cost > 0 ? (doneCost / cost) * 100 : 0
        };
    }, [data]);

    const productivity = useMemo(() => {
        if (!data) return { speed: 0, etaDays: 0, countedThisSession: 0 };
        const countedThisSession = Math.max(0, branchMetrics.doneUnits - initialDoneUnits);
        const elapsedHours = (Date.now() - sessionStartTime) / (1000 * 60 * 60);
        const speed = countedThisSession / Math.max(0.05, elapsedHours);
        const remainingHours = branchMetrics.pendingUnits / Math.max(1, speed);
        const etaDays = remainingHours / 8;
        return { speed, etaDays: isFinite(etaDays) ? etaDays : 0, countedThisSession };
    }, [data, branchMetrics.doneUnits, branchMetrics.pendingUnits, sessionStartTime, initialDoneUnits]);

    const calcScopeMetrics = (scope: Group | Department) => {
        let skus = 0, units = 0, cost = 0, doneSkus = 0, doneUnits = 0, doneCost = 0;
        const cats = 'departments' in scope ? scope.departments.flatMap(d => d.categories) : scope.categories;
        cats.forEach(c => {
            skus += c.itemsCount;
            units += c.totalQuantity;
            cost += (c.totalCost || 0);
            if (isDoneStatus(c.status)) {
                doneSkus += c.itemsCount;
                doneUnits += c.totalQuantity;
                doneCost += (c.totalCost || 0);
            }
        });
        return {
            skus, units, cost, doneSkus, doneUnits, doneCost,
            pendingUnits: units - doneUnits,
            pendingSkus: skus - doneSkus,
            pendingCost: cost - doneCost,
            progress: skus > 0 ? (doneSkus / skus) * 100 : 0,
            progressUnits: units > 0 ? (doneUnits / units) * 100 : 0,
            progressCost: cost > 0 ? (doneCost / cost) * 100 : 0
        };
    };

    const getDeptById = (group: Group, deptId?: string) => group.departments.find(d => d.id === deptId);

    const getScopeCategories = (groupId?: string | number, deptId?: string | number, catId?: string | number) => {
        if (!data) return [] as { group: Group; dept: Department; cat: Category }[];
        const g = data.groups.find(gr => normalizeScopeId(gr.id) === normalizeScopeId(groupId));
        if (!g) return [];
        if (catId) {
            const targetDept = deptId
                ? g.departments.find(d => normalizeScopeId(d.id) === normalizeScopeId(deptId))
                : g.departments.find(d => d.categories.some(c => normalizeScopeId(c.id) === normalizeScopeId(catId)));
            const cat = targetDept?.categories.find(c => normalizeScopeId(c.id) === normalizeScopeId(catId));
            return targetDept && cat ? [{ group: g, dept: targetDept, cat }] : [];
        }
        if (deptId) {
            const dept = g.departments.find(d => normalizeScopeId(d.id) === normalizeScopeId(deptId));
            if (!dept) return [];
            return dept.categories.map(c => ({ group: g, dept, cat: c }));
        }
        return g.departments.flatMap(d => d.categories.map(c => ({ group: g, dept: d, cat: c })));
    };

    const getPartialPercentForGroup = (group: Group, totalSkus: number) => {
        if (!data?.partialStarts || data.partialStarts.length === 0 || totalSkus <= 0) return 0;
        const catMap = new Map<string, number>();
        group.departments.forEach(d => d.categories.forEach(c => catMap.set(c.id, c.itemsCount)));
        const selected = new Set<string>();
        data.partialStarts.forEach(p => {
            if (normalizeScopeId(p.groupId) !== normalizeScopeId(group.id)) return;
            if (!p.deptId) {
                group.departments.forEach(d => d.categories.forEach(c => selected.add(c.id)));
                return;
            }
            const dept = getDeptById(group, normalizeScopeId(p.deptId));
            if (!dept) return;
            if (!p.catId) {
                dept.categories.forEach(c => selected.add(c.id));
                return;
            }
            const cat = dept.categories.find(c => normalizeScopeId(c.id) === normalizeScopeId(p.catId));
            if (cat) selected.add(cat.id);
        });
        let sum = 0;
        selected.forEach(id => { sum += catMap.get(id) || 0; });
        return totalSkus > 0 ? (sum / totalSkus) * 100 : 0;
    };

    const getPartialPercentForDept = (group: Group, dept: Department, totalSkus: number) => {
        if (!data?.partialStarts || data.partialStarts.length === 0 || totalSkus <= 0) return 0;
        const catMap = new Map<string, number>();
        dept.categories.forEach(c => catMap.set(c.id, c.itemsCount));
        const selected = new Set<string>();
        data.partialStarts.forEach(p => {
            if (normalizeScopeId(p.groupId) !== normalizeScopeId(group.id)) return;
            if (!p.deptId) {
                dept.categories.forEach(c => selected.add(c.id));
                return;
            }
            if (normalizeScopeId(p.deptId) !== normalizeScopeId(dept.id)) return;
            if (!p.catId) {
                dept.categories.forEach(c => selected.add(c.id));
                return;
            }
            const cat = dept.categories.find(c => normalizeScopeId(c.id) === normalizeScopeId(p.catId));
            if (cat) selected.add(cat.id);
        });
        let sum = 0;
        selected.forEach(id => { sum += catMap.get(id) || 0; });
        return totalSkus > 0 ? (sum / totalSkus) * 100 : 0;
    };

    const buildTermKey = (scope: TermScope) => {
        if (scope.type === 'custom') {
            const customKey = (scope.customScopes || [])
                .map(s => partialScopeKey(s))
                .filter(Boolean)
                .sort()
                .join(',');
            return `custom|${scope.batchId || ''}|${customKey}`;
        }
        return [scope.type, scope.groupId || '', scope.deptId || '', scope.catId || ''].join('|');
    };

    const getLegacyCustomTermKey = (scope: TermScope) => {
        if (scope.type !== 'custom') return '';
        const customKey = (scope.customScopes || [])
            .map(s => partialScopeKey(s))
            .filter(Boolean)
            .sort()
            .join(',');
        return customKey ? `custom|${customKey}` : '';
    };

    const getCustomScopePart = (scope: TermScope) => {
        if (scope.type !== 'custom') return '';
        return normalizeCustomScopesPart(
            (scope.customScopes || [])
                .map(s => partialScopeKey(s))
                .filter(Boolean)
                .join(',')
        );
    };

    const findEquivalentCustomTermPayload = (
        scope: TermScope,
        draftsSource: Record<string, TermForm> = {},
        metricsStore: Record<string, any> = {}
    ): { key: string; draft?: TermForm; metrics?: any } | null => {
        if (scope.type !== 'custom') return null;
        const targetScopesPart = getCustomScopePart(scope);
        if (!targetScopesPart) return null;
        const currentKey = buildTermKey(scope);
        const keys = Array.from(new Set([
            ...Object.keys(draftsSource || {}),
            ...Object.keys(metricsStore || {})
        ]));
        let bestWithMetrics: { key: string; draft?: TermForm; metrics?: any } | null = null;
        let firstDraftOnly: { key: string; draft?: TermForm; metrics?: any } | null = null;
        for (const candidateKey of keys) {
            if (candidateKey === currentKey || !candidateKey.startsWith('custom|')) continue;
            if (getCustomDraftScopesPart(candidateKey) !== targetScopesPart) continue;
            const draft = draftsSource[candidateKey];
            const metrics = pickPreferredTermMetrics(draft?.excelMetrics, metricsStore[candidateKey]);
            if (draft?.excelMetricsRemovedAt && !draft?.excelMetrics) continue;
            if (metrics) {
                if (!bestWithMetrics || pickPreferredTermMetrics(metrics, bestWithMetrics.metrics) === metrics) {
                    bestWithMetrics = { key: candidateKey, draft, metrics };
                }
                continue;
            }
            if (draft && !firstDraftOnly) firstDraftOnly = { key: candidateKey, draft, metrics };
        }
        return bestWithMetrics || firstDraftOnly;
    };

    const upsertScopeDraft = (
        sourceDrafts: Record<string, TermForm>,
        scope: TermScope,
        draft: TermForm
    ) => {
        const key = buildTermKey(scope);
        const nextDrafts = { ...(sourceDrafts || {}), [key]: draft };
        const legacyKey = getLegacyCustomTermKey(scope);
        if (legacyKey && legacyKey !== key) {
            delete nextDrafts[legacyKey];
        }
        return nextDrafts;
    };

    const getScopedMetrics = useCallback((scope: { type: 'group' | 'department' | 'category', groupId: string, deptId?: string, catId?: string }) => {
        const tk = buildTermKey(scope as any);
        const directDraft = termDrafts[tk];
        const backupMetrics = (((data as any)?.termExcelMetricsByKey || {}) as Record<string, any>)[tk];
        if (directDraft?.excelMetricsRemovedAt && !directDraft?.excelMetrics) return null;
        const draftMetrics = pickPreferredTermMetrics(directDraft?.excelMetrics, backupMetrics);
        const group = data?.groups?.find(g => normalizeScopeId(g.id) === normalizeScopeId(scope.groupId));
        if (!group) return null;
        const gName = normalizeText(group.name);
        const normalizeDigitsKey = (v: unknown) => String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');
        const makeAliasSet = (values: unknown[]) => {
            const set = new Set<string>();
            values.forEach(v => {
                const raw = normalizeScopeId(v);
                if (raw) set.add(raw);
                const digits = normalizeDigitsKey(v);
                if (digits) set.add(digits);
            });
            return set;
        };
        const scopeGroupAliases = makeAliasSet([scope.groupId, group.id]);
        const groupNameToIds = new Map<string, Set<string>>();
        (data?.groups || []).forEach(g => {
            const key = normalizeText(g.name);
            if (!key) return;
            const ids = groupNameToIds.get(key) || new Set<string>();
            makeAliasSet([g.id]).forEach(id => ids.add(id));
            groupNameToIds.set(key, ids);
        });

        let dName = '';
        let cName = '';
        let selectedDept: Department | undefined;
        let selectedCat: Category | undefined;
        const deptNameToIds = new Map<string, Set<string>>();
        const catNameToIds = new Map<string, Set<string>>();
        let scopeDeptAliases = new Set<string>();
        let scopeCatAliases = new Set<string>();
        if (scope.deptId) {
            selectedDept = group.departments.find(d =>
                makeAliasSet([d.id, (d as any).numericId]).has(normalizeScopeId(scope.deptId!)) ||
                makeAliasSet([d.id, (d as any).numericId]).has(normalizeDigitsKey(scope.deptId!))
            );
            if (selectedDept) dName = normalizeText(selectedDept.name);
            group.departments.forEach(d => {
                const key = normalizeText(d.name);
                if (!key) return;
                const ids = deptNameToIds.get(key) || new Set<string>();
                makeAliasSet([d.id, (d as any).numericId]).forEach(id => ids.add(id));
                deptNameToIds.set(key, ids);
            });
            scopeDeptAliases = makeAliasSet([scope.deptId, selectedDept?.id, (selectedDept as any)?.numericId]);
        }
        if (scope.catId && scope.deptId) {
            const dept = selectedDept || group.departments.find(d => normalizeScopeId(d.id) === normalizeScopeId(scope.deptId!));
            selectedCat = dept?.categories.find(c =>
                makeAliasSet([c.id, (c as any).numericId]).has(normalizeScopeId(scope.catId!)) ||
                makeAliasSet([c.id, (c as any).numericId]).has(normalizeDigitsKey(scope.catId!))
            );
            if (selectedCat) cName = normalizeText(selectedCat.name);
            (dept?.categories || []).forEach(c => {
                const key = normalizeText(c.name);
                if (!key) return;
                const ids = catNameToIds.get(key) || new Set<string>();
                makeAliasSet([c.id, (c as any).numericId]).forEach(id => ids.add(id));
                catNameToIds.set(key, ids);
            });
            scopeCatAliases = makeAliasSet([scope.catId, selectedCat?.id, (selectedCat as any)?.numericId]);
        }
        const matchByUniqueName = (nameMap: Map<string, Set<string>>, rowName: unknown, targetAliases: Set<string>) => {
            const key = normalizeText(rowName);
            if (!key) return false;
            const ids = nameMap.get(key);
            if (!ids || ids.size !== 1) return false;
            const only = Array.from(ids)[0];
            return targetAliases.has(only);
        };
        const matchScopeRecord = (row: any) => {
            const rowG = normalizeScopeId(row?.groupId);
            const rowD = normalizeScopeId(row?.deptId);
            const rowC = normalizeScopeId(row?.catId);
            const matchG = rowG
                ? (scopeGroupAliases.has(rowG) || scopeGroupAliases.has(normalizeDigitsKey(rowG)))
                : (normalizeText(row?.groupName) === gName && matchByUniqueName(groupNameToIds, row?.groupName, scopeGroupAliases));
            if (scope.type === 'group') return matchG;
            const matchD = rowD
                ? (scopeDeptAliases.has(rowD) || scopeDeptAliases.has(normalizeDigitsKey(rowD)))
                : (normalizeText(row?.deptName) === dName && matchByUniqueName(deptNameToIds, row?.deptName, scopeDeptAliases));
            if (scope.type === 'department') return matchG && matchD;
            const matchC = rowC
                ? (scopeCatAliases.has(rowC) || scopeCatAliases.has(normalizeDigitsKey(rowC)))
                : (normalizeText(row?.catName) === cName && matchByUniqueName(catNameToIds, row?.catName, scopeCatAliases));
            return matchG && matchD && matchC;
        };
        const summarizeScopedRows = (rows: any[]) => rows.reduce((acc: any, curr: any) => ({
            sysQty: (acc.sysQty || 0) + Number(curr?.sysQty || 0),
            sysCost: (acc.sysCost || 0) + Number(curr?.sysCost || 0),
            countedQty: (acc.countedQty || 0) + Number(curr?.countedQty || 0),
            countedCost: (acc.countedCost || 0) + Number(curr?.countedCost || 0),
            diffQty: (acc.diffQty || 0) + Number(curr?.diffQty || 0),
            diffCost: (acc.diffCost || 0) + Number(curr?.diffCost || 0)
        }), { sysQty: 0, sysCost: 0, countedQty: 0, countedCost: 0, diffQty: 0, diffCost: 0 });
        const applyOfficialTermScale = (scopedTotals: any, sourceRows: any[], metrics: any) => {
            const officialDiffCost = getOfficialTermDiffCost(metrics);
            const officialDiffQty = Number(metrics?.diffQty || 0);
            const sourceTotals = summarizeScopedRows(sourceRows || []);
            const rawSourceDiffCost = roundAuditMoney(sourceTotals.diffCost);
            const rawScopedDiffCost = roundAuditMoney(scopedTotals.diffCost);
            const rawSourceDiffQty = Number(sourceTotals.diffQty || 0);
            const rawScopedDiffQty = Number(scopedTotals.diffQty || 0);

            const next = { ...scopedTotals };
            if (
                officialDiffCost !== null &&
                Math.abs(rawSourceDiffCost) > 0.01 &&
                Math.abs(rawSourceDiffCost - officialDiffCost) > 0.01
            ) {
                next.diffCost = roundAuditMoney(rawScopedDiffCost * (officialDiffCost / rawSourceDiffCost));
                next.countedCost = roundAuditMoney(Number(next.sysCost || 0) + Number(next.diffCost || 0));
            }
            if (
                Number.isFinite(officialDiffQty) &&
                Math.abs(rawSourceDiffQty) > 0.01 &&
                Math.abs(rawSourceDiffQty - officialDiffQty) > 0.01
            ) {
                next.diffQty = rawScopedDiffQty * (officialDiffQty / rawSourceDiffQty);
                next.countedQty = Number(next.sysQty || 0) + Number(next.diffQty || 0);
            }
            return next;
        };
        // Se houver draft direto, filtra pelo escopo para evitar contaminação entre grupos.
        // Se não houver nenhum match (dados legados), mantém total bruto para não apagar.
        if (draftMetrics) {
            if (scope.type === 'group') {
                return getWholeTermMetricsTotals(draftMetrics);
            }
            const directItems = (draftMetrics.items || []).filter((it: any) => matchScopeRecord(it));
            const directGrouped = (draftMetrics.groupedDifferences || []).filter((d: any) => matchScopeRecord(d));
            const source = directItems.length > 0
                ? directItems
                : (directGrouped.length > 0 ? directGrouped : null);
            if (source) {
                const allSourceRows = directItems.length > 0
                    ? (draftMetrics.items || []).filter((it: any) => !isTermMetadataRow(it))
                    : (draftMetrics.groupedDifferences || []);
                return applyOfficialTermScale(summarizeScopedRows(source), allSourceRows, draftMetrics);
            }
            return null;
        }
        const makeScopeCatKeys = (s: { groupId?: string; deptId?: string; catId?: string }) =>
            new Set(
                getScopeCategories(s.groupId, s.deptId, s.catId)
                    .map(({ group, dept, cat }) => partialScopeKey({ groupId: group.id, deptId: dept.id, catId: cat.id }))
            );
        const targetCatKeys = makeScopeCatKeys(scope as any);
        const parseCustomDraftKey = (draftKey: string) => {
            const match = draftKey.match(/^custom\|([^|]*)(?:\|(.*))?$/);
            if (!match) return null as null | { batchId?: string; scopesPart: string };
            const hasNewFormat = typeof match[2] === 'string';
            if (hasNewFormat) return { batchId: (match[1] || '').trim() || undefined, scopesPart: match[2] || '' };
            return { batchId: undefined, scopesPart: match[1] || '' }; // legado
        };
        const draftTouchesScope = (draftKey: string) => {
            if (targetCatKeys.size === 0) return false;
            if (draftKey.startsWith('custom|')) {
                const meta = parseCustomDraftKey(draftKey);
                const scopedKeys = (meta?.scopesPart || '').split(',').filter(Boolean);
                for (const scopeKey of scopedKeys) {
                    const [g, d, c] = scopeKey.split('|');
                    const expanded = getScopeCategories(g || undefined, d || undefined, c || undefined);
                    for (const { group, dept, cat } of expanded) {
                        if (targetCatKeys.has(partialScopeKey({ groupId: group.id, deptId: dept.id, catId: cat.id }))) return true;
                    }
                }
                return false;
            }
            const [type, g, d, c] = draftKey.split('|');
            if (!type || type === 'custom') return false;
            const expanded = getScopeCategories(g || undefined, d || undefined, c || undefined);
            for (const { group, dept, cat } of expanded) {
                if (targetCatKeys.has(partialScopeKey({ groupId: group.id, deptId: dept.id, catId: cat.id }))) return true;
            }
            return false;
        };
        const scopedEntries = Object.entries(termDrafts || {})
            .filter(([draftKey, draft]) => {
                if (!draft?.excelMetrics || draft?.excelMetricsRemovedAt) return false;
                if (!draftTouchesScope(draftKey)) return false;
                return true;
            })
            .map(([draftKey, draft]) => ({ draftKey, draft: draft! }));
        const selectedScopedEntries = selectNonOverlappingTermMetricEntries(
            data,
            scopedEntries.map(({ draftKey, draft }) => [draftKey, draft.excelMetrics] as [string, any])
        ).map(([draftKey, metrics]) => ({
            draftKey,
            draft: { excelMetrics: metrics } as TermForm
        }));
        const scopedPools = selectedScopedEntries
            .map(({ draft }) => draft.excelMetrics)
            .filter(Boolean);
        if (scope.type === 'group' && selectedScopedEntries.length > 0) {
            const targetGroup = normalizeScopeId(scope.groupId);
            const entryGroups = (draftKey: string) => {
                const groups = new Set<string>();
                if (draftKey.startsWith('custom|')) {
                    const meta = parseCustomDraftKey(draftKey);
                    (meta?.scopesPart || '').split(',').filter(Boolean).forEach(scopeKey => {
                        const [g] = scopeKey.split('|');
                        const normalized = normalizeScopeId(g);
                        if (normalized) groups.add(normalized);
                    });
                    return groups;
                }
                const [, g] = draftKey.split('|');
                const normalized = normalizeScopeId(g);
                if (normalized) groups.add(normalized);
                return groups;
            };
            const ownedByThisGroup = selectedScopedEntries.filter(({ draftKey }) => {
                const groups = entryGroups(draftKey);
                return groups.size === 1 && groups.has(targetGroup);
            });
            if (ownedByThisGroup.length === selectedScopedEntries.length) {
                return getWholeTermMetricsTotals(mergeExcelMetricsPools(scopedPools as any[]));
            }
        }
        // Prioridade: Rascunho do próprio termo > Soma dos termos do mesmo grupo
        const base = draftMetrics || mergeExcelMetricsPools(scopedPools as any[]);

        if (!base || !base.groupedDifferences) return null;

        const scopeGroupIdNorm = normalizeScopeId(scope.groupId);
        const scopeDeptIdNorm = normalizeScopeId(scope.deptId);
        const scopeCatIdNorm = normalizeScopeId(scope.catId);
        const filtered = base.groupedDifferences.filter((d: any) => {
            const hasGroupId = !!normalizeScopeId(d.groupId);
            const hasDeptId = !!normalizeScopeId(d.deptId);
            const hasCatId = !!normalizeScopeId(d.catId);
            const matchG = hasGroupId
                ? normalizeScopeId(d.groupId) === scopeGroupIdNorm
                : normalizeText(d.groupName) === gName;
            if (scope.type === 'group') return matchG;
            const matchD = hasDeptId
                ? normalizeScopeId(d.deptId) === scopeDeptIdNorm
                : normalizeText(d.deptName) === dName;
            if (scope.type === 'department') return matchG && matchD;
            const matchC = hasCatId
                ? normalizeScopeId(d.catId) === scopeCatIdNorm
                : normalizeText(d.catName) === cName;
            return matchG && matchD && matchC;
        });

        if (filtered.length === 0) return null;

        const allSourceRows = Array.isArray(base.items) && base.items.length > 0
            ? base.items.filter((it: any) => !isTermMetadataRow(it))
            : (base.groupedDifferences || []);
        return applyOfficialTermScale(summarizeScopedRows(filtered), allSourceRows, base);
    }, [data, termDrafts, buildTermKey, getScopeCategories]);

    const sumExcelMetrics = useCallback((items: Array<any | null | undefined>) => {
        return items.reduce((acc: any, curr: any) => {
            if (!curr) return acc;
            return {
                sysQty: (acc.sysQty || 0) + Number(curr.sysQty || 0),
                sysCost: (acc.sysCost || 0) + Number(curr.sysCost || 0),
                countedQty: (acc.countedQty || 0) + Number(curr.countedQty || 0),
                countedCost: (acc.countedCost || 0) + Number(curr.countedCost || 0),
                diffQty: (acc.diffQty || 0) + Number(curr.diffQty || 0),
                diffCost: (acc.diffCost || 0) + Number(curr.diffCost || 0)
            };
        }, { sysQty: 0, sysCost: 0, countedQty: 0, countedCost: 0, diffQty: 0, diffCost: 0 });
    }, []);

    const getGroupVerifiedMetrics = useCallback((group: any) => {
        const groupId = String(group?.id || '');
        const direct = getScopedMetrics({ type: 'group', groupId });
        if (direct) return direct;
        const deptMetrics = (group?.departments || [])
            .map((dept: any) => getScopedMetrics({ type: 'department', groupId, deptId: String(dept.id) }))
            .filter(Boolean);

        if (deptMetrics.length === 0) return null;
        return sumExcelMetrics(deptMetrics);
    }, [getScopedMetrics, sumExcelMetrics]);

    const postAuditAdjustments = useMemo(
        () => normalizePostAuditAdjustments((data as any)?.postAuditAdjustments),
        [data]
    );

    const postAuditAdjustmentTotals = useMemo(() => {
        return postAuditAdjustments.reduce((acc, item) => ({
            quantity: acc.quantity + Number(item.quantity || 0),
            cost: roundAuditMoney(acc.cost + Number(item.totalCost || 0))
        }), { quantity: 0, cost: 0 });
    }, [postAuditAdjustments]);

    const metricsContainsPostAuditAdjustments = useCallback((metrics: any) => {
        const rows = [
            ...(Array.isArray(metrics?.items) ? metrics.items : []),
            ...(Array.isArray(metrics?.groupedDifferences) ? metrics.groupedDifferences : [])
        ];
        return rows.some((row: any) =>
            row?.isPostAuditAdjustment === true ||
            normalizeScopeId(row?.groupId) === '__post_audit_adjustments__' ||
            normalizeText(row?.groupName) === normalizeText('AJUSTES APÓS AUDITORIA')
        );
    }, []);

    const getPostAuditAdjustmentTotalsForScope = useCallback((scope: { groupId?: string; deptId?: string; catId?: string }) => {
        const norm = (value: unknown) => normalizeScopeId(value as any).trim().toLowerCase();
        const targetGroup = norm(scope.groupId);
        const targetDept = norm(scope.deptId);
        const targetCat = norm(scope.catId);
        return postAuditAdjustments.reduce((acc, item) => {
            if (targetGroup && norm(item.groupId) !== targetGroup) return acc;
            if (targetDept && norm(item.deptId) !== targetDept) return acc;
            if (targetCat && norm(item.catId) !== targetCat) return acc;
            return {
                quantity: acc.quantity + Number(item.quantity || 0),
                cost: roundAuditMoney(acc.cost + Number(item.totalCost || 0))
            };
        }, { quantity: 0, cost: 0 });
    }, [postAuditAdjustments]);

    const normalizeTermScopeLike = useCallback((scope?: { type?: TermScopeType; groupId?: string; deptId?: string; catId?: string } | null): TermScope | null => {
        if (!scope?.groupId) return null;
        return {
            type: scope.type || (scope.catId ? 'category' : scope.deptId ? 'department' : 'group'),
            groupId: scope.groupId,
            deptId: scope.deptId,
            catId: scope.catId
        };
    }, []);

    const getPostAuditAdjustmentsForTermScope = useCallback((scope?: TermScope | null) => {
        if (!scope || postAuditAdjustments.length === 0) return [] as PostAuditAdjustment[];

        const normalizeDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
        const makeAliasSet = (values: unknown[]) => {
            const set = new Set<string>();
            values.forEach(value => {
                const raw = normalizeScopeId(value as any).trim().toLowerCase();
                if (raw) set.add(raw);
                const digits = normalizeDigits(value);
                if (digits) set.add(digits);
            });
            return set;
        };
        const hasIntersection = (a: Set<string>, b: Set<string>) => {
            for (const value of a) {
                if (b.has(value)) return true;
            }
            return false;
        };
        const matchByIdOrName = (
            itemIds: Set<string>,
            targetIds: Set<string>,
            itemName?: string,
            targetName?: string
        ) => {
            if (itemIds.size > 0 && targetIds.size > 0 && hasIntersection(itemIds, targetIds)) return true;
            const itemText = normalizeText(itemName || '');
            const targetText = normalizeText(targetName || '');
            return !!itemText && !!targetText && itemText === targetText;
        };
        const matchesEntry = (
            item: PostAuditAdjustment,
            entry: { group: Group; dept: Department; cat: Category },
            specificity: 'group' | 'department' | 'category'
        ) => {
            const itemGroupIds = makeAliasSet([item.groupId]);
            const targetGroupIds = makeAliasSet([entry.group.id, (entry.group as any).numericId]);
            if (!matchByIdOrName(itemGroupIds, targetGroupIds, item.groupName, entry.group.name)) return false;
            if (specificity === 'group') return true;

            const itemDeptIds = makeAliasSet([item.deptId]);
            const targetDeptIds = makeAliasSet([entry.dept.id, entry.dept.numericId]);
            if (!matchByIdOrName(itemDeptIds, targetDeptIds, item.deptName, entry.dept.name)) return false;
            if (specificity === 'department') return true;

            const itemCatIds = makeAliasSet([item.catId]);
            const targetCatIds = makeAliasSet([entry.cat.id, entry.cat.numericId]);
            return matchByIdOrName(itemCatIds, targetCatIds, item.catName, entry.cat.name);
        };
        const matchesFallbackPartial = (
            item: PostAuditAdjustment,
            partial: { groupId?: string; deptId?: string; catId?: string },
            specificity: 'group' | 'department' | 'category'
        ) => {
            const itemGroupIds = makeAliasSet([item.groupId]);
            if (!hasIntersection(itemGroupIds, makeAliasSet([partial.groupId]))) return false;
            if (specificity === 'group') return true;
            const itemDeptIds = makeAliasSet([item.deptId]);
            if (!hasIntersection(itemDeptIds, makeAliasSet([partial.deptId]))) return false;
            if (specificity === 'department') return true;
            const itemCatIds = makeAliasSet([item.catId]);
            return hasIntersection(itemCatIds, makeAliasSet([partial.catId]));
        };
        const matchesPartial = (
            item: PostAuditAdjustment,
            partial: { groupId?: string; deptId?: string; catId?: string }
        ) => {
            if (!normalizeScopeId(partial.groupId)) return false;
            const specificity = partial.catId ? 'category' : partial.deptId ? 'department' : 'group';
            const entries = getScopeCategories(partial.groupId, partial.deptId, partial.catId);
            if (entries.length === 0) return matchesFallbackPartial(item, partial, specificity);
            return entries.some(entry => matchesEntry(item, entry, specificity));
        };

        if (scope.type === 'custom') {
            const partials = scope.customScopes || [];
            return postAuditAdjustments.filter(item => partials.some(partial => matchesPartial(item, partial)));
        }

        return postAuditAdjustments.filter(item => matchesPartial(item, scope));
    }, [postAuditAdjustments, data]);

    const getPostAuditAdjustmentTotalsForTermScope = useCallback((scope?: TermScope | { groupId?: string; deptId?: string; catId?: string } | null) => {
        const resolvedScope = normalizeTermScopeLike(scope as any);
        const adjustments = getPostAuditAdjustmentsForTermScope(resolvedScope);
        return adjustments.reduce((acc, item) => ({
            quantity: acc.quantity + Number(item.quantity || 0),
            cost: roundAuditMoney(acc.cost + Number(item.totalCost || 0))
        }), { quantity: 0, cost: 0 });
    }, [getPostAuditAdjustmentsForTermScope, normalizeTermScopeLike]);

    const termDisplayMetrics = useMemo(() => {
        if (!termComparisonMetrics) return null;
        if (metricsContainsPostAuditAdjustments(termComparisonMetrics)) return termComparisonMetrics;
        const adjustments = getPostAuditAdjustmentsForTermScope(termModal ? termModal : null);
        const totals = adjustments.reduce((acc, item) => ({
            quantity: acc.quantity + Number(item.quantity || 0),
            cost: roundAuditMoney(acc.cost + Number(item.totalCost || 0))
        }), { quantity: 0, cost: 0 });

        if (adjustments.length === 0 || (Math.abs(totals.quantity) <= 0.0001 && Math.abs(totals.cost) <= 0.001)) {
            return termComparisonMetrics;
        }

        const adjustmentItems = adjustments.map((item) => {
            const previousQty = item.mode === 'replace'
                ? Number(item.previousAuditedQty || 0)
                : 0;
            const correctedQty = item.mode === 'replace'
                ? Number(item.replacementQuantity ?? (previousQty + Number(item.quantity || 0)))
                : Number(item.quantity || 0);
            const previousCost = roundAuditMoney(previousQty * Number(item.unitCost || 0));
            const correctedCost = roundAuditMoney(previousCost + Number(item.totalCost || 0));
            const hierarchy = [item.groupName, item.deptName, item.catName].filter(Boolean).join(' > ');

            return {
                code: item.reducedCode || item.code || item.barcode || '',
                description: hierarchy
                    ? `AJUSTE PÓS-AUDITORIA - ${item.description} (${hierarchy})`
                    : `AJUSTE PÓS-AUDITORIA - ${item.description}`,
                lab: item.mode === 'replace' ? 'SUBSTITUIR' : 'AJUSTE',
                groupId: '__post_audit_adjustments__',
                groupName: 'AJUSTES APÓS AUDITORIA',
                deptId: '__post_audit_adjustments__',
                deptName: 'CORREÇÕES MANUAIS',
                catId: '__post_audit_adjustments__',
                catName: 'AJUSTES LANÇADOS',
                sysQty: previousQty,
                sysCost: previousCost,
                countedQty: correctedQty,
                countedCost: correctedCost,
                diffQty: Number(item.quantity || 0),
                diffCost: roundAuditMoney(item.totalCost || 0),
                isPostAuditAdjustment: true,
                note: item.note,
                createdAt: item.createdAt
            };
        });
        const adjustmentGroupedRow = adjustmentItems.reduce((acc: any, item: any) => ({
            ...acc,
            sysQty: acc.sysQty + Number(item.sysQty || 0),
            sysCost: roundAuditMoney(acc.sysCost + Number(item.sysCost || 0)),
            countedQty: acc.countedQty + Number(item.countedQty || 0),
            countedCost: roundAuditMoney(acc.countedCost + Number(item.countedCost || 0)),
            diffQty: acc.diffQty + Number(item.diffQty || 0),
            diffCost: roundAuditMoney(acc.diffCost + Number(item.diffCost || 0))
        }), {
            groupId: '__post_audit_adjustments__',
            groupName: 'AJUSTES APÓS AUDITORIA',
            deptId: '__post_audit_adjustments__',
            deptName: 'CORREÇÕES MANUAIS',
            catId: '__post_audit_adjustments__',
            catName: 'AJUSTES LANÇADOS',
            sysQty: 0,
            sysCost: 0,
            countedQty: 0,
            countedCost: 0,
            diffQty: 0,
            diffCost: 0,
            isPostAuditAdjustment: true
        });
        const adjustedDiffCost = roundAuditMoney(Number(termComparisonMetrics.diffCost || 0) + totals.cost);

        return {
            ...termComparisonMetrics,
            countedQty: Number(termComparisonMetrics.countedQty || 0) + totals.quantity,
            countedCost: roundAuditMoney(Number(termComparisonMetrics.countedCost || 0) + totals.cost),
            diffQty: Number(termComparisonMetrics.diffQty || 0) + totals.quantity,
            diffCost: adjustedDiffCost,
            officialDiffCost: adjustedDiffCost,
            financialDiffSource: termComparisonMetrics.financialDiffSource
                ? `${termComparisonMetrics.financialDiffSource}_with_post_audit_adjustments`
                : 'post_audit_adjustments',
            items: [...(termComparisonMetrics.items || []), ...adjustmentItems],
            groupedDifferences: [...(termComparisonMetrics.groupedDifferences || []), adjustmentGroupedRow],
            postAuditAdjustmentTotals: {
                count: adjustments.length,
                quantity: totals.quantity,
                cost: totals.cost
            }
        };
    }, [termComparisonMetrics, termModal, getPostAuditAdjustmentsForTermScope, metricsContainsPostAuditAdjustments]);

    const applyPostAuditAdjustmentsToMetrics = useCallback((
        metrics: any | null,
        scope: { groupId?: string; deptId?: string; catId?: string }
    ) => {
        const adjustments = getPostAuditAdjustmentTotalsForTermScope(scope);
        if (!metrics) {
            if (Math.abs(adjustments.quantity) <= 0.01 && Math.abs(adjustments.cost) <= 0.01) return null;
            return {
                sysQty: 0,
                sysCost: 0,
                countedQty: adjustments.quantity,
                countedCost: adjustments.cost,
                diffQty: adjustments.quantity,
                diffCost: adjustments.cost
            };
        }
        return {
            ...metrics,
            countedQty: Number(metrics.countedQty || 0) + Number(adjustments.quantity || 0),
            countedCost: roundAuditMoney(Number(metrics.countedCost || 0) + Number(adjustments.cost || 0)),
            diffQty: Number(metrics.diffQty || 0) + Number(adjustments.quantity || 0),
            diffCost: roundAuditMoney(Number(metrics.diffCost || 0) + Number(adjustments.cost || 0))
        };
    }, [getPostAuditAdjustmentTotalsForTermScope]);

    const getAdjustedAuditedCostForScope = useCallback((
        rawAuditedCost: number,
        metrics: any | null,
        scope: { groupId?: string; deptId?: string; catId?: string }
    ) => {
        const adjustments = getPostAuditAdjustmentTotalsForTermScope(scope);
        return roundAuditMoney(
            Number(rawAuditedCost || 0) +
            Number(metrics?.diffCost || 0) +
            Number(adjustments.cost || 0)
        );
    }, [getPostAuditAdjustmentTotalsForTermScope]);

    const authoritativeTermMetrics = useMemo(
        () => getAuthoritativeTermMetrics(data, termDrafts),
        [data, termDrafts]
    );

    const filialTotalsMetrics = useMemo(() => {
        if (!data) {
            return {
                diffQty: 0,
                diffCost: 0,
                repDivergencePct: 0,
                pendingUnits: 0,
                pendingSkus: 0,
                pendingCost: 0,
                groupsWithDivergence: 0,
                doneUnits: 0,
                totalUnits: 0,
                doneCost: 0,
                totalCost: 0
            };
        }

        let diffQty = 0;
        let diffCost = 0;
        let groupsWithDivergence = 0;
        let sourceAlreadyHasPostAuditAdjustments = false;
        if (authoritativeTermMetrics) {
            diffQty = Number(authoritativeTermMetrics.diffQty || 0);
            diffCost = roundAuditMoney(authoritativeTermMetrics.diffCost);
            groupsWithDivergence = Math.abs(diffQty) > 0.01 || Math.abs(diffCost) > 0.01 ? 1 : 0;
            sourceAlreadyHasPostAuditAdjustments = metricsContainsPostAuditAdjustments(authoritativeTermMetrics);
        } else {
            data.groups.forEach(group => {
                const metrics = getGroupVerifiedMetrics(group);
                if (!metrics) return;
                if (metricsContainsPostAuditAdjustments(metrics)) sourceAlreadyHasPostAuditAdjustments = true;
                const currentDiffQty = Number(metrics.diffQty || 0);
                const currentDiffCost = Number(metrics.diffCost || 0);
                diffQty += currentDiffQty;
                diffCost += currentDiffCost;
                if (Math.abs(currentDiffQty) > 0.01 || Math.abs(currentDiffCost) > 0.01) {
                    groupsWithDivergence += 1;
                }
            });
            diffCost = roundAuditMoney(diffCost);
        }
        if (postAuditAdjustments.length > 0 && !sourceAlreadyHasPostAuditAdjustments) {
            diffQty += Number(postAuditAdjustmentTotals.quantity || 0);
            diffCost = roundAuditMoney(diffCost + Number(postAuditAdjustmentTotals.cost || 0));
            if (
                Math.abs(Number(postAuditAdjustmentTotals.quantity || 0)) > 0.01 ||
                Math.abs(Number(postAuditAdjustmentTotals.cost || 0)) > 0.01
            ) {
                groupsWithDivergence += 1;
            }
        }

        const pendingUnits = Math.max(0, Number(branchMetrics.units || 0) - Number(branchMetrics.doneUnits || 0));
        const pendingSkus = Math.max(0, Number(branchMetrics.skus || 0) - Number(branchMetrics.doneSkus || 0));
        const pendingCost = Math.max(0, Number(branchMetrics.cost || 0) - Number(branchMetrics.doneCost || 0));
        const repDivergencePct = Number(branchMetrics.doneCost || 0) > 0
            ? (diffCost / Number(branchMetrics.doneCost || 0)) * 100
            : 0;

        return {
            diffQty,
            diffCost,
            repDivergencePct,
            pendingUnits,
            pendingSkus,
            pendingCost,
            groupsWithDivergence,
            doneUnits: Number(branchMetrics.doneUnits || 0) + diffQty,
            totalUnits: Number(branchMetrics.units || 0),
            doneCost: roundAuditMoney(Number(branchMetrics.doneCost || 0) + diffCost),
            totalCost: Number(branchMetrics.cost || 0)
        };
    }, [data, authoritativeTermMetrics, getGroupVerifiedMetrics, branchMetrics.units, branchMetrics.doneUnits, branchMetrics.skus, branchMetrics.doneSkus, branchMetrics.cost, branchMetrics.doneCost, postAuditAdjustments.length, postAuditAdjustmentTotals.quantity, postAuditAdjustmentTotals.cost, metricsContainsPostAuditAdjustments]);

    const createDefaultTermForm = (): TermForm => ({
        inventoryNumber: inventoryNumber || data?.inventoryNumber || '',
        date: new Date().toLocaleDateString('pt-BR'),
        managerName2: '',
        managerCpf2: '',
        managerSignature2: '',
        managerName: '',
        managerCpf: '',
        managerSignature: '',
        collaborators: Array.from({ length: 10 }, () => ({ name: '', cpf: '', signature: '' }))
    });

    const hasAnySignerData = (form?: TermForm | null) => {
        const localNormName = (value?: string) => String(value || '').trim().replace(/\s+/g, ' ');
        const localCpfDigits = (value?: string) => String(value || '').replace(/\D/g, '');
        if (!form) return false;
        if (
            localNormName(form.managerName2) ||
            localCpfDigits(form.managerCpf2) ||
            String(form.managerSignature2 || '').trim() ||
            localNormName(form.managerName) ||
            localCpfDigits(form.managerCpf) ||
            String(form.managerSignature || '').trim()
        ) return true;
        return (form.collaborators || []).some(c =>
            localNormName(c.name) || localCpfDigits(c.cpf) || String(c.signature || '').trim()
        );
    };

    const getLatestSignerTemplate = (
        draftsSource: Record<string, TermForm> = termDrafts,
        dataSource: AuditData | null = data
    ): TermForm | null => {
        const localDrafts = Object.values(draftsSource || {});
        for (let i = localDrafts.length - 1; i >= 0; i--) {
            if (hasAnySignerData(localDrafts[i])) return localDrafts[i];
        }
        const persistedDrafts = Object.values((((dataSource as any)?.termDrafts || {}) as Record<string, TermForm>) || {});
        for (let i = persistedDrafts.length - 1; i >= 0; i--) {
            if (hasAnySignerData(persistedDrafts[i])) return persistedDrafts[i];
        }
        return null;
    };

    const openTermModal = async (scope: TermScope) => {
        let sourceData = data;
        let sourceDrafts = termDraftsRef.current || termDrafts;
        try {
            const fresh = await fetchFreshOpenAuditSnapshot();
            if (fresh) {
                sourceData = fresh.data;
                sourceDrafts = fresh.drafts;
            }
        } catch (err) {
            console.error("Falha ao buscar atualização antes de abrir termo:", err);
        }
        if (!sourceData) return;

        {
        const data = sourceData;
        const termDrafts = sourceDrafts;
        const key = buildTermKey(scope);
        const isGlobalUnifiedCustomTerm = scope.type === 'custom' && normalizeScopeId(scope.batchId) === GLOBAL_UNIFIED_TERM_BATCH_ID;
        let draft = termDrafts[key];
        const legacyKey = getLegacyCustomTermKey(scope);
        if (!draft && scope.type === 'custom' && scope.batchId && legacyKey) draft = termDrafts[legacyKey];
        const metricsStore = (((data as any)?.termExcelMetricsByKey || {}) as Record<string, any>);
        const equivalentCustomPayload = findEquivalentCustomTermPayload(scope, termDrafts, metricsStore);
        if (!draft && equivalentCustomPayload?.draft) draft = equivalentCustomPayload.draft;
        const backupMetrics = pickPreferredTermMetrics(
            metricsStore[key],
            legacyKey ? metricsStore[legacyKey] : undefined,
            equivalentCustomPayload?.metrics
        );
        const resolvedExcelMetrics = normalizeTermMetricsToOfficial(pickPreferredTermMetrics(draft?.excelMetrics, backupMetrics));
        const hasExplicitRemovalDraft = !!(draft?.excelMetricsRemovedAt && !draft?.excelMetrics);
        const signerTemplate = getLatestSignerTemplate(termDrafts, data);
        const nextFormBase = draft
            ? (!draft.inventoryNumber && (inventoryNumber || data?.inventoryNumber)
                ? { ...draft, inventoryNumber: inventoryNumber || data?.inventoryNumber || '' }
                : draft)
            : (signerTemplate
                ? applyTermSigners(createDefaultTermForm(), signerTemplate)
                : createDefaultTermForm());
        const nextForm = (!isGlobalUnifiedCustomTerm && !hasExplicitRemovalDraft && resolvedExcelMetrics)
            ? { ...nextFormBase, excelMetrics: resolvedExcelMetrics }
            : nextFormBase;
        setTermModal(scope);
        setTermForm(nextForm);
        setTermFieldErrors({});
        setTermTouchedFields({});
        setTermShakeFields({});

        const scopeGroupIds = getScopeGroupIds(scope);
        const fallbackPools = scope.type === 'custom'
            ? (scope.batchId
                ? (isGlobalUnifiedCustomTerm
                    ? Object.entries(termDrafts || {})
                        .filter(([draftKey, draft]) => draftKey !== key && !!draft?.excelMetrics && !draft?.excelMetricsRemovedAt)
                        .map(([, draft]) => draft!.excelMetrics)
                        .filter(Boolean)
                    : scopeGroupIds.flatMap(groupId => getExcelPoolsByGroupFromDrafts(termDrafts, groupId, { batchId: scope.batchId })))
                : [])
            : (() => {
                const targetCatKeys = new Set(
                    getScopeCategories(scope.groupId, scope.deptId, scope.catId)
                        .map(({ group, dept, cat }) => partialScopeKey({ groupId: group.id, deptId: dept.id, catId: cat.id }))
                );
                const parseCustomDraftKey = (draftKey: string) => {
                    const match = draftKey.match(/^custom\|([^|]*)(?:\|(.*))?$/);
                    if (!match) return null as null | { batchId?: string; scopesPart: string };
                    const hasNewFormat = typeof match[2] === 'string';
                    if (hasNewFormat) return { batchId: (match[1] || '').trim() || undefined, scopesPart: match[2] || '' };
                    return { batchId: undefined, scopesPart: match[1] || '' };
                };
                const draftTouchesScope = (draftKey: string) => {
                    if (targetCatKeys.size === 0) return false;
                    if (draftKey.startsWith('custom|')) {
                        const meta = parseCustomDraftKey(draftKey);
                        const scopedKeys = (meta?.scopesPart || '').split(',').filter(Boolean);
                        for (const scopeKey of scopedKeys) {
                            const [g, d, c] = scopeKey.split('|');
                            const expanded = getScopeCategories(g || undefined, d || undefined, c || undefined);
                            for (const { group, dept, cat } of expanded) {
                                if (targetCatKeys.has(partialScopeKey({ groupId: group.id, deptId: dept.id, catId: cat.id }))) return true;
                            }
                        }
                        return false;
                    }
                    const [type, g, d, c] = draftKey.split('|');
                    if (!type || type === 'custom') return false;
                    const expanded = getScopeCategories(g || undefined, d || undefined, c || undefined);
                    for (const { group, dept, cat } of expanded) {
                        if (targetCatKeys.has(partialScopeKey({ groupId: group.id, deptId: dept.id, catId: cat.id }))) return true;
                    }
                    return false;
                };
                const scopedEntries = Object.entries(termDrafts || {})
                    .filter(([draftKey, draft]) => {
                        if (!draft?.excelMetrics || draft?.excelMetricsRemovedAt) return false;
                        if (!draftTouchesScope(draftKey)) return false;
                        return true;
                    })
                    .map(([draftKey, draft]) => ({ draftKey, draft: draft! }));
                return scopedEntries
                    .map(({ draft }) => draft.excelMetrics)
                    .filter(Boolean);
            })();
        // Termos dependentes devem refletir o termo origem do mesmo escopo/grupo:
        // prioriza excel do próprio termo; sem ele, agrega os termos compatíveis da filial.
        const hasExplicitRemoval = !!(draft?.excelMetricsRemovedAt && !draft?.excelMetrics);
        const rawPool = hasExplicitRemoval
            ? null
            : (isGlobalUnifiedCustomTerm
                ? mergeExcelMetricsPools(fallbackPools as any[])
                : (resolvedExcelMetrics || mergeExcelMetricsPools(fallbackPools as any[])));

        const hasDirectExcelMetrics = !!resolvedExcelMetrics && !isGlobalUnifiedCustomTerm;
        let nextMetrics = hasDirectExcelMetrics ? rawPool : null;
        const metricsMissingScopeIds = (metrics: any) => {
            if (!metrics) return false;
            const hasLegacyGrouped = (metrics.groupedDifferences || []).some((d: any) => !normalizeScopeId(d?.groupId));
            const hasLegacyItems = (metrics.items || []).some((it: any) => !normalizeScopeId(it?.groupId));
            return hasLegacyGrouped || hasLegacyItems;
        };
        const shouldNormalizeLegacyIds = metricsMissingScopeIds(rawPool);
        const normalizeDigitsKey = (v: unknown) => String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');
        const makeAliasSet = (values: unknown[]) => {
            const set = new Set<string>();
            values.forEach(v => {
                const raw = normalizeScopeId(v);
                if (raw) set.add(raw);
                const digits = normalizeDigitsKey(v);
                if (digits) set.add(digits);
            });
            return set;
        };

        if (( !hasDirectExcelMetrics || shouldNormalizeLegacyIds ) && rawPool?.groupedDifferences && scope.type === 'custom') {
            if (scopeGroupIds.length > 0 && data?.groups) {
                const acceptedIds = new Set<string>();
                const groupNameToIds = new Map<string, Set<string>>();
                (data.groups || []).forEach(g => {
                    const key = normalizeText(g.name);
                    if (!key) return;
                    const ids = groupNameToIds.get(key) || new Set<string>();
                    makeAliasSet([g.id]).forEach(id => ids.add(id));
                    groupNameToIds.set(key, ids);
                });
                scopeGroupIds.forEach(id => {
                    const group = data.groups.find(g => normalizeScopeId(g.id) === normalizeScopeId(id));
                    makeAliasSet([id, group?.id]).forEach(alias => acceptedIds.add(alias));
                });
                const matchCustomGroup = (row: any) => {
                    const rowId = normalizeScopeId(row?.groupId);
                    if (rowId) return acceptedIds.has(rowId) || acceptedIds.has(normalizeDigitsKey(rowId));
                    const rowName = normalizeText(row?.groupName);
                    if (!rowName) return false;
                    const ids = groupNameToIds.get(rowName);
                    if (!ids || ids.size !== 1) return false;
                    const only = Array.from(ids)[0];
                    return acceptedIds.has(only);
                };

                const filteredGrouped = (rawPool.groupedDifferences || []).filter((d: any) => matchCustomGroup(d));
                const filteredItems = (rawPool.items || []).filter((it: any) => matchCustomGroup(it));

                if (filteredGrouped.length > 0 || filteredItems.length > 0) {
                    const groupedSource = filteredGrouped.length > 0
                        ? filteredGrouped
                        : (filteredItems || []).map((it: any) => ({
                            groupId: normalizeScopeId(it.groupId) || undefined,
                            groupName: it.groupName,
                            deptId: normalizeScopeId(it.deptId) || undefined,
                            deptName: it.deptName,
                            catId: normalizeScopeId(it.catId) || undefined,
                            catName: it.catName,
                            sysQty: it.sysQty || 0,
                            sysCost: it.sysCost || 0,
                            countedQty: it.countedQty || 0,
                            countedCost: it.countedCost || 0,
                            diffQty: it.diffQty || 0,
                            diffCost: it.diffCost || 0
                        }));

                    const aggregated = groupedSource.reduce((acc: any, curr: any) => ({
                        sysQty: (acc.sysQty || 0) + (curr.sysQty || 0),
                        sysCost: (acc.sysCost || 0) + (curr.sysCost || 0),
                        countedQty: (acc.countedQty || 0) + (curr.countedQty || 0),
                        countedCost: (acc.countedCost || 0) + (curr.countedCost || 0),
                        diffQty: (acc.diffQty || 0) + (curr.diffQty || 0),
                        diffCost: (acc.diffCost || 0) + (curr.diffCost || 0)
                    }), { sysQty: 0, sysCost: 0, countedQty: 0, countedCost: 0, diffQty: 0, diffCost: 0 });

                    nextMetrics = {
                        ...aggregated,
                        items: filteredItems,
                        groupedDifferences: filteredGrouped
                    };
                }
            }

            if (!nextMetrics) {
                nextMetrics = rawPool;
            }
        }

        if (( !hasDirectExcelMetrics || shouldNormalizeLegacyIds ) && rawPool?.groupedDifferences && scope.groupId) {
            const group = data?.groups?.find(g => normalizeScopeId(g.id) === normalizeScopeId(scope.groupId));
            if (group) {
                const gName = normalizeText(group.name);
                const gAliases = makeAliasSet([scope.groupId, group.id]);
                const groupNameToIds = new Map<string, Set<string>>();
                (data?.groups || []).forEach(g => {
                    const key = normalizeText(g.name);
                    if (!key) return;
                    const ids = groupNameToIds.get(key) || new Set<string>();
                    makeAliasSet([g.id]).forEach(id => ids.add(id));
                    groupNameToIds.set(key, ids);
                });
                let dName = '';
                let cName = '';
                let dAliases = new Set<string>();
                let cAliases = new Set<string>();
                const deptNameToIds = new Map<string, Set<string>>();
                const catNameToIds = new Map<string, Set<string>>();
                let selectedDept: Department | undefined;

                if (scope.deptId) {
                    selectedDept = group.departments.find(d =>
                        makeAliasSet([d.id, (d as any).numericId]).has(normalizeScopeId(scope.deptId!)) ||
                        makeAliasSet([d.id, (d as any).numericId]).has(normalizeDigitsKey(scope.deptId!))
                    );
                    if (selectedDept) dName = normalizeText(selectedDept.name);
                    group.departments.forEach(d => {
                        const key = normalizeText(d.name);
                        if (!key) return;
                        const ids = deptNameToIds.get(key) || new Set<string>();
                        makeAliasSet([d.id, (d as any).numericId]).forEach(id => ids.add(id));
                        deptNameToIds.set(key, ids);
                    });
                    dAliases = makeAliasSet([scope.deptId, selectedDept?.id, (selectedDept as any)?.numericId]);
                }
                if (scope.catId && scope.deptId) {
                    const dept = selectedDept || group.departments.find(d => normalizeScopeId(d.id) === normalizeScopeId(scope.deptId!));
                    const cat = dept?.categories.find(c =>
                        makeAliasSet([c.id, (c as any).numericId]).has(normalizeScopeId(scope.catId!)) ||
                        makeAliasSet([c.id, (c as any).numericId]).has(normalizeDigitsKey(scope.catId!))
                    );
                    if (cat) {
                        cName = normalizeText(cat.name);
                        cAliases = makeAliasSet([scope.catId, cat.id, (cat as any).numericId]);
                    }
                    (dept?.categories || []).forEach(c => {
                        const key = normalizeText(c.name);
                        if (!key) return;
                        const ids = catNameToIds.get(key) || new Set<string>();
                        makeAliasSet([c.id, (c as any).numericId]).forEach(id => ids.add(id));
                        catNameToIds.set(key, ids);
                    });
                }
                const matchByUniqueName = (nameMap: Map<string, Set<string>>, rowName: unknown, targetAliases: Set<string>) => {
                    const key = normalizeText(rowName);
                    if (!key) return false;
                    const ids = nameMap.get(key);
                    if (!ids || ids.size !== 1) return false;
                    const only = Array.from(ids)[0];
                    return targetAliases.has(only);
                };

                const filteredGrouped = rawPool.groupedDifferences.filter((d: any) => {
                    const hasGroupId = !!normalizeScopeId(d.groupId);
                    const hasDeptId = !!normalizeScopeId(d.deptId);
                    const hasCatId = !!normalizeScopeId(d.catId);
                    const matchG = hasGroupId
                        ? (gAliases.has(normalizeScopeId(d.groupId)) || gAliases.has(normalizeDigitsKey(d.groupId)))
                        : (normalizeText(d.groupName) === gName && matchByUniqueName(groupNameToIds, d.groupName, gAliases));
                    if (scope.type === 'group') return matchG;
                    const matchD = hasDeptId
                        ? (dAliases.has(normalizeScopeId(d.deptId)) || dAliases.has(normalizeDigitsKey(d.deptId)))
                        : (normalizeText(d.deptName) === dName && matchByUniqueName(deptNameToIds, d.deptName, dAliases));
                    if (scope.type === 'department') return matchG && matchD;
                    const matchC = hasCatId
                        ? (cAliases.has(normalizeScopeId(d.catId)) || cAliases.has(normalizeDigitsKey(d.catId)))
                        : (normalizeText(d.catName) === cName && matchByUniqueName(catNameToIds, d.catName, cAliases));
                    return matchG && matchD && matchC;
                });

                const filteredItems = (rawPool.items || []).filter((it: any) => {
                    const hasGroupId = !!normalizeScopeId(it.groupId);
                    const hasDeptId = !!normalizeScopeId(it.deptId);
                    const hasCatId = !!normalizeScopeId(it.catId);
                    const matchG = hasGroupId
                        ? (gAliases.has(normalizeScopeId(it.groupId)) || gAliases.has(normalizeDigitsKey(it.groupId)))
                        : (normalizeText(it.groupName) === gName && matchByUniqueName(groupNameToIds, it.groupName, gAliases));
                    if (scope.type === 'group') return matchG;
                    const matchD = hasDeptId
                        ? (dAliases.has(normalizeScopeId(it.deptId)) || dAliases.has(normalizeDigitsKey(it.deptId)))
                        : (normalizeText(it.deptName) === dName && matchByUniqueName(deptNameToIds, it.deptName, dAliases));
                    if (scope.type === 'department') return matchG && matchD;
                    const matchC = hasCatId
                        ? (cAliases.has(normalizeScopeId(it.catId)) || cAliases.has(normalizeDigitsKey(it.catId)))
                        : (normalizeText(it.catName) === cName && matchByUniqueName(catNameToIds, it.catName, cAliases));
                    return matchG && matchD && matchC;
                });

                if (filteredGrouped.length > 0 || filteredItems.length > 0) {
                    const groupedSource = filteredGrouped.length > 0
                        ? filteredGrouped
                        : (filteredItems || []).reduce((acc: any[], it: any) => {
                            const key = `${normalizeScopeId(it.groupId) || it.groupName}|${normalizeScopeId(it.deptId) || it.deptName}|${normalizeScopeId(it.catId) || it.catName}`;
                            const existing = acc.find(x => `${normalizeScopeId(x.groupId) || x.groupName}|${normalizeScopeId(x.deptId) || x.deptName}|${normalizeScopeId(x.catId) || x.catName}` === key);
                            if (existing) {
                                existing.sysQty += it.sysQty || 0;
                                existing.sysCost += it.sysCost || 0;
                                existing.countedQty += it.countedQty || 0;
                                existing.countedCost += it.countedCost || 0;
                                existing.diffQty += it.diffQty || 0;
                                existing.diffCost += it.diffCost || 0;
                            } else {
                                acc.push({
                                    groupId: normalizeScopeId(it.groupId) || undefined,
                                    groupName: it.groupName,
                                    deptId: normalizeScopeId(it.deptId) || undefined,
                                    deptName: it.deptName,
                                    catId: normalizeScopeId(it.catId) || undefined,
                                    catName: it.catName,
                                    sysQty: it.sysQty || 0,
                                    sysCost: it.sysCost || 0,
                                    countedQty: it.countedQty || 0,
                                    countedCost: it.countedCost || 0,
                                    diffQty: it.diffQty || 0,
                                    diffCost: it.diffCost || 0
                                });
                            }
                            return acc;
                        }, []);

                    const aggregated = groupedSource.reduce((acc: any, curr: any) => ({
                        sysQty: (acc.sysQty || 0) + (curr.sysQty || 0),
                        sysCost: (acc.sysCost || 0) + (curr.sysCost || 0),
                        countedQty: (acc.countedQty || 0) + (curr.countedQty || 0),
                        countedCost: (acc.countedCost || 0) + (curr.countedCost || 0),
                        diffQty: (acc.diffQty || 0) + (curr.diffQty || 0),
                        diffCost: (acc.diffCost || 0) + (curr.diffCost || 0)
                    }), { sysQty: 0, sysCost: 0, countedQty: 0, countedCost: 0, diffQty: 0, diffCost: 0 });

                    nextMetrics = {
                        ...aggregated,
                        items: filteredItems,
                        groupedDifferences: groupedSource
                    };
                } else {
                    // Nenhuma linha casou com o grupo/departamento/categoria.
                    // Evita "vazamento" entre grupos com departamentos/categorias de mesmo nome.
                    // Só mantém pool bruto para escopo de GRUPO; depto/categoria ficam sem métrica.
                    nextMetrics = scope.type === 'group' ? rawPool : null;
                }
            }
        }

        // Corrigir apenas groupName e tentar upgrade de DIVERSOS via data.groups
        // NÃO re-classifica itens que já têm dept/cat válidos — apenas corrige o grupo
        if (( !hasDirectExcelMetrics || shouldNormalizeLegacyIds ) && nextMetrics && scope.groupId) {
            const termGroupName = GROUP_CONFIG_DEFAULTS[scope.groupId] || `Grupo ${scope.groupId}`;
            const scopeGroupIdNorm = normalizeScopeId(scope.groupId);
            const scopeGroupNameNorm = normalizeText(termGroupName);

            // Build localLookup only to TRY to upgrade DIVERSOS items that might now be in data.groups
            const localLookup = new Map<string, { deptId?: string; deptName: string; catId?: string; catName: string }>();
            if (data?.groups) {
                const groupObj = data.groups.find(g => String(g.id) === String(scope.groupId));
                if (groupObj) {
                    groupObj.departments.forEach(d => {
                        d.categories.forEach(c => {
                            c.products.forEach(p => {
                                const key = normalizeBarcode(p.reducedCode || p.code);
                                if (key) localLookup.set(key, { deptId: normalizeScopeId(d.id), deptName: d.name, catId: normalizeScopeId(c.id), catName: c.name });
                                const altKey = normalizeBarcode(p.code);
                                if (altKey && altKey !== key && !localLookup.has(altKey)) {
                                    localLookup.set(altKey, { deptId: normalizeScopeId(d.id), deptName: d.name, catId: normalizeScopeId(c.id), catName: c.name });
                                }
                            });
                        });
                    });
                }
            }

            // Preserve classificação carregada: não forçar troca de grupo quando não encontrar vínculo.
            // Upgrade para dept/cat ocorre só quando item está em DIVERSOS e houver match local.
            if (nextMetrics.items) {
                nextMetrics.items = nextMetrics.items.map((item: any) => {
                    const rawGroupName = String(item.groupName || '').trim();
                    const isSemGrupo = normalizeText(rawGroupName) === normalizeText('DIVERSOS (SEM GRUPO)');
                    const currentGroupId = normalizeScopeId(item.groupId);
                    // Nunca "puxa" item sem grupo para o grupo do termo aberto.
                    // Se o item não trouxer grupo de origem, permanece sem grupo.
                    const resolvedGroupId = currentGroupId || '';
                    const resolvedGroupName = rawGroupName || (resolvedGroupId ? termGroupName : 'DIVERSOS (SEM GRUPO)');

                    const alreadyClassified =
                        item.deptName && item.deptName !== 'DIVERSOS (SEM DEPARTAMENTO)' &&
                        item.catName && item.catName !== 'DIVERSOS (SEM CATEGORIA)';

                    if (alreadyClassified) {
                        return {
                            ...item,
                            groupId: resolvedGroupId || undefined,
                            groupName: resolvedGroupName
                        };
                    }

                    // Item is still in DIVERSOS — try to upgrade via localLookup
                    const match = localLookup.get(normalizeBarcode(item.code));
                    return {
                        ...item,
                        groupId: resolvedGroupId || undefined,
                        groupName: resolvedGroupName,
                        deptId: match ? normalizeScopeId(match.deptId) : normalizeScopeId(item.deptId),
                        deptName: match ? match.deptName : (item.deptName || 'DIVERSOS (SEM DEPARTAMENTO)'),
                        catId: match ? normalizeScopeId(match.catId) : normalizeScopeId(item.catId),
                        catName: match ? match.catName : (item.catName || 'DIVERSOS (SEM CATEGORIA)')
                    };
                });

                // Em termo de grupo, mantém somente itens realmente pertencentes ao grupo do escopo.
                // Isso evita contaminação visual/financeira (ex.: grupo 66 exibindo divergência de outro grupo).
                if (scope.type === 'group') {
                    nextMetrics.items = nextMetrics.items.filter((item: any) => {
                        const rowGroupId = normalizeScopeId(item.groupId);
                        const rowGroupName = normalizeText(item.groupName);
                        if (rowGroupId) return rowGroupId === scopeGroupIdNorm;
                        if (rowGroupName) return rowGroupName === scopeGroupNameNorm;
                        return false;
                    });
                }
            }

            // Re-aggregate groupedDifferences from corrected items
            if (nextMetrics.items) {
                const gMap: Record<string, { groupId?: string; groupName: string; deptId?: string; deptName: string; catId?: string; catName: string; sysQty: number; sysCost: number; countedQty: number; countedCost: number; diffCost: number; diffQty: number }> = {};
                nextMetrics.items.forEach((item: any) => {
                    const key = `${normalizeScopeId(item.groupId) || item.groupName}|${normalizeScopeId(item.deptId) || item.deptName}|${normalizeScopeId(item.catId) || item.catName}`;
                    if (!gMap[key]) {
                        gMap[key] = {
                            groupId: normalizeScopeId(item.groupId) || undefined,
                            groupName: item.groupName,
                            deptId: normalizeScopeId(item.deptId) || undefined,
                            deptName: item.deptName,
                            catId: normalizeScopeId(item.catId) || undefined,
                            catName: item.catName,
                            sysQty: 0,
                            sysCost: 0,
                            countedQty: 0,
                            countedCost: 0,
                            diffCost: 0,
                            diffQty: 0
                        };
                    }
                    gMap[key].sysQty += (item.sysQty || 0);
                    gMap[key].sysCost += (item.sysCost || 0);
                    gMap[key].countedQty += (item.countedQty || 0);
                    gMap[key].countedCost += (item.countedCost || 0);
                    gMap[key].diffCost += (item.diffCost || 0);
                    gMap[key].diffQty += (item.diffQty || 0);
                });
                nextMetrics.groupedDifferences = Object.values(gMap).sort((a, b) => a.diffCost - b.diffCost);
            }
        }
        // Filtro final obrigatório por escopo para evitar contaminação entre grupos/departamentos/categorias.
        // Aplica inclusive quando o termo possui excelMetrics direto salvo.
        if (nextMetrics && scope.type !== 'custom') {
            const scopeCategories = getScopeCategories(scope.groupId, scope.deptId, scope.catId);
            const allowedCatKeys = new Set(
                scopeCategories.map(({ group, dept, cat }) =>
                    partialScopeKey({ groupId: group.id, deptId: dept.id, catId: cat.id })
                )
            );
            const inScope = (row: any) => {
                const key = partialScopeKey({ groupId: row?.groupId, deptId: row?.deptId, catId: row?.catId });
                if (allowedCatKeys.has(key)) return true;
                // fallback legado por nome quando IDs vierem ausentes
                return scopeCategories.some(({ group, dept, cat }) =>
                    normalizeText(row?.groupName) === normalizeText(group.name) &&
                    normalizeText(row?.deptName) === normalizeText(dept.name) &&
                    normalizeText(row?.catName) === normalizeText(cat.name)
                );
            };

            const scopedItems = Array.isArray(nextMetrics.items)
                ? nextMetrics.items.filter(inScope)
                : [];

            if (scopedItems.length > 0) {
                const gMap: Record<string, {
                    groupId?: string; groupName: string;
                    deptId?: string; deptName: string;
                    catId?: string; catName: string;
                    sysQty: number; sysCost: number;
                    countedQty: number; countedCost: number;
                    diffCost: number; diffQty: number;
                }> = {};

                scopedItems.forEach((item: any) => {
                    const key = `${normalizeScopeId(item.groupId) || normalizeText(item.groupName)}|${normalizeScopeId(item.deptId) || normalizeText(item.deptName)}|${normalizeScopeId(item.catId) || normalizeText(item.catName)}`;
                    if (!gMap[key]) {
                        gMap[key] = {
                            groupId: normalizeScopeId(item.groupId) || undefined,
                            groupName: item.groupName || 'DIVERSOS (SEM GRUPO)',
                            deptId: normalizeScopeId(item.deptId) || undefined,
                            deptName: item.deptName || 'DIVERSOS (SEM DEPARTAMENTO)',
                            catId: normalizeScopeId(item.catId) || undefined,
                            catName: item.catName || 'DIVERSOS (SEM CATEGORIA)',
                            sysQty: 0,
                            sysCost: 0,
                            countedQty: 0,
                            countedCost: 0,
                            diffCost: 0,
                            diffQty: 0
                        };
                    }
                    gMap[key].sysQty += Number(item?.sysQty || 0);
                    gMap[key].sysCost += Number(item?.sysCost || 0);
                    gMap[key].countedQty += Number(item?.countedQty || 0);
                    gMap[key].countedCost += Number(item?.countedCost || 0);
                    gMap[key].diffQty += Number(item?.diffQty || 0);
                    gMap[key].diffCost += Number(item?.diffCost || 0);
                });

                const groupedDifferences = Object.values(gMap).sort((a, b) => a.diffCost - b.diffCost);
                const totals = scopedItems.reduce((acc: any, item: any) => ({
                    sysQty: acc.sysQty + Number(item?.sysQty || 0),
                    sysCost: acc.sysCost + Number(item?.sysCost || 0),
                    countedQty: acc.countedQty + Number(item?.countedQty || 0),
                    countedCost: acc.countedCost + Number(item?.countedCost || 0),
                    diffQty: acc.diffQty + Number(item?.diffQty || 0),
                    diffCost: acc.diffCost + Number(item?.diffCost || 0)
                }), { sysQty: 0, sysCost: 0, countedQty: 0, countedCost: 0, diffQty: 0, diffCost: 0 });

                nextMetrics = {
                    ...nextMetrics,
                    ...totals,
                    items: scopedItems,
                    groupedDifferences
                };
            } else if (Array.isArray(nextMetrics.groupedDifferences)) {
                const grouped = nextMetrics.groupedDifferences.filter(inScope);
                if (grouped.length > 0) {
                    const totals = grouped.reduce((acc: any, row: any) => ({
                        sysQty: acc.sysQty + Number(row?.sysQty || 0),
                        sysCost: acc.sysCost + Number(row?.sysCost || 0),
                        countedQty: acc.countedQty + Number(row?.countedQty || 0),
                        countedCost: acc.countedCost + Number(row?.countedCost || 0),
                        diffQty: acc.diffQty + Number(row?.diffQty || 0),
                        diffCost: acc.diffCost + Number(row?.diffCost || 0)
                    }), { sysQty: 0, sysCost: 0, countedQty: 0, countedCost: 0, diffQty: 0, diffCost: 0 });
                    nextMetrics = {
                        ...nextMetrics,
                        ...totals,
                        groupedDifferences: grouped,
                        items: []
                    };
                } else {
                    nextMetrics = null;
                }
            } else {
                nextMetrics = null;
            }
        }

        setTermComparisonMetrics(normalizeTermMetricsToOfficial(nextMetrics));

        // Persist re-classified metrics & form to termDrafts always (not conditional on reference equality)
        const normalizedNextMetrics = normalizeTermMetricsToOfficial(nextMetrics);
        const formToSave = normalizedNextMetrics
            ? { ...nextForm, excelMetrics: normalizedNextMetrics }
            : (nextForm?.excelMetrics
                ? { ...nextForm, excelMetrics: normalizeTermMetricsToOfficial(nextForm.excelMetrics) }
                : ((draft?.excelMetrics ? { ...nextForm, excelMetrics: normalizeTermMetricsToOfficial(draft.excelMetrics) } : nextForm)));
        setTermDrafts(current => {
            const mergedBase = composeTermDraftsForPersist(current, termDrafts);
            const nextDrafts = upsertScopeDraft(mergedBase, scope as any, formToSave);
            termDraftsRef.current = nextDrafts;
            return nextDrafts;
        });
        }
    };

    useEffect(() => {
        if (!termModal || !termForm) return;
        const key = buildTermKey(termModal);
        const legacyKey = getLegacyCustomTermKey(termModal);
        const metricsStore = (((data as any)?.termExcelMetricsByKey || {}) as Record<string, any>);
        const equivalentCustomPayload = findEquivalentCustomTermPayload(termModal, termDrafts, metricsStore);
        const draft = termDrafts[key] || (legacyKey ? termDrafts[legacyKey] : undefined) || equivalentCustomPayload?.draft;
        const backupMetrics = pickPreferredTermMetrics(
            metricsStore[key],
            legacyKey ? metricsStore[legacyKey] : undefined,
            equivalentCustomPayload?.metrics
        );
        const remoteMetrics = normalizeTermMetricsToOfficial(pickPreferredTermMetrics(draft?.excelMetrics, backupMetrics));
        const explicitlyRemoved = !!(draft?.excelMetricsRemovedAt && !draft?.excelMetrics);
        if (!remoteMetrics || explicitlyRemoved) return;

        if (!termForm.excelMetrics) {
            setTermForm(prev => prev && !prev.excelMetrics ? { ...prev, excelMetrics: remoteMetrics } : prev);
        }
        if (!rawTermMetricsRef.current) {
            setTermComparisonMetrics(remoteMetrics);
        }
    }, [data, termDrafts, termForm, termModal]);

    const updateTermForm = (updater: (prev: TermForm) => TermForm, options?: { skipReplication?: boolean }) => {
        setTermForm(prev => {
            if (!prev) return prev;
            if (isReadOnlyCompletedView) return prev;
            const next = updater(prev);
            if (termModal) {
                const key = buildTermKey(termModal);
                setTermDrafts(current => {
                    const persistedMetrics = normalizeTermMetricsToOfficial(pickPreferredTermMetrics(
                        rawTermMetricsRef.current,
                        termComparisonMetrics,
                        next.excelMetrics,
                        current[key]?.excelMetrics
                    ));
                    const currentScopeDrafts = upsertScopeDraft(
                        current,
                        termModal,
                        persistedMetrics ? { ...next, excelMetrics: persistedMetrics } : next
                    );
                    if (options?.skipReplication) return currentScopeDrafts;
                    return replicateSignersToAllTermDrafts(currentScopeDrafts, next);
                });
            }
            return next;
        });
    };

    const handleSignatureComplete = async (field: 'managerSignature' | 'managerSignature2' | { collabIndex: number }, dataUrl: string) => {
        if (isReadOnlyCompletedView || !termModal || !data) return;

        // Atualização instantânea para a UI
        updateTermForm(prev => {
            if (!prev) return prev;
            const updated = { ...prev };
            if (field === 'managerSignature') updated.managerSignature = dataUrl;
            else if (field === 'managerSignature2') updated.managerSignature2 = dataUrl;
            else if (typeof field === 'object' && field.collabIndex !== undefined) {
                updated.collaborators = updated.collaborators.map((c, i) => i === field.collabIndex ? { ...c, signature: dataUrl } : c);
            }
            return updated;
        });

        // Background: compressão, replicação para todos os termos e salvamento no BD
        void (async () => {
            try {
                const compressed = await ImageUtils.compressImage(dataUrl, { maxWidth: 600, quality: 0.6 });
                
                const currentData = data;
                const currentForm = termFormRef.current || termForm;

                let finalForm = { ...currentForm } as TermForm;
                if (field === 'managerSignature') finalForm.managerSignature = compressed;
                else if (field === 'managerSignature2') finalForm.managerSignature2 = compressed;
                else if (typeof field === 'object' && field.collabIndex !== undefined) {
                    finalForm.collaborators = finalForm.collaborators.map((c, i) => i === field.collabIndex ? { ...c, signature: compressed } : c);
                }

                // Atualiza a UI com a versão comprimida
                updateTermForm(() => finalForm);

                // IMPORTANTE: Buscar a auditoria MAIS RECENTE do banco para não sobrescrever o progresso de outros usuários (ex: Gestor vs Master)
                const freshLatest = await fetchLatestAudit(selectedFilial);
                const baseData = freshLatest ? (freshLatest.data as AuditData) : currentData;
                const baseDrafts = (baseData as any).termDrafts || {};

                // Monta estrutura de salvamento baseada nos dados mais recentes
                const key = buildTermKey(termModal);
                const forceClearedFlag = removedExcelDraftKeysRef.current.has(key);
                const latestBackupMetrics = (((baseData as any)?.termExcelMetricsByKey || {}) as Record<string, any>)[key];
                const latestDraftAtKey = baseDrafts[key] || termDrafts[key];
                const hasAnyMetricsInMemory = !!(rawTermMetricsRef.current || rawTermComparisonMetrics || termComparisonMetrics || finalForm.excelMetrics || latestDraftAtKey?.excelMetrics || latestBackupMetrics);
                const forceCleared = forceClearedFlag && !hasAnyMetricsInMemory;
                const persistedMetrics = forceCleared ? undefined : normalizeTermMetricsToOfficial(pickPreferredTermMetrics(
                    rawTermMetricsRef.current,
                    rawTermComparisonMetrics,
                    termComparisonMetrics,
                    finalForm.excelMetrics,
                    latestDraftAtKey?.excelMetrics,
                    latestBackupMetrics
                ));
                
                const formToSave = persistedMetrics ? { ...finalForm, excelMetrics: persistedMetrics } : (latestDraftAtKey || finalForm);
                const nextDrafts = forceCleared ? baseDrafts : upsertScopeDraft(baseDrafts, termModal, formToSave);
                
                // Replica assinatura para TODOS os termos em rascunho instantaneamente
                const syncedDrafts = replicateSignersToAllTermDrafts(nextDrafts, finalForm);
                const nextDataWithTerms = { ...baseData, termDrafts: syncedDrafts } as any;
                
                setTermDrafts(syncedDrafts);
                termDraftsRef.current = syncedDrafts;
                setData(nextDataWithTerms as AuditData);

                // Dispara salvamento pro DB passando allowProgressRegression para contornar qualquer rejeição de timestamp
                let skus = 0;
                let doneSkus = 0;
                (nextDataWithTerms.groups || []).forEach((g: any) =>
                    (g.departments || []).forEach((d: any) =>
                        (d.categories || []).forEach((c: any) => {
                            skus += Number(c.itemsCount || 0);
                            if (isDoneStatus(c.status)) doneSkus += Number(c.itemsCount || 0);
                        })
                    )
                );
                const progress = skus > 0 ? (doneSkus / skus) * 100 : 0;
                
                const savedSession = await persistAuditSession({
                    id: freshLatest?.id || dbSessionId,
                    branch: selectedFilial,
                    audit_number: freshLatest?.audit_number || nextAuditNumber,
                    status: freshLatest?.status || 'open',
                    data: nextDataWithTerms,
                    progress: Math.max(progress, Number(freshLatest?.progress || 0)),
                    user_email: userEmail
                }, { allowProgressRegression: true });
                
                if (savedSession) {
                    await CacheService.set(`audit_session_${selectedFilial}`, savedSession as any);
                }
            } catch (err) {
                console.error("Auto-save signature failed:", err);
            }
        })();
    };
    const handleSaveTermDraft = async () => {
        if (!termModal || !termForm || !data) return;
        setIsSavingTerm(true);
        try {
            const freshLatest = await fetchLatestAudit(selectedFilial);
            const baseData = freshLatest ? (freshLatest.data as AuditData) : data;
            const baseDrafts = (baseData as any).termDrafts || {};
            const key = buildTermKey(termModal);
            const forceClearedFlag = removedExcelDraftKeysRef.current.has(key);
            const latestBackupMetrics = (((baseData as any)?.termExcelMetricsByKey || {}) as Record<string, any>)[key];
            const latestDraftAtKey = baseDrafts[key] || termDrafts[key];
            const hasAnyMetricsInMemory = !!(rawTermMetricsRef.current || rawTermComparisonMetrics || termComparisonMetrics || termForm.excelMetrics || latestDraftAtKey?.excelMetrics || latestBackupMetrics);
            const forceCleared = forceClearedFlag && !hasAnyMetricsInMemory;
            const persistedMetrics = forceCleared ? undefined : normalizeTermMetricsToOfficial(pickPreferredTermMetrics(
                rawTermMetricsRef.current,
                rawTermComparisonMetrics,
                termComparisonMetrics,
                termForm.excelMetrics,
                latestDraftAtKey?.excelMetrics,
                latestBackupMetrics
            ));
            const formToSave = persistedMetrics ? { ...termForm, excelMetrics: persistedMetrics } : termForm;
            const nextDrafts = forceCleared ? baseDrafts : upsertScopeDraft(baseDrafts, termModal, formToSave);
            const syncedDrafts = replicateSignersToAllTermDrafts(nextDrafts, termForm);
            const nextDataWithTerms = { ...baseData, termDrafts: syncedDrafts } as any;
            setTermDrafts(syncedDrafts);
            termDraftsRef.current = syncedDrafts;
            setData(nextDataWithTerms as AuditData);
            const savedSession = await persistAuditSession({
                id: freshLatest?.id || dbSessionId,
                branch: selectedFilial,
                audit_number: freshLatest?.audit_number || nextAuditNumber,
                status: freshLatest?.status || 'open',
                data: nextDataWithTerms,
                progress: calculateProgress(nextDataWithTerms),
                user_email: userEmail
            }, { allowProgressRegression: true });
            if (savedSession) {
                await CacheService.set(`audit_session_${selectedFilial}`, savedSession as any);
                setShowSavedFeedback(true);
                alert("✅ Dados salvos com sucesso no Banco de Dados!");
                setTimeout(() => setShowSavedFeedback(false), 2500);
            }
        } catch (err) {
            console.error("Error saving term draft:", err);
            alert("Erro ao salvar rascunho do termo. Verifique sua conexão.");
        } finally {
            setIsSavingTerm(false);
        }
    };
    const closeTermModal = useCallback(() => {
        const currentScope = termModal;
        const currentForm = termFormRef.current || termForm;
        const currentData = data;
        const currentDrafts = termDraftsRef.current || termDrafts;
        const currentMetrics = rawTermMetricsRef.current || rawTermComparisonMetrics || termComparisonMetrics;

        // Fecha instantaneamente; persistência roda em background.
        setTermModal(null);
        setTermForm(null);
        setTermComparisonMetrics(null);
        setTermFieldErrors({});
        setTermTouchedFields({});
        setTermShakeFields({});

        if (!isReadOnlyCompletedView && currentScope && currentForm && currentData) {
            const key = buildTermKey(currentScope);
            const forceClearedFlag = removedExcelDraftKeysRef.current.has(key);
            const latestDraftAtKey = currentDrafts[key];
            const hasAnyMetricsInMemory =
                !!(rawTermMetricsRef.current ||
                    rawTermComparisonMetrics ||
                    termComparisonMetrics ||
                    currentForm.excelMetrics ||
                    latestDraftAtKey?.excelMetrics);
            const forceCleared = forceClearedFlag && !hasAnyMetricsInMemory;
            const persistedMetrics =
                forceCleared
                    ? undefined
                    : normalizeTermMetricsToOfficial(pickPreferredTermMetrics(
                        currentMetrics,
                        currentForm.excelMetrics,
                        latestDraftAtKey?.excelMetrics
                    ));
            const formToSave = persistedMetrics
                ? { ...currentForm, excelMetrics: persistedMetrics }
                : (latestDraftAtKey || currentForm);
            // Segurança: se já existe Excel salvo e nada novo foi calculado, mantém o draft existente
            // para impedir sobrescrita vazia ao fechar o modal.
            const shouldKeepExistingDraft =
                !forceCleared &&
                !persistedMetrics &&
                !!latestDraftAtKey?.excelMetrics;
            const nextDrafts = shouldKeepExistingDraft
                ? currentDrafts
                : upsertScopeDraft(currentDrafts, currentScope, formToSave);
            const syncedDrafts = replicateSignersToAllTermDrafts(nextDrafts, currentForm);
            const metricsStore = { ...(((currentData as any)?.termExcelMetricsByKey || {}) as Record<string, any>) };
            if (forceCleared) {
                delete metricsStore[key];
            } else if (persistedMetrics) {
                metricsStore[key] = persistedMetrics;
            }
            const nextDataWithTerms = { ...currentData, termDrafts: syncedDrafts, termExcelMetricsByKey: metricsStore } as any;
            setTermDrafts(syncedDrafts);
            termDraftsRef.current = syncedDrafts;
            setData(nextDataWithTerms as AuditData);
            void (async () => {
                try {
                    let dataToPersist = nextDataWithTerms;
                    let sessionIdToPersist = dbSessionId;
                    let auditNumberToPersist = nextAuditNumber;
                    let statusToPersist: DbAuditSession['status'] = 'open';
                    let updatedAtToPersist = lastAuditUpdateRef.current || undefined;
                    const fresh = await fetchFreshOpenAuditSnapshot();
                    if (fresh) {
                        const remoteMetricsStore = { ...(((fresh.data as any)?.termExcelMetricsByKey || {}) as Record<string, any>) };
                        const remoteDrafts = fresh.drafts || {};
                        const latestBackupMetrics = remoteMetricsStore[key];
                        const latestDraftAtKey = remoteDrafts[key] || syncedDrafts[key];
                        const freshPersistedMetrics = forceCleared
                            ? undefined
                            : normalizeTermMetricsToOfficial(pickPreferredTermMetrics(
                                persistedMetrics,
                                latestDraftAtKey?.excelMetrics,
                                latestBackupMetrics
                            ));
                        const freshFormToSave = freshPersistedMetrics
                            ? { ...currentForm, excelMetrics: freshPersistedMetrics }
                            : (latestDraftAtKey || currentForm);
                        const freshDrafts = forceCleared
                            ? remoteDrafts
                            : upsertScopeDraft(remoteDrafts, currentScope, freshFormToSave);
                        const freshSyncedDrafts = replicateSignersToAllTermDrafts(freshDrafts, currentForm);
                        if (forceCleared) {
                            delete remoteMetricsStore[key];
                        } else if (freshPersistedMetrics) {
                            remoteMetricsStore[key] = freshPersistedMetrics;
                        }
                        dataToPersist = { ...fresh.data, termDrafts: freshSyncedDrafts, termExcelMetricsByKey: remoteMetricsStore } as any;
                        sessionIdToPersist = fresh.session.id;
                        auditNumberToPersist = fresh.session.audit_number;
                        statusToPersist = fresh.session.status;
                        updatedAtToPersist = fresh.session.updated_at || updatedAtToPersist;
                        setTermDrafts(freshSyncedDrafts);
                        termDraftsRef.current = freshSyncedDrafts;
                        setData(dataToPersist as AuditData);
                    }
                    let skus = 0;
                    let doneSkus = 0;
                    (dataToPersist.groups || []).forEach((g: any) =>
                        (g.departments || []).forEach((d: any) =>
                            (d.categories || []).forEach((c: any) => {
                                skus += Number(c.itemsCount || 0);
                                if (isDoneStatus(c.status)) doneSkus += Number(c.itemsCount || 0);
                            })
                        )
                    );
                    const progress = skus > 0 ? (doneSkus / skus) * 100 : 0;
                    const savedSession = await persistAuditSession({
                        id: sessionIdToPersist,
                        branch: selectedFilial,
                        audit_number: auditNumberToPersist,
                        status: statusToPersist,
                        data: dataToPersist,
                        progress: progress,
                        user_email: userEmail,
                        updated_at: updatedAtToPersist
                    }, { allowProgressRegression: true });
                    if (savedSession) {
                        await CacheService.set(`audit_session_${selectedFilial}`, savedSession as any);
                    }
                } catch (err) {
                    console.error("Error autosaving term draft on close:", err);
                }
            })();
            if (forceCleared) {
                removedExcelDraftKeysRef.current.delete(key);
            }
        }
    }, [termModal, termForm, rawTermComparisonMetrics, termComparisonMetrics, data, termDrafts, dbSessionId, selectedFilial, nextAuditNumber, userEmail, isReadOnlyCompletedView, fetchFreshOpenAuditSnapshot]);

    const handleProcessTermComparisonExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isReadOnlyCompletedView) {
            alert("Modo consulta ativo: não é possível alterar Excel de termo.");
            e.target.value = '';
            return;
        }
        const file = e.target.files?.[0];
        if (!file) {
            setTermComparisonMetrics(null);
            return;
        }

        try {
            const rows = await readExcel(file);
            const termColumns = detectTermComparisonColumns(rows);
            let sysQty = 0;
            let sysCost = 0;
            let countedQty = 0;
            let countedCost = 0;
            let diffQtySum = 0;
            let diffCostSum = 0;
            const items: any[] = [];
            const scopeGroupIds = getScopeGroupIds(termModal);
            const hasSingleScopeGroup = scopeGroupIds.length === 1;
            const primaryScopeGroupId = hasSingleScopeGroup ? scopeGroupIds[0] : undefined;
            const scopedGroupNameSet = new Set<string>();
            if (data?.groups && scopeGroupIds.length > 0) {
                data.groups.forEach(g => {
                    if (scopeGroupIds.includes(normalizeScopeId(g.id))) {
                        scopedGroupNameSet.add(normalizeText(g.name));
                    }
                });
            }
            const singleScopedGroupName = primaryScopeGroupId
                ? (GROUP_CONFIG_DEFAULTS[primaryScopeGroupId as keyof typeof GROUP_CONFIG_DEFAULTS] || `Grupo ${primaryScopeGroupId}`)
                : undefined;
            const resolveHierarchyByIds = (groupId?: string, deptId?: string, catId?: string) => {
                const gId = normalizeScopeId(groupId);
                const dId = normalizeScopeId(deptId);
                const cId = normalizeScopeId(catId);
                const g = data?.groups?.find(gr => normalizeScopeId(gr.id) === gId);
                const d = g?.departments?.find(dp =>
                    normalizeScopeId(dp.id) === dId ||
                    normalizeScopeId((dp as any).numericId) === dId
                );
                const c = d?.categories?.find(ct =>
                    normalizeScopeId(ct.id) === cId ||
                    normalizeScopeId((ct as any).numericId) === cId
                );
                return {
                    groupId: gId,
                    groupName: g?.name || GROUP_CONFIG_DEFAULTS[gId] || (gId ? `Grupo ${gId}` : ''),
                    deptId: dId,
                    deptName: d?.name || '',
                    catId: cId,
                    catName: c?.name || ''
                };
            };

            type TermHierarchyEntry = { groupId?: string, groupName: string, deptId?: string, deptName: string, catId?: string, catName: string };

            const addUniqueHierarchyEntry = (
                registry: Map<string, TermHierarchyEntry[]>,
                code: unknown,
                entry: TermHierarchyEntry
            ) => {
                const key = normalizeBarcode(code);
                if (!key) return;
                const current = registry.get(key) || [];
                const alreadyExists = current.some(existing =>
                    normalizeScopeId(existing.groupId) === normalizeScopeId(entry.groupId) &&
                    normalizeScopeId(existing.deptId) === normalizeScopeId(entry.deptId) &&
                    normalizeScopeId(existing.catId) === normalizeScopeId(entry.catId) &&
                    normalizeText(existing.groupName) === normalizeText(entry.groupName) &&
                    normalizeText(existing.deptName) === normalizeText(entry.deptName) &&
                    normalizeText(existing.catName) === normalizeText(entry.catName)
                );
                if (!alreadyExists) {
                    current.push(entry);
                    registry.set(key, current);
                }
            };

            // --- Universal Registry: fallback scan of ALL group cadastro files ---
            const universalRegistry = new Map<string, TermHierarchyEntry[]>();

            const loadUniversalRegistry = async () => {
                for (const groupId of GROUP_UPLOAD_IDS) {
                    const file = globalGroupFiles[groupId];
                    if (!file) continue;

                    try {
                        const rows = await readExcel(file);
                        const groupName = GROUP_CONFIG_DEFAULTS[groupId] || `Grupo ${groupId}`;

                        rows.forEach((row: any[]) => {
                            if (!row || row.length < 4) return;

                            const deptRaw = String(row[18] ?? '').trim(); // Col S = departamento
                            const catRaw = String(row[22] ?? '').trim(); // Col W = categoria
                            if (!deptRaw && !catRaw) return;

                            const deptParsed = parseHierarchyCells(row[18], row[19], 'DIVERSOS (SEM DEPARTAMENTO)', ['GERAL']);
                            const catParsed = parseHierarchyCells(row[22], row[23], 'DIVERSOS (SEM CATEGORIA)', ['GERAL']);
                            const deptName = deptParsed.name;
                            const catName = catParsed.name;

                            const codes = collectProductCodeCandidates(row, 12);
                            codes.forEach(code => {
                                if (!code) return;
                                addUniqueHierarchyEntry(universalRegistry, code, {
                                    groupId: normalizeScopeId(groupId),
                                    groupName,
                                    deptId: normalizeScopeId(deptParsed.numericId),
                                    deptName,
                                    catId: normalizeScopeId(catParsed.numericId),
                                    catName
                                });
                            });
                        });
                    } catch (err) { }
                }
            };

            // --- Branch history registry: reuse previous finalized/open uploads from this branch ---
            const branchHistoryRegistry = new Map<string, TermHierarchyEntry[]>();

            const isUsableHistoryEntry = (entry: TermHierarchyEntry) => {
                return Boolean(
                    normalizeScopeId(entry.groupId) &&
                    String(entry.groupName || '').trim() &&
                    !isDiversosLabel(entry.groupName) &&
                    normalizeScopeId(entry.deptId) &&
                    String(entry.deptName || '').trim() &&
                    !isDiversosLabel(entry.deptName) &&
                    normalizeScopeId(entry.catId) &&
                    String(entry.catName || '').trim() &&
                    !isDiversosLabel(entry.catName)
                );
            };

            const addHistoryClassification = (code: unknown, entry: TermHierarchyEntry) => {
                if (!isUsableHistoryEntry(entry)) return;
                addUniqueHierarchyEntry(branchHistoryRegistry, code, {
                    groupId: normalizeScopeId(entry.groupId),
                    groupName: String(entry.groupName || '').trim(),
                    deptId: normalizeScopeId(entry.deptId),
                    deptName: String(entry.deptName || '').trim(),
                    catId: normalizeScopeId(entry.catId),
                    catName: String(entry.catName || '').trim()
                });
            };

            const addMetricsItemsToHistory = (metrics: any) => {
                (Array.isArray(metrics?.items) ? metrics.items : []).forEach((item: any) => {
                    addHistoryClassification(item?.code || item?.reducedCode || item?.barcode, {
                        groupId: normalizeScopeId(item?.groupId),
                        groupName: item?.groupName || '',
                        deptId: normalizeScopeId(item?.deptId),
                        deptName: item?.deptName || '',
                        catId: normalizeScopeId(item?.catId),
                        catName: item?.catName || ''
                    });
                });
            };

            const addAuditDataToHistoryRegistry = (sourceData: any) => {
                if (!sourceData) return;

                (sourceData.groups || []).forEach((group: any) => {
                    (group.departments || []).forEach((department: any) => {
                        (department.categories || []).forEach((category: any) => {
                            const entry: TermHierarchyEntry = {
                                groupId: normalizeScopeId(group.id),
                                groupName: group.name || GROUP_CONFIG_DEFAULTS[normalizeScopeId(group.id)] || '',
                                deptId: normalizeScopeId(department.id || department.numericId),
                                deptName: department.name || '',
                                catId: normalizeScopeId(category.id || category.numericId),
                                catName: category.name || ''
                            };
                            (category.products || []).forEach((product: any) => {
                                [
                                    product?.reducedCode,
                                    product?.code,
                                    product?.barcode,
                                    product?.codigo,
                                    product?.codReduzido,
                                    product?.id
                                ].forEach(code => addHistoryClassification(code, entry));
                            });
                        });
                    });
                });

                Object.values(sourceData.termExcelMetricsByKey || {}).forEach(addMetricsItemsToHistory);
                Object.values(sourceData.termDrafts || {}).forEach((draft: any) => addMetricsItemsToHistory(draft?.excelMetrics));
            };

            const loadBranchHistoryRegistry = async () => {
                addAuditDataToHistoryRegistry(data);
                try {
                    const history = await fetchAuditsHistory(selectedFilial);
                    const sessions = await Promise.all(
                        (history || [])
                            .slice(0, 12)
                            .map(async (audit) => {
                                if (audit?.id && dbSessionId && audit.id === dbSessionId) return null;
                                if (!audit?.audit_number) return null;
                                return fetchAuditSession(selectedFilial, audit.audit_number);
                            })
                    );
                    sessions.forEach(session => addAuditDataToHistoryRegistry(session?.data));
                } catch (err) {
                    console.warn('Falha ao carregar historico de classificacao da filial:', err);
                }
            };

            await Promise.all([loadUniversalRegistry(), loadBranchHistoryRegistry()]);

            // Pre-build hierarchy lookup for fast cross-referencing Col B (código reduzido)
            // Can contain multiple hierarchies if the item spans groups
            const productLookup = new Map<string, { groupId?: string, groupName: string, deptId?: string, deptName: string, catId?: string, catName: string }[]>();
            if (data?.groups) {
                data.groups.forEach(g => {
                    g.departments.forEach(d => {
                        d.categories.forEach(c => {
                            c.products.forEach(p => {
                                const key = normalizeBarcode(p.reducedCode || p.code);
                                if (key) {
                                    const ex = productLookup.get(key) || [];
                                    // Prevent strict duplicates
                                    if (!ex.find(e => normalizeScopeId(e.groupId) === normalizeScopeId(g.id) && normalizeScopeId(e.deptId) === normalizeScopeId(d.id) && normalizeScopeId(e.catId) === normalizeScopeId(c.id))) {
                                        ex.push({
                                            groupId: normalizeScopeId(g.id),
                                            groupName: g.name,
                                            deptId: normalizeScopeId(d.id),
                                            deptName: d.name,
                                            catId: normalizeScopeId(c.id),
                                            catName: c.name
                                        });
                                    }
                                    productLookup.set(key, ex);
                                }
                                const altKey = normalizeBarcode(p.code);
                                if (altKey && altKey !== key) {
                                    const ex = productLookup.get(altKey) || [];
                                    if (!ex.find(e => normalizeScopeId(e.groupId) === normalizeScopeId(g.id) && normalizeScopeId(e.deptId) === normalizeScopeId(d.id) && normalizeScopeId(e.catId) === normalizeScopeId(c.id))) {
                                        ex.push({
                                            groupId: normalizeScopeId(g.id),
                                            groupName: g.name,
                                            deptId: normalizeScopeId(d.id),
                                            deptName: d.name,
                                            catId: normalizeScopeId(c.id),
                                            catName: c.name
                                        });
                                    }
                                    productLookup.set(altKey, ex);
                                }
                            });
                        });
                    });
                });
            }

            // --- Secondary lookup: read cadastro file directly for this group ---
            // Pega itens com estoque zero (não em data.groups) via Col B e Col C (código reduzido)
            const cadastroLookup = new Map<string, TermHierarchyEntry>();
            if (primaryScopeGroupId) {
                const groupIdKey = primaryScopeGroupId as typeof GROUP_UPLOAD_IDS[number];
                const cadastroFile = globalGroupFiles[groupIdKey];
                if (cadastroFile) {
                    try {
                        const cadastroRows = await readExcel(cadastroFile);
                        cadastroRows.forEach((row: any[]) => {
                            if (!row || row.length < 4) return;

                            const deptRaw = String(row[18] ?? '').trim(); // Col S = departamento
                            const catRaw = String(row[22] ?? '').trim(); // Col W = categoria

                            // Skip rows where both dept and cat are empty (header/blank rows)
                            if (!deptRaw && !catRaw) return;

                            const deptParsed = parseHierarchyCells(row[18], row[19], 'DIVERSOS (SEM DEPARTAMENTO)', ['GERAL']);
                            const catParsed = parseHierarchyCells(row[22], row[23], 'DIVERSOS (SEM CATEGORIA)', ['GERAL']);
                            const deptName = deptParsed.name;
                            const catName = catParsed.name;

                            const rowCodes = collectProductCodeCandidates(row, 12);
                            rowCodes.forEach((codeCandidate) => {
                                if (!codeCandidate) return;
                                const candidate = {
                                    groupId: normalizeScopeId(primaryScopeGroupId),
                                    groupName: GROUP_CONFIG_DEFAULTS[normalizeScopeId(primaryScopeGroupId)] || `Grupo ${primaryScopeGroupId}`,
                                    deptId: normalizeScopeId(deptParsed.numericId),
                                    deptName,
                                    catId: normalizeScopeId(catParsed.numericId),
                                    catName
                                };
                                const current = cadastroLookup.get(codeCandidate);
                                const chosen = current ? pickBestHierarchyEntry([current as any, candidate as any], primaryScopeGroupId) as any : candidate;
                                cadastroLookup.set(codeCandidate, chosen);
                            });
                        });

                    } catch (err) { }
                }
            }


            const systemCategoryMap = new Map<string, { groupId: string, groupName: string, deptId: string, deptName: string, catId: string, catName: string }>();
            (data?.groups || []).forEach(g => {
                (g.departments || []).forEach(d => {
                    (d.categories || []).forEach(c => {
                        const key = normalizeText(c.name);
                        if (key && !systemCategoryMap.has(key)) {
                            systemCategoryMap.set(key, {
                                groupId: String(g.id),
                                groupName: g.name,
                                deptId: String(d.id),
                                deptName: d.name,
                                catId: String(c.id),
                                catName: c.name
                            });
                        }
                    });
                });
            });

            const groupedMap: Record<string, { groupId?: string, groupName: string, deptId?: string, deptName: string, catId?: string, catName: string, sysQty: number, sysCost: number, countedQty: number, countedCost: number, diffQty: number, diffCost: number }> = {};

            // Process rows after the real table header; metadata above it is ignored.
            const firstProductRowIndex = termColumns.headerRowIndex >= 0 ? termColumns.headerRowIndex + 1 : 1;
            for (let i = firstProductRowIndex; i < rows.length; i++) {
                const row = rows[i];
                if (!row) continue;

                // Se houver "Total Geral", ignorar
                const rowText = row.map(cell => String(cell || '').trim().toLowerCase()).join(' | ');
                const codigo = String(row[termColumns.code] || '').trim();
                const descricao = String(row[termColumns.description] || '').trim();

                if (rowText.includes('total geral')) {
                    continue;
                }

                // Skip header / metadata rows from the Excel system export
                const metadataKeywords = [
                    'filial:', 'grupo de produtos:', 'departamento:', 'categoria:',
                    'tipo de produto:', 'grupo de preço:', 'início contagem:',
                    'conferência de estoque', 'código', 'página 1 de', 'produto:'
                ];

                let isHeader = false;
                for (let j = 0; j < Math.min(row.length, 5); j++) {
                    const cellVal = String(row[j] || '').trim().toLowerCase();
                    if (metadataKeywords.some(keyword => cellVal.startsWith(keyword))) {
                        isHeader = true;
                        break;
                    }
                }

                // If code or description is exactly "-" or empty, it's highly likely a metadata row
                const isHyphenRow = (!codigo && !descricao) ||
                    codigo === '-' ||
                    descricao === '-' ||
                    (codigo === '' && descricao === '-');

                // Real product rows in this report will have a numeric value in column K (sysQty) and O (countedQty)
                // Metadata rows usually have empty strings or spaces there, or don't reach those indices
                const sqStr = String(row[termColumns.sysQty] || '').trim();
                const cqStr = String(row[termColumns.countedQty] || '').trim();
                const isNotProductRow = sqStr === '' && cqStr === '';

                if (isHeader || isHyphenRow || isNotProductRow) {
                    continue;
                }

                const sq = parseStockNumber(row[termColumns.sysQty]);
                const sc = parseStockNumber(row[termColumns.sysCost]);
                const cq = parseStockNumber(row[termColumns.countedQty]);
                const cc = parseStockNumber(row[termColumns.countedCost]);

                // A diferença QTD agora é calculada matematicamente (Físico - Sistema) em vez de ler a coluna N, 
                // pois a soma literal de N estava gerando valores incorretos (+71.488 un).
                const dq = cq - sq;

                // Captura os dados básicos da linha para imprimir no termo depois
                const code = String(row[termColumns.code] || '').trim();
                const description = String(row[termColumns.description] || '').trim();
                const lab = String(row[termColumns.lab] || '').trim();

                sysQty += sq;
                sysCost += sc;
                countedQty += cq;
                countedCost += cc;
                diffQtySum += dq;
                const directCostDiff = termColumns.diffCost !== undefined && hasNumericCellValue(row[termColumns.diffCost])
                    ? parseStockNumber(row[termColumns.diffCost])
                    : null;
                const costDiff = directCostDiff ?? (cc - sc);
                diffCostSum += costDiff;

                // Identifica a Hierarquia cruzando com memory database
                const forcedGroupName = primaryScopeGroupId
                    ? (GROUP_CONFIG_DEFAULTS[primaryScopeGroupId as keyof typeof GROUP_CONFIG_DEFAULTS] || `Grupo ${primaryScopeGroupId}`)
                    : undefined;

                // Normaliza o código da coluna B para o mesmo formato do lookup
                let normalizedCode = normalizeBarcode(code);
                let registries = productLookup.get(normalizedCode) || [];
                let localCadastroEntry = cadastroLookup.get(normalizedCode);
                let universalEntries = universalRegistry.get(normalizedCode) || [];
                let historyEntries = branchHistoryRegistry.get(normalizedCode) || [];
                const manualScope = TERM_MANUAL_CLASSIFICATION_BY_CODE[normalizedCode];
                const manualEntry = manualScope ? resolveHierarchyByIds(manualScope.groupId, manualScope.deptId, manualScope.catId) : null;

                // Multi-match agressivo: Se não achou pelas vias normais na coluna B, vasculha A até F
                if (registries.length === 0 && !localCadastroEntry && universalEntries.length === 0 && historyEntries.length === 0) {
                    for (let c = 0; c <= 5; c++) {
                        if (c === 1) continue; // já testou
                        const testCode = normalizeBarcode(row[c]);
                        if (testCode) {
                            if (productLookup.has(testCode)) {
                                normalizedCode = testCode;
                                registries = productLookup.get(testCode) || [];
                                break;
                            }
                            if (cadastroLookup.has(testCode)) {
                                normalizedCode = testCode;
                                localCadastroEntry = cadastroLookup.get(testCode);
                                break;
                            }
                            if (universalRegistry.has(testCode)) {
                                normalizedCode = testCode;
                                universalEntries = universalRegistry.get(testCode) || [];
                                break;
                            }
                            if (branchHistoryRegistry.has(testCode)) {
                                normalizedCode = testCode;
                                historyEntries = branchHistoryRegistry.get(testCode) || [];
                                break;
                            }
                        }
                    }
                }

                // Prioritize finding the item ALREADY in the current group's stock
                const contextRegistryEntry = forcedGroupName
                    ? registries.find(r => normalizeText(r.groupName) === normalizeText(forcedGroupName))
                    : (scopedGroupNameSet.size > 0
                        ? registries.find(r => scopedGroupNameSet.has(normalizeText(r.groupName)))
                        : undefined);
                const globalRegistryEntry = registries[0];
                // Para classificar termo, CADASTRO/MANUAL prevalece sobre estrutura derivada do estoque.
                const getUsableEntry = (entry: TermHierarchyEntry | null | undefined) =>
                    entry && isUsableHistoryEntry(entry) ? entry : null;
                const pickUsableEntry = (entries: TermHierarchyEntry[]) =>
                    getUsableEntry(pickBestHierarchyEntry(entries, primaryScopeGroupId) as TermHierarchyEntry | null);
                const manualPreferredEntry = getUsableEntry(manualEntry as TermHierarchyEntry | null);
                const localPreferredEntry = getUsableEntry(localCadastroEntry as TermHierarchyEntry | null);
                const universalPreferredEntry = pickUsableEntry(universalEntries);
                const historyPreferredEntry = pickUsableEntry(historyEntries);
                const cadastroPreferredEntry =
                    manualPreferredEntry ||
                    localPreferredEntry ||
                    universalPreferredEntry ||
                    historyPreferredEntry ||
                    manualEntry ||
                    localCadastroEntry ||
                    pickBestHierarchyEntry(universalEntries, primaryScopeGroupId) ||
                    pickBestHierarchyEntry(historyEntries, primaryScopeGroupId);
                const fallbackEntry = cadastroPreferredEntry || contextRegistryEntry || globalRegistryEntry;
                const resolvedGroupName =
                    (cadastroPreferredEntry as any)?.groupName ||
                    contextRegistryEntry?.groupName ||
                    fallbackEntry?.groupName ||
                    forcedGroupName ||
                    singleScopedGroupName ||
                    'DIVERSOS (SEM GRUPO)';

                let hierarchy = {
                    groupId: normalizeScopeId((cadastroPreferredEntry as any)?.groupId) || normalizeScopeId(contextRegistryEntry?.groupId) || normalizeScopeId(fallbackEntry?.groupId) || normalizeScopeId(primaryScopeGroupId) || '',
                    groupName: resolvedGroupName,
                    deptId: normalizeScopeId((cadastroPreferredEntry as any)?.deptId) || normalizeScopeId(localCadastroEntry?.deptId) || normalizeScopeId(contextRegistryEntry?.deptId) || normalizeScopeId(fallbackEntry?.deptId) || '',
                    deptName: (cadastroPreferredEntry as any)?.deptName || localCadastroEntry?.deptName || contextRegistryEntry?.deptName || fallbackEntry?.deptName || 'DIVERSOS (SEM DEPARTAMENTO)',
                    catId: normalizeScopeId((cadastroPreferredEntry as any)?.catId) || normalizeScopeId(localCadastroEntry?.catId) || normalizeScopeId(contextRegistryEntry?.catId) || normalizeScopeId(fallbackEntry?.catId) || '',
                    catName: (cadastroPreferredEntry as any)?.catName || localCadastroEntry?.catName || contextRegistryEntry?.catName || fallbackEntry?.catName || 'DIVERSOS (SEM CATEGORIA)'
                };

                // Forçar hierarquia do sistema se for órfão mas tiver nome de categoria válido no mix da filial
                const normCat = normalizeText(hierarchy.catName);
                if ((!hierarchy.catId || hierarchy.groupName.includes('DIVERSOS')) && systemCategoryMap.has(normCat)) {
                    const forced = systemCategoryMap.get(normCat)!;
                    hierarchy = {
                        groupId: normalizeScopeId(forced.groupId),
                        groupName: forced.groupName,
                        deptId: normalizeScopeId(forced.deptId),
                        deptName: forced.deptName,
                        catId: normalizeScopeId(forced.catId),
                        catName: forced.catName
                    };
                }

                const groupKey = `${hierarchy.groupId || hierarchy.groupName}|${hierarchy.deptId || hierarchy.deptName}|${hierarchy.catId || hierarchy.catName}`;
                if (!groupedMap[groupKey]) {
                    groupedMap[groupKey] = {
                        groupId: hierarchy.groupId || undefined,
                        groupName: hierarchy.groupName,
                        deptId: hierarchy.deptId || undefined,
                        deptName: hierarchy.deptName,
                        catId: hierarchy.catId || undefined,
                        catName: hierarchy.catName,
                        sysQty: 0,
                        sysCost: 0,
                        countedQty: 0,
                        countedCost: 0,
                        diffQty: 0,
                        diffCost: 0
                    };
                }
                groupedMap[groupKey].sysQty += sq;
                groupedMap[groupKey].sysCost += sc;
                groupedMap[groupKey].countedQty += cq;
                groupedMap[groupKey].countedCost += cc;
                groupedMap[groupKey].diffQty += dq;
                groupedMap[groupKey].diffCost += costDiff;

                items.push({
                    code,
                    description,
                    lab,
                    sysQty: sq,
                    sysCost: sc,
                    countedQty: cq,
                    countedCost: cc,
                    diffQty: dq,
                    diffCost: costDiff,
                    ...hierarchy
                });
            }

            // Convert map to sorted array (Sort by highest cost difference missing)
            const groupedDifferences = Object.values(groupedMap).sort((a, b) => a.diffCost - b.diffCost);
            const officialDiffCost = roundAuditMoney(diffCostSum);

            const payload = {
                sysQty,
                sysCost,
                countedQty,
                countedCost,
                diffQty: diffQtySum,
                diffCost: officialDiffCost,
                officialDiffCost,
                financialDiffSource: termColumns.diffCost !== undefined ? 'spreadsheet_column' : 'calculated_cost_delta',
                financialDiffColumnIndex: termColumns.diffCost,
                items,
                groupedDifferences,
                sourceRows: rows,
                sourceFileName: file.name,
                sourceFileSize: file.size,
                sourceUploadedAt: new Date().toISOString()
            };

            setTermComparisonMetrics(payload);
            rawTermMetricsRef.current = payload as any;
            setTermForm(prev => (prev ? { ...prev, excelMetrics: payload, excelMetricsRemovedAt: undefined } : prev));

            let nextDrafts: Record<string, TermForm> | null = null;
            if (termModal && termForm) {
                const key = buildTermKey(termModal);
                removedExcelDraftKeysRef.current.delete(key);
                const mutableDrafts: Record<string, TermForm> = { ...(termDrafts || {}) };
                const makeCatKey = (groupId?: string | number, deptId?: string | number, catId?: string | number) =>
                    partialScopeKey({ groupId, deptId, catId });
                const collectScopeCatKeys = (scope: { groupId?: string; deptId?: string; catId?: string }) =>
                    getScopeCategories(scope.groupId, scope.deptId, scope.catId)
                        .map(({ group, dept, cat }) => makeCatKey(group.id, dept.id, cat.id));
                const targetCatKeys = new Set<string>();
                if (termModal.type === 'custom') {
                    (termModal.customScopes || []).forEach(scope => {
                        collectScopeCatKeys(scope).forEach(k => targetCatKeys.add(k));
                    });
                } else {
                    collectScopeCatKeys(termModal).forEach(k => targetCatKeys.add(k));
                }
                const keyTouchesTarget = (draftKey: string) => {
                    if (targetCatKeys.size === 0) return draftKey === key;
                    if (draftKey.startsWith('custom|')) {
                        const match = draftKey.match(/^custom\|([^|]*)(?:\|(.*))?$/);
                        const scopesPart = typeof match?.[2] === 'string'
                            ? match[2]
                            : (match?.[1] || '');
                        const scopedKeys = scopesPart.split(',').filter(Boolean);
                        for (const scopeKey of scopedKeys) {
                            const [g, d, c] = scopeKey.split('|');
                            const expanded = getScopeCategories(g || undefined, d || undefined, c || undefined);
                            for (const { group, dept, cat } of expanded) {
                                if (targetCatKeys.has(makeCatKey(group.id, dept.id, cat.id))) return true;
                            }
                        }
                        return false;
                    }
                    const [type, g, d, c] = draftKey.split('|');
                    if (!type || type === 'custom') return false;
                    const expanded = getScopeCategories(g || undefined, d || undefined, c || undefined);
                    for (const { group, dept, cat } of expanded) {
                        if (targetCatKeys.has(makeCatKey(group.id, dept.id, cat.id))) return true;
                    }
                    return false;
                };

                Object.keys(mutableDrafts).forEach(draftKey => {
                    const current = mutableDrafts[draftKey];
                    if (!current || !keyTouchesTarget(draftKey)) return;
                    if (current.excelMetricsRemovedAt && !current.excelMetrics) {
                        mutableDrafts[draftKey] = { ...current, excelMetricsRemovedAt: undefined };
                    }
                    removedExcelDraftKeysRef.current.delete(draftKey);
                });

                nextDrafts = upsertScopeDraft(
                    mutableDrafts,
                    termModal,
                    { ...termForm, excelMetrics: payload, excelMetricsRemovedAt: undefined }
                );
                setTermDrafts(nextDrafts);
                termDraftsRef.current = nextDrafts;
            }

            if (data) {
                const nextData = {
                    ...data,
                    termExcelMetricsByKey: {
                        ...(((data as any)?.termExcelMetricsByKey || {}) as Record<string, any>),
                        ...(termModal ? { [buildTermKey(termModal)]: payload } : {})
                    }
                } as any;

                const savedSession = await persistAuditSession({
                    id: dbSessionId,
                    branch: selectedFilial,
                    audit_number: nextAuditNumber,
                    status: 'open',
                    data: {
                        ...nextData,
                        termDrafts: nextDrafts || composeTermDraftsForPersist((((nextData as any)?.termDrafts || {}) as Record<string, TermForm>), termDrafts)
                    } as any,
                    progress: calculateProgress(nextData),
                    user_email: userEmail
                });
                if (!savedSession) {
                    throw new Error("Falha ao salvar atualização do Excel no Supabase.");
                }
                await CacheService.set(`audit_session_${selectedFilial}`, savedSession as any);
                setDbSessionId(savedSession.id);
                setNextAuditNumber(savedSession.audit_number);
                const savedData = (savedSession.data as AuditData) || nextData;
                setData(savedData);
                setTermDrafts((((savedData as any)?.termDrafts || nextDrafts || {}) as Record<string, TermForm>));
            }

        } catch (err) {
            console.error("Erro ao processar Excel do Termo:", err);
            alert("Erro ao ler/salvar o arquivo Excel.");
            setTermComparisonMetrics(null);

            if (termModal && termForm) {
                const key = buildTermKey(termModal);
                setTermDrafts(current => {
                    const next = { ...current };
                    if (next[key]) next[key] = { ...next[key], excelMetrics: undefined };
                    return next;
                });
            }
        }

        // Reset input value to allow uploading the same file again if needed
        e.target.value = '';
    };

    const downloadTermComparisonExcel = () => {
        const metrics = normalizeTermMetricsToOfficial(
            pickPreferredTermMetrics(rawTermMetricsRef.current, termComparisonMetrics, termForm?.excelMetrics)
        );
        if (!metrics) {
            alert("Nenhuma planilha de divergências carregada para baixar.");
            return;
        }

        const sanitizeFileToken = (value: unknown) =>
            String(value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9_-]+/g, '_')
                .replace(/^_+|_+$/g, '')
                .slice(0, 80);

        const wb = XLSX.utils.book_new();
        const sourceRows = Array.isArray((metrics as any).sourceRows)
            ? ((metrics as any).sourceRows as any[][])
            : [];

        if (sourceRows.length > 0) {
            const wsOriginal = XLSX.utils.aoa_to_sheet(sourceRows);
            XLSX.utils.book_append_sheet(wb, wsOriginal, "Excel Carregado");
        }

        const scopeInfo = termModal ? buildTermScopeInfo(termModal) : null;
        const summaryRows = [
            ['Resumo Identificado', ''],
            ['Filial', data?.filial ? `Filial ${data.filial}` : selectedFilial || ''],
            ['Nº Inventário', termForm?.inventoryNumber || inventoryNumber || data?.inventoryNumber || ''],
            ['Nº Auditoria', nextAuditNumber || ''],
            ['Escopo', termModal?.type || ''],
            ['Grupo', scopeInfo?.group?.name || ''],
            ['Departamentos', (scopeInfo?.departments || []).map(d => d.name).join(', ')],
            ['Categorias', (scopeInfo?.categories || []).map(c => c.name).join(', ')],
            ['Arquivo de origem', (metrics as any).sourceFileName || 'Reconstruído a partir dos dados salvos'],
            ['Carregado em', (metrics as any).sourceUploadedAt || ''],
            [],
            ['Estoque Sistema (Qtde)', Number(metrics.sysQty || 0)],
            ['Custo Total Sistema (R$)', roundAuditMoney(metrics.sysCost)],
            ['Estoque Físico (Qtde)', Number(metrics.countedQty || 0)],
            ['Custo Total Físico (R$)', roundAuditMoney(metrics.countedCost)],
            ['Diferença de Estoque (Qtde)', Number(metrics.diffQty || 0)],
            ['Resultado Financeiro (R$)', roundAuditMoney(metrics.diffCost)]
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
        wsSummary['!cols'] = [{ wch: 34 }, { wch: 48 }];
        XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

        const itemRows = (Array.isArray(metrics.items) ? metrics.items : []).map((item: any) => ({
            'Código': item.code || '',
            'Descrição': item.description || item.name || '',
            'Laboratório': item.lab || '',
            'Grupo': item.groupName || '',
            'Departamento': item.deptName || '',
            'Categoria': item.catName || '',
            'Estoque Sistema': Number(item.sysQty || 0),
            'Custo Sistema (R$)': roundAuditMoney(item.sysCost),
            'Estoque Físico': Number(item.countedQty || 0),
            'Custo Físico (R$)': roundAuditMoney(item.countedCost),
            'Diferença Qtd': Number(item.diffQty || 0),
            'Diferença R$': roundAuditMoney(item.diffCost)
        }));
        if (itemRows.length > 0) {
            const wsItems = XLSX.utils.json_to_sheet(itemRows);
            wsItems['!cols'] = [
                { wch: 14 }, { wch: 42 }, { wch: 18 }, { wch: 22 }, { wch: 24 }, { wch: 24 },
                { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 16 }
            ];
            XLSX.utils.book_append_sheet(wb, wsItems, "Itens Salvos");
        }

        const groupedRows = (Array.isArray(metrics.groupedDifferences) ? metrics.groupedDifferences : []).map((row: any) => ({
            'Grupo': row.groupName || '',
            'Departamento': row.deptName || '',
            'Categoria': row.catName || '',
            'Estoque Sistema': Number(row.sysQty || 0),
            'Custo Sistema (R$)': roundAuditMoney(row.sysCost),
            'Estoque Físico': Number(row.countedQty || 0),
            'Custo Físico (R$)': roundAuditMoney(row.countedCost),
            'Diferença Qtd': Number(row.diffQty || 0),
            'Diferença R$': roundAuditMoney(row.diffCost)
        }));
        if (groupedRows.length > 0) {
            const wsGrouped = XLSX.utils.json_to_sheet(groupedRows);
            wsGrouped['!cols'] = [
                { wch: 22 }, { wch: 24 }, { wch: 24 }, { wch: 16 }, { wch: 18 },
                { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 16 }
            ];
            XLSX.utils.book_append_sheet(wb, wsGrouped, "Resumo Categoria");
        }

        const baseName = sanitizeFileToken(
            (metrics as any).sourceFileName
                ? String((metrics as any).sourceFileName).replace(/\.(xlsx|xls)$/i, '')
                : `excel_termo_f${selectedFilial || data?.filial || 'loja'}_auditoria_${nextAuditNumber || 'atual'}`
        ) || 'excel_termo';
        XLSX.writeFile(wb, `${baseName}_baixado.xlsx`);
    };

    const removeTermComparisonExcel = async () => {
        if (isReadOnlyCompletedView) {
            alert("Modo consulta ativo: não é possível remover Excel de termo.");
            return;
        }
        if (!canUseAuditMasterTools) {
            alert("Apenas Master ou Administrativo pode remover planilha do termo.");
            return;
        }
        setTermComparisonMetrics(null);
        const removedAt = new Date().toISOString();
        setTermForm(prev => (prev ? { ...prev, excelMetrics: undefined, excelMetricsRemovedAt: removedAt } : prev));
        if (termModal && termForm) {
            const tk = buildTermKey(termModal);
            const nextDrafts = { ...termDrafts };
            const makeCatKey = (groupId?: string | number, deptId?: string | number, catId?: string | number) =>
                partialScopeKey({ groupId, deptId, catId });
            const collectScopeCatKeys = (scope: { groupId?: string; deptId?: string; catId?: string }) =>
                getScopeCategories(scope.groupId, scope.deptId, scope.catId)
                    .map(({ group, dept, cat }) => makeCatKey(group.id, dept.id, cat.id));
            const targetCatKeys = new Set<string>();
            if (termModal.type === 'custom') {
                (termModal.customScopes || []).forEach(scope => {
                    collectScopeCatKeys(scope).forEach(k => targetCatKeys.add(k));
                });
            } else {
                collectScopeCatKeys(termModal).forEach(k => targetCatKeys.add(k));
            }
            const keyTouchesTarget = (draftKey: string) => {
                if (targetCatKeys.size === 0) return draftKey === tk;
                if (draftKey.startsWith('custom|')) {
                    // Compatibilidade: formato novo "custom|<batchId>|<scopes>"
                    // e legado "custom|<scopes>"
                    const match = draftKey.match(/^custom\|([^|]*)(?:\|(.*))?$/);
                    const scopesPart = typeof match?.[2] === 'string'
                        ? match[2]
                        : (match?.[1] || '');
                    const scopedKeys = scopesPart.split(',').filter(Boolean);
                    for (const scopeKey of scopedKeys) {
                        const [g, d, c] = scopeKey.split('|');
                        const expanded = getScopeCategories(g || undefined, d || undefined, c || undefined);
                        for (const { group, dept, cat } of expanded) {
                            if (targetCatKeys.has(makeCatKey(group.id, dept.id, cat.id))) return true;
                        }
                    }
                    return false;
                }
                const [type, g, d, c] = draftKey.split('|');
                if (!type || type === 'custom') return false;
                const expanded = getScopeCategories(g || undefined, d || undefined, c || undefined);
                for (const { group, dept, cat } of expanded) {
                    if (targetCatKeys.has(makeCatKey(group.id, dept.id, cat.id))) return true;
                }
                return false;
            };

            Object.keys(nextDrafts).forEach(draftKey => {
                if (!nextDrafts[draftKey]?.excelMetrics) return;
                if (!keyTouchesTarget(draftKey)) return;
                nextDrafts[draftKey] = { ...nextDrafts[draftKey], excelMetrics: undefined, excelMetricsRemovedAt: removedAt };
                removedExcelDraftKeysRef.current.add(draftKey);
            });
            if (!nextDrafts[tk]) nextDrafts[tk] = { ...termForm, excelMetrics: undefined, excelMetricsRemovedAt: removedAt };
            else nextDrafts[tk] = { ...nextDrafts[tk], excelMetrics: undefined, excelMetricsRemovedAt: removedAt };
            removedExcelDraftKeysRef.current.add(tk);
            const legacyKey = getLegacyCustomTermKey(termModal);
            if (legacyKey && nextDrafts[legacyKey]) {
                nextDrafts[legacyKey] = { ...nextDrafts[legacyKey], excelMetrics: undefined, excelMetricsRemovedAt: removedAt };
                removedExcelDraftKeysRef.current.add(legacyKey);
            }
            setTermDrafts(nextDrafts);

            const nextData = data ? { ...data } : null;
            if (nextData && termModal) {
                const key = buildTermKey(termModal);
                const nextStore = { ...(((nextData as any).termExcelMetricsByKey || {}) as Record<string, any>) };
                delete nextStore[key];
                (nextData as any).termExcelMetricsByKey = nextStore;
            }
            if (nextData) setData(nextData);

            if (canUseAuditMasterTools && nextData) {
                const savedSession = await persistAuditSession({
                    id: dbSessionId,
                    branch: selectedFilial,
                    audit_number: nextAuditNumber,
                    status: 'open',
                    data: { ...nextData, termDrafts: nextDrafts } as any,
                    progress: calculateProgress(nextData),
                    user_email: userEmail
                });
                if (savedSession) {
                    await CacheService.set(`audit_session_${selectedFilial}`, savedSession as any);
                    const savedData = (savedSession.data as AuditData) || nextData;
                    setData(savedData);
                    setTermDrafts((((savedData as any)?.termDrafts || nextDrafts || {}) as Record<string, TermForm>));
                } else {
                    throw new Error("Erro ao salvar remoção do Excel.");
                }
            }
        }
    };

    useEffect(() => {
        if (!termModal || typeof window === 'undefined' || typeof document === 'undefined') return;
        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeTermModal();
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [termModal, closeTermModal]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleLookupShortcut = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
                event.preventDefault();
                auditLookupInputRef.current?.focus();
                auditLookupInputRef.current?.select();
                setAuditLookupOpen(true);
            }
        };
        window.addEventListener('keydown', handleLookupShortcut);
        return () => window.removeEventListener('keydown', handleLookupShortcut);
    }, []);

    const buildTermScopeInfo = (scope: TermScope) => {
        if (!data) return null;
        const buildDeptLabel = (d: Department) => `${d.numericId || d.id} - ${d.name}`;
        const buildCatLabel = (c: Category) => `${c.numericId || c.id} - ${c.name}`;

        if (scope.type === 'custom') {
            const scopes = scope.customScopes || [];
            const departmentsMap = new Map<string, Department>();
            const categoriesMap = new Map<string, Category>();
            const products: { groupName: string; deptName: string; catName: string; code: string; name: string; quantity: number; cost: number }[] = [];
            const productKeys = new Set<string>();
            const groupLabels = new Set<string>();

            const pushProducts = (groupName: string, deptName: string, catName: string, cat: Category) => {
                cat.products.forEach(p => {
                    const key = `${groupName}|${deptName}|${catName}|${p.code}`;
                    if (productKeys.has(key)) return;
                    productKeys.add(key);
                    products.push({ groupName, deptName, catName, code: p.code, name: p.name, quantity: p.quantity, cost: p.cost || 0 });
                });
            };

            scopes.forEach(s => {
                const group = data.groups.find(g => g.id === s.groupId);
                if (!group) return;
                groupLabels.add(`${group.id} - ${group.name}`);

                if (!s.deptId && !s.catId) {
                    group.departments.forEach(d => {
                        departmentsMap.set(d.id, { ...d, name: buildDeptLabel(d) });
                        d.categories.forEach(c => {
                            categoriesMap.set(c.id, { ...c, name: buildCatLabel(c) });
                            pushProducts(group.name, d.name, c.name, c);
                        });
                    });
                    return;
                }

                let dept = s.deptId ? group.departments.find(d => d.id === s.deptId) : undefined;
                if (!dept && s.catId) {
                    dept = group.departments.find(d => d.categories.some(c => c.id === s.catId));
                }
                if (dept) {
                    departmentsMap.set(dept.id, { ...dept, name: buildDeptLabel(dept) });
                    if (!s.catId) {
                        dept.categories.forEach(c => {
                            categoriesMap.set(c.id, { ...c, name: buildCatLabel(c) });
                            pushProducts(group.name, dept!.name, c.name, c);
                        });
                        return;
                    }
                    const cat = dept.categories.find(c => c.id === s.catId);
                    if (cat) {
                        categoriesMap.set(cat.id, { ...cat, name: buildCatLabel(cat) });
                        pushProducts(group.name, dept.name, cat.name, cat);
                    }
                }
            });

            const departments = Array.from(departmentsMap.values());
            const categories = Array.from(categoriesMap.values());
            const group: Group = {
                id: 'custom',
                name: scope.customLabel || 'Contagens Personalizadas',
                departments: []
            };
            return {
                group,
                dept: undefined,
                cat: undefined,
                departments,
                categories,
                products,
                groupLabelText: Array.from(groupLabels).join(', ')
            };
        }

        const group = data.groups.find(g => g.id === scope.groupId);
        if (!group) return null;

        let dept: Department | undefined;
        let cat: Category | undefined;
        let departments: Department[] = [];
        let categories: Category[] = [];
        const products: { groupName: string; deptName: string; catName: string; code: string; name: string; quantity: number; cost: number }[] = [];

        if (scope.type === 'group') {
            departments = group.departments;
            categories = group.departments.flatMap(d => d.categories);
            group.departments.forEach(d => {
                d.categories.forEach(c => {
                    c.products.forEach(p => {
                        products.push({ groupName: group.name, deptName: d.name, catName: c.name, code: p.code, name: p.name, quantity: p.quantity, cost: p.cost || 0 });
                    });
                });
            });
        } else if (scope.type === 'department') {
            dept = group.departments.find(d => d.id === scope.deptId);
            if (dept) {
                departments = [dept];
                categories = dept.categories;
                dept.categories.forEach(c => {
                    c.products.forEach(p => {
                        products.push({ groupName: group.name, deptName: dept!.name, catName: c.name, code: p.code, name: p.name, quantity: p.quantity, cost: p.cost || 0 });
                    });
                });
            }
        } else {
            dept = group.departments.find(d => d.id === scope.deptId);
            cat = dept?.categories.find(c => c.id === scope.catId);
            if (dept && cat) {
                departments = [dept];
                categories = [cat];
                cat.products.forEach(p => {
                    products.push({ groupName: group.name, deptName: dept!.name, catName: cat!.name, code: p.code, name: p.name, quantity: p.quantity, cost: p.cost || 0 });
                });
            }
        }

        return { group, dept, cat, departments, categories, products };
    };

    const formatTermDate = (val?: string) => {
        if (!val) return new Date().toLocaleDateString('pt-BR');
        return val;
    };

    const normalizePersonName = (value?: string) => String(value || '').trim().replace(/\s+/g, ' ');
    const hasNameAndSurname = (value?: string) => normalizePersonName(value).split(' ').filter(Boolean).length >= 2;
    const cpfDigits = (value?: string) => String(value || '').replace(/\D/g, '');
    const formatCpf = useCallback((value?: string) => {
        const digits = cpfDigits(value).slice(0, 11);
        if (digits.length <= 3) return digits;
        if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
        if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
        return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    }, []);
    const isTermFieldValid = useCallback((fieldKey: string, value?: string) => {
        const normalized = String(value || '').trim();
        if (!normalized) return false;
        if (fieldKey.endsWith('_cpf')) return cpfDigits(value).length >= 11;
        return hasNameAndSurname(value);
    }, []);
    const clearTermFieldError = useCallback((fieldKey: string) => {
        setTermFieldErrors(prev => {
            if (!prev[fieldKey]) return prev;
            const next = { ...prev };
            delete next[fieldKey];
            return next;
        });
    }, []);
    const validateTermFieldOnBlur = useCallback((fieldKey: string, value?: string) => {
        setTermTouchedFields(prev => ({ ...prev, [fieldKey]: true }));
        const normalized = String(value || '').trim();
        if (!normalized) {
            clearTermFieldError(fieldKey);
            return;
        }
        if (fieldKey.endsWith('_cpf')) {
            if (cpfDigits(value).length < 11) {
                setTermFieldErrors(prev => ({ ...prev, [fieldKey]: 'CPF deve ter no mínimo 11 números.' }));
                return;
            }
            clearTermFieldError(fieldKey);
            return;
        }
        if (!hasNameAndSurname(value)) {
            setTermFieldErrors(prev => ({ ...prev, [fieldKey]: 'Informe nome e sobrenome.' }));
            return;
        }
        clearTermFieldError(fieldKey);
    }, [clearTermFieldError]);
    const raiseTermFieldErrors = useCallback((nextErrors: Record<string, string>) => {
        setTermFieldErrors(nextErrors);
        setTermTouchedFields(prev => {
            const next = { ...prev };
            Object.keys(nextErrors).forEach(key => {
                next[key] = true;
            });
            return next;
        });

        const shakeKeys = Object.keys(nextErrors);
        const nextShakeState = shakeKeys.reduce((acc, key) => {
            acc[key] = true;
            return acc;
        }, {} as Record<string, boolean>);
        setTermShakeFields(nextShakeState);

        if (termShakeTimeoutRef.current !== null && typeof window !== 'undefined') {
            window.clearTimeout(termShakeTimeoutRef.current);
        }
        if (typeof window !== 'undefined') {
            termShakeTimeoutRef.current = window.setTimeout(() => setTermShakeFields({}), 420);
        }

        const firstInvalidField = shakeKeys[0];
        if (firstInvalidField && typeof document !== 'undefined') {
            window.requestAnimationFrame(() => {
                const el = document.querySelector(`[data-term-field="${firstInvalidField}"]`) as HTMLElement | null;
                el?.focus();
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
    }, []);

    const handlePrintTerm = async (options?: { divergencesOnly?: boolean }) => {
        if (!data || !termModal || !termForm) return;
        const divergencesOnly = !!options?.divergencesOnly;
        const scopeInfo = buildTermScopeInfo(termModal);
        if (!scopeInfo) return;

        const peopleToValidate = [
            {
                label: 'Gestor 1',
                name: termForm.managerName2,
                cpf: termForm.managerCpf2,
                signature: termForm.managerSignature2,
                nameField: 'manager1_name',
                cpfField: 'manager1_cpf'
            },
            {
                label: 'Gestor 2',
                name: termForm.managerName,
                cpf: termForm.managerCpf,
                signature: termForm.managerSignature,
                nameField: 'manager2_name',
                cpfField: 'manager2_cpf'
            }
        ];

        const filledPeople = peopleToValidate.filter(p =>
            normalizePersonName(p.name) || cpfDigits(p.cpf) || String(p.signature || '').trim()
        );

        const fieldErrors: Record<string, string> = {};
        filledPeople.forEach(person => {
            if (!hasNameAndSurname(person.name)) {
                fieldErrors[person.nameField] = `${person.label}: informe nome e sobrenome.`;
            }
            if (cpfDigits(person.cpf).length < 11) {
                fieldErrors[person.cpfField] = `${person.label}: CPF deve ter no mínimo 11 números.`;
            }
        });

        if (Object.keys(fieldErrors).length > 0) {
            raiseTermFieldErrors(fieldErrors);
            return;
        }
        if (Object.keys(termFieldErrors).length > 0) setTermFieldErrors({});

        const key = buildTermKey(termModal);
        const backupMetrics = (((data as any)?.termExcelMetricsByKey || {}) as Record<string, any>)[key];
        const persistedMetrics = normalizeTermMetricsToOfficial(pickPreferredTermMetrics(
            rawTermMetricsRef.current,
            rawTermComparisonMetrics,
            termComparisonMetrics,
            termForm.excelMetrics,
            termDrafts[key]?.excelMetrics,
            backupMetrics
        ));
        const formToPersist = persistedMetrics
            ? { ...termForm, excelMetrics: persistedMetrics }
            : termForm;
        const nextDrafts = upsertScopeDraft(termDrafts, termModal, formToPersist);
        const syncedDrafts = replicateSignersToAllTermDrafts(nextDrafts, termForm);
        setTermDrafts(syncedDrafts);
        termDraftsRef.current = syncedDrafts;
        try {
            // Persistence consolidated in audit_sessions (data field)
            const progress = calculateProgress(data || {} as any);
            const metricsStore = { ...(((data as any)?.termExcelMetricsByKey || {}) as Record<string, any>) };
            if (persistedMetrics) metricsStore[key] = persistedMetrics;
            const savedSession = await persistAuditSession({
                id: dbSessionId,
                branch: selectedFilial,
                audit_number: nextAuditNumber,
                status: 'open',
                data: { ...data, termDrafts: syncedDrafts, termExcelMetricsByKey: metricsStore } as any,
                progress: progress,
                user_email: userEmail
            }, { allowProgressRegression: true });
            if (savedSession) {
                await CacheService.set(`audit_session_${selectedFilial}`, savedSession as any);
            }
        } catch (err) {
            console.error("Error saving term draft:", err);
        }
        const termMetricsForOutput = termDisplayMetrics || termComparisonMetrics;
        const isGlobalUnifiedTermPdf =
            termModal.type === 'custom' &&
            normalizeScopeId((termModal as any).batchId) === GLOBAL_UNIFIED_TERM_BATCH_ID;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const contentX = 14;
        const contentWidth = pageWidth - contentX * 2;
        const topMargin = 18;
        const bottomMargin = 14;
        let y = topMargin;
        const nextPageIfNeeded = (lineHeight: number) => {
            if (y + lineHeight > pageHeight - bottomMargin) {
                doc.addPage();
                y = topMargin;
            }
        };
        const drawWrapped = (text: string, lineHeight: number, gap: number = 1.2) => {
            const lines = doc.splitTextToSize(String(text || ''), contentWidth);
            lines.forEach((line: string) => {
                nextPageIfNeeded(lineHeight);
                doc.text(line, contentX, y);
                y += lineHeight;
            });
            y += gap;
        };

        doc.setFontSize(isGlobalUnifiedTermPdf ? 14 : 16);
        doc.setTextColor(15, 23, 42);
        drawWrapped('TERMO DE AUDITORIA', isGlobalUnifiedTermPdf ? 5.5 : 6, 2);

        doc.setFontSize(isGlobalUnifiedTermPdf ? 9 : 10);
        doc.setTextColor(60);
        const inventoryLine = `Nº INVENTÁRIO: ${termForm.inventoryNumber || '__________'} - ${formatTermDate(termForm.date)}`;
        drawWrapped(inventoryLine, isGlobalUnifiedTermPdf ? 4 : 4.5, 1);
        const filialLine = `Filial Auditada: Filial ${data.filial}`;
        drawWrapped(filialLine, isGlobalUnifiedTermPdf ? 4 : 4.5, 1);
        const groupLabelForPdf = termModal.type === 'custom'
            ? `${(scopeInfo as any).groupLabelText || scopeInfo.group.name} (personalizado)`
            : scopeInfo.group.name;
        drawWrapped(`Grupo: ${groupLabelForPdf}`, isGlobalUnifiedTermPdf ? 4 : 4.5, 1);

        const deptNames = scopeInfo.departments.map(d => d.name);
        const catNames = scopeInfo.categories.map(c => c.name);
        const deptList = deptNames.join(', ') || '-';
        const catList = catNames.join(', ') || '-';
        drawWrapped(`Departamentos (${deptNames.length}): ${deptList}`, isGlobalUnifiedTermPdf ? 4 : 4.4, 0.8);
        drawWrapped(`Categorias (${catNames.length}): ${catList}`, isGlobalUnifiedTermPdf ? 4 : 4.4, 1.5);

        const bodyText = [
            'Declaro que fui orientado e treinado sobre as melhores práticas de auditoria e procedimentos internos com relação ao estoque físico da empresa.',
            'Declaro também que participei ativamente do levantamento e contagem do estoque físico total desta filial conforme relatório de conferência anexo validado por mim.',
            'Portanto, estou ciente de que as informações apontadas nos relatórios em anexo são verdadeiras, assim como sou responsável pela contagem do estoque mensal e pela conservação do patrimônio da empresa.',
            'A inobservância dos procedimentos internos da empresa ou o apontamento de informações inverídicas no referido relatório ou termo, acarretará na aplicação das penalidades dispostas no Artigo 482, incisos, da Consolidação das Leis do Trabalho (CLT), ressalvadas, as demais sanções legais concomitantes.',
            'Os horários e datas constantes nos relatórios em anexo, são informações de uso exclusivo do setor de auditoria.'
        ].join(' ');

        doc.setTextColor(30);
        drawWrapped(bodyText, isGlobalUnifiedTermPdf ? 3.8 : 4.1, 2);

        if (y > pageHeight - 42) {
            doc.addPage();
            y = 20;
        }

        const signatureRows = [
            [
                termForm.managerName2 ? `Gestor 1: ${termForm.managerName2}` : 'Gestor 1',
                termForm.managerCpf2 || '',
                termForm.managerSignature2 ? { content: '', sig: termForm.managerSignature2 } : '________________________'
            ],
            [
                termForm.managerName ? `Gestor 2: ${termForm.managerName}` : 'Gestor 2',
                termForm.managerCpf || '',
                termForm.managerSignature ? { content: '', sig: termForm.managerSignature } : '________________________'
            ],
            ...(termForm.collaborators.length ? termForm.collaborators : Array.from({ length: 10 }, () => ({ name: '', cpf: '', signature: '' }))).map((c, idx) => [
                c.name || `Colaborador ${idx + 1}`,
                c.cpf || '',
                c.signature ? { content: '', sig: c.signature } : '________________________'
            ])
        ];

        autoTable(doc, {
            startY: y,
            head: [['Responsável', 'CPF', 'Ass.']],
            body: signatureRows,
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: { top: 1, right: 2, bottom: 3, left: 2 }, valign: 'bottom', halign: 'left' },
            columnStyles: {
                0: { cellWidth: 80 },
                1: { cellWidth: 45 },
                2: { cellWidth: 55, minCellHeight: 18 }
            },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
            didDrawCell: (data: any) => {
                if (data.section !== 'body' || data.column.index !== 2) return;
                const raw = data.cell.raw as any;
                const sig = raw?.sig;
                if (typeof sig === 'string' && sig.startsWith('data:image')) {
                    const padding = 1;
                    const x = data.cell.x + padding;
                    const w = data.cell.width - padding * 2;
                    const h = Math.min(12, data.cell.height - padding * 2);
                    const y = data.cell.y + data.cell.height - h - padding;
                    doc.addImage(sig, 'PNG', x, y, w, h);
                }
            }
        });

        // @ts-ignore
        const afterSignY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 6 : y + 20;
        let contentStartY = afterSignY;

        // 1. Resumo financeiro logo após assinaturas
        if (termMetricsForOutput) {
            if (contentStartY > 250) {
                doc.addPage();
                contentStartY = 20;
            }

            doc.setFontSize(11);
            doc.setTextColor(15, 23, 42);
            doc.text('RESUMO FINANCEIRO DA CONFERÊNCIA', 14, contentStartY);
            contentStartY += 6;

            const diffType = termMetricsForOutput.diffCost < 0 ? 'Prejuízo (Falta)' : termMetricsForOutput.diffCost > 0 ? 'Sobra (Excesso)' : 'Zero';
            const rawScopeAuditedCost = (scopeInfo.products || []).reduce((sum: number, p: any) => sum + ((p.quantity || 0) * (p.cost || 0)), 0);
            const adjustmentTotals = (termMetricsForOutput as any).postAuditAdjustmentTotals || { count: 0, quantity: 0, cost: 0 };
            const scopeAuditedCost = roundAuditMoney(Number(rawScopeAuditedCost || 0) + Number(adjustmentTotals.cost || 0));
            const representativity = getFinancialRepresentativity(scopeAuditedCost, termMetricsForOutput.diffCost);
            const representativityLabel = representativity === null
                ? 'N/A'
                : `${representativity.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
            const fmtCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const fmtInt = (value: number) => Math.round(value || 0).toLocaleString('pt-BR');
            const mixPending = Math.max(0, Number(branchMetrics.skus || 0) - Number(branchMetrics.doneSkus || 0));

            const summaryRows = [
                [{ content: 'INDICADORES DA FILIAL', styles: { fontStyle: 'bold', fillColor: [238, 242, 255], halign: 'center' } }, { content: '', styles: { fillColor: [238, 242, 255] } }],
                ['Conferência Global da Filial', `${Number(branchMetrics.progress || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`],
                ['SKUs Totais (Mix Importado)', fmtInt(Number(branchMetrics.skus || 0))],
                ['Mix Auditado (Conf./Pend.)', `${fmtInt(Number(branchMetrics.doneSkus || 0))} / ${fmtInt(mixPending)}`],
                ['Unidades Totais (Conf./Total)', `${fmtInt(Number(filialTotalsMetrics.doneUnits || 0))} / ${fmtInt(Number(branchMetrics.units || 0))}`],
                ['Valor em Custo (Conf./Total)', `${fmtCurrency(Number(filialTotalsMetrics.doneCost || 0))} / ${fmtCurrency(Number(branchMetrics.cost || 0))}`],
                ['Total Conferido R$', fmtCurrency(Number(filialTotalsMetrics.doneCost || 0))],
                ['Falta Conferir R$', fmtCurrency(Number(filialTotalsMetrics.pendingCost || 0))],
                ['Qtde Divergência', `${Number(filialTotalsMetrics.diffQty || 0) > 0 ? '+' : ''}${fmtInt(Number(filialTotalsMetrics.diffQty || 0))} un.`],
                ['Divergência R$', fmtCurrency(Number(filialTotalsMetrics.diffCost || 0))],
                ['Rep. Divergência', `${Number(filialTotalsMetrics.repDivergencePct || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`],
                [{ content: 'DADOS DO TERMO (ESCOPO)', styles: { fontStyle: 'bold', fillColor: [238, 242, 255], halign: 'center' } }, { content: '', styles: { fillColor: [238, 242, 255] } }],
                ...(Number(adjustmentTotals.count || 0) > 0
                    ? [[
                        'Ajustes Após Auditoria',
                        `${Number(adjustmentTotals.quantity || 0) > 0 ? '+' : ''}${fmtInt(Number(adjustmentTotals.quantity || 0))} un. / ${fmtCurrency(Number(adjustmentTotals.cost || 0))}`
                    ]]
                    : []),
                ['Estoque Sistema (Qtde)', Math.round(termMetricsForOutput.sysQty).toLocaleString('pt-BR')],
                ['Custo Total Sistema', fmtCurrency(Number(termMetricsForOutput.sysCost || 0))],
                ['Estoque Físico (Qtde)', Math.round(termMetricsForOutput.countedQty).toLocaleString('pt-BR')],
                ['Custo Total Físico', fmtCurrency(Number(termMetricsForOutput.countedCost || 0))],
                ['Diferença de Estoque (Qtde)', termMetricsForOutput.diffQty.toLocaleString('pt-BR')],
                ['Resultado Financeiro', fmtCurrency(Number(termMetricsForOutput.diffCost || 0)) + ` (${diffType})`],
                ['Representatividade no Auditado', representativityLabel]
            ];

            autoTable(doc, {
                startY: contentStartY,
                body: summaryRows,
                theme: 'grid',
                styles: { fontSize: 9, cellPadding: 2, halign: 'center', valign: 'middle' },
                columnStyles: {
                    0: { cellWidth: 90, fontStyle: 'bold', fillColor: [248, 250, 252], halign: 'center' },
                    1: { cellWidth: 70, halign: 'center' }
                },
                didParseCell: (hookData: any) => {
                    if (hookData.section !== 'body' || hookData.column.index !== 1) return;
                    const rowLabel = String(hookData.row?.raw?.[0]?.content ?? hookData.row?.raw?.[0] ?? '').trim().toLowerCase();
                    if (!rowLabel) return;
                    const isFinancialResult = rowLabel.includes('resultado financeiro');
                    const isDiffMoney = rowLabel === 'divergência r$';
                    if (isFinancialResult || isDiffMoney) {
                        hookData.cell.styles.fontStyle = 'bold';
                        const value = isFinancialResult ? Number(termMetricsForOutput.diffCost || 0) : Number(filialTotalsMetrics.diffCost || 0);
                        if (value < 0) hookData.cell.styles.textColor = [220, 38, 38];
                        if (value > 0) hookData.cell.styles.textColor = [22, 163, 74];
                    }
                }
            });

            // @ts-ignore
            contentStartY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 10 : contentStartY + 50;
        }

        let cursorY = contentStartY;

        if (termMetricsForOutput && termMetricsForOutput.groupedDifferences && termMetricsForOutput.groupedDifferences.length > 0) {
            if (cursorY > 240) {
                doc.addPage();
                cursorY = 20;
            }
            doc.setFontSize(11);
            doc.setTextColor(15, 23, 42);
            doc.text('RESUMO DE DIVERGÊNCIAS POR CATEGORIA', 14, cursorY);

            const groupHead = [['Item / Hierarquia', 'Dif Qtd', 'Sist.', 'Fís.', 'Dif R$']];
            const groupBody: any[] = [];
            termMetricsForOutput.groupedDifferences.forEach((g: any) => {
                groupBody.push([
                    { content: `${g.groupName} > ${g.deptName} > ${g.catName}`, colSpan: 1, styles: { fontStyle: 'bold', fillColor: [243, 244, 246] } },
                    { content: `${g.diffQty > 0 ? '+' : ''}${Math.round(g.diffQty).toLocaleString('pt-BR')} un.`, styles: { fontStyle: 'bold', fillColor: [243, 244, 246] } },
                    { content: '', styles: { fillColor: [243, 244, 246] } },
                    { content: '', styles: { fillColor: [243, 244, 246] } },
                    { content: `R$ ${g.diffCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, styles: { fontStyle: 'bold', fillColor: [243, 244, 246] } }
                ]);

                const catItems = termMetricsForOutput.items.filter(
                    (item: any) =>
                        item.catName?.toLowerCase() === g.catName?.toLowerCase() &&
                        item.deptName?.toLowerCase() === g.deptName?.toLowerCase() &&
                        item.groupName?.toLowerCase() === g.groupName?.toLowerCase()
                ).sort((a: any, b: any) => a.diffCost - b.diffCost);

                catItems.forEach((item: any) => {
                    groupBody.push([
                        `  ${item.code} - ${item.description}`,
                        `${item.diffQty > 0 ? '+' : ''}${Math.round(item.diffQty).toLocaleString('pt-BR')}`,
                        Math.round(item.sysQty).toLocaleString('pt-BR'),
                        Math.round(item.countedQty).toLocaleString('pt-BR'),
                        `R$ ${item.diffCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    ]);
                });
            });

            autoTable(doc, {
                startY: cursorY + 6,
                head: groupHead,
                body: groupBody,
                theme: 'striped',
                tableWidth: 'wrap',
                styles: { fontSize: 6.5, cellPadding: 1.2, overflow: 'linebreak', halign: 'center', valign: 'middle' },
                headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255] },
                columnStyles: {
                    0: { cellWidth: 63, halign: 'center' },
                    1: { cellWidth: 12, halign: 'center' },
                    2: { cellWidth: 12, halign: 'center' },
                    3: { cellWidth: 12, halign: 'center' },
                    4: { cellWidth: 18, halign: 'center' }
                },
                didParseCell: (hookData: any) => {
                    if (hookData.section === 'body' && hookData.row.raw[0]?.styles?.fontStyle === 'bold') {
                        if (hookData.column.index === 1 || hookData.column.index === 4) {
                            const valStr = hookData.cell.raw.content?.toString() || hookData.cell.raw.toString();
                            if (valStr.includes('-')) hookData.cell.styles.textColor = [220, 38, 38];
                            else if (valStr !== 'R$ 0,00' && valStr !== 'R$ -0,00' && valStr !== '0 un.' && valStr !== '') hookData.cell.styles.textColor = [22, 163, 74];
                        }
                    }
                    if (hookData.section === 'body' && !hookData.row.raw[0]?.styles) {
                        if (hookData.column.index === 1 || hookData.column.index === 4) {
                            const valStr = hookData.cell.raw.toString();
                            if (valStr.includes('-')) hookData.cell.styles.textColor = [220, 38, 38];
                            else if (valStr !== 'R$ 0,00' && valStr !== 'R$ -0,00' && valStr !== '0' && valStr !== '') hookData.cell.styles.textColor = [22, 163, 74];
                        }
                    }
                }
            });
            // @ts-ignore
            cursorY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 10 : cursorY + 30;
        }

        if (termMetricsForOutput && termMetricsForOutput.items && termMetricsForOutput.items.length > 0) {
            if (cursorY > 240) {
                doc.addPage();
                cursorY = 20;
            }
            doc.setFontSize(11);
            doc.setTextColor(15, 23, 42);
            doc.text('DIVERGÊNCIAS (PLANILHA DE CONFRONTO)', 14, cursorY);

            const divHead = [['Cód', 'Descrição', 'Lab', 'Est Sist', 'Est Fis', 'Dif Qtd', 'Custo Sist', 'Custo Físico', 'Dif R$']];
            const divBody = termMetricsForOutput.items.map(p => [
                p.code,
                p.description,
                p.lab,
                Math.round(p.sysQty).toLocaleString(),
                Math.round(p.countedQty).toLocaleString(),
                Math.round(p.diffQty).toLocaleString(),
                `R$ ${(p.sysCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                `R$ ${(p.countedCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                `R$ ${(p.diffCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            ]);
            const divFoot = [[
                { content: 'TOTAIS DAS DIVERGÊNCIAS', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
                Math.round(termMetricsForOutput.sysQty).toLocaleString(),
                Math.round(termMetricsForOutput.countedQty).toLocaleString(),
                Math.round(termMetricsForOutput.diffQty).toLocaleString(),
                `R$ ${(termMetricsForOutput.sysCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                `R$ ${(termMetricsForOutput.countedCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                `R$ ${(termMetricsForOutput.diffCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            ]];

            autoTable(doc, {
                startY: cursorY + 6,
                head: divHead,
                body: divBody,
                foot: divFoot,
                theme: 'striped',
                tableWidth: 'wrap',
                styles: { fontSize: 6.5, cellPadding: 1.2, overflow: 'linebreak', halign: 'center', valign: 'middle' },
                headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
                footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 12, halign: 'center' },
                    1: { cellWidth: 45, halign: 'center' },
                    2: { cellWidth: 10, halign: 'center' },
                    3: { cellWidth: 10, halign: 'center' },
                    4: { cellWidth: 10, halign: 'center' },
                    5: { cellWidth: 10, halign: 'center' },
                    6: { cellWidth: 15, halign: 'center' },
                    7: { cellWidth: 15, halign: 'center' },
                    8: { cellWidth: 15, halign: 'center' }
                }
            });
            // @ts-ignore
            cursorY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 10 : cursorY + 50;
        }

        if (!divergencesOnly) {
            // Restante do termo: produtos conferidos
            const productHead = [['Grupo', 'Departamento', 'Categoria', 'Código', 'Produto', 'Qtd', 'Custo Unit', 'Custo Total']];
            const productBody = scopeInfo.products.map(p => [
                p.groupName,
                p.deptName,
                p.catName,
                p.code,
                p.name,
                Math.round(p.quantity).toLocaleString(),
                `R$ ${(p.cost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                `R$ ${((p.cost || 0) * p.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            ]);
            const productFoot = [[
                { content: 'TOTAIS DOS ITENS CONFERIDOS', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
                Math.round(scopeInfo.products.reduce((acc, p) => acc + p.quantity, 0)).toLocaleString(),
                '',
                `R$ ${scopeInfo.products.reduce((acc, p) => acc + (p.quantity * (p.cost || 0)), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            ]];

            autoTable(doc, {
                startY: cursorY,
                head: productHead,
                body: productBody,
                foot: productFoot,
                theme: 'striped',
                tableWidth: 'wrap',
                styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak', halign: 'center', valign: 'middle' },
                headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
                footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 18, halign: 'center' },
                    1: { cellWidth: 28, halign: 'center' },
                    2: { cellWidth: 24, halign: 'center' },
                    3: { cellWidth: 16, halign: 'center' },
                    4: { cellWidth: 42, halign: 'center' },
                    5: { cellWidth: 10, halign: 'center' },
                    6: { cellWidth: 20, halign: 'center' },
                    7: { cellWidth: 20, halign: 'center' }
                }
            });

            // @ts-ignore
            cursorY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 10 : cursorY + 50;
        }

        const safeName = scopeInfo.group.name.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 30);
        const termTypeFile = termModal.type === 'custom' ? 'personalizado' : termModal.type;
        const modeSuffix = divergencesOnly ? '_somente_divergencias' : '';
        const fileName = `Termo_Auditoria_F${data.filial}_${termTypeFile}_${safeName}${modeSuffix}.pdf`;
        insertAppEventLog({
            company_id: selectedCompany?.id || null,
            branch: selectedFilial || null,
            area: null,
            user_email: userEmail,
            user_name: userName || null,
            app: 'auditoria',
            event_type: 'audit_term_printed',
            entity_type: 'audit_term',
            entity_id: fileName,
            status: 'success',
            success: true,
            source: 'web',
            event_meta: { type: termModal.type, group: scopeInfo.group.name, divergencesOnly }
        }).catch(() => { });
        doc.save(fileName);
    };
    const calculateProgress = useCallback((auditData: AuditData) => {
        let skus = 0, doneSkus = 0;
        if (auditData.groups) {
            auditData.groups.forEach(g => g.departments.forEach(d => d.categories.forEach(c => {
                skus += c.itemsCount;
                if (isDoneStatus(c.status)) doneSkus += c.itemsCount;
            })));
        }
        return skus > 0 ? (doneSkus / skus) * 100 : 0;
    }, []);

    const applyPartialScopes = useCallback((base: AuditData, partials: Array<{ startedAt: string; groupId?: string; deptId?: string; catId?: string }>) => {
        const partialMap = new Map<string, { startedAt: string; groupId?: string; deptId?: string; catId?: string }>();
        (partials || []).forEach(p => {
            if (!p?.startedAt) return;
            base.groups.forEach(g => {
                if (!isPartialScopeMatch(p, g.id)) return;
                g.departments.forEach(d => {
                    if (!isPartialScopeMatch(p, g.id, d.id)) return;
                    d.categories.forEach(c => {
                        if (!isPartialScopeMatch(p, g.id, d.id, c.id)) return;
                        const current = normalizeAuditStatus(c.status);
                        if (current === AuditStatus.DONE) return;
                        const key = partialScopeKey({ groupId: g.id, deptId: d.id, catId: c.id });
                        const existing = partialMap.get(key);
                        if (!existing) {
                            partialMap.set(key, {
                                startedAt: p.startedAt,
                                groupId: normalizeScopeId(g.id),
                                deptId: normalizeScopeId(d.id),
                                catId: normalizeScopeId(c.id)
                            });
                        }
                    });
                });
            });
        });
        const normalizedPartials = Array.from(partialMap.values());
        return {
            ...base,
            partialStarts: normalizedPartials,
            partialCompleted: base.partialCompleted || [],
            groups: base.groups.map(g => ({
                ...g,
                departments: g.departments.map(d => ({
                    ...d,
                    categories: d.categories.map(c => {
                        const current = normalizeAuditStatus(c.status);
                        if (current === AuditStatus.DONE) return { ...c, status: current };
                        const matched = normalizedPartials.some(p => isPartialScopeMatch(p, g.id, d.id, c.id));
                        return { ...c, status: matched ? AuditStatus.IN_PROGRESS : AuditStatus.TODO };
                    })
                }))
            }))
        };
    }, []);

    const clearPartialProgress = useCallback(async (
        reason?: 'expired' | 'manual' | 'invalid',
        discardCompleted = false,
        suppressExpiredAlert = false
    ) => {
        // Regra de segurança: nunca mais limpar automaticamente por "expiração".
        // Contagens finalizadas não podem ser afetadas por esse fluxo.
        if (reason === 'expired') return;
        if (!data?.partialStarts || data.partialStarts.length === 0) return;
        const nextData = applyPartialScopes(
            discardCompleted ? { ...data, partialCompleted: [] } : data,
            []
        );
        setData(nextData);
        try {
            const progress = calculateProgress(nextData);
            const savedSession = await persistAuditSession({
                id: dbSessionId,
                branch: selectedFilial,
                audit_number: nextAuditNumber,
                status: 'open',
                data: { ...nextData, termDrafts: composeTermDraftsForPersist((((nextData as any)?.termDrafts || {}) as Record<string, TermForm>), (((data as any)?.termDrafts || {}) as Record<string, TermForm>), termDrafts) } as any,
                progress: progress,
                user_email: userEmail
            }, { allowProgressRegression: true });
            if (savedSession) {
                await CacheService.set(`audit_session_${selectedFilial}`, savedSession as any);
            }
            insertAppEventLog({
                company_id: selectedCompany?.id || null,
                branch: selectedFilial || null,
                area: null,
                user_email: userEmail,
                user_name: userName || null,
                app: 'auditoria',
                event_type: 'audit_partial_pause',
                entity_type: 'partial_scope',
                entity_id: selectedFilial || null,
                status: 'success',
                success: true,
                source: 'web',
                event_meta: { reason: reason || 'manual', discarded_completed: discardCompleted }
            }).catch(() => { });

            if (reason === 'expired' && !suppressExpiredAlert && !isUpdatingStock) {
                if (sessionStorage.getItem(PARTIAL_EXPIRED_ALERT_KEY) !== '1') {
                    sessionStorage.setItem(PARTIAL_EXPIRED_ALERT_KEY, '1');
                    alert("Contagem parcial expirada. Inicie novamente para continuar.");
                }
            } else if (reason !== 'expired') {
                sessionStorage.removeItem(PARTIAL_EXPIRED_ALERT_KEY);
            }
        } catch (err) {
            console.error("Error clearing partial:", err);
        }
    }, [data, dbSessionId, selectedFilial, nextAuditNumber, applyPartialScopes, calculateProgress, isUpdatingStock, PARTIAL_EXPIRED_ALERT_KEY]);

    const finalizeActivePartials = useCallback(async () => {
        if (isReadOnlyCompletedView) {
            alert("Modo consulta ativo: este inventário concluído não pode ser editado.");
            return;
        }
        if (!data?.partialStarts || data.partialStarts.length === 0) return;
        if (!canUseAuditMasterTools) {
            alert("Apenas Master ou Administrativo pode concluir contagens parciais.");
            return;
        }
        if (!window.confirm("Deseja concluir todas as contagens parciais ativas?")) return;

        const toComplete = data.partialStarts;
        const completedAt = new Date().toISOString();
        const batchId = createBatchId();
        const merged = [
            ...(data.partialCompleted || []),
            ...toComplete.map(p => ({ ...p, completedAt, batchId }))
        ];
        const dedupedMap = new Map<string, { startedAt?: string; completedAt: string; batchId?: string; groupId?: string; deptId?: string; catId?: string }>();
        merged.forEach(p => {
            dedupedMap.set(partialCompletedKey(p), p);
        });
        const nextCompleted = Array.from(dedupedMap.values());

        const inScope = (p: { groupId?: string; deptId?: string; catId?: string }, g: Group, d: Department, c: Category) =>
            isPartialScopeMatch(p, g.id, d.id, c.id);

        const nextDataRaw: AuditData = {
            ...data,
            partialStarts: [],
            partialCompleted: nextCompleted,
            lastPartialBatchId: batchId,
            groups: data.groups.map(g => ({
                ...g,
                departments: g.departments.map(d => ({
                    ...d,
                    categories: d.categories.map(c => {
                        const current = normalizeAuditStatus(c.status);
                        if (current === AuditStatus.DONE) return { ...c, status: current };
                        const shouldFinalize = toComplete.some(p => inScope(p, g, d, c));
                        if (shouldFinalize) return { ...c, status: AuditStatus.DONE };
                        return { ...c, status: current };
                    })
                }))
            }))
        };

        const nextData = applyPartialScopes(nextDataRaw, []);
        setData(nextData);

        try {
            // Persistence consolidated in audit_sessions (data field)
            const progress = calculateProgress(nextData);
            const savedSession = await persistAuditSession({
                id: dbSessionId,
                branch: selectedFilial,
                audit_number: nextAuditNumber,
                status: 'open',
                data: { ...nextData, termDrafts: composeTermDraftsForPersist((((nextData as any)?.termDrafts || {}) as Record<string, TermForm>), (((data as any)?.termDrafts || {}) as Record<string, TermForm>), termDrafts) } as any,
                progress: progress,
                user_email: userEmail
            }, { allowProgressRegression: true });
            if (savedSession) {
                await CacheService.set(`audit_session_${selectedFilial}`, savedSession as any);
            }
            insertAppEventLog({
                company_id: selectedCompany?.id || null,
                branch: selectedFilial || null,
                area: null,
                user_email: userEmail,
                user_name: userName || null,
                app: 'auditoria',
                event_type: 'audit_partial_finalize',
                entity_type: 'partial_batch',
                entity_id: batchId,
                status: 'success',
                success: true,
                source: 'web',
                event_meta: { total_scopes: toComplete.length }
            }).catch(() => { });
            alert("Contagens parciais concluídas.");

        } catch (err) {
            console.error("Error finalizing partials:", err);
            alert("Erro ao concluir contagens parciais no Supabase.");
        }
    }, [data, dbSessionId, selectedFilial, nextAuditNumber, applyPartialScopes, calculateProgress, canUseAuditMasterTools, isReadOnlyCompletedView]);

    const clearActivePartialsShortcut = useCallback(async () => {
        if (isReadOnlyCompletedView) {
            alert("Modo consulta ativo: este inventário concluído não pode ser editado.");
            return;
        }
        if (!data?.partialStarts || data.partialStarts.length === 0) return;
        if (!window.confirm("Deseja desfazer todas as contagens parciais ativas?")) return;
        await clearPartialProgress('manual', false);
    }, [data, clearPartialProgress, isReadOnlyCompletedView]);

    const startScopeAudit = async (groupId?: string, deptId?: string, catId?: string) => {
        if (isReadOnlyCompletedView) {
            alert("Modo consulta ativo: este inventário concluído não pode ser editado.");
            return;
        }
        if (!data) return;
        sessionStorage.removeItem(PARTIAL_EXPIRED_ALERT_KEY);
        const scopeCatsGuard = getScopeCategories(groupId, deptId, catId);
        const scopeOpenCats = scopeCatsGuard.filter(({ cat }) => !isDoneStatus(cat.status));
        if (scopeOpenCats.length === 0) {
            await toggleScopeStatus(groupId, deptId, catId);
            return;
        }
        const nowIso = new Date().toISOString();
        const existing = data?.partialStarts || [];
        const catMap = new Map<string, { startedAt: string; groupId: string; deptId: string; catId: string }>();

        existing.forEach(p => {
            const expanded = getScopeCategories(p.groupId, p.deptId, p.catId);
            expanded.forEach(({ group, dept, cat }) => {
                if (isDoneStatus(cat.status)) return;
                const key = partialScopeKey({ groupId: group.id, deptId: dept.id, catId: cat.id });
                if (!catMap.has(key)) {
                    catMap.set(key, {
                        startedAt: p.startedAt || nowIso,
                        groupId: normalizeScopeId(group.id),
                        deptId: normalizeScopeId(dept.id),
                        catId: normalizeScopeId(cat.id)
                    });
                }
            });
        });

        const scopeCats = scopeOpenCats;
        const scopeKeys = scopeCats.map(({ group, dept, cat }) => partialScopeKey({ groupId: group.id, deptId: dept.id, catId: cat.id }));
        const allSelected = scopeKeys.length > 0 && scopeKeys.every(k => catMap.has(k));

        if (allSelected) {
            scopeKeys.forEach(k => catMap.delete(k));
        } else {
            scopeCats.forEach(({ group, dept, cat }) => {
                const key = partialScopeKey({ groupId: group.id, deptId: dept.id, catId: cat.id });
                catMap.set(key, {
                    startedAt: nowIso,
                    groupId: normalizeScopeId(group.id),
                    deptId: normalizeScopeId(dept.id),
                    catId: normalizeScopeId(cat.id)
                });
            });
        }

        const nextPartials = Array.from(catMap.values());
        const nextData = applyPartialScopes(data, nextPartials);

        setData(nextData);

        try {
            const progress = calculateProgress(nextData);
            const savedSession = await persistAuditSession({
                id: dbSessionId,
                branch: selectedFilial,
                audit_number: nextAuditNumber,
                status: 'open',
                data: { ...nextData, termDrafts: composeTermDraftsForPersist((((nextData as any)?.termDrafts || {}) as Record<string, TermForm>), (((data as any)?.termDrafts || {}) as Record<string, TermForm>), termDrafts) } as any,
                progress: progress,
                user_email: userEmail
            }, { allowProgressRegression: true });
            if (savedSession) {
                await CacheService.set(`audit_session_${selectedFilial}`, savedSession as any);
            }
            insertAppEventLog({
                company_id: selectedCompany?.id || null,
                branch: selectedFilial || null,
                area: null,
                user_email: userEmail,
                user_name: userName || null,
                app: 'auditoria',
                event_type: allSelected ? 'audit_partial_pause' : 'audit_partial_start',
                entity_type: 'partial_scope',
                entity_id: `${groupId || ''}:${deptId || ''}:${catId || ''}`,
                status: 'success',
                success: true,
                source: 'web',
                event_meta: { groupId, deptId, catId }
            }).catch(() => { });
        } catch (err) {
            console.error("Error persisting start:", err);
            alert("Erro ao registrar início no Supabase. O progresso foi salvo localmente.");
        }
    };

    const toggleScopeStatus = async (groupId?: string, deptId?: string, catId?: string) => {
        if (isReadOnlyCompletedView) {
            alert("Modo consulta ativo: este inventário concluído não pode ser editado.");
            return;
        }
        if (!data) return;
        if (!canUseAuditMasterTools) {
            alert("Apenas Master ou Administrativo pode concluir ou desativar contagens parciais.");
            return;
        }

        const scopeCats: Category[] = [];
        data.groups.forEach(g => {
            if (groupId && g.id !== groupId) return;
            g.departments.forEach(d => {
                if (deptId && d.id !== deptId) return;
                d.categories.forEach(c => {
                    if (catId && c.id !== catId) return;
                    scopeCats.push(c);
                });
            });
        });

        const hasStarted = scopeCats.some(c => normalizeAuditStatus(c.status) !== AuditStatus.TODO);
        if (!hasStarted) {
            alert("Inicie a auditoria parcial antes de concluir.");
            return;
        }

        // Determinar se o escopo atual já está todo concluído
        let allDone = true;
        data.groups.forEach(g => {
            if (groupId && g.id !== groupId) return;
            g.departments.forEach(d => {
                if (deptId && d.id !== deptId) return;
                d.categories.forEach(c => {
                    if (catId && c.id !== catId) return;
                    if (!isDoneStatus(c.status)) allDone = false;
                });
            });
        });

        const isUnmarkFlow = allDone;
        if (isUnmarkFlow) {
            if (!window.confirm("Tem certeza que deseja desmarcar este escopo finalizado?")) return;
            const typed = window.prompt("Confirmação de segurança: digite DESMARCAR para continuar.");
            if ((typed || '').trim().toUpperCase() !== 'DESMARCAR') return;
        } else {
            if (!window.confirm("Tem certeza que deseja finalizar e gravar o estoque no Supabase?")) return;
        }

        const targetScopeCatKeys = new Set(
            getScopeCategories(groupId, deptId, catId).map(({ group, dept, cat }) =>
                partialScopeKey({ groupId: group.id, deptId: dept.id, catId: cat.id })
            )
        );
        const entryTouchesTargetScope = (entry: { groupId?: string; deptId?: string; catId?: string }) => {
            if (targetScopeCatKeys.size === 0) return scopeContainsPartial(entry, groupId, deptId, catId);
            const expanded = getScopeCategories(entry.groupId, entry.deptId, entry.catId);
            for (const { group, dept, cat } of expanded) {
                const key = partialScopeKey({ groupId: group.id, deptId: dept.id, catId: cat.id });
                if (targetScopeCatKeys.has(key)) return true;
            }
            return false;
        };
        const existingPartials = data?.partialStarts || [];
        const filteredPartials = existingPartials.filter(p => !entryTouchesTargetScope(p));
        const baseCompleted = isUnmarkFlow
            ? (data.partialCompleted || []).filter(p => !entryTouchesTargetScope(p))
            : (data.partialCompleted || []);
        let nextCompleted = baseCompleted;
        let nextBatchId = data.lastPartialBatchId;
        if (isUnmarkFlow) {
            nextBatchId = getLatestBatchId(baseCompleted);
        } else {
            const completedAt = new Date().toISOString();
            const batchId = createBatchId();
            const scopeEntry = {
                completedAt,
                batchId,
                groupId: normalizeScopeId(groupId),
                deptId: normalizeScopeId(deptId),
                catId: normalizeScopeId(catId)
            };
            const map = new Map<string, any>();
            baseCompleted.forEach(p => map.set(partialCompletedKey(p), p));
            map.set(partialCompletedKey(scopeEntry), scopeEntry);
            nextCompleted = Array.from(map.values());
            nextBatchId = batchId;
        }

        const nextDataRaw: AuditData = {
            ...data,
            partialStarts: filteredPartials,
            partialCompleted: nextCompleted,
            lastPartialBatchId: nextBatchId,
            groups: data.groups.map(g => {
                if (groupId && g.id !== groupId) return g;
                return {
                    ...g,
                    departments: g.departments.map(d => {
                        if (deptId && d.id !== deptId) return d;
                        return {
                            ...d,
                            categories: d.categories.map(c => {
                                if (catId && c.id !== catId) return c;
                                if (isUnmarkFlow) return { ...c, status: AuditStatus.TODO };
                                if (isDoneStatus(c.status)) return c;
                                return { ...c, status: AuditStatus.DONE };
                            })
                        };
                    })
                };
            })
        };

        const nextData = applyPartialScopes(nextDataRaw, filteredPartials);
        const nextDrafts = termDrafts;

        const nextDataWithTerms = { ...nextData, termDrafts: nextDrafts } as any;
        setData(nextDataWithTerms);

        try {
            const progress = calculateProgress(nextDataWithTerms);
            const savedSession = await persistAuditSession({
                id: dbSessionId,
                branch: selectedFilial,
                audit_number: nextAuditNumber,
                status: 'open',
                data: nextDataWithTerms,
                progress: progress,
                user_email: userEmail
            }, { allowProgressRegression: isUnmarkFlow });
            if (savedSession) {
                await CacheService.set(`audit_session_${selectedFilial}`, savedSession as any);
            }
            insertAppEventLog({
                company_id: selectedCompany?.id || null,
                branch: selectedFilial || null,
                area: null,
                user_email: userEmail,
                user_name: userName || null,
                app: 'auditoria',
                event_type: isUnmarkFlow ? 'audit_partial_pause' : 'audit_partial_finalize',
                entity_type: 'partial_scope',
                entity_id: `${groupId || ''}:${deptId || ''}:${catId || ''}`,
                status: 'success',
                success: true,
                source: 'web',
                event_meta: { groupId, deptId, catId, action: isUnmarkFlow ? 'unmark' : 'finalize' }
            }).catch(() => { });
            alert(isUnmarkFlow
                ? "Escopo desmarcado com sucesso."
                : "Estoque gravado no Supabase com sucesso!");

        } catch (err) {
            console.error("Error persisting toggle:", err);
            alert("Erro ao gravar no Supabase. O progresso foi salvo localmente.");
        }
    };

    const handleExportPDF = async () => {
        if (!data) return;
        const doc = new jsPDF('l', 'mm', 'a4');
        const ts = new Date().toLocaleString('pt-BR');

        doc.setFontSize(22); doc.setTextColor(15, 23, 42);
        doc.text(`INVENTÁRIO ANALÍTICO: FILIAL ${data.filial}`, 14, 22);
        doc.setFontSize(10); doc.setTextColor(100);
        doc.text(`${data.empresa} - Emitido em: ${ts}`, 14, 30);
        doc.line(14, 34, 282, 34);

        const summaryData = [
            ["PREVISÃO DE TÉRMINO", `${Math.ceil(productivity.etaDays)} dias restantes`, "CONFERÊNCIA (SKUs)", `${Math.round(branchMetrics.progress)}%`],
            ["SKUs TOTAIS (Relatório)", branchMetrics.skus.toLocaleString(), "UNIDADES TOTAIS (Relatório)", Math.round(branchMetrics.units).toLocaleString()],
            ["SKUs CONFERIDOS", branchMetrics.doneSkus.toLocaleString(), "UNIDADES CONFERIDAS", Math.round(filialTotalsMetrics.doneUnits).toLocaleString()],
            ["SKUs FALTANTES", branchMetrics.pendingSkus.toLocaleString(), "UNIDADES FALTANTES", Math.round(branchMetrics.pendingUnits).toLocaleString()],
            ["VALOR TOTAL (Custo)", `R$ ${branchMetrics.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, "VALOR CONFERIDO", `R$ ${filialTotalsMetrics.doneCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]
        ];

        autoTable(doc, { startY: 40, body: summaryData, theme: 'grid', styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [79, 70, 229] } });

        doc.addPage();
        doc.setFontSize(16); doc.setTextColor(15, 23, 42);
        doc.text("BALANÇO ANALÍTICO HIERÁRQUICO (TOTAL vs CONFERIDO)", 14, 20);

        const hierarchyRows: any[] = [];
        data.groups.forEach(g => {
            const gm = calcScopeMetrics(g);
            hierarchyRows.push([
                { content: `GRUPO: ${g.name} (ID ${g.id})`, styles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' } },
                gm.skus, gm.doneSkus, `${Math.round(gm.progress)}%`,
                Math.round(gm.units).toLocaleString(), Math.round(gm.doneUnits).toLocaleString(), `${Math.round(gm.progressUnits)}%`,
                `R$ ${gm.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, `R$ ${gm.doneCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            ]);

            g.departments.forEach(d => {
                const dm = calcScopeMetrics(d);
                hierarchyRows.push([
                    { content: `  > DEPARTAMENTO: ${d.name} (${d.numericId || '--'})`, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } },
                    dm.skus, dm.doneSkus, `${Math.round(dm.progress)}%`,
                    Math.round(dm.units).toLocaleString(), Math.round(dm.doneUnits).toLocaleString(), `${Math.round(dm.progressUnits)}%`,
                    `R$ ${dm.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, `R$ ${dm.doneCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                ]);

                d.categories.forEach(c => {
                    const isDone = isDoneStatus(c.status);
                    hierarchyRows.push([
                        `      - ${c.name} (${c.numericId || "--"})`,
                        c.itemsCount, isDone ? c.itemsCount : 0, isDone ? "100%" : "0%",
                        c.totalQuantity.toLocaleString(), isDone ? c.totalQuantity.toLocaleString() : "0", isDone ? "100%" : "0%",
                        `R$ ${c.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, isDone ? `R$ ${c.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "R$ 0,00"
                    ]);
                });
            });
        });

        autoTable(doc, {
            startY: 30,
            head: [['Hierarquia de Inventário (Grupo > Depto > Cat)', 'Mix Total', 'Mix Conf.', 'Prog Mix', 'Unid Total', 'Unid Conf.', 'Prog Unid', 'Custo Total', 'Custo Conf.']],
            body: hierarchyRows,
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: { fillColor: [15, 23, 42] }
        });

        const fileName = `Auditoria_F${data.filial}_Analitica.pdf`;
        insertAppEventLog({
            company_id: selectedCompany?.id || null,
            branch: selectedFilial || null,
            area: null,
            user_email: userEmail,
            user_name: userName || null,
            app: 'auditoria',
            event_type: 'audit_report_printed',
            entity_type: 'audit_report',
            entity_id: fileName,
            status: 'success',
            success: true,
            source: 'web'
        }).catch(() => { });
        doc.save(fileName);
    };

    const handleExportDetailedExcel = () => {
        if (!data) {
            alert("Nenhum dado de auditoria disponível para exportação.");
            return;
        }

        try {
            const allProductsData: any[] = [];
            let totalSysQty = 0;
            let totalCountedQty = 0;
            let totalSysCost = 0;
            let totalCountedCost = 0;
            let totalFaltaQty = 0;
            let totalFaltaCost = 0;
            let totalSobraQty = 0;
            let totalSobraCost = 0;
            let divergentSkusCount = 0;

            // Helper de deduplicacao
            const normalizeDigitsLocal = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
            const normalizeScopeIdLocal = (value: unknown) => String(value ?? '').trim().toLowerCase();
            const normalizeTextLocal = (value: unknown) =>
                String(value ?? '')
                    .normalize('NFD')
                    .replace(/[̀-ͯ]/g, '')
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .trim();

            const mergeExcelMetricsPoolsLocal = (poolsList: any[]) => {
                const validPools = (poolsList || []).filter(Boolean);
                if (validPools.length === 0) return null;
                if (validPools.length === 1) return validPools[0];

                const uniqueItems = new Map<string, any>();
                validPools.forEach((pool: any) => {
                    (Array.isArray(pool?.items) ? pool.items : []).forEach((it: any) => {
                        const keyObj = {
                            code: normalizeDigitsLocal(it?.code || it?.reducedCode),
                            groupId: normalizeScopeIdLocal(it?.groupId),
                            deptId: normalizeScopeIdLocal(it?.deptId),
                            catId: normalizeScopeIdLocal(it?.catId),
                            groupName: normalizeTextLocal(it?.groupName),
                            deptName: normalizeTextLocal(it?.deptName),
                            catName: normalizeTextLocal(it?.catName),
                            sysQty: Number(it?.sysQty || 0),
                            countedQty: Number(it?.countedQty || 0),
                            diffQty: Number(it?.diffQty || 0),
                            sysCost: Number(it?.sysCost || 0),
                            countedCost: Number(it?.countedCost || 0),
                            diffCost: Number(it?.diffCost || 0)
                        };
                        const key = JSON.stringify(keyObj);
                        if (!uniqueItems.has(key)) uniqueItems.set(key, it);
                    });
                });
                return { items: Array.from(uniqueItems.values()) };
            };

            const metricsByKey = new Map<string, any>();
            Object.entries((((data as any)?.termExcelMetricsByKey || {}) as Record<string, any>)).forEach(([draftKey, metrics]) => {
                if (metrics) metricsByKey.set(draftKey, metrics);
            });
            Object.entries(termDrafts || {}).forEach(([draftKey, draftValue]) => {
                if (draftValue?.excelMetricsRemovedAt && !draftValue?.excelMetrics) {
                    metricsByKey.delete(draftKey);
                    return;
                }
                if (draftValue?.excelMetrics) metricsByKey.set(draftKey, draftValue.excelMetrics);
            });

            const metricEntries = Array.from(metricsByKey.entries()).filter(([, metrics]) => !!metrics);
            const globalUnifiedEntries = metricEntries.filter(([draftKey]) =>
                draftKey.startsWith('custom|') && draftKey.includes(GLOBAL_UNIFIED_TERM_BATCH_ID)
            );
            const pools = (globalUnifiedEntries.length > 0 ? globalUnifiedEntries : metricEntries)
                .map(([, metrics]) => metrics);

            const merged = mergeExcelMetricsPoolsLocal(pools);
            const uniqueExcelItems = merged?.items || [];

            const metadataKeywords = [
                'filial:', 'grupo de produtos:', 'departamento:', 'categoria:',
                'tipo de produto:', 'grupo de preço:', 'início contagem:',
                'conferência de estoque', 'código', 'página 1 de', 'produto:'
            ];

            const isMetadataRow = (item: any) => {
                const codigo = String(item.code || '').trim().toLowerCase();
                const descricao = String(item.description || '').trim().toLowerCase();

                if (metadataKeywords.some(keyword => codigo.startsWith(keyword) || descricao.startsWith(keyword))) {
                    return true;
                }
                if ((!codigo && !descricao) || codigo === '-' || descricao === '-' || (codigo === '' && descricao === '-')) {
                    return true;
                }
                return false;
            };

            const cleanExcelItems = uniqueExcelItems.filter((item: any) => !isMetadataRow(item));

            cleanExcelItems.forEach((item: any) => {
                const sysQty = Number(item.sysQty || 0);
                const countedQty = Number(item.countedQty || 0);
                const diffQty = Number(item.diffQty || 0);
                const cost = roundAuditMoney(item.cost);
                const sysCost = roundAuditMoney(item.sysCost);
                const countedCost = roundAuditMoney(item.countedCost);
                const diffCost = roundAuditMoney(item.diffCost);

                let faltaQty = 0;
                let faltaCost = 0;
                let sobraQty = 0;
                let sobraCost = 0;

                if (diffQty < 0) {
                    faltaQty = Math.abs(diffQty);
                    faltaCost = Math.abs(diffCost);
                } else if (diffQty > 0) {
                    sobraQty = diffQty;
                    sobraCost = diffCost;
                }

                allProductsData.push({
                    code: item.code || '',
                    reducedCode: item.reducedCode || '',
                    name: item.description || item.name || '',
                    groupName: item.groupName || 'DIVERSOS (SEM GRUPO)',
                    deptName: item.deptName || 'DIVERSOS (SEM DEPARTAMENTO)',
                    catName: item.catName || 'DIVERSOS (SEM CATEGORIA)',
                    cost,
                    sysQty,
                    countedQty,
                    diffQty,
                    sysCost,
                    countedCost,
                    diffCost,
                    faltaQty,
                    faltaCost,
                    sobraQty,
                    sobraCost,
                    status: Math.abs(diffQty) > 0.01 || Math.abs(diffCost) > 0.01
                        ? (diffQty < 0 ? 'FALTA' : diffQty > 0 ? 'SOBRA' : 'DIVERGÊNCIA FINANCEIRA')
                        : 'CORRETO'
                });
            });

            // Acumular totais a partir de allProductsData
            allProductsData.forEach(p => {
                totalSysQty += p.sysQty;
                totalCountedQty += p.countedQty;
                totalSysCost = roundAuditMoney(totalSysCost + p.sysCost);
                totalCountedCost = roundAuditMoney(totalCountedCost + p.countedCost);
                totalFaltaQty += p.faltaQty;
                totalFaltaCost = roundAuditMoney(totalFaltaCost + p.faltaCost);
                totalSobraQty += p.sobraQty;
                totalSobraCost = roundAuditMoney(totalSobraCost + p.sobraCost);
                if (Math.abs(Number(p.diffQty || 0)) > 0.01 || Math.abs(Number(p.diffCost || 0)) > 0.01) {
                    divergentSkusCount++;
                }
            });

            // 3. Agrupamentos
            const groupMap: Record<string, any> = {};
            const deptMap: Record<string, any> = {};
            const catMap: Record<string, any> = {};

            allProductsData.forEach(p => {
                // Grupo
                if (!groupMap[p.groupName]) {
                    groupMap[p.groupName] = { Grupo: p.groupName, 'Qtd Sistema': 0, 'Qtd Conferida': 0, 'Divergência Qtd': 0, 'Custo Sistema (R$)': 0, 'Custo Conferido (R$)': 0, 'Divergência R$': 0, 'Qtd Faltas (Perdas)': 0, 'Valor Faltas (R$)': 0, 'Qtd Sobras': 0, 'Valor Sobras (R$)': 0 };
                }
                const g = groupMap[p.groupName];
                g['Qtd Sistema'] += p.sysQty;
                g['Qtd Conferida'] += p.countedQty;
                g['Divergência Qtd'] += p.diffQty;
                g['Custo Sistema (R$)'] = roundAuditMoney(g['Custo Sistema (R$)'] + p.sysCost);
                g['Custo Conferido (R$)'] = roundAuditMoney(g['Custo Conferido (R$)'] + p.countedCost);
                g['Divergência R$'] = roundAuditMoney(g['Divergência R$'] + p.diffCost);
                g['Qtd Faltas (Perdas)'] += p.faltaQty;
                g['Valor Faltas (R$)'] = roundAuditMoney(g['Valor Faltas (R$)'] + p.faltaCost);
                g['Qtd Sobras'] += p.sobraQty;
                g['Valor Sobras (R$)'] = roundAuditMoney(g['Valor Sobras (R$)'] + p.sobraCost);

                // Departamento
                const deptKey = `${p.groupName} | ${p.deptName}`;
                if (!deptMap[deptKey]) {
                    deptMap[deptKey] = { Grupo: p.groupName, Departamento: p.deptName, 'Qtd Sistema': 0, 'Qtd Conferida': 0, 'Divergência Qtd': 0, 'Custo Sistema (R$)': 0, 'Custo Conferido (R$)': 0, 'Divergência R$': 0, 'Qtd Faltas (Perdas)': 0, 'Valor Faltas (R$)': 0, 'Qtd Sobras': 0, 'Valor Sobras (R$)': 0 };
                }
                const d = deptMap[deptKey];
                d['Qtd Sistema'] += p.sysQty;
                d['Qtd Conferida'] += p.countedQty;
                d['Divergência Qtd'] += p.diffQty;
                d['Custo Sistema (R$)'] = roundAuditMoney(d['Custo Sistema (R$)'] + p.sysCost);
                d['Custo Conferido (R$)'] = roundAuditMoney(d['Custo Conferido (R$)'] + p.countedCost);
                d['Divergência R$'] = roundAuditMoney(d['Divergência R$'] + p.diffCost);
                d['Qtd Faltas (Perdas)'] += p.faltaQty;
                d['Valor Faltas (R$)'] = roundAuditMoney(d['Valor Faltas (R$)'] + p.faltaCost);
                d['Qtd Sobras'] += p.sobraQty;
                d['Valor Sobras (R$)'] = roundAuditMoney(d['Valor Sobras (R$)'] + p.sobraCost);

                // Categoria
                const catKey = `${p.groupName} | ${p.deptName} | ${p.catName}`;
                if (!catMap[catKey]) {
                    catMap[catKey] = { Grupo: p.groupName, Departamento: p.deptName, Categoria: p.catName, 'Qtd Sistema': 0, 'Qtd Conferida': 0, 'Divergência Qtd': 0, 'Custo Sistema (R$)': 0, 'Custo Conferido (R$)': 0, 'Divergência R$': 0, 'Qtd Faltas (Perdas)': 0, 'Valor Faltas (R$)': 0, 'Qtd Sobras': 0, 'Valor Sobras (R$)': 0 };
                }
                const c = catMap[catKey];
                c['Qtd Sistema'] += p.sysQty;
                c['Qtd Conferida'] += p.countedQty;
                c['Divergência Qtd'] += p.diffQty;
                c['Custo Sistema (R$)'] = roundAuditMoney(c['Custo Sistema (R$)'] + p.sysCost);
                c['Custo Conferido (R$)'] = roundAuditMoney(c['Custo Conferido (R$)'] + p.countedCost);
                c['Divergência R$'] = roundAuditMoney(c['Divergência R$'] + p.diffCost);
                c['Qtd Faltas (Perdas)'] += p.faltaQty;
                c['Valor Faltas (R$)'] = roundAuditMoney(c['Valor Faltas (R$)'] + p.faltaCost);
                c['Qtd Sobras'] += p.sobraQty;
                c['Valor Sobras (R$)'] = roundAuditMoney(c['Valor Sobras (R$)'] + p.sobraCost);
            });

            // 4. Criar workbook
            const wb = XLSX.utils.book_new();

            // Aba 1: Resumo Geral
            const overallDiffCost = roundAuditMoney(totalCountedCost - totalSysCost);
            const diffType = overallDiffCost < 0 ? 'Prejuízo (Falta)' : overallDiffCost > 0 ? 'Sobra (Excesso)' : 'Zero';
            const fmtCurrency = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const fmtInt = (value: number) => Math.round(Number(value || 0)).toLocaleString('pt-BR');
            const fmtPercent = (value: number | null) => value === null
                ? 'N/A'
                : `${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
            const signedInt = (value: number) => `${Number(value || 0) > 0 ? '+' : ''}${fmtInt(Number(value || 0))}`;
            const mixPending = Math.max(0, Number(branchMetrics.skus || 0) - Number(branchMetrics.doneSkus || 0));
            const termRepresentativity = getFinancialRepresentativity(Number(branchMetrics.doneCost || branchMetrics.cost || 0), overallDiffCost);
            const summaryData = [
                ['MÉTRICA', 'VALOR'],
                ['EMPRESA', data.empresa || 'Sem Empresa'],
                ['FILIAL / LOJA', data.filial || 'Sem Filial'],
                ['NÚMERO DA AUDITORIA', accessedAuditNumber !== null ? String(accessedAuditNumber) : 'N/A'],
                ['STATUS DA SESSÃO', isReadOnlyCompletedView ? 'CONCLUÍDO (MODO CONSULTA)' : 'ABERTO'],
                ['DATA DE EXPORTAÇÃO', new Date().toLocaleString('pt-BR')],
                [],
                ['RESUMO FINANCEIRO DA CONFERÊNCIA', ''],
                ['INDICADORES DA FILIAL', ''],
                ['Conferência Global da Filial', `${Number(branchMetrics.progress || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`],
                ['SKUs Totais (Mix Importado)', fmtInt(Number(branchMetrics.skus || 0))],
                ['Mix Auditado (Conf./Pend.)', `${fmtInt(Number(branchMetrics.doneSkus || 0))} / ${fmtInt(mixPending)}`],
                ['Unidades Totais (Conf./Total)', `${fmtInt(Number(filialTotalsMetrics.doneUnits || 0))} / ${fmtInt(Number(branchMetrics.units || 0))}`],
                ['Valor em Custo (Conf./Total)', `${fmtCurrency(Number(filialTotalsMetrics.doneCost || 0))} / ${fmtCurrency(Number(branchMetrics.cost || 0))}`],
                ['Total Conferido R$', fmtCurrency(Number(filialTotalsMetrics.doneCost || 0))],
                ['Falta Conferir R$', fmtCurrency(Number(filialTotalsMetrics.pendingCost || 0))],
                ['Qtde Divergência', `${signedInt(Number(filialTotalsMetrics.diffQty || 0))} un.`],
                ['Divergência R$', fmtCurrency(Number(filialTotalsMetrics.diffCost || 0))],
                ['Rep. Divergência', fmtPercent(Number(filialTotalsMetrics.repDivergencePct || 0))],
                [],
                ['DADOS DO TERMO (ESCOPO)', ''],
                ['Estoque Sistema (Qtde)', fmtInt(totalSysQty)],
                ['Custo Total Sistema', fmtCurrency(totalSysCost)],
                ['Estoque Físico (Qtde)', fmtInt(totalCountedQty)],
                ['Custo Total Físico', fmtCurrency(totalCountedCost)],
                ['Diferença de Estoque (Qtde)', signedInt(totalCountedQty - totalSysQty)],
                ['Resultado Financeiro', `${fmtCurrency(overallDiffCost)} (${diffType})`],
                ['Representatividade no Auditado', fmtPercent(termRepresentativity)],
                [],
                ['DETALHAMENTO DAS DIVERGÊNCIAS', ''],
                ['TOTAL DE ITENS NO TERMO', allProductsData.length],
                ['TOTAL DE ITENS COM DIVERGÊNCIA', divergentSkusCount],
                ['FALTAS / PERDAS - QTD UNIDADES', fmtInt(totalFaltaQty)],
                ['FALTAS / PERDAS - VALOR (R$)', fmtCurrency(totalFaltaCost)],
                ['SOBRAS - QTD UNIDADES', fmtInt(totalSobraQty)],
                ['SOBRAS - VALOR (R$)', fmtCurrency(totalSobraCost)]
            ];
            const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
            wsSummary['!cols'] = [{ wch: 42 }, { wch: 38 }];
            XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo Geral");

            // Aba 2: Por Grupo
            const wsGroup = XLSX.utils.json_to_sheet(Object.values(groupMap));
            XLSX.utils.book_append_sheet(wb, wsGroup, "Por Grupo");

            // Aba 3: Por Departamento
            const wsDept = XLSX.utils.json_to_sheet(Object.values(deptMap));
            XLSX.utils.book_append_sheet(wb, wsDept, "Por Departamento");

            // Aba 4: Por Categoria
            const wsCat = XLSX.utils.json_to_sheet(Object.values(catMap));
            XLSX.utils.book_append_sheet(wb, wsCat, "Por Categoria");

            // Aba 5: Itens Detalhado
            const detailedItems = allProductsData.map(p => ({
                'Código de Barras': p.code,
                'Código Reduzido': p.reducedCode,
                'Descrição do Produto': p.name,
                'Grupo': p.groupName,
                'Departamento': p.deptName,
                'Categoria': p.catName,
                'Custo Unitário (R$)': p.cost,
                'Qtd Sistema': p.sysQty,
                'Qtd Físico': p.countedQty,
                'Divergência Qtd': p.diffQty,
                'Total Sistema (R$)': p.sysCost,
                'Total Físico (R$)': p.countedCost,
                'Divergência Financeira (R$)': p.diffCost,
                'Qtd Faltas (Perdas)': p.faltaQty,
                'Valor Faltas (R$)': p.faltaCost,
                'Qtd Sobras': p.sobraQty,
                'Valor Sobras (R$)': p.sobraCost,
                'Status': p.status
            }));
            const wsDetailed = XLSX.utils.json_to_sheet(detailedItems);
            XLSX.utils.book_append_sheet(wb, wsDetailed, "Itens Detalhado");

            if (postAuditAdjustments.length > 0) {
                const adjustmentRows = postAuditAdjustments.map(item => ({
                    'Data/Hora': item.createdAt ? new Date(item.createdAt).toLocaleString('pt-BR', { hour12: false }) : '',
                    'Usuário': item.createdBy || '',
                    'Código Reduzido': item.reducedCode || item.code,
                    'Código de Barras': item.barcode || '',
                    'Descrição': item.description,
                    'Grupo': item.groupName || item.groupId || '',
                    'Departamento': item.deptName || item.deptId || '',
                    'Categoria': item.catName || item.catId || '',
                    'Qtd Ajuste': item.quantity,
                    'Custo Unitário (R$)': item.unitCost,
                    'Impacto Financeiro (R$)': item.totalCost,
                    'Observação': item.note || ''
                }));
                const wsAdjustments = XLSX.utils.json_to_sheet(adjustmentRows);
                XLSX.utils.book_append_sheet(wb, wsAdjustments, "Ajustes Pos Auditoria");
            }

            const fileName = `Auditoria_F${data.filial}_N${accessedAuditNumber || 'DETALHADA'}_Detalhado.xlsx`;
            XLSX.writeFile(wb, fileName);

            insertAppEventLog({
                company_id: selectedCompany?.id || null,
                branch: selectedFilial || null,
                area: null,
                user_email: userEmail,
                user_name: userName || null,
                app: 'auditoria',
                event_type: 'audit_report_printed',
                entity_type: 'audit_report',
                entity_id: fileName,
                status: 'success',
                success: true,
                source: 'web'
            }).catch(() => { });

        } catch (error) {
            console.error("Erro ao exportar planilha Excel detalhada:", error);
            alert("Erro ao gerar o relatório detalhado em Excel.");
        }
    };
    const selectedGroup = useMemo(() => data?.groups.find(g => g.id === view.selectedGroupId), [data, view.selectedGroupId]);
    const selectedDept = useMemo(() => selectedGroup?.departments.find(d => d.id === view.selectedDeptId), [selectedGroup, view.selectedDeptId]);
    const selectedCat = useMemo(() => selectedDept?.categories.find(c => c.id === view.selectedCatId), [selectedDept, view.selectedCatId]);

    const formatPostAdjustmentHierarchyText = useCallback((label: string, code?: string | number | null, name?: string | null) => {
        const codeText = String(code || '').trim();
        const nameText = String(name || '').trim();
        if (codeText && nameText) return `${label}: ${codeText} - ${nameText}`;
        if (nameText) return `${label}: ${nameText}`;
        if (codeText) return `${label}: ${codeText}`;
        return `${label}: N/D`;
    }, []);

    const isAutoPostAdjustmentNote = useCallback((value: string) => {
        const text = normalizeLookupText(value);
        return text.startsWith('ja auditado em') &&
            text.includes('grupo:') &&
            text.includes('departamento:') &&
            text.includes('categoria:');
    }, []);

    const resolveCompletedAtForScope = useCallback((groupId: string, deptId: string, catId: string) => {
        const completed = Array.isArray((data as any)?.partialCompleted) ? (data as any).partialCompleted : [];
        let latestAt = '';
        completed.forEach((entry: any) => {
            if (!isPartialScopeMatch(entry, groupId, deptId, catId)) return;
            const candidate = String(entry?.completedAt || entry?.startedAt || '').trim();
            if (!candidate) return;
            if (!latestAt || new Date(candidate).getTime() > new Date(latestAt).getTime()) {
                latestAt = candidate;
            }
        });
        return latestAt || null;
    }, [data]);

    const auditLookupIndex = useMemo(() => {
        if (!data) return [] as Array<{
            groupId: string;
            groupName: string;
            deptId: string;
            deptName: string;
            catId: string;
            catName: string;
            deptCode: string;
            catCode: string;
            productName: string;
            barcode: string;
            reducedCode: string;
            codeKeys: string[];
            quantity: number;
            unitCost: number;
            audited: boolean;
            completedAt?: string | null;
            searchText: string;
        }>;

        return data.groups.flatMap(group =>
            group.departments.flatMap(dept =>
                dept.categories.flatMap(cat =>
                    cat.products.map(product => {
                        const productAny = product as any;
                        const productCodeKey = normalizeProductLookupCode(product.code);
                        const reducedCode = String(product.reducedCode || barcodeAliasToReduced[productCodeKey] || '').trim();
                        const reducedKey = normalizeProductLookupCode(reducedCode);
                        const savedAliases = Array.isArray(productAny.barcodeAliases) ? productAny.barcodeAliases : [];
                        const stockAliases = stockCodeAliasesByReduced[reducedKey] || [];
                        const cadastroAliases = cadastroBarcodeAliasesByReduced[reducedKey] || [];
                        const rawCodeCandidates = [
                            productAny.barcode,
                            product.code,
                            reducedCode,
                            ...savedAliases,
                            ...stockAliases,
                            ...cadastroAliases
                        ].map(value => String(value || '').trim()).filter(Boolean);
                        const codeKeys = Array.from(new Set(rawCodeCandidates.map(normalizeProductLookupCode).filter(Boolean)));
                        const distinctBarcodeCandidates = rawCodeCandidates.filter(code => {
                            const key = normalizeProductLookupCode(code);
                            return key && key !== reducedKey;
                        });
                        const barcode = String(
                            distinctBarcodeCandidates.find(code => normalizeProductLookupCode(code).length >= 8) ||
                            distinctBarcodeCandidates[0] ||
                            ''
                        ).trim();
                        const completedAt = resolveCompletedAtForScope(group.id, dept.id, cat.id);
                        const audited = isDoneStatus(cat.status);
                        const deptCode = String((dept as any).numericId || dept.id || '').trim();
                        const catCode = String((cat as any).numericId || cat.id || '').trim();
                        return {
                            groupId: group.id,
                            groupName: group.name,
                            deptId: dept.id,
                            deptName: dept.name,
                            catId: cat.id,
                            catName: cat.name,
                            deptCode,
                            catCode,
                            productName: product.name,
                            barcode,
                            reducedCode,
                            codeKeys,
                            quantity: Number(product.quantity || 0),
                            unitCost: roundAuditMoney(product.cost || 0),
                            audited,
                            completedAt,
                            searchText: normalizeLookupText(
                                `${barcode} ${reducedCode} ${codeKeys.join(' ')} ${product.name} ${group.id} ${group.name} ${dept.id} ${dept.name} ${cat.id} ${cat.name}`
                            )
                        };
                    })
                )
            )
        );
    }, [data, resolveCompletedAtForScope, stockCodeAliasesByReduced, cadastroBarcodeAliasesByReduced, barcodeAliasToReduced]);

    const normalizedAuditLookup = useMemo(() => normalizeLookupText(auditLookup), [auditLookup]);
    const normalizedAuditLookupCode = useMemo(() => normalizeProductLookupCode(auditLookup), [auditLookup]);
    const auditLookupResults = useMemo(() => {
        if (!normalizedAuditLookup) return [] as typeof auditLookupIndex;
        const resolvedLookupCodes = Array.from(new Set([
            normalizedAuditLookupCode,
            barcodeAliasToReduced[normalizedAuditLookupCode]
        ].filter(Boolean)));
        return auditLookupIndex
            .filter(item => {
                if (resolvedLookupCodes.length > 0) {
                    const itemReduced = normalizeProductLookupCode(item.reducedCode);
                    const codeMatch = item.codeKeys.some(key =>
                        resolvedLookupCodes.some(lookupCode =>
                            key === lookupCode ||
                            (lookupCode.length >= 3 && key.includes(lookupCode)) ||
                            (lookupCode.length >= 8 && key.length >= 8 && lookupCode.includes(key))
                        )
                    ) || resolvedLookupCodes.includes(itemReduced);
                    if (codeMatch) return true;
                }
                return item.searchText.includes(normalizedAuditLookup);
            })
            .slice(0, 25);
    }, [auditLookupIndex, normalizedAuditLookup, normalizedAuditLookupCode, barcodeAliasToReduced]);
    const normalizedPostAdjustmentCode = useMemo(() => normalizeProductLookupCode(postAdjustmentCode), [postAdjustmentCode]);
    const postAdjustmentProduct = useMemo(() => {
        if (normalizedPostAdjustmentCode) {
            const resolvedLookupCodes = Array.from(new Set([
                normalizedPostAdjustmentCode,
                barcodeAliasToReduced[normalizedPostAdjustmentCode]
            ].filter(Boolean)));
            const exactMatches = auditLookupIndex.filter(item =>
                item.codeKeys.some(key => resolvedLookupCodes.includes(key)) ||
                resolvedLookupCodes.includes(normalizeProductLookupCode(item.reducedCode))
            );
            if (exactMatches.length > 0) {
                return [...exactMatches].sort((a, b) => {
                    const score = (item: (typeof auditLookupIndex)[number]) => {
                        const barcodeKey = normalizeProductLookupCode(item.barcode);
                        const reducedKey = normalizeProductLookupCode(item.reducedCode);
                        return (
                            (barcodeKey && resolvedLookupCodes.includes(barcodeKey) ? 40 : 0) +
                            (item.codeKeys.some(key => key !== reducedKey && resolvedLookupCodes.includes(key)) ? 35 : 0) +
                            (reducedKey && resolvedLookupCodes.includes(reducedKey) ? 30 : 0) +
                            (item.audited ? 20 : 0) +
                            (item.completedAt ? 10 : 0)
                        );
                    };
                    return score(b) - score(a);
                })[0];
            }
        }
        const text = normalizeLookupText(postAdjustmentCode);
        if (!text) return null;
        return auditLookupIndex.find(item => item.searchText.includes(text)) || null;
    }, [auditLookupIndex, normalizedPostAdjustmentCode, postAdjustmentCode, barcodeAliasToReduced]);

    const termAuditedProductItems = useMemo(() => {
        const metricsByKey = new Map<string, any>();
        Object.entries((((data as any)?.termExcelMetricsByKey || {}) as Record<string, any>)).forEach(([draftKey, metrics]) => {
            if (metrics) metricsByKey.set(draftKey, metrics);
        });
        Object.entries(termDrafts || {}).forEach(([draftKey, draftValue]) => {
            if (draftValue?.excelMetricsRemovedAt && !draftValue?.excelMetrics) {
                metricsByKey.delete(draftKey);
                return;
            }
            if (draftValue?.excelMetrics) metricsByKey.set(draftKey, draftValue.excelMetrics);
        });

        const rows: Array<{
            codeKeys: string[];
            groupId?: string;
            groupName?: string;
            deptId?: string;
            deptName?: string;
            catId?: string;
            catName?: string;
            sysQty: number;
            countedQty: number;
            diffQty: number;
        }> = [];

        metricsByKey.forEach(metrics => {
            const normalized = normalizeTermMetricsToOfficial(metrics);
            (Array.isArray(normalized?.items) ? normalized.items : []).forEach((item: any) => {
                if (isTermMetadataRow(item)) return;
                const codeKeys = Array.from(new Set([
                    item?.code,
                    item?.reducedCode,
                    item?.barcode
                ].map(normalizeProductLookupCode).filter(Boolean)));
                if (codeKeys.length === 0) return;
                rows.push({
                    codeKeys,
                    groupId: normalizeScopeId(item?.groupId),
                    groupName: item?.groupName,
                    deptId: normalizeScopeId(item?.deptId),
                    deptName: item?.deptName,
                    catId: normalizeScopeId(item?.catId),
                    catName: item?.catName,
                    sysQty: Number(item?.sysQty || 0),
                    countedQty: Number(item?.countedQty || 0),
                    diffQty: Number(item?.diffQty || 0)
                });
            });
        });

        return rows;
    }, [data, termDrafts]);

    const postAdjustmentAuditedSnapshot = useMemo(() => {
        const product = postAdjustmentProduct;
        if (!product) return null;

        const productKeys = new Set(product.codeKeys);
        const normalizedGroupId = normalizeScopeId(product.groupId);
        const normalizedDeptIds = new Set([product.deptId, product.deptCode].map(normalizeScopeId).filter(Boolean));
        const normalizedCatIds = new Set([product.catId, product.catCode].map(normalizeScopeId).filter(Boolean));
        const normalizedDeptName = normalizeLookupText(product.deptName);
        const normalizedCatName = normalizeLookupText(product.catName);

        const codeMatches = termAuditedProductItems.filter(item => item.codeKeys.some(key => productKeys.has(key)));
        const scoreTermItem = (item: typeof termAuditedProductItems[number]) => {
            let score = 0;
            if (item.groupId && item.groupId === normalizedGroupId) score += 4;
            if (item.deptId && normalizedDeptIds.has(item.deptId)) score += 3;
            else if (item.deptName && normalizeLookupText(item.deptName) === normalizedDeptName) score += 2;
            if (item.catId && normalizedCatIds.has(item.catId)) score += 3;
            else if (item.catName && normalizeLookupText(item.catName) === normalizedCatName) score += 2;
            return score;
        };
        const bestScore = codeMatches.reduce((max, item) => Math.max(max, scoreTermItem(item)), -1);
        const selectedTermItems = bestScore > 0
            ? codeMatches.filter(item => scoreTermItem(item) === bestScore)
            : codeMatches;

        const baseAuditedQty = selectedTermItems.length > 0
            ? selectedTermItems.reduce((sum, item) => sum + Number(item.countedQty || 0), 0)
            : Number(product.quantity || 0);
        const baseSystemQty = selectedTermItems.length > 0
            ? selectedTermItems.reduce((sum, item) => sum + Number(item.sysQty || 0), 0)
            : Number(product.quantity || 0);

        const adjustmentQty = postAuditAdjustments.reduce((sum, adjustment) => {
            const adjustmentKeys = [
                adjustment.code,
                adjustment.reducedCode,
                adjustment.barcode
            ].map(normalizeProductLookupCode).filter(Boolean);
            const matchesCode = adjustmentKeys.some(key => productKeys.has(key));
            if (!matchesCode) return sum;
            return sum + Number(adjustment.quantity || 0);
        }, 0);

        return {
            baseAuditedQty,
            baseSystemQty,
            adjustmentQty,
            currentAuditedQty: baseAuditedQty + adjustmentQty,
            source: selectedTermItems.length > 0 ? 'term' : 'system'
        };
    }, [postAdjustmentProduct, termAuditedProductItems, postAuditAdjustments]);

    const postAdjustmentComputedDelta = useMemo(() => {
        if (!String(postAdjustmentQty || '').trim()) return null;
        const inputQuantity = parseSignedAuditNumber(postAdjustmentQty);
        if (!Number.isFinite(inputQuantity)) return null;
        if (postAdjustmentMode === 'replace') {
            if (!postAdjustmentAuditedSnapshot) return null;
            return inputQuantity - Number(postAdjustmentAuditedSnapshot.currentAuditedQty || 0);
        }
        return inputQuantity;
    }, [postAdjustmentMode, postAdjustmentQty, postAdjustmentAuditedSnapshot]);

    const postAdjustmentScopeInfo = useMemo(() => {
        const product = postAdjustmentProduct;
        if (!product) return null;
        return {
            group: formatPostAdjustmentHierarchyText('Grupo', product.groupId, product.groupName),
            dept: formatPostAdjustmentHierarchyText('Departamento', product.deptCode || product.deptId, product.deptName),
            cat: formatPostAdjustmentHierarchyText('Categoria', product.catCode || product.catId, product.catName)
        };
    }, [postAdjustmentProduct, formatPostAdjustmentHierarchyText]);

    const postAdjustmentAutoNote = useMemo(() => {
        const product = postAdjustmentProduct;
        if (!product || !product.audited) return '';
        const completedAtLabel = product.completedAt
            ? new Date(product.completedAt).toLocaleString('pt-BR', { hour12: false })
            : 'data nao registrada';
        return [
            `Já auditado em ${completedAtLabel}.`,
            `${postAdjustmentScopeInfo?.group || formatPostAdjustmentHierarchyText('Grupo', product.groupId, product.groupName)}.`,
            `${postAdjustmentScopeInfo?.dept || formatPostAdjustmentHierarchyText('Departamento', product.deptCode || product.deptId, product.deptName)}.`,
            `${postAdjustmentScopeInfo?.cat || formatPostAdjustmentHierarchyText('Categoria', product.catCode || product.catId, product.catName)}.`
        ].join(' ');
    }, [postAdjustmentProduct, postAdjustmentScopeInfo, formatPostAdjustmentHierarchyText]);

    useEffect(() => {
        if (!postAdjustmentAutoNote) {
            if (!lastAutoPostAdjustmentNoteRef.current) return;
            setPostAdjustmentNote(current => {
                const trimmed = current.trim();
                if (trimmed === lastAutoPostAdjustmentNoteRef.current || isAutoPostAdjustmentNote(trimmed)) return '';
                return current;
            });
            lastAutoPostAdjustmentNoteRef.current = '';
            return;
        }
        setPostAdjustmentNote(current => {
            const trimmed = current.trim();
            if (!trimmed) {
                lastAutoPostAdjustmentNoteRef.current = postAdjustmentAutoNote;
                return postAdjustmentAutoNote;
            }
            if (lastAutoPostAdjustmentNoteRef.current && current.startsWith(lastAutoPostAdjustmentNoteRef.current)) {
                const manualComplement = current.slice(lastAutoPostAdjustmentNoteRef.current.length).trimStart();
                lastAutoPostAdjustmentNoteRef.current = postAdjustmentAutoNote;
                return manualComplement ? `${postAdjustmentAutoNote} ${manualComplement}` : postAdjustmentAutoNote;
            }
            if (isAutoPostAdjustmentNote(trimmed)) {
                lastAutoPostAdjustmentNoteRef.current = postAdjustmentAutoNote;
                return postAdjustmentAutoNote;
            }
            return current;
        });
    }, [postAdjustmentAutoNote, isAutoPostAdjustmentNote]);

    const handleOpenAuditLookupResult = useCallback((result: (typeof auditLookupIndex)[number]) => {
        setView({
            level: 'products',
            selectedGroupId: result.groupId,
            selectedDeptId: result.deptId,
            selectedCatId: result.catId
        });
        setAuditLookup('');
        setAuditLookupOpen(false);
    }, []);
    const persistPostAuditAdjustments = useCallback(async (nextAdjustmentsRaw: PostAuditAdjustment[]) => {
        if (!data || isReadOnlyCompletedView) return false;
        const nextAdjustments = normalizePostAuditAdjustments(nextAdjustmentsRaw);
        const nextData = {
            ...data,
            postAuditAdjustments: nextAdjustments,
            termDrafts: composeTermDraftsForPersist(((data as any).termDrafts || {}) as Record<string, TermForm>, termDrafts)
        } as AuditData;
        const dataToPersist = {
            ...nextData,
            __replacePostAuditAdjustments: true
        } as any;
        setData(nextData);
        const progress = calculateProgress(nextData);
        const savedSession = await persistAuditSession({
            id: dbSessionId,
            branch: selectedFilial,
            audit_number: nextAuditNumber,
            status: 'open',
            data: dataToPersist,
            progress,
            user_email: userEmail,
            updated_at: lastAuditUpdateRef.current || undefined
        });
        if (!savedSession) {
            setData(data);
            return false;
        }
        setDbSessionId(savedSession.id);
        setNextAuditNumber(savedSession.audit_number);
        setData((savedSession.data as AuditData) || nextData);
        return true;
    }, [data, isReadOnlyCompletedView, composeTermDraftsForPersist, termDrafts, calculateProgress, persistAuditSession, dbSessionId, selectedFilial, nextAuditNumber, userEmail]);

    const addPostAuditAdjustment = useCallback(async () => {
        if (isReadOnlyCompletedView) return;
        setPostAdjustmentError(null);
        const product = postAdjustmentProduct;
        const inputQuantity = parseSignedAuditNumber(postAdjustmentQty);
        if (!product) {
            setPostAdjustmentError('Produto não encontrado pelo reduzido, código de barras ou descrição.');
            return;
        }
        if (!String(postAdjustmentQty || '').trim()) {
            setPostAdjustmentError(postAdjustmentMode === 'replace'
                ? 'Informe a quantidade correta auditada.'
                : 'Informe uma quantidade diferente de zero.');
            return;
        }
        if (!Number.isFinite(inputQuantity)) {
            setPostAdjustmentError('Informe uma quantidade válida.');
            return;
        }

        let quantity = inputQuantity;
        let previousAuditedQty: number | undefined;
        let replacementQuantity: number | undefined;
        if (postAdjustmentMode === 'replace') {
            if (!postAdjustmentAuditedSnapshot) {
                setPostAdjustmentError('Não foi possível identificar a quantidade auditada atual deste produto.');
                return;
            }
            previousAuditedQty = Number(postAdjustmentAuditedSnapshot.currentAuditedQty || 0);
            replacementQuantity = inputQuantity;
            quantity = replacementQuantity - previousAuditedQty;
            if (Math.abs(quantity) <= 0.0001) {
                setPostAdjustmentError('A quantidade correta informada já é igual à quantidade auditada atual.');
                return;
            }
        } else if (!quantity || !Number.isFinite(quantity)) {
            setPostAdjustmentError('Informe uma quantidade diferente de zero.');
            return;
        }
        const unitCost = roundAuditMoney(product.unitCost || 0);
        if (!unitCost || !Number.isFinite(unitCost)) {
            setPostAdjustmentError('Produto sem custo unitário válido.');
            return;
        }
        const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `adj_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const adjustment: PostAuditAdjustment = {
            id,
            code: product.reducedCode || product.barcode || postAdjustmentCode.trim(),
            barcode: product.barcode || undefined,
            reducedCode: product.reducedCode || undefined,
            description: product.productName,
            mode: postAdjustmentMode,
            previousAuditedQty,
            replacementQuantity,
            quantity,
            unitCost,
            totalCost: roundAuditMoney(quantity * unitCost),
            groupId: product.groupId,
            groupName: product.groupName,
            deptId: product.deptCode || product.deptId,
            deptName: product.deptName,
            catId: product.catCode || product.catId,
            catName: product.catName,
            note: postAdjustmentNote.trim() || undefined,
            createdAt: new Date().toISOString(),
            createdBy: userEmail
        };
        setIsSavingPostAdjustment(true);
        try {
            const saved = await persistPostAuditAdjustments([...postAuditAdjustments, adjustment]);
            if (saved) {
                setPostAdjustmentCode('');
                setPostAdjustmentQty('');
                setPostAdjustmentNote('');
                setPostAdjustmentMode('replace');
                lastAutoPostAdjustmentNoteRef.current = '';
                setPostAdjustmentError(null);
            } else {
                setPostAdjustmentError('Não foi possível salvar o ajuste.');
            }
        } finally {
            setIsSavingPostAdjustment(false);
        }
    }, [isReadOnlyCompletedView, postAdjustmentProduct, postAdjustmentQty, postAdjustmentCode, postAdjustmentNote, postAdjustmentMode, postAdjustmentAuditedSnapshot, userEmail, persistPostAuditAdjustments, postAuditAdjustments]);

    const removePostAuditAdjustment = useCallback(async (id: string) => {
        if (isReadOnlyCompletedView) return;
        setIsSavingPostAdjustment(true);
        setPostAdjustmentError(null);
        try {
            const saved = await persistPostAuditAdjustments(postAuditAdjustments.filter(item => item.id !== id));
            if (!saved) setPostAdjustmentError('Não foi possível remover o ajuste.');
        } finally {
            setIsSavingPostAdjustment(false);
        }
    }, [isReadOnlyCompletedView, persistPostAuditAdjustments, postAuditAdjustments]);
    const termScopeInfo = useMemo(() => (termModal ? buildTermScopeInfo(termModal) : null), [termModal, data]);
    const canEditTerm = canUseAuditMasterTools && !isReadOnlyCompletedView;
    const canFillTermSignatures = !isReadOnlyCompletedView;
    const partialInfoList = useMemo(() => {
        if (!data?.partialStarts || data.partialStarts.length === 0) return [];
        const buildDeptLabel = (d: Department) => `${d.numericId || d.id} - ${d.name}`;
        const buildCatLabel = (c: Category) => `${c.numericId || c.id} - ${c.name}`;

        const bucket = new Map<string, {
            key: string;
            groupLabel: string | null;
            deptLabel: string | null;
            catItems: string[];
            catIds: Set<string>;
            skus: number;
            units: number;
            startedAt?: string;
        }>();

        const addCat = (group: Group, dept: Department, cat: Category, startedAt: string) => {
            const key = `${normalizeScopeId(group.id)}|${normalizeScopeId(dept.id)}`;
            const entry = bucket.get(key) || {
                key,
                groupLabel: `${group.id} - ${group.name}`,
                deptLabel: buildDeptLabel(dept),
                catItems: [],
                catIds: new Set<string>(),
                skus: 0,
                units: 0,
                startedAt
            };
            const catKey = normalizeScopeId(cat.id);
            if (!entry.catIds.has(catKey)) {
                entry.catIds.add(catKey);
                entry.catItems.push(buildCatLabel(cat));
                entry.skus += cat.itemsCount;
                entry.units += cat.totalQuantity;
            }
            if (!entry.startedAt || new Date(startedAt).getTime() < new Date(entry.startedAt).getTime()) {
                entry.startedAt = startedAt;
            }
            bucket.set(key, entry);
        };

        data.partialStarts.forEach(scope => {
            const startedAt = scope.startedAt || new Date().toISOString();
            const expanded = getScopeCategories(scope.groupId, scope.deptId, scope.catId);
            expanded.forEach(({ group, dept, cat }) => addCat(group, dept, cat, startedAt));
        });

        return Array.from(bucket.values()).map(entry => ({
            key: entry.key,
            groupLabel: entry.groupLabel,
            deptLabel: entry.deptLabel,
            catItems: entry.catItems,
            skus: entry.skus,
            units: entry.units,
            startedAtLabel: entry.startedAt
                ? new Date(entry.startedAt).toLocaleString('pt-BR', { hour12: false })
                : ''
        }));
    }, [data]);

    const partialTotals = useMemo(() => {
        if (!data?.partialStarts || data.partialStarts.length === 0) return { skus: 0, units: 0 };
        const seenCats = new Set<string>();
        let skus = 0;
        let units = 0;
        data.partialStarts.forEach(scope => {
            const expanded = getScopeCategories(scope.groupId, scope.deptId, scope.catId);
            expanded.forEach(({ cat }) => {
                const catKey = normalizeScopeId(cat.id);
                if (seenCats.has(catKey)) return;
                seenCats.add(catKey);
                skus += cat.itemsCount;
                units += cat.totalQuantity;
            });
        });
        return { skus, units };
    }, [data]);

    const completedInfoList = useMemo(() => {
        if (!data?.partialCompleted || data.partialCompleted.length === 0) return [];
        const byKey = new Map<string, {
            key: string;
            label: string;
            scope: { groupId?: string; deptId?: string; catId?: string };
            completedAtLabel: string;
        }>();

        const findGroup = (groupId?: string | number) =>
            data.groups.find(g => normalizeScopeId(g.id) === normalizeScopeId(groupId));

        const findDept = (group?: Group, deptId?: string | number) =>
            group?.departments.find(d => normalizeScopeId(d.id) === normalizeScopeId(deptId));

        data.partialCompleted.forEach(scope => {
            const key = partialCompletedKey(scope);
            if (byKey.has(key)) return;
            const group = findGroup(scope.groupId);
            const dept = scope.deptId ? findDept(group, scope.deptId) : undefined;
            const cat = scope.catId
                ? (dept?.categories.find(c => normalizeScopeId(c.id) === normalizeScopeId(scope.catId)) ||
                    group?.departments.flatMap(d => d.categories).find(c => normalizeScopeId(c.id) === normalizeScopeId(scope.catId)))
                : undefined;

            let label = 'Escopo personalizado';
            if (cat) {
                label = `Cat ${cat.numericId || cat.id} - ${cat.name}`;
            } else if (dept) {
                label = `Depto ${dept.numericId || dept.id} - ${dept.name}`;
            } else if (group) {
                label = `Grupo ${group.id} - ${group.name}`;
            }

            byKey.set(key, {
                key,
                label,
                scope: {
                    groupId: normalizeScopeId(scope.groupId),
                    deptId: normalizeScopeId(scope.deptId),
                    catId: normalizeScopeId(scope.catId)
                },
                completedAtLabel: scope.completedAt
                    ? new Date(scope.completedAt).toLocaleString('pt-BR', { hour12: false })
                    : ''
            });
        });

        return Array.from(byKey.values());
    }, [data]);

    const openPartialTerm = (scope: { groupId?: string; deptId?: string; catId?: string }) => {
        if (!scope.groupId) return;
        const type: TermScopeType = scope.catId ? 'category' : scope.deptId ? 'department' : 'group';
        openTermModal({ type, groupId: scope.groupId, deptId: scope.deptId, catId: scope.catId });
    };

    const openUnifiedPartialTerm = (batchId: string) => {
        if (!data?.partialCompleted || data.partialCompleted.length === 0) return;
        const map = new Map<string, { groupId?: string; deptId?: string; catId?: string }>();
        data.partialCompleted.forEach(p => {
            if (getEntryBatchId(p) !== batchId) return;
            const scope = { groupId: p.groupId, deptId: p.deptId, catId: p.catId };
            map.set(partialScopeKey(scope), scope);
        });
        const customScopes = Array.from(map.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([, scope]) => scope);
        if (customScopes.length === 0) return;
        openTermModal({
            type: 'custom',
            customScopes,
            customLabel: 'Contagens Personalizadas (Concluídas)',
            batchId
        });
    };

    const openGlobalUnifiedTerm = () => {
        if (!data) return;
        const map = new Map<string, { groupId?: string; deptId?: string; catId?: string }>();

        (data.partialCompleted || []).forEach(p => {
            const scope = {
                groupId: normalizeScopeId(p.groupId),
                deptId: normalizeScopeId(p.deptId),
                catId: normalizeScopeId(p.catId)
            };
            if (!scope.groupId) return;
            map.set(partialScopeKey(scope), scope);
        });

        if (map.size === 0) {
            data.groups.forEach(group => {
                group.departments.forEach(dept => {
                    dept.categories.forEach(cat => {
                        const scope = {
                            groupId: normalizeScopeId(group.id),
                            deptId: normalizeScopeId(dept.id),
                            catId: normalizeScopeId(cat.id)
                        };
                        map.set(partialScopeKey(scope), scope);
                    });
                });
            });
        }

        const customScopes = Array.from(map.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([, scope]) => scope);
        if (customScopes.length === 0) return;

        openTermModal({
            type: 'custom',
            customScopes,
            customLabel: 'Termo Único Geral - 100% da Auditoria',
            batchId: GLOBAL_UNIFIED_TERM_BATCH_ID
        });
    };

    const resetPartialHistory = useCallback(async () => {
        if (!data) return;
        alert("Proteção ativa: não é permitido zerar contagens finalizadas nem termos.");
    }, [data]);

    const batchSummaryList = useMemo(() => {
        if (!data?.partialCompleted || data.partialCompleted.length === 0) return [];
        const buckets = new Map<string, { batchId: string; count: number; lastAt: string; groupIds: Set<string> }>();
        data.partialCompleted.forEach(p => {
            const batchId = getEntryBatchId(p);
            const entry = buckets.get(batchId) || { batchId, count: 0, lastAt: p.completedAt || p.startedAt || new Date(0).toISOString(), groupIds: new Set<string>() };
            entry.count += 1;
            const normalizedGroupId = normalizeScopeId(p.groupId);
            if (normalizedGroupId) entry.groupIds.add(normalizedGroupId);
            const currentTs = new Date(entry.lastAt).getTime();
            const incomingTs = new Date(p.completedAt || p.startedAt || 0).getTime();
            if (incomingTs > currentTs) entry.lastAt = p.completedAt || p.startedAt || entry.lastAt;
            buckets.set(batchId, entry);
        });
        const resolveGroupLabel = (groupIds: Set<string>) => {
            const labels = Array.from(groupIds)
                .map(groupId => data.groups.find(g => normalizeScopeId(g.id) === normalizeScopeId(groupId)))
                .filter((group): group is Group => !!group)
                .map(group => `Grupo ${group.id} - ${group.name}`);
            if (labels.length === 0) return 'Grupo N/D';
            return labels.join(' | ');
        };
        return Array.from(buckets.values())
            .map(entry => ({
                ...entry,
                groupLabel: resolveGroupLabel(entry.groupIds)
            }))
            .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
    }, [data?.partialCompleted, data?.groups]);

    const batchSummaryByGroup = useMemo(() => {
        if (!batchSummaryList.length) return [] as Array<{
            groupLabel: string;
            lastAt: string;
            items: typeof batchSummaryList;
        }>;
        const map = new Map<string, { groupLabel: string; lastAt: string; items: typeof batchSummaryList }>();
        batchSummaryList.forEach(item => {
            const key = item.groupLabel || 'Grupo N/D';
            const current = map.get(key) || { groupLabel: key, lastAt: item.lastAt, items: [] as typeof batchSummaryList };
            current.items.push(item);
            if (new Date(item.lastAt).getTime() > new Date(current.lastAt).getTime()) {
                current.lastAt = item.lastAt;
            }
            map.set(key, current);
        });
        return Array.from(map.values())
            .map(group => ({
                ...group,
                items: [...group.items].sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
            }))
            .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
    }, [batchSummaryList]);

    if (!data || isUpdatingStock) {
        const structureLocked = !!(data && data.groups && data.groups.length > 0);
        const updateOnlyMode = isUpdatingStock || structureLocked;
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
                <div className="max-w-2xl w-full bg-white rounded-[2rem] shadow-2xl overflow-hidden">
                    <div className="bg-indigo-600 p-10 text-center text-white">
                        <h1 className="text-4xl font-black italic tracking-tighter">AuditFlow</h1>
                        <p className="text-indigo-200 text-[10px] uppercase font-bold tracking-widest mt-1 italic">Sistema de Auditoria Master</p>
                    </div>
                    <div className="p-8 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Empresa</label>
                                <select className="w-full bg-slate-50 border-2 rounded-xl px-4 py-3 font-bold border-slate-100" value={selectedEmpresa} onChange={e => setSelectedEmpresa(e.target.value)}>
                                    {allowedCompanies.length === 0 && <option>Drogaria Cidade</option>}
                                    {allowedCompanies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Selecione a Filial</label>
                                <select className="w-full bg-slate-50 border-2 rounded-xl px-4 py-3 font-bold border-slate-100" value={selectedFilial} onChange={e => setSelectedFilial(e.target.value)}>
                                    <option value="">Selecione...</option>
                                    {allowedAuditBranches.map(f => <option key={f} value={f}>Filial {f}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Número do Inventário</label>
                                    <div className="w-full bg-slate-100 border-2 rounded-xl px-4 py-3 font-bold border-slate-200 text-slate-500 cursor-not-allowed">
                                        {inventoryNumber || 'Selecione a Filial...'}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {selectedFilial && canUseAuditMasterTools && (
                            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 px-4 py-4 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Inventários da Filial {selectedFilial}</p>
                                        <p className="text-xs font-semibold text-slate-600">
                                            {isReadOnlyCompletedView && consultingAuditNumber !== null ? (
                                                <>Visualizando: <span className="font-black text-indigo-700">Nº {consultingAuditNumber}</span></>
                                            ) : (
                                                <>Próximo automático: <span className="font-black text-indigo-700">Nº {nextAuditNumber}</span></>
                                            )}
                                        </p>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                        {isLoadingBranchAudits ? 'carregando...' : `${completedAudits.length} concluído(s)`}
                                    </span>
                                </div>

                                <div className={`grid grid-cols-1 ${latestOpenAudit ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-2`}>
                                    <button
                                        type="button"
                                        onClick={handleStartAudit}
                                        disabled={isProcessing || !canUseAuditMasterTools || !!latestOpenAudit || updateOnlyMode}
                                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isProcessing || !canUseAuditMasterTools || !!latestOpenAudit || updateOnlyMode
                                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                            : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                                        title={
                                            !canUseAuditMasterTools
                                                ? 'Somente Master ou Administrativo cria novo inventário'
                                                : updateOnlyMode
                                                    ? 'Modo atualização de saldos ativo: use somente Atualizar Somente Saldos'
                                                : latestOpenAudit
                                                    ? `Existe inventário aberto Nº ${latestOpenAudit.audit_number}`
                                                    : `Criar novo inventário automático Nº ${nextAuditNumber}`
                                        }
                                    >
                                        Novo inventário
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (updateOnlyMode) return;
                                            setShowCompletedAuditsModal(true);
                                        }}
                                        disabled={completedAudits.length === 0 || updateOnlyMode}
                                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${completedAudits.length === 0 || updateOnlyMode
                                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                            : 'bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50'}`}
                                        title={updateOnlyMode ? 'Modo atualização de saldos ativo: acesso concluído bloqueado' : (completedAudits.length === 0 ? 'Sem inventários concluídos' : 'Acessar inventários concluídos desta filial')}
                                    >
                                        Acessar concluído
                                    </button>

                                    {latestOpenAudit && (
                                        <button
                                            type="button"
                                            onClick={updateOnlyMode ? undefined : resumeLatestOpenAudit}
                                            disabled={isProcessing || updateOnlyMode}
                                            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isProcessing || updateOnlyMode
                                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                : 'bg-amber-500 text-white hover:bg-amber-400'}`}
                                            title={updateOnlyMode ? 'Modo atualização de saldos ativo: retomar aberto bloqueado' : `Retomar inventário aberto Nº ${latestOpenAudit.audit_number}`}
                                        >
                                            Retomar aberto
                                        </button>
                                    )}
                                </div>

                                {latestOpenAudit && (
                                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                                            Existe inventário em aberto: Nº {latestOpenAudit.audit_number}
                                        </p>
                                        <p className="text-[11px] font-semibold text-amber-700 mt-1">
                                            Atualizado em {latestOpenAudit.updated_at ? new Date(latestOpenAudit.updated_at).toLocaleString('pt-BR') : 'data indisponível'}.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {GROUP_UPLOAD_IDS.map((groupId) => {
                                const globalFile = globalGroupFiles[groupId];
                                const globalMeta = globalGroupMeta[groupId];
                                const isLoaded = !!(globalFile || globalMeta);
                                return (
                                    <div
                                        key={`group-upload-${groupId}`}
                                        className={`block border-2 border-dashed rounded-xl p-4 text-center transition-all ${isLoaded ? 'border-emerald-500 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
                                    >
                                        <FileSpreadsheet className={`mx-auto w-6 h-6 mb-1 ${isLoaded ? 'text-emerald-500' : 'text-slate-300'}`} />
                                        <p className="text-[8px] font-black uppercase truncate">{globalMeta?.file_name || globalFile?.name || `${groupId} Cadastro`}</p>
                                        <p className="text-[8px] font-bold text-slate-500 mt-1">
                                            {isLoaded
                                                ? 'Já carregado em Cadastro Base Global'
                                                : 'Carregue no Cadastro Base'}
                                        </p>
                                        {globalMeta && (
                                            <p className="text-[8px] font-bold text-emerald-700 mt-1">
                                                {formatGlobalTimestamp(globalMeta.uploaded_at || globalMeta.updated_at)}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}

                            <div className={`block border-2 border-dashed rounded-xl p-4 text-center transition-all ${globalStockMeta || effectiveStockFile ? 'border-emerald-500 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                                <FileSpreadsheet className={`mx-auto w-6 h-6 mb-1 ${globalStockMeta || effectiveStockFile ? 'text-emerald-500' : 'text-slate-300'}`} />
                                <p className="text-[8px] font-black uppercase truncate">{globalStockMeta?.file_name || effectiveStockFile?.name || 'Estoque Base'}</p>
                                <p className="text-[8px] font-bold text-slate-500 mt-1">
                                    {globalStockMeta || globalStockFile
                                        ? 'Já carregado em Cadastro Base Global'
                                        : 'Carregue no Cadastro Base'}
                                </p>
                                {globalStockMeta && (
                                    <p className="text-[8px] font-bold text-emerald-700 mt-1">
                                        {formatGlobalTimestamp(globalStockMeta.uploaded_at || globalStockMeta.updated_at)}
                                    </p>
                                )}
                            </div>

                            <div className={`block border-2 border-dashed rounded-xl p-4 text-center transition-all ${globalDeptIdsMeta || effectiveDeptIdsFile ? 'border-emerald-500 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                                <FileSpreadsheet className={`mx-auto w-6 h-6 mb-1 ${globalDeptIdsMeta || effectiveDeptIdsFile ? 'text-emerald-500' : 'text-slate-300'}`} />
                                <p className="text-[8px] font-black uppercase truncate">{globalDeptIdsMeta?.file_name || effectiveDeptIdsFile?.name || 'Departamentos'}</p>
                                <p className="text-[8px] font-bold text-slate-500 mt-1">
                                    {globalDeptIdsMeta || globalDeptIdsFile
                                        ? 'Já carregado em Cadastro Base Global'
                                        : 'Carregue no Cadastro Base'}
                                </p>
                                {globalDeptIdsMeta && (
                                    <p className="text-[8px] font-bold text-emerald-700 mt-1">
                                        {formatGlobalTimestamp(globalDeptIdsMeta.uploaded_at || globalDeptIdsMeta.updated_at)}
                                    </p>
                                )}
                            </div>

                            <div className={`block border-2 border-dashed rounded-xl p-4 text-center transition-all ${globalCatIdsMeta || effectiveCatIdsFile ? 'border-emerald-500 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                                <FileSpreadsheet className={`mx-auto w-6 h-6 mb-1 ${globalCatIdsMeta || effectiveCatIdsFile ? 'text-emerald-500' : 'text-slate-300'}`} />
                                <p className="text-[8px] font-black uppercase truncate">{globalCatIdsMeta?.file_name || effectiveCatIdsFile?.name || 'Categorias'}</p>
                                <p className="text-[8px] font-bold text-slate-500 mt-1">
                                    {globalCatIdsMeta || globalCatIdsFile
                                        ? 'Já carregado em Cadastro Base Global'
                                        : 'Carregue no Cadastro Base'}
                                </p>
                                {globalCatIdsMeta && (
                                    <p className="text-[8px] font-bold text-emerald-700 mt-1">
                                        {formatGlobalTimestamp(globalCatIdsMeta.uploaded_at || globalCatIdsMeta.updated_at)}
                                    </p>
                                )}
                            </div>
                        </div>
                        {structureLocked && (
                            <p className="text-[10px] font-bold text-amber-600">
                                Estrutura já iniciada nesta auditoria. Os saldos são atualizados pelo Estoque do Cadastro Base.
                            </p>
                        )}
                        <p className="text-[10px] font-bold text-slate-500">
                            Cadastros por grupo carregados somente pelo Cadastro Base (2000, 3000, 4000, 8000, 10000, 66 e 67). Carregados: <span className="text-slate-700">{effectiveGroupFiles.length}/{GROUP_UPLOAD_IDS.length}</span>.
                            {isLoadingGlobalBases ? ' Verificando bases globais...' : ''}
                        </p>
                        <p className="text-[10px] font-bold text-slate-500">
                            Classificação: usa o <span className="text-slate-700">Estoque do Cadastro Base</span>, cruza com <span className="text-slate-700">Cadastro K</span> (fallback por código reduzido), e lê <span className="text-slate-700">Departamento S</span> + <span className="text-slate-700">Categoria W</span>.
                        </p>
                        <div className="space-y-3">
                            <button onClick={handleStartAudit} disabled={isProcessing || !canUseAuditMasterTools} className={`w-full py-4 rounded-xl text-white font-black uppercase tracking-widest transition-all shadow-xl active:scale-95 ${isProcessing || !canUseAuditMasterTools ? 'bg-slate-300 cursor-not-allowed' : 'bg-slate-900 hover:bg-indigo-600'}`}>
                                {isProcessing
                                    ? 'Sincronizando Banco de Dados...'
                                    : canUseAuditMasterTools
                                        ? (isUpdatingStock
                                            ? 'Atualizar Somente Saldos'
                                            : 'Iniciar Inventário')
                                        : 'Apenas Master ou Administrativo pode Iniciar'}
                            </button>
                            <button onClick={handleLoadFromTrier} disabled={isTrierLoading || !canUseAuditMasterTools || updateOnlyMode} className={`w-full py-4 rounded-xl text-white font-black uppercase tracking-widest transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 ${isTrierLoading || !canUseAuditMasterTools || updateOnlyMode ? 'bg-slate-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
                                <Activity className="w-5 h-5" />
                                {isTrierLoading ? 'Carregando do Trier...' : updateOnlyMode ? 'Trier bloqueado no modo saldos' : canUseAuditMasterTools ? 'Carregar direto do Trier (tempo real)' : 'Apenas Master ou Administrativo pode Carregar'}
                            </button>
                            {trierError && (
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">{trierError}</p>
                                    <button onClick={handleLoadFromTrier} disabled={updateOnlyMode} className={`text-[9px] font-black uppercase tracking-widest ${updateOnlyMode ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:text-emerald-600'}`}>
                                        Tentar novamente
                                    </button>
                                </div>
                            )}
                        </div>
                        {showCompletedAuditsModal && (
                            <div className="fixed inset-0 z-[1500] bg-black/40 flex items-center justify-center p-4">
                                <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Filial {selectedFilial}</p>
                                            <h3 className="text-lg font-black text-slate-800">Inventários Concluídos</h3>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowCompletedAuditsModal(false)}
                                            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100"
                                        >
                                            <X className="w-4 h-4 mx-auto" />
                                        </button>
                                    </div>
                                    <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3">
                                        {localPendingAudit && (
                                            <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md transition-all">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                                                        <RefreshCw className={`w-5 h-5 text-amber-600 ${isSyncing ? 'animate-spin' : ''}`} />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-amber-900 uppercase">
                                                            Sincronização Pendente (Nº {localPendingAudit.inventoryNumber})
                                                        </p>
                                                        <p className="text-[11px] text-amber-700 font-bold">
                                                            Salvo localmente em {localPendingAudit.lastLocalUpdate ? new Date(localPendingAudit.lastLocalUpdate).toLocaleString('pt-BR') : 'Data indisponível'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleManualSync()}
                                                    disabled={isSyncing || !isOnline}
                                                    className={`w-full sm:w-auto px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${isSyncing || !isOnline
                                                        ? 'bg-amber-200 text-amber-400 cursor-not-allowed'
                                                        : 'bg-amber-500 text-white hover:bg-amber-600 shadow-lg active:scale-95'}`}
                                                >
                                                    {isSyncing ? 'Enviando...' : 'Enviar Agora'}
                                                </button>
                                            </div>
                                        )}

                                        {completedAudits.length === 0 && !localPendingAudit ? (
                                            <p className="text-sm font-semibold text-slate-400 text-center py-8">
                                                Nenhum inventário concluído encontrado.
                                            </p>
                                        ) : (
                                            completedAudits.map(item => (
                                                <div key={`${item.branch}_${item.audit_number}_${item.id || ''}`} className="rounded-xl border border-slate-200 px-3 py-3 flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-black text-slate-800">Inventário Nº {item.audit_number}</p>
                                                        <p className="text-[11px] text-slate-500 font-semibold">
                                                            Concluído em {item.updated_at ? new Date(item.updated_at).toLocaleString('pt-BR') : 'data indisponível'}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => void accessCompletedAuditByNumber(item.audit_number)}
                                                            disabled={isProcessing}
                                                            className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${isProcessing
                                                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                                : 'bg-slate-800 text-white hover:bg-slate-700'}`}
                                                            title={`Acessar inventário Nº ${item.audit_number} em modo consulta`}
                                                        >
                                                            Acessar
                                                        </button>
                                                        {canUseAuditMasterTools && (
                                                            <button
                                                                type="button"
                                                                onClick={() => void reopenAuditByNumber(item.audit_number)}
                                                                disabled={isProcessing}
                                                                className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${isProcessing
                                                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                                    : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                                                                title={`Reabrir inventário Nº ${item.audit_number}`}
                                                            >
                                                                Reabrir
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f1f5f9] pb-32 font-sans rounded-3xl overflow-x-hidden overflow-y-visible shadow-inner">
            <header className="bg-slate-900 text-white sticky top-0 z-[1002] px-4 md:px-8 py-3 shadow-xl border-b border-white/5">
                <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
                <div className="flex flex-wrap items-center gap-3 md:gap-6 min-w-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg rotate-2">
                            <ClipboardList className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-lg md:text-xl font-black italic tracking-tighter leading-none whitespace-nowrap">AuditFlow</h1>
                    </div>
                    <div className="hidden md:block h-8 w-px bg-white/10 mx-2"></div>
                    <div className="w-full md:w-auto flex items-center justify-between bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-900 px-4 md:px-8 py-2.5 rounded-2xl border-2 border-indigo-400/50 shadow-[0_8px_25px_rgba(79,70,229,0.5)] transition-transform duration-300">
                        <div className="flex flex-col min-w-0">
                            <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.22em] md:tracking-[0.3em] text-indigo-300 leading-none mb-1 whitespace-nowrap">AUDITANDO AGORA</span>
                            <span className="text-lg md:text-2xl font-black italic tracking-tight md:tracking-tighter leading-tight text-white drop-shadow-md whitespace-nowrap">
                                FILIAL <span className="hidden sm:inline">UNIDADE </span>F{data.filial}
                            </span>
                        </div>
                        <div className="ml-3 md:ml-6 flex flex-col items-center shrink-0 min-w-[32px]">
                            <div className={`w-3 h-3 rounded-full transition-all duration-500 ${
                                !isOnline ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' :
                                isSyncing ? 'bg-blue-400 animate-spin shadow-[0_0_10px_#60a5fa]' : 
                                data?.pendingSync ? 'bg-amber-400 animate-pulse shadow-[0_0_10px_#fbbf24]' : 
                                'bg-emerald-400 animate-pulse shadow-[0_0_10px_#34d399]'
                            }`}></div>
                            <span className={`text-[8px] font-black mt-1 uppercase tracking-tighter ${
                                !isOnline ? 'text-red-400' :
                                isSyncing ? 'text-blue-400' : 
                                data?.pendingSync ? 'text-amber-400' : 
                                'text-emerald-400'
                            }`}>
                                {!isOnline ? 'OFF' : isSyncing ? 'SYNC' : data?.pendingSync ? 'PEND' : 'LIVE'}
                            </span>
                        </div>
                    </div>
                    <div className="hidden lg:flex flex-col items-start px-4 py-2 rounded-xl bg-white/5 border border-white/10 min-w-[130px]">
                        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-300 leading-none">Inventário</span>
                        <span className="text-xl font-black italic tracking-tight text-white leading-tight">Nº {accessedAuditNumber}</span>
                    </div>
                    <div
                        className={`w-full md:w-auto md:max-w-[360px] xl:max-w-[430px] flex items-center gap-3 px-3 md:px-4 py-2 rounded-xl border min-w-0 ${
                            stockHeaderInfo.hasPendingBase
                                ? 'bg-amber-500/15 border-amber-400/50 text-amber-100'
                                : stockHeaderInfo.hasApplied
                                    ? 'bg-emerald-500/10 border-emerald-400/40 text-emerald-100'
                                    : 'bg-white/5 border-white/10 text-slate-200'
                        }`}
                        title={`Estoque aplicado: ${stockHeaderInfo.appliedLabel} | Cadastro Base: ${stockHeaderInfo.baseLabel}`}
                    >
                        <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                stockHeaderInfo.hasPendingBase
                                    ? 'bg-amber-400/20 text-amber-200'
                                    : stockHeaderInfo.hasApplied
                                        ? 'bg-emerald-400/20 text-emerald-200'
                                        : 'bg-white/10 text-slate-300'
                            }`}
                        >
                            {stockHeaderInfo.hasPendingBase ? (
                                <RefreshCw className="w-4 h-4" />
                            ) : (
                                <CheckCircle2 className="w-4 h-4" />
                            )}
                        </div>
                        <div className="min-w-0 flex flex-col leading-none">
                            <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.18em] truncate">
                                {stockHeaderInfo.statusLabel}
                            </span>
                            <span className="text-[10px] md:text-[11px] font-black mt-1 truncate">
                                Aplicado: {stockHeaderInfo.appliedLabel}
                            </span>
                            <span className="text-[9px] font-bold mt-1 opacity-80 truncate">
                                Base: {stockHeaderInfo.baseLabel} - {stockHeaderInfo.fileName}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2 md:gap-3">
                    <div className="hidden xl:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                        <button
                            onClick={handleFinishAudit}
                            disabled={isProcessing || !canManageAuditLifecycle || isReadOnlyCompletedView || !dbSessionId}
                            className={`px-3 py-2 rounded-lg font-black text-[9px] uppercase tracking-widest flex items-center gap-1.5 transition-all ${isProcessing || !canManageAuditLifecycle || isReadOnlyCompletedView || !dbSessionId
                                ? 'bg-slate-500/50 text-slate-300 cursor-not-allowed'
                                : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg'}`}
                            title={
                                !canManageAuditLifecycle
                                    ? 'Somente Master/Admin'
                                    : isReadOnlyCompletedView
                                        ? 'Inventário concluído em modo consulta. Reabra para editar.'
                                        : !dbSessionId
                                            ? 'Nenhum inventário aberto ativo'
                                        : 'Finaliza e salva no Supabase para liberar o próximo número'
                            }
                        >
                            <CheckSquare className="w-3.5 h-3.5" />
                            Salvar e Encerrar
                        </button>
                        <button
                            onClick={handleReopenAudit}
                            disabled={isProcessing || !canUseAuditMasterTools}
                            className={`px-3 py-2 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${isProcessing || !canUseAuditMasterTools
                                ? 'bg-slate-500/50 text-slate-300 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg'}`}
                            title={!canUseAuditMasterTools ? 'Somente Master ou Administrativo' : 'Reabre inventário salvo (concluído)'}
                        >
                            Reabrir
                        </button>
                        <button
                            onClick={handleDeleteCurrentAudit}
                            disabled={isProcessing || !canUseAuditMasterTools}
                            className={`px-3 py-2 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${isProcessing || !canUseAuditMasterTools
                                ? 'bg-slate-500/50 text-slate-300 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-500 text-white shadow-lg'}`}
                            title={!canUseAuditMasterTools ? 'Somente Master ou Administrativo pode excluir permanentemente' : 'Exclusão permanente'}
                        >
                            Excluir
                        </button>
                    </div>
                    <button
                        onClick={async () => {
                            setIsRefreshing(true);
                            await loadAuditNum();
                            setIsRefreshing(false);
                        }}
                        disabled={isRefreshing}
                        className="relative px-3 md:px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg active:scale-95 whitespace-nowrap"
                        style={{
                            background: isRefreshing
                                ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                : 'linear-gradient(135deg, #f97316, #f59e0b)',
                            color: '#fff',
                            boxShadow: isRefreshing ? '0 0 12px #f59e0b88' : '0 0 18px #f9731688, 0 2px 8px #0004',
                            border: '1px solid rgba(251,191,36,0.4)'
                        }}
                        title="Buscar dados atualizados do servidor"
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">{isRefreshing ? 'ATUALIZANDO...' : 'ATUALIZAR'}</span>
                        <span className="sm:hidden">{isRefreshing ? 'SYNC...' : 'SYNC'}</span>
                    </button>
                    <button onClick={handleExportPDF} className="bg-white/10 hover:bg-white/20 px-3 md:px-5 py-2 rounded-xl text-white font-black text-[9px] uppercase tracking-widest flex items-center gap-2 transition-all border border-white/10 whitespace-nowrap">
                        <FileBox className="w-4 h-4" /> <span className="hidden sm:inline">PDF ANALÍTICO</span><span className="sm:hidden">PDF</span>
                    </button>
                    <button onClick={handleExportDetailedExcel} className="bg-white/10 hover:bg-white/20 px-3 md:px-5 py-2 rounded-xl text-white font-black text-[9px] uppercase tracking-widest flex items-center gap-2 transition-all border border-white/10 whitespace-nowrap" title="Exportar planilha Excel completa com perdas e sobras">
                        <FileSpreadsheet className="w-4 h-4" /> <span className="hidden sm:inline">EXCEL DETALHADO</span><span className="sm:hidden">EXCEL</span>
                    </button>
                    <button onClick={handleSafeExit} className="w-10 h-10 rounded-xl bg-red-600/20 text-red-500 border border-red-500/30 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-lg active:scale-90" title="Sair e Salvar">
                        <Power className="w-5 h-5" />
                    </button>
                </div>
                </div>
            </header>

            <div className="sticky top-[72px] md:top-[76px] z-[1001] bg-white/90 backdrop-blur-xl border-b border-slate-200 shadow-lg px-4 md:px-8 py-4 md:py-5">
                {(partialInfoList.length > 0 || (data?.partialCompleted && data.partialCompleted.length > 0)) && (
                    <div className="max-w-[1400px] mx-auto mb-4">
                        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-2xl shadow-sm">
                            <div className="flex flex-wrap items-center gap-3 justify-between">
                                <Activity className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Contagem Parcial</span>
                                <div className="ml-auto flex items-center gap-2">
                                    <button
                                        onClick={clearActivePartialsShortcut}
                                        disabled={partialInfoList.length === 0}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${partialInfoList.length === 0
                                            ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                                            : 'bg-white text-red-600 border-red-200 hover:bg-red-600 hover:text-white'}`}
                                    >
                                        Desfazer Ativas
                                    </button>
                                    <button
                                        onClick={finalizeActivePartials}
                                        disabled={partialInfoList.length === 0 || !canUseAuditMasterTools}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${partialInfoList.length === 0 || !canUseAuditMasterTools
                                            ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                                            : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-600 hover:text-white'}`}
                                        title={!canUseAuditMasterTools ? 'Apenas Master ou Administrativo pode concluir' : undefined}
                                    >
                                        Concluir Ativas
                                    </button>
                                </div>
                            </div>
                            {partialInfoList.length > 0 ? (
                                <div className="mt-3 space-y-3">
                                    {partialInfoList.map((info) => (
                                        <div key={info.key} className="border border-blue-100 bg-white/60 rounded-xl p-3">
                                            <div className="flex flex-wrap items-center gap-3 mb-2">
                                                <span className="text-[10px] font-black text-blue-700/80 uppercase tracking-widest">Início</span>
                                                <span className="text-xs font-semibold">{info.startedAtLabel}</span>
                                            </div>
                                            <div className="grid grid-cols-1 lg:grid-cols-[140px_1fr] gap-2 items-start">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-blue-700/80">Grupo</span>
                                                <span className="text-xs font-semibold">{info.groupLabel || 'N/D'}</span>
                                                <span className="text-[9px] font-black uppercase tracking-widest text-blue-700/80">Departamento</span>
                                                <span className="text-xs font-semibold">{info.deptLabel || 'N/D'}</span>
                                                <span className="text-[9px] font-black uppercase tracking-widest text-blue-700/80">Categorias</span>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {info.catItems.length > 0 ? info.catItems.map((item, idx) => (
                                                        <span key={`cat-${info.key}-${idx}`} className="text-xs font-semibold bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-lg whitespace-nowrap">
                                                            {item}
                                                        </span>
                                                    )) : <span className="text-xs font-semibold">N/D</span>}
                                                </div>
                                                <span className="text-[9px] font-black uppercase tracking-widest text-blue-700/80">Abertos</span>
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <span className="text-xs font-black text-blue-700 tabular-nums whitespace-nowrap">
                                                        {info.skus.toLocaleString('pt-BR')} SKUs
                                                    </span>
                                                    <span className="text-xs font-bold text-blue-400">•</span>
                                                    <span className="text-xs font-black text-blue-700 tabular-nums whitespace-nowrap">
                                                        {info.units.toLocaleString('pt-BR')} Produtos
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="border border-blue-100 bg-blue-50/60 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-blue-700/80">Total Aberto</span>
                                        <span className="text-xs font-black text-blue-700 tabular-nums whitespace-nowrap">
                                            {partialTotals.skus.toLocaleString('pt-BR')} SKUs
                                        </span>
                                        <span className="text-xs font-bold text-blue-400">•</span>
                                        <span className="text-xs font-black text-blue-700 tabular-nums whitespace-nowrap">
                                            {partialTotals.units.toLocaleString('pt-BR')} Produtos
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-3 text-xs font-semibold text-blue-700/70">Nenhuma contagem parcial ativa.</div>
                            )}
                            {completedInfoList.length > 0 && (
                                <div className="mt-4 border-t border-blue-100 pt-3">
                                    <div className="flex items-center gap-2 mb-3 justify-between">
                                        <div className="flex items-center gap-2">
                                            <FileSignature className="w-4 h-4 text-blue-600" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-700/80">Termos</span>
                                        </div>
                                        {canUseAuditMasterTools && (
                                            <button
                                                onClick={resetPartialHistory}
                                                className="text-[9px] font-black uppercase tracking-widest text-red-600 bg-white border border-red-200 px-3 py-1 rounded-lg hover:bg-red-600 hover:text-white transition-colors"
                                                title="Zerar contagens concluídas e termos personalizados"
                                            >
                                                Zerar Termos
                                            </button>
                                        )}
                                    </div>
                                    <div className="rounded-2xl border border-blue-100 bg-white/70 p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="text-[9px] font-black uppercase tracking-widest text-blue-700/60">Termos Personalizados (Concluídos)</div>
                                            <button
                                                onClick={() => setIsTermsPanelCollapsed(prev => !prev)}
                                                className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-blue-700 bg-white border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-600 hover:text-white transition-colors"
                                                title={isTermsPanelCollapsed ? 'Expandir quadro de termos' : 'Minimizar quadro de termos'}
                                            >
                                                <ChevronRight className={`w-3 h-3 transition-transform ${isTermsPanelCollapsed ? '' : 'rotate-90'}`} />
                                                {isTermsPanelCollapsed ? 'Expandir' : 'Minimizar'}
                                            </button>
                                        </div>
                                        {!isTermsPanelCollapsed && (
                                            <>
                                                <div className="flex flex-wrap gap-2">
                                                    {completedInfoList.map(info => (
                                                        <button
                                                            key={`term-${info.key}`}
                                                            onClick={() => openPartialTerm(info.scope)}
                                                            className="text-xs font-semibold bg-white border border-blue-200 px-3 py-1 rounded-lg hover:bg-blue-600 hover:text-white transition-colors whitespace-nowrap"
                                                            title={info.completedAtLabel ? `Concluído em ${info.completedAtLabel}` : undefined}
                                                        >
                                                            {info.label}{info.completedAtLabel ? ` • ${info.completedAtLabel}` : ''}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    {batchSummaryByGroup.length > 0 && (
                                        <div className="mt-3 rounded-2xl border border-blue-100 bg-white/70 p-3">
                                            <div className="text-[9px] font-black uppercase tracking-widest text-blue-700/60 mb-2">Termos Únicos (Por Lote)</div>
                                            <div className="space-y-3">
                                                {batchSummaryByGroup.map(group => (
                                                    <div key={`group-${group.groupLabel}`} className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                                                        <div className="text-[9px] font-black uppercase tracking-widest text-blue-700/70 mb-2 break-words leading-relaxed">
                                                            {group.groupLabel}
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {group.items.map(batch => (
                                                                <button
                                                                    key={`batch-${batch.batchId}`}
                                                                    onClick={() => openUnifiedPartialTerm(batch.batchId)}
                                                                    className="w-full sm:w-auto max-w-full text-left text-[11px] sm:text-xs leading-tight font-semibold bg-white border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-colors break-words"
                                                                    title={batch.lastAt ? `Concluído em ${new Date(batch.lastAt).toLocaleString('pt-BR', { hour12: false })}` : undefined}
                                                                >
                                                                    Termo único • {batch.count} contagens • {batch.lastAt ? new Date(batch.lastAt).toLocaleString('pt-BR', { hour12: false }) : ''}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {branchMetrics.progress >= 100 && (
                                        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                <div>
                                                    <div className="text-[9px] font-black uppercase tracking-widest text-emerald-700/80">Termo Único Geral (100%)</div>
                                                    <div className="text-[11px] font-semibold text-emerald-900/80">Consolida todas as divergências em um único termo final.</div>
                                                </div>
                                                <button
                                                    onClick={openGlobalUnifiedTerm}
                                                    className="w-full sm:w-auto text-xs font-black uppercase tracking-wider bg-emerald-600 text-white border border-emerald-700 px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
                                                >
                                                    Abrir Termo Geral
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-6 gap-6 items-center">
                    <div className="md:col-span-2">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic leading-none">Conferência Global da Filial</span>
                            <span className="text-2xl font-black text-indigo-600 leading-none">{Math.round(branchMetrics.progress)}%</span>
                        </div>
                        <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200 p-0.5">
                            <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(79,70,229,0.3)]" style={{ width: `${branchMetrics.progress}%` }}></div>
                        </div>
                    </div>

                    <div className="flex flex-col items-center border-l border-slate-100 px-2 min-w-0">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic text-center">SKUs Totais</span>
                        <span className="text-2xl font-black text-slate-900 tabular-nums leading-none mt-1">{branchMetrics.skus.toLocaleString()}</span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase mt-1 tracking-tighter">MIX IMPORTADO</span>
                    </div>

                    <div className="flex flex-col items-center border-l border-slate-100 px-2 min-w-0">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic text-center">Unidades Totais</span>
                        <div className="flex flex-nowrap items-center justify-center gap-2 mt-1 text-center leading-none whitespace-nowrap">
                            <span className="text-[clamp(0.9rem,1.25vw,1.2rem)] font-black text-indigo-700 tabular-nums leading-none whitespace-nowrap">{Math.round(filialTotalsMetrics.doneUnits).toLocaleString()}</span>
                            <span className="text-slate-200 text-[clamp(0.7rem,1vw,0.9rem)] leading-none whitespace-nowrap">/</span>
                            <span className="text-[clamp(0.8rem,1.1vw,1.05rem)] font-black text-slate-300 tabular-nums leading-none whitespace-nowrap">{Math.round(branchMetrics.units).toLocaleString()}</span>
                        </div>
                        <span className="text-[8px] font-bold text-indigo-300 uppercase mt-1 tracking-tighter">CONFERIDAS / TOTAIS</span>
                    </div>

                    <div className="flex flex-col items-center border-l border-slate-100 px-2 min-w-0">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic text-center">Valor em Custo</span>
                        <div className="flex flex-nowrap items-center justify-center gap-2 mt-1 text-center leading-none whitespace-nowrap">
                            <span className="text-[clamp(0.88rem,1.2vw,1.15rem)] font-black text-emerald-700 tabular-nums leading-none whitespace-nowrap">R$ {filialTotalsMetrics.doneCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span className="text-slate-200 text-[clamp(0.7rem,1vw,0.9rem)] leading-none whitespace-nowrap">/</span>
                            <span className="text-[clamp(0.8rem,1.05vw,1.05rem)] font-black text-slate-300 tabular-nums leading-none whitespace-nowrap">{branchMetrics.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <span className="text-[8px] font-bold text-emerald-300 uppercase mt-1 tracking-tighter">CONFERIDO / TOTAL</span>
                    </div>

                    <div className="flex flex-col items-center border-l border-slate-100 px-2 min-w-0">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic text-center">Mix Auditado</span>
                        <div className="flex flex-nowrap items-center justify-center gap-2 mt-1 text-center leading-none whitespace-nowrap">
                            <span className="text-[clamp(0.9rem,1.25vw,1.2rem)] font-black text-emerald-600 tabular-nums leading-none whitespace-nowrap">{branchMetrics.doneSkus.toLocaleString()}</span>
                            <span className="text-slate-200 text-[clamp(0.7rem,1vw,0.9rem)] leading-none whitespace-nowrap">/</span>
                            <span className="text-[clamp(0.8rem,1.1vw,1.05rem)] font-black text-slate-300 tabular-nums leading-none whitespace-nowrap">{branchMetrics.pendingSkus.toLocaleString()}</span>
                        </div>
                        <span className="text-[8px] font-bold text-emerald-500 uppercase mt-1 tracking-tighter">CONFERIDOS / PENDENTES</span>
                    </div>

                    <div className="flex flex-col items-center border-l border-indigo-100 bg-indigo-50/50 rounded-2xl py-2 px-4 shadow-sm md:col-span-1">
                        <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest italic text-center">Dias Restantes</span>
                        <span className="text-2xl font-black text-indigo-600 tabular-nums leading-none mt-1">{Math.ceil(productivity.etaDays)} <span className="text-[10px] uppercase font-bold text-indigo-400">Dias</span></span>
                        <span className="text-[8px] font-bold text-indigo-300 uppercase mt-1 tracking-tighter">PREVISÃO FINAL</span>
                    </div>

                    <div className="md:col-span-5 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Qtde Divergência</div>
                                <div className={`text-xl font-black tabular-nums mt-1 ${filialTotalsMetrics.diffQty < 0 ? 'text-red-600' : filialTotalsMetrics.diffQty > 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                    {filialTotalsMetrics.diffQty > 0 ? '+' : ''}{Math.round(filialTotalsMetrics.diffQty).toLocaleString('pt-BR')} un.
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Divergência R$</div>
                                <div className={`text-xl font-black tabular-nums mt-1 ${filialTotalsMetrics.diffCost < 0 ? 'text-red-600' : filialTotalsMetrics.diffCost > 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                    {filialTotalsMetrics.diffCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Total Conferido R$</div>
                                <div className="text-xl font-black text-slate-800 tabular-nums mt-1">
                                    {filialTotalsMetrics.doneCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 mt-1">
                                    Falta conferir: {filialTotalsMetrics.pendingCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Rep. Divergência</div>
                                <div className={`text-xl font-black tabular-nums mt-1 ${filialTotalsMetrics.repDivergencePct < 0 ? 'text-red-600' : filialTotalsMetrics.repDivergencePct > 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                    {filialTotalsMetrics.repDivergencePct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 mt-1">
                                    Unidades: {Math.round(filialTotalsMetrics.doneUnits).toLocaleString('pt-BR')} / {Math.round(filialTotalsMetrics.totalUnits).toLocaleString('pt-BR')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <main className="max-w-[1400px] mx-auto px-8 mt-8">
                <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <Breadcrumbs
                        className="mb-0"
                        view={view}
                        onNavigate={l => setView(prev => ({ ...prev, level: l }))}
                        groupName={selectedGroup?.name}
                        deptName={selectedDept?.name}
                    />
                    <div className="relative w-full xl:max-w-[540px]">
                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 h-12 shadow-sm">
                            <Search className="w-4 h-4 text-slate-400 shrink-0" />
                            <input
                                ref={auditLookupInputRef}
                                type="text"
                                value={auditLookup}
                                onChange={(e) => {
                                    setAuditLookup(e.target.value);
                                    setAuditLookupOpen(true);
                                }}
                                onFocus={() => setAuditLookupOpen(true)}
                                onBlur={() => setTimeout(() => setAuditLookupOpen(false), 120)}
                                placeholder="Buscar por reduzido, código de barras ou descrição (Ctrl+F)"
                                className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none"
                            />
                        </div>

                        {auditLookupOpen && normalizedAuditLookup && (
                            <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-[360px] overflow-y-auto">
                                {auditLookupResults.length === 0 ? (
                                    <div className="px-4 py-3 text-xs text-slate-500">
                                        Nenhum produto encontrado.
                                    </div>
                                ) : (
                                    auditLookupResults.map((result, index) => (
                                        <button
                                            key={`${result.groupId}-${result.deptId}-${result.catId}-${result.barcode}-${result.reducedCode}-${index}`}
                                            onMouseDown={(event) => {
                                                event.preventDefault();
                                                handleOpenAuditLookupResult(result);
                                            }}
                                            className="w-full text-left px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-indigo-50 transition-colors"
                                        >
                                            <p className="text-xs font-black text-slate-800 uppercase leading-tight">{result.productName}</p>
                                            <p className="text-[11px] text-slate-500 mt-1">
                                                Barras: <span className="font-semibold text-slate-700">{result.barcode || 'N/D'}</span>
                                                {' • '}
                                                Reduzido: <span className="font-semibold text-slate-700">{result.reducedCode || 'N/D'}</span>
                                            </p>
                                            <p className="text-[11px] text-indigo-600 font-semibold mt-1">
                                                Grupo {result.groupId} ({result.groupName}) • Depto {result.deptName} • Cat {result.catName}
                                            </p>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className={`grid gap-6 ${view.level === 'groups' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
                    {view.level === 'groups' && [...data.groups].sort((a, b) => {
                        const getGroupOrder = (idRaw: unknown) => {
                            const raw = String(idRaw || '').trim();
                            const numeric = Number((raw.match(/\d+/)?.[0] || '999999'));
                            return Number.isFinite(numeric) ? numeric : 999999;
                        };
                        return getGroupOrder(a.id) - getGroupOrder(b.id);
                    }).map(group => {
                        const m = calcScopeMetrics(group);
                        const totalSkus = Number(m.skus);
                        const doneSkus = Number(m.doneSkus);
                        const isComplete = totalSkus > 0 && doneSkus >= totalSkus;
                        const groupCats = group.departments.flatMap(d => d.categories);
                        const groupHasStarted = groupCats.some(c => normalizeAuditStatus(c.status) !== AuditStatus.TODO);
                        const groupHasInProgress = groupCats.some(c => isInProgressStatus(c.status));
                        const groupAllDone = totalSkus > 0 && doneSkus >= totalSkus;
                        const groupPartialPercent = groupHasInProgress ? getPartialPercentForGroup(group, totalSkus) : 0;
                        const groupProgressValue = groupAllDone ? 100 : groupHasInProgress ? groupPartialPercent : m.progress;
                        const groupScope = { groupId: group.id };
                        const groupMetrics = getGroupVerifiedMetrics(group);
                        const groupDisplayMetrics = applyPostAuditAdjustmentsToMetrics(groupMetrics, groupScope);
                        const groupAdjustedDoneCost = getAdjustedAuditedCostForScope(m.doneCost, groupMetrics, groupScope);
                        return (
                            <div key={group.id} className={`rounded-[2.5rem] p-8 border shadow-sm hover:shadow-xl transition-all group flex flex-col relative overflow-hidden ${groupHasInProgress ? 'bg-blue-50/60 border-blue-200' : 'bg-white border-slate-200'}`}>
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 group-hover:bg-indigo-100 transition-colors z-0"></div>
                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-6">
                                        <span className="text-xl font-black text-indigo-600 bg-indigo-50 px-5 py-2.5 rounded-2xl border border-indigo-100 shadow-sm">ID {group.id}</span>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); if (isComplete) openTermModal({ type: 'group', groupId: group.id }); }}
                                                disabled={!isComplete}
                                                className={`px-3 h-10 rounded-xl border flex items-center justify-center gap-1 transition-all shadow-sm text-[10px] font-black uppercase ${isComplete ? 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-600 hover:text-white' : 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'}`}
                                                title={isComplete ? 'Assinar e imprimir termo' : 'Conclua 100% para liberar'}
                                            >
                                                <FileSignature className="w-4 h-4" />
                                                Termo
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); startScopeAudit(group.id); }}
                                                disabled={!canUseAuditMasterTools}
                                                className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all shadow-sm ${!canUseAuditMasterTools
                                                    ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                                                    : isComplete
                                                        ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-500 hover:text-white'
                                                    : groupHasInProgress
                                                        ? 'bg-blue-600 text-white border-blue-500'
                                                        : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-600 hover:text-white'}`}
                                                title={!canUseAuditMasterTools ? 'Apenas Master ou Administrativo pode iniciar grupo inteiro' : (isComplete ? 'Desmarcar conclusão e reabrir parcial' : (groupHasInProgress ? 'Desativar contagem parcial' : (groupHasStarted ? 'Retomar auditoria parcial' : 'Iniciar auditoria parcial')))}
                                            >
                                                <Activity className="w-5 h-5" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); toggleScopeStatus(group.id); }}
                                                disabled={!canUseAuditMasterTools || !groupHasStarted}
                                                className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all shadow-sm ${!canUseAuditMasterTools || !groupHasStarted ? 'bg-slate-50 text-slate-200 border-slate-100 cursor-not-allowed' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white'}`}
                                            >
                                                <CheckSquare className="w-5 h-5" />
                                            </button>
                                            <button onClick={() => setView({ level: 'departments', selectedGroupId: group.id })} className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center hover:bg-indigo-600 transition-all shadow-md">
                                                <ChevronRight className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                    <h2 onClick={() => setView({ level: 'departments', selectedGroupId: group.id })} className="text-xl font-black text-slate-900 uppercase italic mb-6 cursor-pointer group-hover:text-indigo-600 flex-1 leading-tight tracking-tight">{group.name}</h2>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 pt-6 border-t border-slate-50 mb-6">
                                        <div>
                                            <p className="text-[8px] font-black text-slate-400 uppercase italic mb-1">Carga de Mix</p>
                                            <div className="flex flex-wrap justify-between gap-2 text-xs font-bold items-center">
                                                <span className="text-slate-400 min-w-0 break-words mobile-metric-number">Total: {m.skus}</span>
                                                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md text-[9px] mobile-metric-number">{m.doneSkus} Conf.</span>
                                            </div>
                                        </div>
                                        <div className="sm:border-l border-slate-100 sm:pl-6">
                                            <p className="text-[8px] font-black text-slate-400 uppercase italic mb-1">Volume de Unid.</p>
                                            <div className="flex flex-wrap justify-between gap-2 text-xs font-bold items-center">
                                                <span className="text-slate-400 min-w-0 break-words mobile-metric-number">Total: {Math.round(m.units).toLocaleString()}</span>
                                                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md text-[9px] mobile-metric-number">{Math.round(m.doneUnits).toLocaleString()} Aud.</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-1 mb-6 pt-4 border-t border-slate-50">
                                        <p className="text-[8px] font-black text-slate-400 uppercase italic">Valor Total (Custo)</p>
                                        <div className="flex flex-col sm:flex-row sm:justify-between gap-1 text-sm font-black min-w-0">
                                            <span className="text-slate-400 mobile-metric-number leading-tight break-words">R$ {m.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                            <span className="text-emerald-600 mobile-metric-number leading-tight break-words">R$ {groupAdjustedDoneCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} Aud.</span>
                                        </div>
                                    </div>

                                    {/* Injeção do Dashboard de Excel (Geral) — usa os TOTAIS das excelMetrics */}
                                    {groupDisplayMetrics && (
                                        <ExcelMetricsDashboard metrics={groupDisplayMetrics} auditedBaseCost={groupAdjustedDoneCost} />
                                    )}

                                    <div className="mt-6">
                                        <ProgressBar percentage={groupProgressValue} size="md" label={`Progresso do Grupo`} tone={groupAllDone ? 'green' : groupHasInProgress ? 'blue' : 'auto'} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {view.level === 'groups' && (
                        <div className="rounded-[2.5rem] p-8 border border-indigo-200 bg-white shadow-sm hover:shadow-xl transition-all flex flex-col relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-36 h-36 bg-indigo-50 rounded-full -mr-16 -mt-16 z-0"></div>
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="flex items-start justify-between gap-3 mb-6">
                                    <div>
                                        <span className="inline-flex items-center text-sm font-black text-indigo-700 bg-indigo-50 px-4 py-2 rounded-2xl border border-indigo-100 shadow-sm uppercase tracking-widest">
                                            Ajustes
                                        </span>
                                        <h2 className="text-xl font-black text-slate-900 uppercase italic mt-5 leading-tight tracking-tight">
                                            Ajustes após auditoria
                                        </h2>
                                    </div>
                                    <div className={`text-right text-xs font-black tabular-nums ${postAuditAdjustmentTotals.cost < 0 ? 'text-red-600' : postAuditAdjustmentTotals.cost > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        <div>{postAuditAdjustmentTotals.quantity > 0 ? '+' : ''}{postAuditAdjustmentTotals.quantity.toLocaleString('pt-BR')} un.</div>
                                        <div>{postAuditAdjustmentTotals.cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 mb-5">
                                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 min-w-0">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Itens</p>
                                        <p className="text-lg font-black text-slate-800 tabular-nums">{postAuditAdjustments.length}</p>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 min-w-0">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Qtd</p>
                                        <p className={`text-lg font-black tabular-nums ${postAuditAdjustmentTotals.quantity < 0 ? 'text-red-600' : postAuditAdjustmentTotals.quantity > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                                            {postAuditAdjustmentTotals.quantity > 0 ? '+' : ''}{postAuditAdjustmentTotals.quantity.toLocaleString('pt-BR')}
                                        </p>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 min-w-0">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Valor</p>
                                        <p className={`text-base font-black tabular-nums leading-tight ${postAuditAdjustmentTotals.cost < 0 ? 'text-red-600' : postAuditAdjustmentTotals.cost > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                                            {postAuditAdjustmentTotals.cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-3 border-t border-slate-100 pt-5">
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPostAdjustmentMode('delta');
                                                setPostAdjustmentError(null);
                                            }}
                                            disabled={isReadOnlyCompletedView || isSavingPostAdjustment}
                                            className={`h-9 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${postAdjustmentMode === 'delta'
                                                ? 'bg-slate-900 text-white border-slate-900'
                                                : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:text-indigo-600'} disabled:bg-slate-100 disabled:text-slate-300 disabled:border-slate-100`}
                                        >
                                            Somar/Subtrair
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPostAdjustmentMode('replace');
                                                setPostAdjustmentError(null);
                                            }}
                                            disabled={isReadOnlyCompletedView || isSavingPostAdjustment}
                                            className={`h-9 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${postAdjustmentMode === 'replace'
                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:text-indigo-600'} disabled:bg-slate-100 disabled:text-slate-300 disabled:border-slate-100`}
                                        >
                                            Substituir Auditado
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2">
                                        <input
                                            value={postAdjustmentCode}
                                            onChange={(event) => {
                                                setPostAdjustmentCode(event.target.value);
                                                setPostAdjustmentError(null);
                                            }}
                                            disabled={isReadOnlyCompletedView || isSavingPostAdjustment}
                                            placeholder="Reduzido, barras ou descrição"
                                            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 disabled:bg-slate-100 disabled:text-slate-400"
                                        />
                                        <input
                                            value={postAdjustmentQty}
                                            onChange={(event) => {
                                                setPostAdjustmentQty(event.target.value);
                                                setPostAdjustmentError(null);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') void addPostAuditAdjustment();
                                            }}
                                            disabled={isReadOnlyCompletedView || isSavingPostAdjustment}
                                            placeholder={postAdjustmentMode === 'replace' ? 'Qtd correta' : '+2 / -1'}
                                            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 disabled:bg-slate-100 disabled:text-slate-400"
                                        />
                                    </div>
                                    <textarea
                                        value={postAdjustmentNote}
                                        onChange={(event) => setPostAdjustmentNote(event.target.value)}
                                        disabled={isReadOnlyCompletedView || isSavingPostAdjustment}
                                        placeholder="Observação"
                                        rows={3}
                                        className="min-h-[72px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 disabled:bg-slate-100 disabled:text-slate-400"
                                    />

                                    {postAdjustmentProduct && (
                                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                                            <p className="text-[10px] font-black uppercase text-emerald-800 leading-tight">{postAdjustmentProduct.productName}</p>
                                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-emerald-700/80">
                                                <span>Red. {postAdjustmentProduct.reducedCode || 'N/D'}</span>
                                                <span>Barras {postAdjustmentProduct.barcode || 'N/D'}</span>
                                                <span>Custo {postAdjustmentProduct.unitCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                                <span>Saldo {postAdjustmentProduct.quantity.toLocaleString('pt-BR')}</span>
                                            </div>
                                            {postAdjustmentScopeInfo && (
                                                <div className="mt-2 space-y-0.5 text-[10px] font-black uppercase text-emerald-800/90 leading-tight">
                                                    <p>{postAdjustmentScopeInfo.group}</p>
                                                    <p>{postAdjustmentScopeInfo.dept}</p>
                                                    <p>{postAdjustmentScopeInfo.cat}</p>
                                                </div>
                                            )}
                                            {postAdjustmentProduct.audited && (
                                                <p className="mt-2 text-[10px] font-black uppercase text-emerald-700">
                                                    Já auditado{postAdjustmentProduct.completedAt ? ` em ${new Date(postAdjustmentProduct.completedAt).toLocaleString('pt-BR', { hour12: false })}` : ''}
                                                </p>
                                            )}
                                            {postAdjustmentAuditedSnapshot && (
                                                <div className="mt-2 rounded-lg bg-white/70 border border-emerald-100 px-2 py-1.5 text-[10px] font-black text-emerald-900">
                                                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                                                        <span>Sist. {postAdjustmentAuditedSnapshot.baseSystemQty.toLocaleString('pt-BR')}</span>
                                                        <span>Auditado atual {postAdjustmentAuditedSnapshot.currentAuditedQty.toLocaleString('pt-BR')}</span>
                                                        {postAdjustmentAuditedSnapshot.adjustmentQty !== 0 && (
                                                            <span>Ajustes já lançados {postAdjustmentAuditedSnapshot.adjustmentQty > 0 ? '+' : ''}{postAdjustmentAuditedSnapshot.adjustmentQty.toLocaleString('pt-BR')}</span>
                                                        )}
                                                    </div>
                                                    {postAdjustmentMode === 'replace' && postAdjustmentComputedDelta !== null && (
                                                        <p className={`mt-1 ${postAdjustmentComputedDelta < 0 ? 'text-red-600' : postAdjustmentComputedDelta > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                                                            Ajuste calculado: {postAdjustmentComputedDelta > 0 ? '+' : ''}{postAdjustmentComputedDelta.toLocaleString('pt-BR')} un.
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {postAdjustmentError && (
                                        <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
                                            {postAdjustmentError}
                                        </div>
                                    )}

                                    <button
                                        onClick={() => void addPostAuditAdjustment()}
                                        disabled={isReadOnlyCompletedView || isSavingPostAdjustment}
                                        className="w-full h-12 rounded-xl bg-slate-900 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all"
                                    >
                                        {isSavingPostAdjustment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                        Adicionar ajuste
                                    </button>

                                    {isReadOnlyCompletedView && (
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            Modo consulta: ajustes bloqueados.
                                        </p>
                                    )}
                                </div>

                                <div className="mt-5 flex-1 min-h-[120px] max-h-[260px] overflow-y-auto pr-1 space-y-2">
                                    {postAuditAdjustments.length === 0 ? (
                                        <div className="h-full min-h-[120px] rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 flex items-center justify-center text-center px-4">
                                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                                                Nenhum ajuste lançado
                                            </p>
                                        </div>
                                    ) : (
                                        postAuditAdjustments.map(adjustment => (
                                            <div key={adjustment.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-[11px] font-black uppercase text-slate-800 leading-tight break-words">{adjustment.description}</p>
                                                        <p className="mt-1 text-[10px] font-bold text-slate-400">
                                                            Red. {adjustment.reducedCode || adjustment.code} • {adjustment.groupName || `Grupo ${adjustment.groupId || '-'}`}
                                                        </p>
                                                        {adjustment.mode === 'replace' && (
                                                            <p className="mt-1 text-[10px] font-black uppercase text-indigo-600">
                                                                Substituiu auditado: {Number(adjustment.previousAuditedQty || 0).toLocaleString('pt-BR')} -&gt; {Number(adjustment.replacementQuantity || 0).toLocaleString('pt-BR')}
                                                            </p>
                                                        )}
                                                        {adjustment.note && (
                                                            <p className="mt-1 text-[10px] font-semibold text-slate-500 break-words">{adjustment.note}</p>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => void removePostAuditAdjustment(adjustment.id)}
                                                        disabled={isReadOnlyCompletedView || isSavingPostAdjustment}
                                                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
                                                        title="Remover ajuste"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] font-black">
                                                    <div className="rounded-lg bg-white border border-slate-100 px-2 py-1">
                                                        <span className="block text-slate-400 uppercase">Qtd</span>
                                                        <span className={adjustment.quantity < 0 ? 'text-red-600' : 'text-emerald-600'}>
                                                            {adjustment.quantity > 0 ? '+' : ''}{adjustment.quantity.toLocaleString('pt-BR')}
                                                        </span>
                                                    </div>
                                                    <div className="rounded-lg bg-white border border-slate-100 px-2 py-1">
                                                        <span className="block text-slate-400 uppercase">Custo</span>
                                                        <span className="text-slate-700">{adjustment.unitCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                                    </div>
                                                    <div className="rounded-lg bg-white border border-slate-100 px-2 py-1">
                                                        <span className="block text-slate-400 uppercase">Total</span>
                                                        <span className={adjustment.totalCost < 0 ? 'text-red-600' : 'text-emerald-600'}>
                                                            {adjustment.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {view.level === 'departments' && [...(selectedGroup?.departments || [])].sort((a, b) => {
                        const aHasInProgress = a.categories.some(c => isInProgressStatus(c.status));
                        const bHasInProgress = b.categories.some(c => isInProgressStatus(c.status));
                        if (aHasInProgress && !bHasInProgress) return -1;
                        if (!aHasInProgress && bHasInProgress) return 1;

                        const aM = calcScopeMetrics(a);
                        const bM = calcScopeMetrics(b);
                        const aAllDone = Number(aM.skus) > 0 && Number(aM.doneSkus) >= Number(aM.skus);
                        const bAllDone = Number(bM.skus) > 0 && Number(bM.doneSkus) >= Number(bM.skus);

                        if (aAllDone && !bAllDone) return 1;
                        if (!aAllDone && bAllDone) return -1;

                        const aMetrics = getScopedMetrics({ type: 'department', groupId: selectedGroup!.id, deptId: a.id });
                        const bMetrics = getScopedMetrics({ type: 'department', groupId: selectedGroup!.id, deptId: b.id });
                        const aHasDivergence = !!aMetrics && (Math.abs(Number(aMetrics.diffQty || 0)) > 0.01 || Math.abs(Number(aMetrics.diffCost || 0)) > 0.01);
                        const bHasDivergence = !!bMetrics && (Math.abs(Number(bMetrics.diffQty || 0)) > 0.01 || Math.abs(Number(bMetrics.diffCost || 0)) > 0.01);
                        if (aHasDivergence && !bHasDivergence) return -1;
                        if (!aHasDivergence && bHasDivergence) return 1;

                        return 0;
                    }).map(dept => {
                        const m = calcScopeMetrics(dept);
                        const totalSkus = Number(m.skus);
                        const doneSkus = Number(m.doneSkus);
                        const isComplete = totalSkus > 0 && doneSkus >= totalSkus;
                        const deptHasStarted = dept.categories.some(c => normalizeAuditStatus(c.status) !== AuditStatus.TODO);
                        const deptHasInProgress = dept.categories.some(c => isInProgressStatus(c.status));
                        const deptAllDone = totalSkus > 0 && doneSkus >= totalSkus;
                        const deptPartialPercent = deptHasInProgress ? getPartialPercentForDept(selectedGroup!, dept, totalSkus) : 0;
                        const deptProgressValue = deptAllDone ? 100 : deptHasInProgress ? deptPartialPercent : m.progress;
                        const deptScope = { groupId: selectedGroup!.id, deptId: dept.id };
                        const deptMetrics = getScopedMetrics({ type: 'department', groupId: selectedGroup!.id, deptId: dept.id });
                        const deptDisplayMetrics = applyPostAuditAdjustmentsToMetrics(deptMetrics, deptScope);
                        const deptAdjustedDoneCost = getAdjustedAuditedCostForScope(m.doneCost, deptMetrics, deptScope);
                        return (
                            <div key={dept.id} className={`rounded-[2rem] border shadow-sm hover:shadow-md transition-all p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row items-stretch lg:items-center gap-4 sm:gap-6 lg:gap-10 group ${deptHasInProgress ? 'bg-blue-50/60 border-blue-200' : 'bg-white border-slate-200'}`}>
                                <div className="flex flex-col items-center justify-center bg-slate-50 rounded-[2rem] p-4 sm:p-6 w-full lg:w-auto lg:min-w-[160px] border border-slate-100 shadow-inner">
                                    <span className="text-[9px] font-black text-slate-400 uppercase mb-2 italic">SISTEMA ID</span>
                                    <span className="text-5xl font-black text-indigo-700 leading-none tracking-tighter">{dept.numericId || '--'}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:justify-between sm:items-start mb-4 sm:mb-6">
                                        <h2 onClick={() => setView(prev => ({ ...prev, level: 'categories', selectedDeptId: dept.id }))} className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 uppercase italic leading-tight break-words group-hover:text-indigo-600 cursor-pointer tracking-tight sm:tracking-tighter max-w-full">{dept.name}</h2>
                                        <div className="flex flex-wrap gap-2 sm:justify-end">
                                            <button
                                                onClick={() => { if (isComplete) openTermModal({ type: 'department', groupId: selectedGroup!.id, deptId: dept.id }); }}
                                                disabled={!isComplete}
                                                className={`px-3 py-2 min-w-[72px] rounded-xl text-[10px] font-black uppercase transition-all shadow-sm ${isComplete ? 'bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-600 hover:text-white' : 'bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed'}`}
                                                title={isComplete ? 'Assinar e imprimir termo' : 'Conclua 100% para liberar'}
                                            >
                                                Termo
                                            </button>
                                            <button
                                                onClick={() => startScopeAudit(selectedGroup?.id, dept.id)}
                                                className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase transition-all shadow-sm ${deptAllDone
                                                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-500 hover:text-white'
                                                    : deptHasInProgress
                                                        ? 'bg-blue-600 text-white border-blue-500'
                                                        : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-600 hover:text-white'}`}
                                                title={deptAllDone ? 'Desmarcar conclusão e reabrir parcial' : (deptHasInProgress ? 'Desativar contagem parcial' : (deptHasStarted ? 'Retomar auditoria parcial' : 'Iniciar auditoria parcial'))}
                                            >
                                                {deptAllDone ? 'REABRIR' : deptHasInProgress ? 'PAUSAR' : 'INICIAR'}
                                            </button>
                                            <button
                                                onClick={() => toggleScopeStatus(selectedGroup?.id, dept.id)}
                                                disabled={!canUseAuditMasterTools || !deptHasStarted}
                                                className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase transition-all shadow-sm ${!canUseAuditMasterTools || !deptHasStarted ? 'bg-slate-50 text-slate-200 border-slate-100 cursor-not-allowed' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white'}`}
                                            >
                                                Alternar Tudo
                                            </button>
                                            <button onClick={() => setView(prev => ({ ...prev, level: 'categories', selectedDeptId: dept.id }))} className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center hover:bg-indigo-600 transition-all shadow-lg">
                                                <ChevronRight className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-6">
                                        <div className="flex flex-col min-w-0"><span className="text-[9px] font-black text-slate-400 uppercase italic mb-1">Mix Total</span><span className="mobile-metric-number text-lg font-black text-slate-400 break-words">{m.skus}</span></div>
                                        <div className="flex flex-col min-w-0"><span className="text-[9px] font-black text-slate-400 uppercase italic mb-1">Mix Aud.</span><span className="mobile-metric-number text-xl font-black text-emerald-600 break-words">{m.doneSkus}</span></div>
                                        <div className="flex flex-col min-w-0"><span className="text-[9px] font-black text-slate-400 uppercase italic mb-1">Unid Totais</span><span className="mobile-metric-number text-lg font-black text-slate-400 break-words">{Math.round(m.units).toLocaleString()}</span></div>
                                        <div className="flex flex-col min-w-0"><span className="text-[9px] font-black text-slate-400 uppercase italic mb-1">Unid Aud.</span><span className="mobile-metric-number text-xl font-black text-indigo-600 break-words">{Math.round(m.doneUnits).toLocaleString()}</span></div>
                                        <div className="flex flex-col min-w-0"><span className="text-[9px] font-black text-slate-400 uppercase italic mb-1">Custo Total</span><span className="mobile-metric-number text-lg font-black text-slate-400 break-words">R$ {m.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                        <div className="flex flex-col min-w-0"><span className="text-[9px] font-black text-slate-400 uppercase italic mb-1">Custo Aud.</span><span className="mobile-metric-number text-xl font-black text-emerald-600 break-words">R$ {deptAdjustedDoneCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                    </div>

                                    {deptDisplayMetrics && (
                                        <ExcelMetricsDashboard metrics={deptDisplayMetrics} auditedBaseCost={deptAdjustedDoneCost} />
                                    )}

                                    <ProgressBar percentage={deptProgressValue} size="md" label={`Status do Departamento`} tone={deptAllDone ? 'green' : deptHasInProgress ? 'blue' : 'auto'} />
                                </div>
                            </div>
                        );
                    })}

                    {view.level === 'categories' && [...(selectedDept?.categories || [])].sort((a, b) => {
                        const aStatus = normalizeAuditStatus(a.status);
                        const bStatus = normalizeAuditStatus(b.status);

                        // IN_PROGRESS no topo (peso 0)
                        // TODO no meio (peso 1)
                        // DONE no fim (peso 2)
                        const getWeight = (status: AuditStatus) => {
                            if (status === AuditStatus.IN_PROGRESS) return 0;
                            if (status === AuditStatus.TODO) return 1;
                            if (status === AuditStatus.DONE) return 2;
                            return 3;
                        };

                        const byStatus = getWeight(aStatus) - getWeight(bStatus);
                        if (byStatus !== 0) return byStatus;

                        const aMetrics = getScopedMetrics({ type: 'category', groupId: selectedGroup!.id, deptId: selectedDept!.id, catId: a.id });
                        const bMetrics = getScopedMetrics({ type: 'category', groupId: selectedGroup!.id, deptId: selectedDept!.id, catId: b.id });
                        const aHasDivergence = !!aMetrics && (Math.abs(Number(aMetrics.diffQty || 0)) > 0.01 || Math.abs(Number(aMetrics.diffCost || 0)) > 0.01);
                        const bHasDivergence = !!bMetrics && (Math.abs(Number(bMetrics.diffQty || 0)) > 0.01 || Math.abs(Number(bMetrics.diffCost || 0)) > 0.01);
                        if (aHasDivergence && !bHasDivergence) return -1;
                        if (!aHasDivergence && bHasDivergence) return 1;

                        return 0;
                    }).map(cat => {
                        const catStatus = normalizeAuditStatus(cat.status);
                        const canFinalize = canUseAuditMasterTools && catStatus !== AuditStatus.TODO;
                        const startLabel = catStatus === AuditStatus.DONE ? 'REABRIR' : catStatus === AuditStatus.IN_PROGRESS ? 'PAUSAR' : 'INICIAR';
                        const catProgressValue = catStatus === AuditStatus.DONE ? 100 : catStatus === AuditStatus.IN_PROGRESS ? 50 : 0;
                        const catScope = { groupId: selectedGroup!.id, deptId: selectedDept!.id, catId: cat.id };
                        const catMetrics = getScopedMetrics({ type: 'category', groupId: selectedGroup!.id, deptId: selectedDept!.id, catId: cat.id });
                        const catDisplayMetrics = applyPostAuditAdjustmentsToMetrics(catMetrics, catScope);
                        const catAdjustedCost = getAdjustedAuditedCostForScope(cat.totalCost, catMetrics, catScope);
                        return (
                            <div key={cat.id} className={`p-4 sm:p-6 lg:p-8 rounded-[2rem] border-2 flex flex-col lg:flex-row items-stretch lg:items-center gap-4 sm:gap-6 lg:gap-10 transition-all hover:shadow-lg group ${catStatus === AuditStatus.DONE ? 'border-slate-200 bg-white' : catStatus === AuditStatus.IN_PROGRESS ? 'border-blue-200 bg-blue-50/40' : 'border-slate-50 bg-white'}`}>
                                <div className="flex flex-col items-center justify-center bg-slate-50 rounded-[2rem] p-4 sm:p-6 w-full lg:w-auto lg:min-w-[160px] border border-slate-100 shadow-inner">
                                    <span className="text-[9px] font-black text-slate-400 uppercase mb-2 italic">SISTEMA ID</span>
                                    <span className="text-5xl font-black text-indigo-700 leading-none tracking-tighter">{cat.numericId || '--'}</span>
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col gap-4 sm:gap-6">
                                    <div className="min-w-0">
                                    <h3 onClick={() => setView(prev => ({ ...prev, level: 'products', selectedCatId: cat.id }))} className={`font-black text-xl sm:text-2xl uppercase italic leading-tight cursor-pointer hover:underline transition-all break-words ${catStatus === AuditStatus.DONE ? 'text-slate-900' : catStatus === AuditStatus.IN_PROGRESS ? 'text-blue-900' : 'text-slate-900'} tracking-tight sm:tracking-tighter`}>{cat.name}</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 mt-3 items-start">
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[9px] font-black text-slate-400 uppercase italic">SKUs Importados</span>
                                            <span className="mobile-metric-number text-md font-black text-slate-800 leading-none break-words">{cat.itemsCount} Mix</span>
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[9px] font-black text-slate-400 uppercase italic">Estoque Físico</span>
                                            <span className="mobile-metric-number text-md font-black text-indigo-600 leading-none break-words">{cat.totalQuantity.toLocaleString()} Unid.</span>
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[9px] font-black text-slate-400 uppercase italic">Valor em Custo</span>
                                            <span className="mobile-metric-number text-md font-black text-emerald-600 leading-none break-words">R$ {catAdjustedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>

                                    </div>
                                    {catDisplayMetrics && (
                                        <ExcelMetricsDashboard metrics={catDisplayMetrics} auditedBaseCost={catAdjustedCost} />
                                    )}
                                    <div className="mt-4">
                                        <ProgressBar
                                            percentage={catProgressValue}
                                            size="md"
                                            label="Status da Categoria"
                                            tone={catStatus === AuditStatus.DONE ? 'green' : catStatus === AuditStatus.IN_PROGRESS ? 'blue' : 'auto'}
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2 sm:gap-3">
                                    <button
                                        onClick={() => { if (catStatus === AuditStatus.DONE) openTermModal({ type: 'category', groupId: selectedGroup!.id, deptId: selectedDept!.id, catId: cat.id }); }}
                                        disabled={catStatus !== AuditStatus.DONE}
                                        className={`px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl text-[10px] font-black uppercase transition-all border shadow-sm ${catStatus === AuditStatus.DONE ? 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:text-white hover:bg-indigo-600' : 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'}`}
                                    >
                                        Termo
                                    </button>
                                    <button
                                        onClick={() => startScopeAudit(selectedGroup?.id, selectedDept?.id, cat.id)}
                                        className={`px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl text-[10px] font-black uppercase transition-all border shadow-sm ${catStatus === AuditStatus.DONE
                                            ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-500 hover:text-white'
                                            : catStatus === AuditStatus.IN_PROGRESS
                                                ? 'bg-blue-600 text-white border-blue-500'
                                                : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-600 hover:text-white'}`}
                                    >
                                        {startLabel}
                                    </button>
                                    <button onClick={() => setView(prev => ({ ...prev, level: 'products', selectedCatId: cat.id }))} className="px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-slate-50 text-slate-400 text-[10px] font-black uppercase hover:text-indigo-600 hover:bg-white transition-all border border-transparent hover:border-indigo-100 shadow-sm">Detalhar</button>
                                    <button
                                        onClick={() => toggleScopeStatus(selectedGroup?.id, selectedDept?.id, cat.id)}
                                        disabled={!canFinalize}
                                        className={`px-4 sm:px-8 py-2.5 sm:py-3 rounded-xl font-black text-[10px] sm:text-[11px] uppercase tracking-wider sm:tracking-widest transition-all shadow-md active:scale-95 ${!canFinalize ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : catStatus === AuditStatus.DONE ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-indigo-600'}`}
                                    >
                                        {!canFinalize ? 'INICIE A AUDITORIA' : catStatus === AuditStatus.DONE ? 'CONCLUÍDO' : 'FINALIZAR'}
                                    </button>
                                </div>
                                </div>
                            </div>
                        )
                    })}

                    {view.level === 'products' && selectedCat && (() => {
                        const catStatus = normalizeAuditStatus(selectedCat.status);
                        const canFinalize = canUseAuditMasterTools && catStatus !== AuditStatus.TODO;
                        const startLabel = catStatus === AuditStatus.DONE ? 'REABRIR' : catStatus === AuditStatus.IN_PROGRESS ? 'PAUSAR' : 'INICIAR';
                        return (
                            <div className="bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl overflow-hidden border border-slate-200">
                                <div className="bg-slate-900 p-4 sm:p-6 lg:p-10 text-white flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-center relative">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                                        <Boxes className="w-40 h-40 text-white" />
                                    </div>
                                    <div className="relative z-10 min-w-0 w-full">
                                        <h2 className="text-xl sm:text-3xl lg:text-4xl font-black uppercase italic leading-tight mb-3 tracking-tight sm:tracking-tighter break-words">{selectedCat.name}</h2>
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 min-w-0">
                                            <span className="text-3xl sm:text-5xl font-black text-indigo-400 leading-none drop-shadow-sm whitespace-nowrap">ID: {selectedCat.numericId || '--'}</span>
                                            <div className="hidden sm:block w-px h-10 bg-white/20"></div>
                                            <div className="flex flex-col min-w-0">
                                                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest italic break-words">{selectedGroup?.name}</p>
                                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest italic break-words">{selectedDept?.name}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 sm:gap-3 items-center relative z-10 w-full lg:w-auto">
                                        <div className="text-right mr-6 hidden lg:block">
                                            <p className="text-[10px] font-black text-slate-500 uppercase italic mb-1">Resumo de Carga</p>
                                            <p className="text-2xl font-black leading-none">{selectedCat.itemsCount} SKUs <span className="text-indigo-400 mx-2">|</span> {selectedCat.totalQuantity.toLocaleString()} Unid.</p>
                                        </div>
                                        <button
                                            onClick={() => { if (catStatus === AuditStatus.DONE) openTermModal({ type: 'category', groupId: selectedGroup!.id, deptId: selectedDept!.id, catId: selectedCat.id }); }}
                                            disabled={catStatus !== AuditStatus.DONE}
                                            className={`px-3 sm:px-5 py-2.5 sm:py-4 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-[11px] uppercase tracking-wider sm:tracking-widest shadow-xl transition-all active:scale-95 border ${catStatus === AuditStatus.DONE ? 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-600 hover:text-white' : 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'}`}
                                        >
                                            Imprimir Termo
                                        </button>
                                        <button
                                            onClick={() => startScopeAudit(selectedGroup?.id, selectedDept?.id, selectedCat.id)}
                                            className={`px-3 sm:px-5 py-2.5 sm:py-4 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-[11px] uppercase tracking-wider sm:tracking-widest shadow-xl transition-all active:scale-95 border ${catStatus === AuditStatus.DONE
                                                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-500 hover:text-white'
                                                : catStatus === AuditStatus.IN_PROGRESS
                                                    ? 'bg-blue-600 text-white border-blue-500'
                                                    : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-600 hover:text-white'}`}
                                        >
                                            {startLabel}
                                        </button>
                                        <button
                                            onClick={() => toggleScopeStatus(selectedGroup?.id, selectedDept?.id, selectedCat.id)}
                                            disabled={!canFinalize}
                                            className={`px-3 sm:px-8 py-2.5 sm:py-4 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-[12px] uppercase tracking-wider sm:tracking-[0.2em] shadow-2xl transition-all active:scale-95 border-b-4 ${!canFinalize ? 'bg-slate-300 border-slate-400 text-slate-500 cursor-not-allowed' : catStatus === AuditStatus.DONE ? 'bg-emerald-600 border-emerald-800' : 'bg-indigo-600 border-indigo-800 hover:bg-indigo-500'}`}
                                        >
                                            {!canFinalize ? 'INICIE A AUDITORIA' : catStatus === AuditStatus.DONE ? 'REABRIR CATEGORIA' : 'CONCLUIR AUDITORIA'}
                                        </button>
                                    </div>
                                </div>
                                <div className="max-h-[650px] overflow-auto custom-scrollbar">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-md z-20 border-b shadow-sm">
                                            <tr className="border-b border-slate-100">
                                                <th className="px-3 sm:px-6 lg:px-12 py-4 sm:py-6 text-[10px] sm:text-[11px] font-black uppercase text-slate-400 tracking-widest italic">Cód. de Barras</th>
                                                <th className="px-3 sm:px-6 lg:px-12 py-4 sm:py-6 text-[10px] sm:text-[11px] font-black uppercase text-slate-400 tracking-widest italic">Descrição Analítica do Item</th>
                                                <th className="px-3 sm:px-6 lg:px-12 py-4 sm:py-6 text-[10px] sm:text-[11px] font-black uppercase text-slate-400 text-right tracking-widest italic font-mono">Custo Unit</th>
                                                <th className="px-3 sm:px-6 lg:px-12 py-4 sm:py-6 text-[10px] sm:text-[11px] font-black uppercase text-slate-400 text-right tracking-widest italic font-mono">Custo Total</th>
                                                <th className="px-3 sm:px-6 lg:px-12 py-4 sm:py-6 text-[10px] sm:text-[11px] font-black uppercase text-slate-400 text-right tracking-widest italic">Saldo Importado</th>
                                            </tr>
                                        </thead>
                                        <tbody>{selectedCat.products.map((p, i) => (
                                            <tr key={i} className="border-b border-slate-50 hover:bg-indigo-50/50 transition-colors group text-xs">
                                                <td className="px-3 sm:px-6 lg:px-12 py-3 sm:py-4 text-slate-500 tabular-nums whitespace-nowrap">{p.code}</td>
                                                <td className="px-3 sm:px-6 lg:px-12 py-3 sm:py-4 font-black uppercase italic leading-tight text-slate-800 group-hover:text-indigo-600 transition-colors min-w-[180px]">{p.name}</td>
                                                <td className="px-3 sm:px-6 lg:px-12 py-3 sm:py-4 text-right tabular-nums text-slate-400 italic whitespace-nowrap">R$ {(p.cost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                <td className="px-3 sm:px-6 lg:px-12 py-3 sm:py-4 text-right tabular-nums font-bold text-slate-600 whitespace-nowrap">R$ {((p.cost || 0) * p.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                <td className="px-3 sm:px-6 lg:px-12 py-3 sm:py-4 text-xl sm:text-2xl font-black text-right tabular-nums group-hover:scale-105 transition-transform whitespace-nowrap">{p.quantity.toLocaleString()}</td>
                                            </tr>))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )
                    })()}
                </div>
            </main>

            {view.level !== 'groups' && (
                <button onClick={() => setView(prev => ({ ...prev, level: prev.level === 'products' ? 'categories' : prev.level === 'categories' ? 'departments' : 'groups' }))} className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-16 py-6 rounded-full shadow-[0_25px_60px_rgba(0,0,0,0.4)] font-black text-[14px] uppercase tracking-[0.3em] hover:bg-indigo-600 hover:scale-110 active:scale-95 transition-all z-[2002] border-8 border-[#f1f5f9] flex items-center gap-6 group">
                    <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-3" /> Retornar Nível
                </button>
            )}

            {termModal && termForm && termScopeInfo && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[2147483000] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
                        <div className="p-3 sm:p-6 border-b border-slate-100 flex justify-between items-center gap-2 bg-slate-50">
                            <h3 className="font-bold text-slate-800 uppercase text-[10px] sm:text-xs tracking-wide sm:tracking-widest flex items-center gap-2 break-words">
                                <FileSignature className="w-4 h-4 text-indigo-500" />
                                Termo de Auditoria - {termModal.type === 'custom' ? 'Personalizado' : termModal.type === 'group' ? 'Grupo' : termModal.type === 'department' ? 'Departamento' : 'Categoria'}
                                {(termModal.type === 'group') && termScopeInfo.group.id && ` (ID: ${termScopeInfo.group.id})`}
                                {(termModal.type === 'department') && termScopeInfo.departments[0]?.numericId && ` (ID: ${termScopeInfo.departments[0].numericId})`}
                                {(termModal.type === 'category') && termScopeInfo.categories[0]?.numericId && ` (ID: ${termScopeInfo.categories[0].numericId})`}
                            </h3>
                            <button onClick={closeTermModal} className="text-slate-400 hover:text-red-500 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-3 sm:p-6 max-h-[70vh] overflow-y-auto custom-scrollbar space-y-4 sm:space-y-6">
                            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs text-slate-600">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filial</p>
                                        <p className="font-bold">Filial {data?.filial}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Grupo</p>
                                        <p className="font-bold">
                                            {termModal.type === 'custom'
                                                ? `${(termScopeInfo as any).groupLabelText || termScopeInfo.group.name} (personalizado)`
                                                : termScopeInfo.group.name}
                                            {termScopeInfo.group.id && ` (ID: ${termScopeInfo.group.id})`}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nível</p>
                                        <p className="font-bold capitalize">{termModal.type === 'custom' ? 'personalizado' : termModal.type}</p>
                                    </div>
                                </div>
                                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Departamentos</p>
                                        <p className="font-semibold">{termScopeInfo.departments.map(d => `${d.name}${d.numericId ? ` (ID: ${d.numericId})` : ''}`).join(', ') || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Categorias</p>
                                        <p className="font-semibold">{termScopeInfo.categories.map(c => `${c.name}${c.numericId ? ` (ID: ${c.numericId})` : ''}`).join(', ') || '-'}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="md:col-span-2 space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nº Inventário</label>
                                    <AuditTermInput
                                        value={termForm.inventoryNumber}
                                        onCommit={(val) => updateTermForm(prev => ({ ...prev, inventoryNumber: val }))}
                                        readOnly={!canEditTerm}
                                        className={`w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-sm text-slate-700 ${!canEditTerm ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                                    />
                                </div>
                                <div className="md:col-span-2 space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Data</label>
                                    <AuditTermInput
                                        value={termForm.date}
                                        onCommit={(val) => updateTermForm(prev => ({ ...prev, date: val }))}
                                        placeholder="DD/MM/AAAA"
                                        readOnly={!canEditTerm}
                                        className={`w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-sm text-slate-700 ${!canEditTerm ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Assinaturas dos Gestores</h4>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">A assinatura deve ser igual ao documento.</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Gestor 1</p>
                                        <div className="grid grid-cols-1 gap-2 mb-2">
                                            <AuditTermInput
                                                value={termForm.managerName2}
                                                onImmediateChange={() => clearTermFieldError('manager1_name')}
                                                onCommit={(val) => updateTermForm(prev => ({ ...prev, managerName2: val }), { skipReplication: true })}
                                                onBlurAction={(val) => validateTermFieldOnBlur('manager1_name', val)}
                                                placeholder="Nome do Gestor 1"
                                                dataField="manager1_name"
                                                readOnly={!canFillTermSignatures}
                                                className={`w-full bg-white border rounded-xl px-4 py-2 font-bold text-xs ${
                                                    termFieldErrors.manager1_name
                                                        ? 'border-red-400 bg-red-50 text-red-700 placeholder:text-red-400'
                                                        : (termTouchedFields.manager1_name && isTermFieldValid('manager1_name', termForm.managerName2)
                                                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700 placeholder:text-emerald-400'
                                                            : 'border-slate-200 text-slate-700')
                                                } ${termShakeFields.manager1_name ? 'term-field-shake' : ''} ${!canFillTermSignatures ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                                            />
                                            {termFieldErrors.manager1_name && (
                                                <p className="text-[10px] font-bold text-red-600">{termFieldErrors.manager1_name}</p>
                                            )}
                                            <AuditTermInput
                                                value={termForm.managerCpf2}
                                                onImmediateChange={() => clearTermFieldError('manager1_cpf')}
                                                onCommit={(val) => updateTermForm(prev => ({ ...prev, managerCpf2: formatCpf(val) }), { skipReplication: true })}
                                                onBlurAction={(val) => validateTermFieldOnBlur('manager1_cpf', val)}
                                                placeholder="CPF Gestor 1"
                                                dataField="manager1_cpf"
                                                maxLength={14}
                                                readOnly={!canFillTermSignatures}
                                                className={`w-full bg-white border rounded-xl px-4 py-2 font-bold text-xs ${
                                                    termFieldErrors.manager1_cpf
                                                        ? 'border-red-400 bg-red-50 text-red-700 placeholder:text-red-400'
                                                        : (termTouchedFields.manager1_cpf && isTermFieldValid('manager1_cpf', termForm.managerCpf2)
                                                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700 placeholder:text-emerald-400'
                                                            : 'border-slate-200 text-slate-700')
                                                } ${termShakeFields.manager1_cpf ? 'term-field-shake' : ''} ${!canFillTermSignatures ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                                            />
                                            {termFieldErrors.manager1_cpf && (
                                                <p className="text-[10px] font-bold text-red-600">{termFieldErrors.manager1_cpf}</p>
                                            )}
                                        </div>
                                        {termForm.managerSignature2 ? (
                                            <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-white h-40 flex items-center justify-center">
                                                <img src={termForm.managerSignature2} alt="Assinatura Gestor" className="max-h-full" />
                                                {canFillTermSignatures && (
                                                    <button
                                                        type="button"
                                                        onClick={() => updateTermForm(prev => ({ ...prev, managerSignature2: '' }))}
                                                        className="absolute top-2 right-2 bg-red-100 text-red-600 p-1 rounded hover:bg-red-200"
                                                        title="Apagar assinatura"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ) : canFillTermSignatures ? (
                                            <SignaturePad onEnd={(dataUrl) => handleSignatureComplete('managerSignature2', dataUrl)} />
                                        ) : (
                                            <div className="border border-slate-100 rounded-xl bg-slate-50 h-40 flex items-center justify-center text-slate-400 text-[10px] font-bold uppercase tracking-widest italic">Assinatura Pendente</div>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Gestor 2</p>
                                        <div className="grid grid-cols-1 gap-2 mb-2">
                                            <AuditTermInput
                                                value={termForm.managerName}
                                                onImmediateChange={() => clearTermFieldError('manager2_name')}
                                                onCommit={(val) => updateTermForm(prev => ({ ...prev, managerName: val }), { skipReplication: true })}
                                                onBlurAction={(val) => validateTermFieldOnBlur('manager2_name', val)}
                                                placeholder="Nome do Gestor 2"
                                                dataField="manager2_name"
                                                readOnly={!canFillTermSignatures}
                                                className={`w-full bg-white border rounded-xl px-4 py-2 font-bold text-xs ${
                                                    termFieldErrors.manager2_name
                                                        ? 'border-red-400 bg-red-50 text-red-700 placeholder:text-red-400'
                                                        : (termTouchedFields.manager2_name && isTermFieldValid('manager2_name', termForm.managerName)
                                                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700 placeholder:text-emerald-400'
                                                            : 'border-slate-200 text-slate-700')
                                                } ${termShakeFields.manager2_name ? 'term-field-shake' : ''} ${!canFillTermSignatures ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                                            />
                                            {termFieldErrors.manager2_name && (
                                                <p className="text-[10px] font-bold text-red-600">{termFieldErrors.manager2_name}</p>
                                            )}
                                            <AuditTermInput
                                                value={termForm.managerCpf}
                                                onImmediateChange={() => clearTermFieldError('manager2_cpf')}
                                                onCommit={(val) => updateTermForm(prev => ({ ...prev, managerCpf: formatCpf(val) }), { skipReplication: true })}
                                                onBlurAction={(val) => validateTermFieldOnBlur('manager2_cpf', val)}
                                                placeholder="CPF Gestor 2"
                                                dataField="manager2_cpf"
                                                maxLength={14}
                                                readOnly={!canFillTermSignatures}
                                                className={`w-full bg-white border rounded-xl px-4 py-2 font-bold text-xs ${
                                                    termFieldErrors.manager2_cpf
                                                        ? 'border-red-400 bg-red-50 text-red-700 placeholder:text-red-400'
                                                        : (termTouchedFields.manager2_cpf && isTermFieldValid('manager2_cpf', termForm.managerCpf)
                                                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700 placeholder:text-emerald-400'
                                                            : 'border-slate-200 text-slate-700')
                                                } ${termShakeFields.manager2_cpf ? 'term-field-shake' : ''} ${!canFillTermSignatures ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                                            />
                                            {termFieldErrors.manager2_cpf && (
                                                <p className="text-[10px] font-bold text-red-600">{termFieldErrors.manager2_cpf}</p>
                                            )}
                                        </div>
                                        {termForm.managerSignature ? (
                                            <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-white h-40 flex items-center justify-center">
                                                <img src={termForm.managerSignature} alt="Assinatura Gestor" className="max-h-full" />
                                                {canFillTermSignatures && (
                                                    <button
                                                        type="button"
                                                        onClick={() => updateTermForm(prev => ({ ...prev, managerSignature: '' }))}
                                                        className="absolute top-2 right-2 bg-red-100 text-red-600 p-1 rounded hover:bg-red-200"
                                                        title="Apagar assinatura"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ) : canFillTermSignatures ? (
                                            <SignaturePad onEnd={(dataUrl) => handleSignatureComplete('managerSignature', dataUrl)} />
                                        ) : (
                                            <div className="border border-slate-100 rounded-xl bg-slate-50 h-40 flex items-center justify-center text-slate-400 text-[10px] font-bold uppercase tracking-widest italic">Assinatura Pendente</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Colaboradores</h4>
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                    {termForm.collaborators.map((collab, idx) => {
                                        const collabNumber = idx + 1;
                                        return (
                                            <div key={idx} className="flex gap-3 items-start">
                                                <div className="mt-2 w-7 h-7 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-[10px] font-black flex items-center justify-center shrink-0">
                                                    {collabNumber}
                                                </div>
                                                <div className="flex-1 space-y-3">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <AuditTermInput
                                                            value={collab.name}
                                                            onImmediateChange={() => clearTermFieldError(`collab_${idx}_name`)}
                                                            onCommit={(val) => {
                                                                updateTermForm(prev => ({
                                                                    ...prev,
                                                                    collaborators: prev.collaborators.map((c, i) => i === idx ? { ...c, name: val } : c)
                                                                }), { skipReplication: true });
                                                            }}
                                                            onBlurAction={(val) => validateTermFieldOnBlur(`collab_${idx}_name`, val)}
                                                            placeholder={`Colaborador ${collabNumber}`}
                                                            dataField={`collab_${idx}_name`}
                                                            readOnly={!canFillTermSignatures}
                                                            className={`w-full bg-white border rounded-xl px-4 py-2 font-semibold text-xs ${
                                                                termFieldErrors[`collab_${idx}_name`]
                                                                    ? 'border-red-400 bg-red-50 text-red-700 placeholder:text-red-400'
                                                                    : (termTouchedFields[`collab_${idx}_name`] && isTermFieldValid(`collab_${idx}_name`, collab.name)
                                                                        ? 'border-emerald-400 bg-emerald-50 text-emerald-700 placeholder:text-emerald-400'
                                                                        : 'border-slate-200 text-slate-700')
                                                            } ${termShakeFields[`collab_${idx}_name`] ? 'term-field-shake' : ''} ${!canFillTermSignatures ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                                                        />
                                                        <AuditTermInput
                                                            value={collab.cpf}
                                                            onImmediateChange={() => clearTermFieldError(`collab_${idx}_cpf`)}
                                                            onCommit={(val) => {
                                                                updateTermForm(prev => ({
                                                                    ...prev,
                                                                    collaborators: prev.collaborators.map((c, i) => i === idx ? { ...c, cpf: formatCpf(val) } : c)
                                                                }), { skipReplication: true });
                                                            }}
                                                            onBlurAction={(val) => validateTermFieldOnBlur(`collab_${idx}_cpf`, val)}
                                                            placeholder={`CPF ${collabNumber}`}
                                                            dataField={`collab_${idx}_cpf`}
                                                            maxLength={14}
                                                            readOnly={!canFillTermSignatures}
                                                            className={`w-full bg-white border rounded-xl px-4 py-2 font-semibold text-xs ${
                                                                termFieldErrors[`collab_${idx}_cpf`]
                                                                    ? 'border-red-400 bg-red-50 text-red-700 placeholder:text-red-400'
                                                                    : (termTouchedFields[`collab_${idx}_cpf`] && isTermFieldValid(`collab_${idx}_cpf`, collab.cpf)
                                                                        ? 'border-emerald-400 bg-emerald-50 text-emerald-700 placeholder:text-emerald-400'
                                                                        : 'border-slate-200 text-slate-700')
                                                            } ${termShakeFields[`collab_${idx}_cpf`] ? 'term-field-shake' : ''} ${!canFillTermSignatures ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                                                        />
                                                    </div>
                                                    {(termFieldErrors[`collab_${idx}_name`] || termFieldErrors[`collab_${idx}_cpf`]) && (
                                                        <div className="space-y-1 -mt-1">
                                                            {termFieldErrors[`collab_${idx}_name`] && (
                                                                <p className="text-[10px] font-bold text-red-600">{termFieldErrors[`collab_${idx}_name`]}</p>
                                                            )}
                                                            {termFieldErrors[`collab_${idx}_cpf`] && (
                                                                <p className="text-[10px] font-bold text-red-600">{termFieldErrors[`collab_${idx}_cpf`]}</p>
                                                            )}
                                                        </div>
                                                    )}
                                                    {collab.signature ? (
                                                        <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-white h-40 flex items-center justify-center">
                                                            <img src={collab.signature} alt="Assinatura Colaborador" className="max-h-full" />
                                                            {canFillTermSignatures && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => updateTermForm(prev => ({
                                                                        ...prev,
                                                                        collaborators: prev.collaborators.map((c, i) => i === idx ? { ...c, signature: '' } : c)
                                                                    }))}
                                                                    className="absolute top-2 right-2 bg-red-100 text-red-600 p-1 rounded hover:bg-red-200"
                                                                    title="Apagar assinatura"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : canFillTermSignatures ? (
                                                        <SignaturePad
                                                            label={`Assinatura ${collabNumber}`}
                                                            onEnd={(dataUrl) => {
                                                                // Salva imediatamente para não perder ao fechar modal rapidamente.
                                                                updateTermForm(prev => ({
                                                                    ...prev,
                                                                    collaborators: prev.collaborators.map((c, i) => i === idx ? { ...c, signature: dataUrl } : c)
                                                                }));
                                                                void (async () => {
                                                                    try {
                                                                        const compressed = await ImageUtils.compressImage(dataUrl, { maxWidth: 600, quality: 0.6 });
                                                                        updateTermForm(prev => ({
                                                                            ...prev,
                                                                            collaborators: prev.collaborators.map((c, i) => {
                                                                                if (i !== idx) return c;
                                                                                return c.signature === dataUrl ? { ...c, signature: compressed } : c;
                                                                            })
                                                                        }));
                                                                    } catch {
                                                                        // Mantém dataUrl original se compress falhar.
                                                                    }
                                                                })();
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="border border-slate-100 rounded-xl bg-slate-50 h-40 flex items-center justify-center text-slate-400 text-[10px] font-bold uppercase tracking-widest italic">Assinatura Pendente</div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {canFillTermSignatures && (
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => updateTermForm(prev => ({ ...prev, collaborators: [...prev.collaborators, { name: '', cpf: '', signature: '' }] }))}
                                            className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg hover:bg-indigo-600 hover:text-white transition-all"
                                            title="Adicionar novo colaborador ao final da lista"
                                        >
                                            + Adicionar no final
                                        </button>
                                    </div>
                                )}
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">A assinatura deve ser igual ao documento.</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Todos colaboradores da Filial devem assinar.</p>
                            </div>

                            {/* Excel Comparativo do Termo */}
                            <div className="space-y-4 pt-4 border-t border-slate-100">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <Upload className="w-4 h-4 text-indigo-500" />
                                        Planilha de Divergências
                                    </h4>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gera resumo financeiro no PDF</span>
                                </div>
                                <div className={`bg-white border-2 border-dashed border-slate-200 rounded-xl p-4 text-center relative transition-colors ${!canEditTerm ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'}`}>
                                    <input
                                        type="file"
                                        accept=".xlsx, .xls"
                                        onChange={handleProcessTermComparisonExcel}
                                        className={`absolute inset-0 w-full h-full opacity-0 ${!canEditTerm ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                        title={!canEditTerm ? "Modo consulta: reabra o inventário para carregar planilha" : "Carregar Excel de Divergências"}
                                        disabled={!canEditTerm}
                                    />
                                    <div className="flex flex-col items-center gap-2">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${!canEditTerm ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-500'}`}>
                                            <Upload className="w-5 h-5" />
                                        </div>
                                        <p className="text-sm font-bold text-slate-700">Carregar Excel de Divergências</p>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{!canEditTerm ? 'Modo consulta: reabra para editar' : 'Clique ou arraste o arquivo aqui'}</p>
                                    </div>
                                </div>

                                {termDisplayMetrics && (
                                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 sm:p-4 relative animate-in fade-in slide-in-from-top-2">
                                        {(() => {
                                            const termComparisonMetrics = termDisplayMetrics;
                                            if (!termComparisonMetrics) return null;
                                            const scopeAuditedCost = (termScopeInfo?.products || []).reduce(
                                                (sum: number, p: any) => sum + ((p.quantity || 0) * (p.cost || 0)),
                                                0
                                            );
                                            const scopeAuditedQty = (termScopeInfo?.products || []).reduce(
                                                (sum: number, p: any) => sum + (p.quantity || 0),
                                                0
                                            );
                                            const adjustmentTotals = (termComparisonMetrics as any).postAuditAdjustmentTotals || { count: 0, quantity: 0, cost: 0 };
                                            const adjustedScopeAuditedQty = Number(scopeAuditedQty || 0) + Number(adjustmentTotals.quantity || 0);
                                            const adjustedScopeAuditedCost = roundAuditMoney(Number(scopeAuditedCost || 0) + Number(adjustmentTotals.cost || 0));
                                            const representativity = getFinancialRepresentativity(adjustedScopeAuditedCost, termComparisonMetrics.diffCost);
                                            return (
                                                <>
                                                    <button
                                                        onClick={removeTermComparisonExcel}
                                                        className={`absolute top-3 right-3 transition-colors ${canEditTerm ? 'text-indigo-400 hover:text-red-500' : 'text-slate-300 cursor-not-allowed'}`}
                                                        title={!canEditTerm ? "Modo consulta: reabra o inventário para remover planilha" : "Remover planilha"}
                                                        disabled={!canEditTerm}
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                    <div className="mb-3 flex flex-col gap-2 pr-7 sm:flex-row sm:items-center sm:justify-between">
                                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                                                            <h5 className="text-[10px] font-black text-indigo-800 uppercase tracking-wide sm:tracking-widest">Resumo Identificado</h5>
                                                            {Number(adjustmentTotals.count || 0) > 0 && (
                                                                <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-widest ${
                                                                    Number(adjustmentTotals.cost || 0) < 0
                                                                        ? 'bg-red-100 text-red-700'
                                                                        : 'bg-emerald-100 text-emerald-700'
                                                                }`}>
                                                                    Ajustes: {Number(adjustmentTotals.quantity || 0) > 0 ? '+' : ''}{Math.round(Number(adjustmentTotals.quantity || 0)).toLocaleString('pt-BR')} un. / {Number(adjustmentTotals.cost || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={downloadTermComparisonExcel}
                                                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-indigo-700 shadow-sm transition-all hover:bg-indigo-600 hover:text-white"
                                                            title="Baixar o Excel carregado ou reconstruído a partir dos dados salvos"
                                                        >
                                                            <Download className="w-3.5 h-3.5" />
                                                            Baixar Excel
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                                        <div className="bg-white p-3 rounded border border-slate-100">
                                                            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                                                                <div className="rounded-lg border border-slate-100 bg-slate-50 px-1.5 sm:px-2 py-2 text-center min-w-0">
                                                                    <p className="text-[8px] sm:text-[9px] font-black text-indigo-400 uppercase tracking-normal sm:tracking-widest leading-tight">Est. Sist</p>
                                                                    <p className="mt-1 text-lg sm:text-xl font-black text-slate-700 tabular-nums leading-none">{Math.round(termComparisonMetrics.sysQty).toLocaleString('pt-BR')}</p>
                                                                    <p className="text-[10px] font-bold text-slate-500">un.</p>
                                                                </div>
                                                                <div className="rounded-lg border border-slate-100 bg-slate-50 px-1.5 sm:px-2 py-2 text-center min-w-0">
                                                                    <p className="text-[8px] sm:text-[9px] font-black text-indigo-400 uppercase tracking-normal sm:tracking-widest leading-tight">Est. Físico</p>
                                                                    <p className="mt-1 text-lg sm:text-xl font-black text-slate-700 tabular-nums leading-none">{Math.round(termComparisonMetrics.countedQty).toLocaleString('pt-BR')}</p>
                                                                    <p className="text-[10px] font-bold text-slate-500">un.</p>
                                                                </div>
                                                                <div className="rounded-lg border border-slate-100 bg-slate-50 px-1.5 sm:px-2 py-2 text-center min-w-0">
                                                                    <p className="text-[8px] sm:text-[9px] font-black text-indigo-400 uppercase tracking-normal sm:tracking-widest leading-tight">Diferença</p>
                                                                    <p className={`mt-1 text-lg sm:text-xl font-black tabular-nums leading-none ${termComparisonMetrics.diffQty < 0 ? 'text-red-500' : termComparisonMetrics.diffQty > 0 ? 'text-green-500' : 'text-slate-600'}`}>
                                                                        {termComparisonMetrics.diffQty > 0 ? '+' : ''}{Math.round(termComparisonMetrics.diffQty).toLocaleString('pt-BR')}
                                                                    </p>
                                                                    <p className="text-[10px] font-bold text-slate-500">un.</p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="bg-white p-3 rounded border border-slate-100">
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2 text-center min-w-0">
                                                                    <p className="text-[8px] sm:text-[9px] font-black text-indigo-400 uppercase tracking-normal sm:tracking-widest">Custo Sist</p>
                                                                    <p className="mt-1 text-base md:text-lg font-black text-slate-700 tabular-nums leading-tight break-words">
                                                                        {termComparisonMetrics.sysCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                    </p>
                                                                </div>
                                                                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2 text-center min-w-0">
                                                                    <p className="text-[8px] sm:text-[9px] font-black text-indigo-400 uppercase tracking-normal sm:tracking-widest">Custo Físico</p>
                                                                    <p className="mt-1 text-base md:text-lg font-black text-slate-700 tabular-nums leading-tight break-words">
                                                                        {termComparisonMetrics.countedCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-2 text-center">
                                                                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Resultado Financeiro</p>
                                                                <p className={`mt-1 text-xl sm:text-2xl font-black tabular-nums leading-none break-words ${termComparisonMetrics.diffCost < 0 ? 'text-red-600' : termComparisonMetrics.diffCost > 0 ? 'text-green-600' : 'text-slate-600'}`}>
                                                                    {termComparisonMetrics.diffCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                </p>
                                                                <span className={`mt-1 inline-block text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${termComparisonMetrics.diffCost < 0 ? 'bg-red-100 text-red-600' : termComparisonMetrics.diffCost > 0 ? 'bg-green-100 text-green-600' : 'bg-slate-200 text-slate-600'}`}>
                                                                    {termComparisonMetrics.diffCost < 0 ? 'Prejuízo' : termComparisonMetrics.diffCost > 0 ? 'Sobra' : 'Zero'}
                                                                </span>
                                                                {representativity !== null && (
                                                                    <p className="mt-1 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                                        Rep. Auditada: {representativity.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="mt-3 bg-white p-3 rounded border border-slate-100">
                                                        <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">
                                                            Totais dos Itens Conferidos
                                                        </p>
                                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                            <span className="font-black text-slate-700 tabular-nums">
                                                                {Math.round(adjustedScopeAuditedQty).toLocaleString('pt-BR')} un.
                                                            </span>
                                                            <span className="font-black text-slate-700 tabular-nums break-words">
                                                                {adjustedScopeAuditedCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Quadrinho de Resumo por Categoria */}
                                                    {(() => {
                                                        if (!termComparisonMetrics.groupedDifferences || termComparisonMetrics.groupedDifferences.length === 0) return null;

                                                        const groupsMap = new Map();
                                                        const norm = (s: string) => String(s || 'DIVERSOS').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                                                        termComparisonMetrics.groupedDifferences.forEach((diff: any) => {
                                                            const gName = norm(diff.groupName);
                                                            const dName = norm(diff.deptName);
                                                            const cName = norm(diff.catName);

                                                            if (!groupsMap.has(gName)) {
                                                                groupsMap.set(gName, { name: diff.groupName || 'DIVERSOS', diffQty: 0, diffCost: 0, departments: new Map() });
                                                            }
                                                            const g = groupsMap.get(gName);
                                                            g.diffQty += diff.diffQty || 0;
                                                            g.diffCost += diff.diffCost || 0;

                                                            if (!g.departments.has(dName)) {
                                                                g.departments.set(dName, { name: diff.deptName || 'DIVERSOS', diffQty: 0, diffCost: 0, categories: new Map() });
                                                            }
                                                            const d = g.departments.get(dName);
                                                            d.diffQty += diff.diffQty || 0;
                                                            d.diffCost += diff.diffCost || 0;

                                                            if (!d.categories.has(cName)) {
                                                                d.categories.set(cName, { name: diff.catName || 'DIVERSOS', diffQty: 0, diffCost: 0 });
                                                            }
                                                            const c = d.categories.get(cName);
                                                            c.diffQty += diff.diffQty || 0;
                                                            c.diffCost += diff.diffCost || 0;
                                                        });

                                                        const nested = Array.from(groupsMap.values()).map(g => ({
                                                            ...g,
                                                            departments: Array.from(g.departments.values())
                                                                .map((d: any) => ({
                                                                    ...d,
                                                                    categories: Array.from(d.categories.values()).filter((c: any) =>
                                                                        Math.abs(c.diffQty) > 0.01 || Math.abs(c.diffCost) > 0.01
                                                                    )
                                                                }))
                                                                .filter((d: any) => d.categories.length > 0)
                                                        })).filter(g => g.departments.length > 0);

                                                        if (nested.length === 0) return null;

                                                        return (
                                                            <div className="mt-4 pt-4 border-t border-indigo-100">
                                                                <h6 className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                                                    <Boxes className="w-3.5 h-3.5" />
                                                                    Resumo de Prejuízo por Categoria
                                                                </h6>
                                                                <div className="space-y-3 sm:space-y-4 max-h-[50vh] sm:max-h-[400px] overflow-y-auto custom-scrollbar pr-1 sm:pr-2">
                                                                    {nested.map((group: any, gIdx: number) => (
                                                                        <div key={gIdx} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                                                                            {/* GROUP HEADER */}
                                                                            <div className="p-2.5 sm:p-3 bg-indigo-50/50 border-b border-indigo-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                                                <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
                                                                                    <div className="w-8 h-8 rounded-xl bg-white border border-indigo-100 flex items-center justify-center shadow-sm">
                                                                                        <Boxes className="w-4 h-4 text-indigo-600" />
                                                                                    </div>
                                                                                    <div className="min-w-0">
                                                                                        <h3 className="text-[10px] sm:text-[11px] font-black text-indigo-900 uppercase italic tracking-normal sm:tracking-wider break-words">{group.name}</h3>
                                                                                        <p className="text-[8px] font-bold text-indigo-400 uppercase tracking-wide sm:tracking-widest mt-0.5">Grupo</p>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="self-stretch sm:self-auto w-full sm:w-auto grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3 text-right">
                                                                                    <div className="min-w-0">
                                                                                        <p className="text-[7px] font-black text-indigo-400 uppercase tracking-wide sm:tracking-widest">Dif. Qtd</p>
                                                                                        <p className={`font-bold text-[10px] ${group.diffQty < 0 ? 'text-red-500' : group.diffQty > 0 ? 'text-green-500' : 'text-slate-500'}`}>{group.diffQty > 0 ? '+' : ''}{Math.round(group.diffQty).toLocaleString('pt-BR')} un.</p>
                                                                                    </div>
                                                                                    <div className="border-l border-indigo-100 pl-2 sm:pl-3 min-w-0">
                                                                                        <p className="text-[7px] font-black text-indigo-400 uppercase tracking-wide sm:tracking-widest">Finanças</p>
                                                                                        <p className={`font-black text-xs ${group.diffCost < 0 ? 'text-red-600' : group.diffCost > 0 ? 'text-green-600' : 'text-slate-600'}`}>{group.diffCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            {/* DEPARTMENTS */}
                                                                            <div className="p-3 space-y-3 bg-slate-50/50">
                                                                                {group.departments.map((dept: any, dIdx: number) => (
                                                                                    <div key={dIdx} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                                                                        <div className="p-2.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                                                            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                                                                                                <div className="w-6 h-6 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
                                                                                                    <FileBox className="w-3 h-3 text-slate-500" />
                                                                                                </div>
                                                                                                <div className="min-w-0">
                                                                                                    <h4 className="text-[10px] font-black text-indigo-700 uppercase italic tracking-wide sm:tracking-widest break-words">{dept.name}</h4>
                                                                                                    <p className="text-[7px] font-bold text-slate-400 uppercase tracking-wide sm:tracking-widest">Departamento</p>
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="self-stretch sm:self-auto w-full sm:w-auto grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3 text-right">
                                                                                                <div className="min-w-0">
                                                                                                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-wide sm:tracking-widest">Dif. Qtd</p>
                                                                                                    <p className={`font-bold text-[9px] ${dept.diffQty < 0 ? 'text-red-500' : dept.diffQty > 0 ? 'text-green-500' : 'text-slate-500'}`}>{dept.diffQty > 0 ? '+' : ''}{Math.round(dept.diffQty).toLocaleString('pt-BR')} un.</p>
                                                                                                </div>
                                                                                                <div className="border-l border-slate-100 pl-2 sm:pl-3 min-w-0 sm:w-20">
                                                                                                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-wide sm:tracking-widest">Finanças</p>
                                                                                                    <p className={`font-black text-[11px] ${dept.diffCost < 0 ? 'text-red-600' : dept.diffCost > 0 ? 'text-green-600' : 'text-slate-600'}`}>{dept.diffCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>

                                                                                        {/* CATEGORIES */}
                                                                                        <div className="p-2 bg-[#f8fafc] grid grid-cols-1 gap-1.5">
                                                                                            {dept.categories.map((cat: any, cIdx: number) => {
                                                                                                const catItems = (termComparisonMetrics?.items || []).filter(
                                                                                                    (item: any) =>
                                                                                                        norm(item.catName) === norm(cat.name) &&
                                                                                                        norm(item.deptName) === norm(dept.name)
                                                                                                ).sort((a: any, b: any) => a.diffCost - b.diffCost);
                                                                                                const catKey = `${dept.name}|${cat.name}`;
                                                                                                return (
                                                                                                    <div key={cIdx} className="rounded-lg overflow-hidden border border-[#dcfce7]">
                                                                                                        {/* Category header - clickable */}
                                                                                                        <button
                                                                                                            onClick={() => setExpandedCatKeys(prev => {
                                                                                                                const next = new Set(prev);
                                                                                                                if (next.has(catKey)) next.delete(catKey);
                                                                                                                else next.add(catKey);
                                                                                                                return next;
                                                                                                            })}
                                                                                                            className="w-full bg-[#F0FDF4] p-2 flex items-center justify-between transition-colors hover:bg-[#dcfce7] cursor-pointer"
                                                                                                        >
                                                                                                            <div className="flex items-center gap-2">
                                                                                                                <Activity className="w-3 h-3 text-[#059669]" />
                                                                                                                <span className="text-[9px] font-black text-[#065f46] uppercase italic tracking-widest">{cat.name}</span>
                                                                                                                {catItems.length > 0 && (
                                                                                                                    <span className="bg-indigo-100 text-indigo-600 text-[7px] font-black px-1 py-0.5 rounded-full">
                                                                                                                        {catItems.length}
                                                                                                                    </span>
                                                                                                                )}
                                                                                                            </div>
                                                                                                            <div className="flex items-center gap-3 text-right">
                                                                                                                <div className="min-w-[45px]">
                                                                                                                    <span className={`text-[9px] font-bold ${cat.diffQty < 0 ? 'text-red-600' : cat.diffQty > 0 ? 'text-[#16a34a]' : 'text-[#166534]/70'}`}>
                                                                                                                        {cat.diffQty > 0 ? '+' : ''}{Math.round(cat.diffQty).toLocaleString('pt-BR')} un.
                                                                                                                    </span>
                                                                                                                </div>
                                                                                                                <div className="min-w-[65px]">
                                                                                                                    <span className={`text-[10px] font-black ${cat.diffCost < 0 ? 'text-red-600' : cat.diffCost > 0 ? 'text-[#16a34a]' : 'text-[#166534]/80'}`}>
                                                                                                                        {cat.diffCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                                                                    </span>
                                                                                                                </div>
                                                                                                                <ChevronRight className={`w-3 h-3 text-slate-400 transition-transform ${expandedCatKeys.has(catKey) ? 'rotate-90' : ''}`} />
                                                                                                            </div>
                                                                                                        </button>

                                                                                                        {/* Expanded item list */}
                                                                                                        {expandedCatKeys.has(catKey) && catItems.length > 0 && (
                                                                                                            <div className="bg-white border-t border-[#dcfce7]">
                                                                                                                <table className="w-full text-[8px]">
                                                                                                                    <thead>
                                                                                                                        <tr className="bg-slate-50 border-b border-slate-100">
                                                                                                                            <th className="text-left p-1.5 font-black text-slate-500 uppercase tracking-widest">Cód</th>
                                                                                                                            <th className="text-left p-1.5 font-black text-slate-500 uppercase tracking-widest">Descrição</th>
                                                                                                                            <th className="text-right p-1.5 font-black text-slate-500 uppercase">Sist.</th>
                                                                                                                            <th className="text-right p-1.5 font-black text-slate-500 uppercase">Fís.</th>
                                                                                                                            <th className="text-right p-1.5 font-black text-slate-500 uppercase">Dif.</th>
                                                                                                                            <th className="text-right p-1.5 font-black text-slate-500 uppercase">R$</th>
                                                                                                                        </tr>
                                                                                                                    </thead>
                                                                                                                    <tbody>
                                                                                                                        {catItems.map((item: any, iIdx: number) => (
                                                                                                                            <tr key={iIdx} className={`border-b border-slate-50 ${item.diffQty < 0 ? 'bg-red-50/40' : item.diffQty > 0 ? 'bg-green-50/40' : ''}`}>
                                                                                                                                <td className="p-1.5 font-black text-slate-600 tabular-nums">{item.code}</td>
                                                                                                                                <td className="p-1.5 text-slate-700 max-w-[120px] truncate" title={item.description}>{item.description}</td>
                                                                                                                                <td className="p-1.5 text-right text-slate-500 tabular-nums">{Math.round(item.sysQty)}</td>
                                                                                                                                <td className="p-1.5 text-right text-slate-500 tabular-nums">{Math.round(item.countedQty)}</td>
                                                                                                                                <td className={`p-1.5 text-right font-black tabular-nums ${item.diffQty < 0 ? 'text-red-600' : item.diffQty > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                                                                                                                                    {item.diffQty > 0 ? '+' : ''}{Math.round(item.diffQty)}
                                                                                                                                </td>
                                                                                                                                <td className={`p-1.5 text-right font-black tabular-nums ${item.diffCost < 0 ? 'text-red-600' : item.diffCost > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                                                                                                                                    {item.diffCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                                                                                </td>
                                                                                                                            </tr>
                                                                                                                        ))}
                                                                                                                    </tbody>
                                                                                                                </table>
                                                                                                            </div>
                                                                                                        )}
                                                                                                        {expandedCatKeys.has(catKey) && catItems.length === 0 && (
                                                                                                            <div className="p-2 bg-slate-50 text-center text-[8px] text-slate-400 font-bold">
                                                                                                                Nenhum item encontrado nesta categoria
                                                                                                            </div>
                                                                                                        )}
                                                                                                    </div>
                                                                                                );
                                                                                            })}

                                                                                        </div>
                                                                                        {/* Lista de códigos reduzidos para DIVERSOS */}
                                                                                        {dept.name === 'DIVERSOS (SEM DEPARTAMENTO)' && (() => {
                                                                                            const diversosItems = (termComparisonMetrics?.items || []).filter(
                                                                                                (item: any) =>
                                                                                                    item.deptName === 'DIVERSOS (SEM DEPARTAMENTO)' &&
                                                                                                    (Math.abs(item.diffQty) > 0.01 || Math.abs(item.diffCost) > 0.01)
                                                                                            );
                                                                                            if (diversosItems.length === 0) return null;
                                                                                            return (
                                                                                                <div className="p-2 border-t border-amber-100 bg-amber-50">
                                                                                                    <p className="text-[8px] font-black text-amber-700 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                                                                                        <Search className="w-2.5 h-2.5" />
                                                                                                        Itens sem categoria vinculada (Cód. Reduzido)
                                                                                                    </p>
                                                                                                    <div className="flex flex-wrap gap-1">
                                                                                                        {diversosItems.map((item: any, idx: number) => (
                                                                                                            <span key={idx} className="bg-white border border-amber-200 text-amber-800 text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-sm" title={item.description}>
                                                                                                                {item.code}
                                                                                                            </span>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                </div>
                                                                                            );
                                                                                        })()}
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    ))
                                                                    }
                                                                </div>
                                                            </div>
                                                        )
                                                    })()}
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="p-3 sm:p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                Produtos no termo: {termScopeInfo.products.length}
                            </span>
                            <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
                                <button
                                    onClick={handleSaveTermDraft}
                                    disabled={isSavingTerm || isReadOnlyCompletedView}
                                    className={`w-full sm:w-auto px-6 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 ${
                                        showSavedFeedback 
                                            ? 'bg-emerald-600 text-white' 
                                            : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300'
                                    }`}
                                >
                                    {isSavingTerm ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Salvando...
                                        </>
                                    ) : showSavedFeedback ? (
                                        <>
                                            <Check className="w-4 h-4" />
                                            Dados Salvos!
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4" />
                                            Salvar Dados
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => handlePrintTerm({ divergencesOnly: true })}
                                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-amber-600 text-white font-black text-[11px] uppercase tracking-widest hover:bg-amber-500 transition-all shadow-md"
                                >
                                    Imprimir Só Divergências
                                </button>
                                <button
                                    onClick={() => handlePrintTerm()}
                                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-md"
                                >
                                    Imprimir Termo Completo
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )
            }

            <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f8fafc; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 12px; border: 3px solid #f8fafc; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .mobile-metric-number { font-variant-numeric: tabular-nums; }
        @media (max-width: 640px) {
          .mobile-metric-number {
            display: inline-block;
            min-width: 8ch;
            text-align: right;
            white-space: normal;
          }
        }
        .term-field-shake { animation: termFieldShake 0.35s ease-in-out; }
        @keyframes termFieldShake {
          0% { transform: translateX(0); }
          20% { transform: translateX(-5px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
          100% { transform: translateX(0); }
        }
      `}</style>
        </div >
    );
};

export default AuditModule;

