import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Camera, FileText, CheckSquare, Printer, Clipboard, ClipboardList, Image as ImageIcon, Trash2, Menu, X, ChevronRight, Download, Star, AlertTriangle, CheckCircle, AlertCircle, LayoutDashboard, FileCheck, Settings, LogOut, Users, Palette, Upload, UserPlus, History, RotateCcw, Save, Search, Eye, EyeOff, Phone, User as UserIcon, Ban, Check, Filter, UserX, Undo2, CheckSquare as CheckSquareIcon, Trophy, Frown, PartyPopper, Lock, Loader2, Building2, MapPin, Store, MessageSquare, Send, ThumbsUp, ThumbsDown, Clock, CheckCheck, Lightbulb, MessageSquareQuote, Package, ArrowRight, ArrowLeft, ShieldCheck, HelpCircle, Info, LayoutGrid, UserCircle, FileSearch, ChevronDown, Calendar, RefreshCw, UserCircle2, Plus, SearchX, WifiOff, LineChart } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CHECKLISTS as BASE_CHECKLISTS, THEMES, ACCESS_MODULES, ACCESS_LEVELS, INPUT_TYPE_LABELS, generateId } from './constants';
import { ChecklistData, ChecklistImages, InputType, ChecklistSection, ChecklistDefinition, ChecklistItem, ThemeColor, AppConfig, User, ReportHistoryItem, StockConferenceHistoryItem, CompanyArea, AccessLevelId, AccessModule, AccessLevelMeta, UserRole, StockConferenceSummary } from './types';
import AuditModule from './components/auditoria/AuditModule';
import SignaturePad from './components/SignaturePad';
import { StockConference } from './components/StockConference';
import { supabase } from './supabaseClient';
import * as SupabaseService from './supabaseService';
import { updateCompany, saveConfig, fetchTickets, createTicket, updateTicketStatus, createCompany, DbTicket } from './supabaseService';
import { Topbar } from './components/Layout/Topbar';
import { Header } from './components/Layout/Header';
import { Logo, MFLogo, LogoPrint } from './components/Layout/Logo';
import { AppStorage } from './src/appStorage';
import { CacheService } from './src/cacheService';
import { ImageUtils } from './src/utils/imageUtils';
import { CadastrosBaseService } from './src/cadastrosBase/cadastrosBaseService';
import { PRE_VENCIDOS_MODULE_ENABLED } from './src/featureFlags';


const mergeAccessMatrixWithDefaults = (incoming: Partial<Record<AccessLevelId, Record<string, boolean>>>) => {
    const merged: Record<AccessLevelId, Record<string, boolean>> = {} as any;
    ACCESS_LEVELS.forEach(level => {
        const layer = incoming[level.id] || {};
        merged[level.id] = ACCESS_MODULES.reduce((acc, module) => {
            acc[module.id] = level.id === 'MASTER'
                ? true
                : (typeof layer[module.id] === 'boolean' ? layer[module.id] : false);
            return acc;
        }, {} as Record<string, boolean>);
    });
    return merged;
};

const createInitialAccessMatrix = () => mergeAccessMatrixWithDefaults({});

const sanitizeStockBranch = (branch?: string) => branch?.trim() || 'Filial não informada';
const sanitizeStockArea = (area?: string) => area?.trim() || 'Área não informada';
const BRANCH_REVALIDATION_DAYS = 60;
const BRANCH_CONFIRM_EVENT_TYPE = 'branch_check_confirmed';
const MISSING_BRANCH_TOKENS = new Set([
    '',
    '-',
    'sem filial',
    'sem_filial',
    'filial não informada',
    'null',
    'undefined',
    'n/a',
    'na'
]);

const isMissingBranchValue = (branch?: string | null) => {
    const normalized = String(branch ?? '').trim().toLowerCase();
    return MISSING_BRANCH_TOKENS.has(normalized);
};

const EVENT_TYPE_LABELS: Record<string, string> = {
    app_view_enter: 'Entrada no app',
    app_view_exit: 'Saída do app',
    checklist_started: 'Checklist iniciado',
    checklist_report_saved: 'Checklist salvo',
    checklist_printed: 'Checklist impresso',
    checklist_image_added: 'Imagem adicionada ao checklist',
    pv_created: 'PV criado',
    pv_updated: 'PV atualizado',
    pv_deleted: 'PV excluído',
    pv_sales_upload_success: 'Upload de vendas (sucesso)',
    pv_sales_upload_error: 'Upload de vendas (erro)',
    pv_inventory_upload_success: 'Upload de estoque (sucesso)',
    pv_inventory_upload_error: 'Upload de estoque (erro)',
    pv_analysis_printed: 'Impressão análise de vendas',
    pv_dashboard_finalized: 'Dashboard PV finalizado',
    pv_dashboard_cleared: 'Dashboard PV limpo',
    pv_dashboard_preview: 'Simulação ranking PV',
    pv_dashboard_printed: 'Impressão ranking PV',
    pv_dashboard_downloaded: 'Download ranking PV',
    pv_registration_printed: 'Cadastro PV impresso',
    stock_conference_started: 'Conferência iniciada',
    stock_conference_restarted: 'Conferência reiniciada',
    stock_conference_finished: 'Conferência finalizada',
    stock_conference_printed: 'Conferência impressa',
    stock_conference_export_csv: 'Conferência exportada (CSV)',
    stock_item_count_updated: 'Item conferência atualizado',
    audit_partial_start: 'Auditoria parcial iniciada',
    audit_partial_pause: 'Auditoria parcial pausada',
    audit_partial_finalize: 'Auditoria parcial concluída',
    audit_term_printed: 'Termo de auditoria impresso',
    audit_report_printed: 'Relatório analítico impresso',
    ticket_created: 'Ticket criado',
    user_created: 'Usuário criado',
    user_updated: 'Usuário atualizado',
    user_approved: 'Usuário aprovado',
    user_blocked: 'Usuário bloqueado',
    company_updated: 'Empresa atualizada',
    company_created: 'Empresa criada',
    login: 'Login',
    login_auto: 'Login automático (recarregamento)',
    logout: 'Logout',
    branch_check_confirmed: 'Confirmação de filial',
    branch_changed_on_login: 'Filial alterada no login',
    global_base_uploaded: 'Arquivo base global carregado'
};

const mapViewToAppName = (view: string) => {
    const map: Record<string, string> = {
        checklist: 'checklists',
        summary: 'visao_geral',
        dashboard: 'dashboard',
        report: 'relatorio',
        settings: 'configuracoes',
        history: 'historico',
        view_history: 'historico',
        support: 'suporte',
        stock: 'conferencia',
        access: 'acessos',
        pre: 'pre_vencidos',
        audit: 'auditoria',
        logs: 'metricas_gerenciais',
        cadastros_globais: 'cadastros_globais'
    };
    return map[view] || view;
};

const EVENT_TYPE_GROUPS: Record<string, string> = {
    app_view_enter: 'Sistema',
    app_view_exit: 'Sistema',
    login: 'Sistema',
    login_auto: 'Sistema',
    logout: 'Sistema',
    branch_check_confirmed: 'Sistema',
    branch_changed_on_login: 'Sistema',
    global_base_uploaded: 'Cadastros Globais',
    checklist_started: 'Checklists',
    checklist_report_saved: 'Checklists',
    checklist_printed: 'Checklists',
    checklist_image_added: 'Checklists',
    pv_created: 'Pré‑Vencidos',
    pv_updated: 'Pré‑Vencidos',
    pv_deleted: 'Pré‑Vencidos',
    pv_sales_upload_success: 'Pré‑Vencidos',
    pv_sales_upload_error: 'Pré‑Vencidos',
    pv_inventory_upload_success: 'Pré‑Vencidos',
    pv_inventory_upload_error: 'Pré‑Vencidos',
    pv_analysis_printed: 'Pré‑Vencidos',
    pv_dashboard_finalized: 'Pré‑Vencidos',
    pv_dashboard_cleared: 'Pré‑Vencidos',
    pv_dashboard_preview: 'Pré‑Vencidos',
    pv_dashboard_printed: 'Pré‑Vencidos',
    pv_dashboard_downloaded: 'Pré‑Vencidos',
    pv_registration_printed: 'Pré‑Vencidos',
    stock_conference_started: 'Conferência',
    stock_conference_restarted: 'Conferência',
    stock_conference_finished: 'Conferência',
    stock_conference_printed: 'Conferência',
    stock_conference_export_csv: 'Conferência',
    stock_item_count_updated: 'Conferência',
    audit_partial_start: 'Auditoria',
    audit_partial_pause: 'Auditoria',
    audit_partial_finalize: 'Auditoria',
    audit_term_printed: 'Auditoria',
    audit_report_printed: 'Auditoria',
    ticket_created: 'Suporte',
    user_created: 'Configurações',
    user_updated: 'Configurações',
    user_approved: 'Configurações',
    user_blocked: 'Configurações',
    company_updated: 'Configurações',
    company_created: 'Configurações'
};

const formatEventTypeLabel = (type?: string | null) => {
    const key = String(type || '').trim();
    const label = EVENT_TYPE_LABELS[key] || key || '-';
    const group = EVENT_TYPE_GROUPS[key];
    return group ? `${group}: ${label}` : label;
};

const extractEventLocation = (log: SupabaseService.DbAppEventLog) => {
    const meta = (() => {
        if (!log.event_meta) return {};
        if (typeof log.event_meta === 'string') {
            try {
                return JSON.parse(log.event_meta);
            } catch {
                return {};
            }
        }
        return log.event_meta as Record<string, any>;
    })();
    return meta.url || meta.location || meta.source || log.source || '-';
};

type GlobalBaseModuleSlot = {
    key: string;
    label: string;
    description: string;
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

const GLOBAL_BASE_MODULE_SLOTS: GlobalBaseModuleSlot[] = [
    { key: 'shared_cadastro_produtos', label: 'Cadastro Produtos (Global)', description: 'Base principal para Pré‑Vencidos e Conferência.' },
    { key: 'audit_cadastro_2000', label: 'Auditoria Cadastro 2000', description: 'Arquivo fixo de cadastro grupo 2000.' },
    { key: 'audit_cadastro_3000', label: 'Auditoria Cadastro 3000', description: 'Arquivo fixo de cadastro grupo 3000.' },
    { key: 'audit_cadastro_4000', label: 'Auditoria Cadastro 4000', description: 'Arquivo fixo de cadastro grupo 4000.' },
    { key: 'audit_cadastro_8000', label: 'Auditoria Cadastro 8000', description: 'Arquivo fixo de cadastro grupo 8000.' },
    { key: 'audit_cadastro_10000', label: 'Auditoria Cadastro 10000', description: 'Arquivo fixo de cadastro grupo 10000.' },
    { key: 'audit_cadastro_66', label: 'Auditoria Cadastro 66', description: 'Arquivo fixo de cadastro grupo 66.' },
    { key: 'audit_cadastro_67', label: 'Auditoria Cadastro 67', description: 'Arquivo fixo de cadastro grupo 67.' },
    { key: 'audit_ids_departamento', label: 'Auditoria IDs Departamento', description: 'Relacionamento de departamentos para auditoria.' },
    { key: 'audit_ids_categoria', label: 'Auditoria IDs Categoria', description: 'Relacionamento de categorias para auditoria.' }
];

const RESULT_ANALYSIS_SLOTS: GlobalBaseModuleSlot[] = [
    { key: 'analysis_vendas_totais', label: 'Vendas totais produtos por filial', description: 'Arquivo base de vendas totais para análise.' },
    { key: 'analysis_pedidos', label: 'Pedidos', description: 'Arquivo base de pedidos para análise.' }
];

const PreVencidosManager = PRE_VENCIDOS_MODULE_ENABLED
    ? React.lazy(() => import('./components/preVencidos/PreVencidosManager'))
    : null;

const AnaliseDashboard = React.lazy(() => import('./components/AnaliseResultados/AnaliseDashboard'));

const canonicalizeFilterLabel = (value: string) => {
    const normalized = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
    return normalized.replace(/\d+/g, digits => {
        const parsed = Number(digits);
        return Number.isNaN(parsed) ? digits : parsed.toString();
    });
};

const normalizeFilterKey = (value: string) => canonicalizeFilterLabel(value).toLowerCase();
const isMobileLayout = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;

/**
 * Normaliza nomes de filiais para uma forma canônica.
 * "8" → "Filial 8", "14" → "Filial 14", " Filial 8 " → "Filial 8"
 * Valores como "Sem Filial" permanecem intocados.
 */
const normalizeBranchLabel = (raw: string | null | undefined): string => {
    if (!raw || !String(raw).trim()) return 'Sem Filial';
    const s = String(raw).trim();
    // Se for puramente numérico (ex: "8", "14"), prefixar com "Filial "
    if (/^\d+$/.test(s)) return `Filial ${s}`;
    // Normaliza espaços extras
    return s.replace(/\s+/g, ' ');
};

const buildBranchQueryVariants = (raw: string | null | undefined): string[] => {
    const base = String(raw || '').trim();
    if (!base) return [];

    const normalized = normalizeBranchLabel(base);
    const variants = new Set<string>([base, normalized]);
    const digits = base.match(/\d+/g)?.join('') || normalized.match(/\d+/g)?.join('') || '';

    if (digits) {
        variants.add(digits);
        variants.add(`Filial ${digits}`);
    }

    return Array.from(variants).map(v => v.trim()).filter(Boolean);
};

const normalizeAuditCategoryStatus = (status: unknown): 'done' | 'in_progress' | 'todo' => {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'concluido' || normalized === 'done') return 'done';
    if (normalized === 'iniciado' || normalized === 'in_progress') return 'in_progress';
    return 'todo';
};

const formatBranchFilterLabel = (value: string) => {
    const canonical = canonicalizeFilterLabel(value);
    return canonical.replace(/\d+/g, digits => digits.padStart(2, '0')).toUpperCase();
};

const sanitizeReportBranch = (report: ReportHistoryItem) => {
    const branchCandidate = report.formData['gerencial']?.filial;
    if (typeof branchCandidate === 'string' && branchCandidate.trim()) return branchCandidate.trim();
    const empresaCandidate = report.formData['gerencial']?.empresa;
    if (typeof empresaCandidate === 'string' && empresaCandidate.trim()) return empresaCandidate.trim();
    if (report.pharmacyName) return report.pharmacyName;
    return 'Filial não informada';
};

const sanitizeReportArea = (report: ReportHistoryItem) => {
    const areaCandidate = report.formData['gerencial']?.area;
    if (typeof areaCandidate === 'string' && areaCandidate.trim()) return areaCandidate.trim();
    return 'Área não informada';
};

const parseJsonValue = <T,>(value: any): T | null => {
    if (!value) return null;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) as T;
        } catch {
            return null;
        }
    }
    return value as T;
};

const formatDurationMs = (ms: number) => {
    if (!ms || ms <= 0) return null;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ');
};

const formatFullDateTime = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const datePart = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timePart = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return datePart + ' às ' + timePart;
};

const formatFileSize = (bytes?: number | null) => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
};

const mapStockConferenceReports = (reports: SupabaseService.DbStockConferenceReport[]): StockConferenceHistoryItem[] => {
    return reports.map(rep => {
        const parsedSummary = parseJsonValue<StockConferenceSummary>((rep as any).summary) || rep.summary || { total: 0, matched: 0, divergent: 0, pending: 0, percent: 0 };
        const summary: StockConferenceSummary = parsedSummary || { total: 0, matched: 0, divergent: 0, pending: 0, percent: 0 };
        const branchName = sanitizeStockBranch(rep.branch);
        const areaName = sanitizeStockArea(rep.area);
        const summarySignatures = parseJsonValue<{ pharmacist?: string | null; manager?: string | null }>(summary.signatures) || {};
        const rootSignatures = parseJsonValue<{ pharmacist?: string | null; manager?: string | null }>((rep as any).signatures) || {};
        const startTime = summary.startedAt || summary.started_at || null;
        const endTime = summary.endedAt || summary.ended_at || null;
        const durationMs = summary.durationMs ?? summary.duration_ms ?? null;

        return {
            id: rep.id || `${rep.user_email}_${rep.created_at || Date.now()}`,
            userEmail: rep.user_email,
            userName: rep.user_name,
            branch: branchName,
            area: areaName,
            pharmacist: rep.pharmacist,
            manager: rep.manager,
            total: summary.total,
            matched: summary.matched,
            divergent: summary.divergent,
            pending: summary.pending,
            percent: summary.percent,
            pharmacistSignature: summarySignatures.pharmacist || rootSignatures.pharmacist || null,
            managerSignature: summarySignatures.manager || rootSignatures.manager || null,
            startTime,
            endTime,
            durationMs,
            createdAt: rep.created_at || new Date().toISOString()
        };
    });
};

const mapDbReportToHistoryItem = (r: SupabaseService.DbReport): ReportHistoryItem => {
    // 1. Safe JSON Parsing
    let formData = r.form_data;
    if (typeof formData === 'string') {
        try {
            formData = JSON.parse(formData);
        } catch (e) {
            console.error("Error parsing form_data JSON:", e);
            formData = {};
        }
    }
    formData = formData || {};

    // 2. Robust Extraction Logic
    // Try to find ANY checklist that has the basic info
    let foundInfo = { empresa: '', area: '', filial: '', gestor: '' };

    // Check 'gerencial' first as primary source
    if (formData['gerencial']?.empresa) {
        foundInfo = {
            empresa: String(formData['gerencial'].empresa),
            area: String(formData['gerencial'].area || ''),
            filial: String(formData['gerencial'].filial || ''),
            gestor: String(formData['gerencial'].gestor || '')
        };
    } else {
        // Fallback: search all other checklists for ANY valid data
        // We prioritize checklists that have BOTH empresa and filial
        let bestMatch = null;

        for (const clId of Object.keys(formData)) {
            const data = formData[clId];
            if (data && typeof data === 'object' && data.empresa) {
                const candidate = {
                    empresa: String(data.empresa),
                    area: String(data.area || ''),
                    filial: String(data.filial || ''),
                    gestor: String(data.gestor || '')
                };

                // If we found a candidate with a filial, it's a strong match, stop looking
                if (candidate.filial) {
                    bestMatch = candidate;
                    break;
                }

                // Otherwise keep it as a backup
                if (!bestMatch) {
                    bestMatch = candidate;
                }
            }
        }

        if (bestMatch) {
            foundInfo = bestMatch;
        }
    }

    // Special handling for legacy data or partial failures
    // If we have filial but missing area/empresa, we could theoretically look it up from config,
    // but for now let's trust the report data or the fallback found.

    return {
        id: r.id || Date.now().toString(),
        userEmail: r.user_email,
        userName: r.user_name,
        date: r.created_at || new Date().toISOString(),
        pharmacyName: r.pharmacy_name,
        score: r.score,
        formData: formData,
        images: r.images || {},
        signatures: r.signatures || {},
        ignoredChecklists: r.ignored_checklists || [],
        empresa_avaliada: String(foundInfo.empresa || 'Sem Empresa'),
        companyName: String(foundInfo.empresa || 'Sem Empresa'),
        area: String(foundInfo.area || 'N/A'),
        filial: String(foundInfo.filial || r.pharmacy_name || 'Sem Filial'),
        gestor: String(foundInfo.gestor || 'N/A'),
        createdAt: r.created_at || new Date().toISOString()
    };
};

type StockReportItem = SupabaseService.DbStockConferenceReport['items'][number];

type EnhancedStockConferenceReport = SupabaseService.DbStockConferenceReport & {
    pharmacistSignature?: string | null;
    managerSignature?: string | null;
};

interface StockConferenceReportViewerProps {
    report: EnhancedStockConferenceReport;
    onClose: () => void;
    currentUser?: User | null;
}

const StockConferenceReportViewer = ({ report, onClose, currentUser }: StockConferenceReportViewerProps) => {
    const items = report.items || [];
    const parsedSummary = parseJsonValue<StockConferenceSummary>((report as any).summary) || report.summary || { total: items.length, matched: 0, divergent: 0, pending: 0, percent: 0 };
    const summary: StockConferenceSummary = parsedSummary;
    const createdAt = report.created_at ? new Date(report.created_at) : new Date();
    const rootSignatures = parseJsonValue<{ pharmacist?: string | null; manager?: string | null }>((report as any).signatures) || {};
    const signatureData = parseJsonValue<{ pharmacist?: string | null; manager?: string | null }>(summary.signatures) || rootSignatures;
    const pharmacistSignature = report.pharmacistSignature || signatureData.pharmacist || null;
    const managerSignature = report.managerSignature || signatureData.manager || null;
    const startTimestamp = summary.startedAt || summary.started_at || null;
    const endTimestamp = summary.endedAt || summary.ended_at || null;
    let durationMs = summary.durationMs ?? summary.duration_ms ?? null;
    if (
        (durationMs === null || durationMs === undefined) &&
        startTimestamp &&
        endTimestamp
    ) {
        const startDate = new Date(startTimestamp);
        const endDate = new Date(endTimestamp);
        if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
            durationMs = Math.max(0, endDate.getTime() - startDate.getTime());
        }
    }
    const durationLabel = formatDurationMs(durationMs ?? 0) || '0s';
    const startLabel = formatFullDateTime(startTimestamp);
    const endLabel = formatFullDateTime(endTimestamp);
    const recordedAtLabel = formatFullDateTime(createdAt.toISOString());
    const statusLabelText: Record<'divergent' | 'pending' | 'matched', string> = {
        matched: 'Correto',
        divergent: 'Divergente',
        pending: 'Pendente'
    };
    const summaryTotals = {
        total: summary.total ?? items.length,
        matched: summary.matched ?? 0,
        divergent: summary.divergent ?? 0,
        pending: summary.pending ?? 0,
        percent: summary.percent ?? 0
    };

    const statusOrder: Record<'divergent' | 'pending' | 'matched', number> = {
        divergent: 0,
        pending: 1,
        matched: 2
    };

    const sortedItems = [...items].sort((a, b) => {
        const aOrder = statusOrder[(a.status || 'pending') as 'divergent' | 'pending' | 'matched'] ?? 3;
        const bOrder = statusOrder[(b.status || 'pending') as 'divergent' | 'pending' | 'matched'] ?? 3;
        return aOrder - bOrder;
    });

    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKey);
        return () => {
            window.removeEventListener('keydown', handleKey);
            document.body.style.overflow = previousOverflow;
        };
    }, [onClose]);

    const exportCSV = () => {
        try {
            if (currentUser?.email) {
                SupabaseService.insertAppEventLog({
                    company_id: currentUser.company_id || null,
                    branch: currentUser.filial || null,
                    area: currentUser.area || null,
                    user_email: currentUser.email,
                    user_name: currentUser.name,
                    app: 'conferencia',
                    event_type: 'stock_conference_export_csv',
                    entity_type: 'stock_report',
                    entity_id: report?.id || null,
                    status: 'success',
                    success: true,
                    source: 'web',
                    event_meta: { report_id: report?.id || null }
                }).catch(() => { });
            }
            const headers = 'Codigo Reduzido;Descricao;Estoque Sistema;Contagem;Diferenca;Status\n';
            const rows = sortedItems.map(item => {
                const diff = (item.counted_qty ?? 0) - (item.system_qty ?? 0);
                const statusKey = (item.status || 'pending') as 'divergent' | 'pending' | 'matched';
                const statusLabel = statusLabelText[statusKey] || 'Pendente';
                return `${item.reduced_code};"${item.description || ''}";${item.system_qty ?? 0};${item.counted_qty ?? 0};${diff};${statusLabel}`;
            }).join('\n');

            const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            const fileName = `conferencia_${(report.branch || 'sem_filial').replace(/\s+/g, '_')}_${createdAt.toISOString().slice(0, 10)}.csv`;
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Erro ao exportar CSV da conferência:', error);
            alert('Não foi possível baixar o CSV desta conferência.');
        }
    };

    const exportPDF = () => {
        try {
            if (currentUser?.email) {
                SupabaseService.insertAppEventLog({
                    company_id: currentUser.company_id || null,
                    branch: currentUser.filial || null,
                    area: currentUser.area || null,
                    user_email: currentUser.email,
                    user_name: currentUser.name,
                    app: 'conferencia',
                    event_type: 'stock_conference_printed',
                    entity_type: 'stock_report',
                    entity_id: report?.id || null,
                    status: 'success',
                    success: true,
                    source: 'web',
                    event_meta: { report_id: report?.id || null }
                }).catch(() => { });
            }
            const doc = new jsPDF();
            doc.setFontSize(18);
            doc.text('Relatório de Conferência de Estoque', 14, 20);
            doc.setFontSize(10);

            let headerY = 28;
            const infoLines = [
                'Filial: ' + (report.branch || 'Sem filial'),
                'Área: ' + (report.area || 'Área não informada'),
                'Farmacêutico(a): ' + (report.pharmacist || '-'),
                'Gestor(a): ' + (report.manager || '-'),
                'Responsável: ' + (report.user_name || report.user_email),
                'Início: ' + startLabel,
                'Término: ' + endLabel,
                'Duração: ' + durationLabel,
                'Registrado em: ' + recordedAtLabel
            ];

            infoLines.forEach(line => {
                doc.text(line, 14, headerY);
                headerY += 5;
            });

            const totalsY = headerY + 2;
            doc.text('Total itens: ' + summaryTotals.total, 14, totalsY);
            doc.setTextColor(0, 128, 0);
            doc.text('Corretos: ' + summaryTotals.matched, 14, totalsY + 5);
            doc.setTextColor(200, 0, 0);
            doc.text('Divergentes: ' + summaryTotals.divergent, 70, totalsY + 5);
            doc.setTextColor(255, 165, 0);
            doc.text('Pendentes: ' + summaryTotals.pending, 120, totalsY + 5);
            doc.setTextColor(0, 0, 0);

            const tableColumn = ['Reduzido', 'Descrição', 'Sistema', 'Contagem', 'Diferença', 'Status'];
            const tableRows: any[] = [];
            sortedItems.forEach(item => {
                const diff = (item.counted_qty ?? 0) - (item.system_qty ?? 0);
                const statusKey = (item.status || 'pending') as 'divergent' | 'pending' | 'matched';
                const statusLabel = statusLabelText[statusKey] || 'Pendente';
                tableRows.push([
                    item.reduced_code,
                    item.description || '',
                    (item.system_qty ?? 0).toString(),
                    (item.counted_qty ?? 0).toString(),
                    diff.toString(),
                    statusLabel
                ]);
            });

            autoTable(doc, {
                startY: totalsY + 16,
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
                    if (data.section === 'body' && data.column.index === 4) {
                        const diffVal = parseFloat(data.row.raw[4]);
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
            });
            if (pharmacistSignature || managerSignature) {
                const autoTableMeta = (doc as any).lastAutoTable;
                const tableEndY = autoTableMeta?.finalY ?? 0;
                const nextSignatureY = tableEndY > 0 ? tableEndY + 20 : 20;
                const needsPageBreak = nextSignatureY > 250;
                const signatureStartY = needsPageBreak ? 20 : nextSignatureY;

                const renderSignatureSection = (imgData: string, label: string, owner: string, x: number) => {
                    doc.addImage(imgData, 'PNG', x, signatureStartY, 60, 30);
                    doc.line(x, signatureStartY + 30, x + 60, signatureStartY + 30);
                    doc.setFontSize(8);
                    doc.text(label, x, signatureStartY + 35);
                    doc.text(owner, x, signatureStartY + 40);
                };

                if (needsPageBreak) {
                    doc.addPage();
                }

                if (pharmacistSignature) {
                    renderSignatureSection(pharmacistSignature, 'Farmacêutico(a) responsável', report.pharmacist || '-', 20);
                }
                if (managerSignature) {
                    const offsetX = pharmacistSignature ? 110 : 20;
                    renderSignatureSection(managerSignature, 'Gestor(a) responsável', report.manager || '-', offsetX);
                }
            }

            const fileName = `conferencia_${(report.branch || 'sem_filial').replace(/\s+/g, '_')}_${createdAt.toISOString().slice(0, 10)}.pdf`;
            doc.save(fileName);
        } catch (error) {
            console.error('Erro ao exportar PDF da conferência:', error);
            alert('Não foi possível baixar o PDF desta conferência.');
        }
    };

    const statusStyles: Record<'divergent' | 'pending' | 'matched', { badge: string; border: string }> = {
        divergent: { badge: 'bg-red-50 text-red-600', border: 'border-red-100' },
        pending: { badge: 'bg-yellow-50 text-yellow-700', border: 'border-yellow-100' },
        matched: { badge: 'bg-green-50 text-green-600', border: 'border-green-100' },
    };

    return createPortal(
        <div className="fixed inset-0 z-[2147483000] flex items-center justify-center px-4 py-6">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 w-full max-w-[min(1700px,96vw)] max-h-[92vh] overflow-y-auto rounded-3xl bg-white border border-gray-100 shadow-2xl">
                <div className="relative border-b border-gray-100">
                    <div className="flex items-start justify-between gap-4 px-6 py-4">
                        <div>
                            <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">Conferência de Estoque</p>
                            <h3 className="text-xl font-bold text-gray-900">{report.branch || 'Filial não informada'}</h3>
                            <p className="text-sm text-gray-500">
                                Área: {report.area || 'Área não informada'}
                            </p>
                            <p className="text-sm text-gray-500">
                                {report.pharmacist || 'Farmacêutico não informado'} · {report.manager || 'Gestor não informado'}
                            </p>
                            <p className="text-xs text-gray-400 mt-2">
                                Início: {startLabel}
                            </p>
                            <p className="text-xs text-gray-400">
                                Término: {endLabel}
                            </p>
                            <p className="text-xs text-gray-400">
                                Duração total: {durationLabel}
                            </p>
                            <p className="text-xs text-gray-400">
                                Registrado em {recordedAtLabel} por {report.user_name || report.user_email}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 h-10 w-10 rounded-full bg-white text-gray-500 hover:text-gray-800 shadow-md flex items-center justify-center transition"
                        aria-label="Fechar visualização"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="px-6 py-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-center">
                            <p className="text-[10px] uppercase tracking-widest text-gray-500">Total</p>
                            <p className="text-3xl font-bold text-gray-900">{summaryTotals.total}</p>
                        </div>
                        <div className="rounded-2xl border border-green-100 bg-green-50 p-4 text-center">
                            <p className="text-[10px] uppercase tracking-widest text-green-600">Corretos</p>
                            <p className="text-3xl font-bold text-green-800">{summaryTotals.matched}</p>
                        </div>
                        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-center">
                            <p className="text-[10px] uppercase tracking-widest text-red-600">Divergentes</p>
                            <p className="text-3xl font-bold text-red-800">{summaryTotals.divergent}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-2xl border border-yellow-100 bg-yellow-50 p-4 text-center">
                            <p className="text-[10px] uppercase tracking-widest text-yellow-700">Pendentes</p>
                            <p className="text-3xl font-bold text-yellow-800">{summaryTotals.pending}</p>
                        </div>
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-center">
                            <p className="text-[10px] uppercase tracking-widest text-blue-600">Progresso</p>
                            <p className="text-3xl font-bold text-blue-800">{Math.round(summaryTotals.percent)}%</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
                        <span className="inline-flex items-center px-3 py-1 border border-gray-200 rounded-full bg-gray-50">Responsável: {report.user_name || report.user_email}</span>
                        <span className="inline-flex items-center px-3 py-1 border border-gray-200 rounded-full bg-gray-50">Farmacêutico: {report.pharmacist || '-'}</span>
                        <span className="inline-flex items-center px-3 py-1 border border-gray-200 rounded-full bg-gray-50">Gestor: {report.manager || '-'}</span>
                    </div>

                    {(pharmacistSignature || managerSignature) && (
                        <div className="grid gap-4 md:grid-cols-2">
                            {pharmacistSignature && (
                                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-center space-y-2">
                                    <p className="text-[10px] uppercase tracking-widest text-gray-400">Farmacêutico(a)</p>
                                    <img src={pharmacistSignature} alt="Assinatura Farmacêutico" className="mx-auto h-28 object-contain rounded" style={{ background: '#fff' }} />
                                    <p className="text-xs text-gray-500">{report.pharmacist || '-'}</p>
                                </div>
                            )}
                            {managerSignature && (
                                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-center space-y-2">
                                    <p className="text-[10px] uppercase tracking-widest text-gray-400">Gestor(a)</p>
                                    <img src={managerSignature} alt="Assinatura Gestor" className="mx-auto h-28 object-contain rounded" style={{ background: '#fff' }} />
                                    <p className="text-xs text-gray-500">{report.manager || '-'}</p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="overflow-x-auto border border-gray-100 rounded-2xl">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-widest">
                                <tr>
                                    <th className="px-4 py-3">Reduzido</th>
                                    <th className="px-4 py-3">Descrição</th>
                                    <th className="px-4 py-3 text-center">Sistema</th>
                                    <th className="px-4 py-3 text-center">Contagem</th>
                                    <th className="px-4 py-3 text-center">Diferença</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-gray-700">
                                {sortedItems.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                                            Nenhum item registrado nessa conferência.
                                        </td>
                                    </tr>
                                )}
                                {sortedItems.map(item => {
                                    const diff = (item.counted_qty ?? 0) - (item.system_qty ?? 0);
                                    const statusKey = (item.status || 'pending') as 'divergent' | 'pending' | 'matched';
                                    const badge = statusStyles[statusKey];
                                    return (
                                        <tr key={`${item.reduced_code}-${item.system_qty}-${item.counted_qty}`}>
                                            <td className="px-4 py-3 font-mono">{item.reduced_code}</td>
                                            <td className="px-4 py-3">{item.description || 'Sem descrição'}</td>
                                            <td className="px-4 py-3 text-center font-mono">{item.system_qty ?? 0}</td>
                                            <td className="px-4 py-3 text-center font-mono">{item.counted_qty ?? 0}</td>
                                            <td className="px-4 py-3 text-center font-mono">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${diff > 0 ? 'text-blue-600' : diff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                    {diff > 0 ? `+${diff}` : diff}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`text-[10px] font-bold rounded-full px-3 py-1 border ${badge.border} ${badge.badge}`}>
                                                    {statusLabelText[statusKey] || 'Pendente'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <button
                            onClick={exportPDF}
                            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg px-5 py-3 text-sm font-bold shadow-lg hover:brightness-110 transition"
                        >
                            <Printer size={16} />
                            <span>Baixar PDF</span>
                        </button>
                        <button
                            onClick={exportCSV}
                            className="flex items-center gap-2 border border-gray-200 rounded-lg px-5 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 transition"
                        >
                            <ClipboardList size={16} />
                            <span>Baixar CSV</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

// --- FALLBACK USERS (usado apenas se Supabase falhar) ---
const INITIAL_USERS: User[] = [
    { email: 'asconavietagestor@gmail.com', password: 'marcelo1508', name: 'Marcelo Asconavieta', phone: '99999999999', role: 'MASTER', approved: true, rejected: false },
    { email: 'contato@marcelo.far.br', password: 'marcelo1508', name: 'Contato Marcelo', phone: '99999999999', role: 'MASTER', approved: true, rejected: false },
];

// --- COMPONENTS ---

// Custom Date Input 3D
const DateInput = ({ value, onChange, theme, hasError, disabled }: { value: string, onChange: (val: string) => void, theme: any, hasError?: boolean, disabled?: boolean }) => {
    const [day, setDay] = useState('');
    const [month, setMonth] = useState('');
    const [year, setYear] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (value) {
            const parts = value.split('/');
            if (parts.length === 3) {
                setDay(parts[0]);
                setMonth(parts[1]);
                setYear(parts[2]);
            }
        } else {
            setDay('');
            setMonth('');
            setYear('');
        }
    }, [value]);

    const updateDate = (d: string, m: string, y: string) => {
        if (d && m && y && y.length === 4) {
            onChange(`${d}/${m}/${y}`);
        }
        // Don't clear immediately to allow typing flow
    };

    const dayRef = useRef<HTMLInputElement>(null);
    const monthRef = useRef<HTMLInputElement>(null);
    const yearRef = useRef<HTMLInputElement>(null);

    const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 2) val = val.slice(0, 2);
        setDay(val);
        if (val.length === 2) {
            monthRef.current?.focus();
        }
        updateDate(val, month, year);
    };

    const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 2) val = val.slice(0, 2);
        setMonth(val);
        if (val.length === 2) {
            yearRef.current?.focus();
        }
        if (val.length === 0) {
            dayRef.current?.focus();
        }
        updateDate(day, val, year);
    };

    const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 4) val = val.slice(0, 4);
        setYear(val);
        if (val.length === 4) {
            updateDate(day, month, val);
        }
        if (val.length === 0) {
            monthRef.current?.focus();
        }
    };

    return (
        <div className={`flex items-center gap-2 bg-gray-50 border rounded-xl p-2.5 transition-all duration-300 ${hasError
            ? 'border-red-300 ring-2 ring-red-100'
            : isFocused
                ? 'border-blue-400 ring-4 ring-blue-500/10 shadow-md transform -translate-y-0.5'
                : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
            } ${disabled ? 'opacity-60 bg-gray-100 cursor-not-allowed' : ''}`}>
            <div className="relative flex-1">
                <input
                    ref={dayRef}
                    type="text"
                    inputMode="numeric"
                    placeholder="DD"
                    value={day}
                    onChange={handleDayChange}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    disabled={disabled}
                    className="w-full text-center bg-transparent outline-none font-mono text-gray-700 placeholder-gray-300 font-medium"
                />
            </div>
            <span className="text-gray-300 font-light text-lg">/</span>
            <div className="relative flex-1">
                <input
                    ref={monthRef}
                    type="text"
                    inputMode="numeric"
                    placeholder="MM"
                    value={month}
                    onChange={handleMonthChange}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    disabled={disabled}
                    className="w-full text-center bg-transparent outline-none font-mono text-gray-700 placeholder-gray-300 font-medium"
                />
            </div>
            <span className="text-gray-300 font-light text-lg">/</span>
            <div className="relative flex-[1.5]">
                <input
                    ref={yearRef}
                    type="text"
                    inputMode="numeric"
                    placeholder="AAAA"
                    value={year}
                    onChange={handleYearChange}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    disabled={disabled}
                    className="w-full text-center bg-transparent outline-none font-mono text-gray-700 placeholder-gray-300 font-medium"
                />
            </div>
            <Calendar size={16} className={`ml-1 ${isFocused ? 'text-blue-500' : 'text-gray-400'} transition-colors duration-300`} />
        </div>
    );
};

// --- AUTH COMPONENTS ---

const LoginScreen = ({
    onLogin,
    users,
    onRegister,
    companies
}: {
    onLogin: (u: User) => void,
    users: User[],
    onRegister: (u: User) => void,
    companies: any[]
}) => {
    const [isRegistering, setIsRegistering] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [selectedCompanyForRegistration, setSelectedCompanyForRegistration] = useState('');
    const [error, setError] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [success, setSuccess] = useState('');
    const [shakeButton, setShakeButton] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, '');
        if (val.length <= 11) {
            setPhone(val);
        }
        setPhoneError(''); // clear error while typing
    };

    const handlePhoneBlur = () => {
        if (phone.length > 0 && phone.length !== 11) {
            setPhoneError('Formato inválido. Digite DDD (2) + Número (9). Ex: 11999999999');
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // --- FORGOT PASSWORD FLOW ---
        if (isForgotPassword) {
            if (!email) {
                setError('Por favor, digite seu e-mail para recuperar a senha.');
                setShakeButton(true);
                setTimeout(() => setShakeButton(false), 500);
                return;
            }
            // Simulate email sending
            setSuccess(`Um link para redefinição de senha foi enviado para ${email}.`);
            setShakeButton(false);
            // Optional: Clear email or reset view after timeout
            setTimeout(() => {
                setIsForgotPassword(false);
                setSuccess('');
                setEmail('');
            }, 4000);
            return;
        }

        // --- REGISTRATION FLOW ---
        if (isRegistering) {
            // Validate Phone Length (11 digits)
            if (phone.length !== 11) {
                setPhoneError('Formato inválido. Digite DDD (2) + Número (9). Ex: 11999999999');
                setShakeButton(true);
                setTimeout(() => setShakeButton(false), 500);
                return;
            }

            // Validate Password Length
            if (password.length < 6) {
                setError('A senha deve ter no mínimo 6 dígitos.');
                setShakeButton(true);
                setTimeout(() => setShakeButton(false), 500);
                return;
            }

            // Validate Passwords Match
            if (password !== confirmPassword) {
                setError('As senhas não coincidem.');
                setShakeButton(true);
                setTimeout(() => setShakeButton(false), 500);
                return;
            }

            if (users.find(u => u.email === email)) {
                setError('E-mail já cadastrado.');
                return;
            }
            onRegister({ email, password, name, phone, role: 'USER', approved: false, rejected: false, company_id: selectedCompanyForRegistration || null });
            setSuccess('Solicitação enviada com sucesso! Seu acesso será avaliado por um mediador.');
            setIsRegistering(false);
            setEmail('');
            setPassword('');
            setConfirmPassword('');
            setName('');
            setPhone('');
            setSelectedCompanyForRegistration('');
        } else {
            // --- LOGIN FLOW ---
            const user = users.find(u => u.email === email && u.password === password);
            if (user) {
                if (user.rejected) {
                    setError('Seu acesso foi recusado ou bloqueado. Contate o administrador.');
                } else if (!user.approved) {
                    setError('Sua conta ainda não foi aprovada pelo Master.');
                } else {
                    onLogin(user);
                }
            } else {
                setError('E-mail ou senha inválidos.');
            }
        }
    };

    const getPasswordInputClass = (val: string) => {
        const mismatch = isRegistering && password && confirmPassword && password !== confirmPassword;
        const match = isRegistering && password && confirmPassword && password === confirmPassword;

        if (mismatch) {
            return "w-full bg-red-50 border border-red-500 rounded-xl p-3.5 text-red-900 focus:ring-2 focus:ring-red-200 focus:border-transparent transition-all outline-none shadow-inner-light placeholder-red-300";
        }
        if (match) {
            return "w-full bg-green-50 border border-green-500 rounded-xl p-3.5 text-gray-900 focus:ring-2 focus:ring-green-200 focus:border-transparent transition-all outline-none shadow-inner-light";
        }
        return "w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#002b5c] focus:border-transparent transition-all outline-none shadow-inner-light";
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated Background Elements */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse-slow"></div>
                <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
            </div>
            {/* Decorative Gradient Overlay */}
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-br from-[#002b5c]/30 to-[#cc0000]/20 transform -skew-y-6 origin-top-left z-0"></div>

            <div className="glass rounded-3xl shadow-lift-lg w-full max-w-lg overflow-hidden relative z-10 border border-white/20 animate-scale-in">
                <div className="pt-10 pb-6 text-center relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent"></div>
                    <div className="flex justify-center mb-4 relative z-10 animate-bounce-subtle">
                        <div className="w-[6.666rem] h-[6.666rem] filter drop-shadow-2xl transform transition-transform duration-300 hover:scale-110">
                            <MFLogo className="w-full h-full" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-extrabold text-white uppercase tracking-wide drop-shadow-lg"></h1>
                    <p className="text-white/80 font-bold tracking-widest text-xs mt-1 uppercase drop-shadow-md">Gestão & Excelência</p>
                </div>

                <div className="p-8 md:p-12 pt-4 bg-white/90 backdrop-blur-sm rounded-b-3xl">
                    <h2 className="text-xl font-bold text-gray-800 mb-6 text-center border-b border-gray-200 pb-4 animate-fade-in-up">
                        {isForgotPassword ? '🔐 Recuperar Senha' : isRegistering ? '✨ Criar Nova Conta' : '🔑 Acesso ao Sistema'}
                    </h2>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 text-red-700 text-sm font-medium rounded-xl border border-red-200 flex items-center shadow-md animate-shake">
                            <AlertCircle size={18} className="mr-2 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="mb-6 p-4 bg-green-50 text-green-700 text-sm font-medium rounded-xl border border-green-200 flex items-center shadow-md animate-scale-in">
                            <CheckCircle size={18} className="mr-2 flex-shrink-0 animate-bounce-subtle" />
                            {success}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {isRegistering && (
                            <>
                                <div className="group animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-2 ml-1 flex items-center gap-1">
                                        <UserIcon size={12} className="text-blue-500" />
                                        Nome Completo
                                    </label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl p-3.5 text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 outline-none shadow-sm hover:border-gray-300 hover:shadow-md"
                                        placeholder="Seu nome completo"
                                        required={isRegistering}
                                    />
                                </div>
                                <div className="group animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-2 ml-1 flex items-center gap-1">
                                        <Phone size={12} className="text-green-500" />
                                        Telefone / WhatsApp
                                    </label>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={handlePhoneChange}
                                        onBlur={handlePhoneBlur}
                                        className={`w-full border-2 rounded-xl p-3.5 text-gray-900 focus:bg-white focus:ring-2 focus:border-transparent transition-all duration-300 outline-none shadow-sm hover:shadow-md ${phoneError ? 'bg-red-50 border-red-400 focus:ring-red-300 focus:border-red-400' : 'bg-gray-50 border-gray-200 focus:ring-green-500 focus:border-green-500 hover:border-gray-300'}`}
                                        placeholder="(00) 00000-0000"
                                        required={isRegistering}
                                    />
                                    {phoneError && <p className="text-red-500 text-xs mt-2 ml-1 font-bold flex items-center gap-1 animate-shake"><AlertCircle size={12} />{phoneError}</p>}
                                </div>
                                <div className="group animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-2 ml-1 flex items-center gap-1">
                                        <Building2 size={12} className="text-purple-500" />
                                        Empresa que Trabalha
                                    </label>
                                    <select
                                        value={selectedCompanyForRegistration}
                                        onChange={(e) => setSelectedCompanyForRegistration(e.target.value)}
                                        className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl p-3.5 text-gray-900 focus:bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-300 outline-none shadow-sm hover:border-gray-300 hover:shadow-md cursor-pointer"
                                        required={isRegistering}
                                    >
                                        <option value="">-- Selecione a Empresa --</option>
                                        {companies.map((company: any) => (
                                            <option key={company.id} value={company.id}>{company.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        )}

                        <div className="group animate-fade-in-up" style={{ animationDelay: isRegistering ? '0.4s' : '0.1s' }}>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-2 ml-1">E-mail</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl p-3.5 text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 outline-none shadow-sm hover:border-gray-300 hover:shadow-md"
                                placeholder="nome@exemplo.com"
                                required
                            />
                        </div>

                        {/* Show Password fields only if NOT in Forgot Password mode */}
                        {!isForgotPassword && (
                            <div className="group">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Senha</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className={getPasswordInputClass(password) + " pr-12"}
                                        placeholder="••••••••"
                                        autoComplete={isRegistering ? "new-password" : "current-password"}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>
                        )}

                        {isRegistering && (
                            <div className="group">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Confirmar Senha</label>
                                <div className="relative">
                                    <input
                                        type={showConfirmPassword ? "text" : "password"}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className={getPasswordInputClass(confirmPassword) + " pr-12"}
                                        placeholder="••••••••"
                                        autoComplete="new-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Forgot Password Link */}
                        {!isRegistering && !isForgotPassword && (
                            <div className="flex justify-end animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                                <button
                                    type="button"
                                    onClick={() => { setIsForgotPassword(true); setError(''); setSuccess(''); }}
                                    className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-all duration-300 hover:underline underline-offset-2 flex items-center gap-1 group"
                                >
                                    <Lock size={14} className="transition-transform duration-300 group-hover:rotate-12" />
                                    Esqueci minha senha
                                </button>
                            </div>
                        )}

                        <button
                            type="submit"
                            className={`w-full bg-gradient-to-r from-blue-600 via-blue-700 to-purple-600 text-white font-bold text-lg py-4 rounded-xl hover:from-blue-700 hover:via-purple-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-blue-500/50 hover:-translate-y-1 transform active:scale-95 mt-6 ripple relative overflow-hidden group ${shakeButton ? 'animate-shake !bg-gradient-to-r !from-red-600 !to-red-700' : ''}`}
                        >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                {isForgotPassword ? (
                                    <>
                                        <Send size={20} className="transition-transform duration-300 group-hover:scale-110" />
                                        Enviar Link de Redefinição
                                    </>
                                ) : isRegistering ? (
                                    <>
                                        <UserPlus size={20} className="transition-transform duration-300 group-hover:scale-110" />
                                        Solicitar Cadastro
                                    </>
                                ) : (
                                    <>
                                        <ArrowRight size={20} className="transition-transform duration-300 group-hover:translate-x-1" />
                                        Entrar no Sistema
                                    </>
                                )}
                            </span>
                            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                        </button>
                    </form>

                    <div className="mt-8 text-center text-sm">
                        {isForgotPassword ? (
                            <button
                                onClick={() => { setIsForgotPassword(false); setError(''); setSuccess(''); }}
                                className="text-gray-500 hover:text-[#002b5c] font-semibold transition-colors flex items-center justify-center gap-2 mx-auto"
                            >
                                <Undo2 size={16} /> Voltar ao Login
                            </button>
                        ) : (
                            <button
                                onClick={() => { setIsRegistering(!isRegistering); setError(''); setSuccess(''); setConfirmPassword(''); setPhone(''); setPhoneError(''); }}
                                className="text-gray-500 hover:text-[#002b5c] font-semibold transition-colors underline decoration-2 decoration-transparent hover:decoration-[#002b5c] underline-offset-4"
                            >
                                {isRegistering ? 'Já tenho conta? Fazer Login' : 'Não tem acesso? Criar conta'}
                            </button>
                        )}
                    </div>
                </div>
                <div className="bg-gray-50 p-4 text-center text-xs text-gray-400 font-medium uppercase tracking-widest border-t border-gray-100">
                    &copy; {new Date().getFullYear()} Marcelo Far
                </div>
            </div>
        </div>
    );
};


// --- MAIN APP ---

const App: React.FC = () => {
    // Migration State
    const [showMigrationPanel, setShowMigrationPanel] = useState(false);
    const [isMigrating, setIsMigrating] = useState(false);
    const [migrationStatus, setMigrationStatus] = useState('');
    // Loading State
    const [isLoadingData, setIsLoadingData] = useState(true);

    // Auth State
    const [users, setUsers] = useState<User[]>(INITIAL_USERS);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [showBranchSelectionModal, setShowBranchSelectionModal] = useState(false);
    const [branchSelectionMode, setBranchSelectionMode] = useState<'required' | 'confirm'>('required');
    const [branchSelectionValue, setBranchSelectionValue] = useState('');
    const [branchSelectionArea, setBranchSelectionArea] = useState('');
    const [branchSelectionMessage, setBranchSelectionMessage] = useState('');
    const [isSavingBranchSelection, setIsSavingBranchSelection] = useState(false);
    const [branchPromptCheckedForUser, setBranchPromptCheckedForUser] = useState<string | null>(null);

    // Config State
    const [config, setConfig] = useState<AppConfig>({
        pharmacyName: 'Marcelo Far',
        logo: null
    });

    // Companies State
    const [companies, setCompanies] = useState<any[]>([]);

    // App Logic State
    const [checklists, setChecklists] = useState<ChecklistDefinition[]>(BASE_CHECKLISTS);
    const initialChecklistId = BASE_CHECKLISTS[0]?.id || 'gerencial';
    const [activeChecklistId, setActiveChecklistId] = useState<string>(initialChecklistId);
    const [editingChecklistDefinition, setEditingChecklistDefinition] = useState<ChecklistDefinition | null>(null);
    const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
    const [isSavingChecklistDefinition, setIsSavingChecklistDefinition] = useState(false);
    const [formData, setFormData] = useState<Record<string, ChecklistData>>({});
    const [images, setImages] = useState<Record<string, ChecklistImages>>({});
    const [signatures, setSignatures] = useState<Record<string, Record<string, string>>>({});
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => isMobileLayout());
    const [showErrors, setShowErrors] = useState(false);

    const [currentView, setCurrentView] = useState<'checklist' | 'summary' | 'dashboard' | 'report' | 'settings' | 'history' | 'view_history' | 'support' | 'stock' | 'access' | 'pre' | 'audit' | 'logs' | 'cadastros_globais'>(() => {
        if (typeof window === 'undefined') return 'dashboard';
        const savedView = localStorage.getItem('APP_CURRENT_VIEW');
        const allowedViews = new Set([
            'checklist',
            'summary',
            'dashboard',
            'report',
            'settings',
            'history',
            'view_history',
            'support',
            'stock',
            'access',
            'audit',
            'logs',
            'cadastros_globais',
            ...(PRE_VENCIDOS_MODULE_ENABLED ? ['pre'] : [])
        ]);
        if (savedView && allowedViews.has(savedView)) {
            return savedView as 'checklist' | 'summary' | 'dashboard' | 'report' | 'settings' | 'history' | 'view_history' | 'support' | 'stock' | 'access' | 'pre' | 'audit' | 'logs' | 'cadastros_globais';
        }
        return 'dashboard';
    });

    useEffect(() => {
        if (currentView) {
            localStorage.setItem('APP_CURRENT_VIEW', currentView);
        }
    }, [currentView]);
    const [ignoredChecklists, setIgnoredChecklists] = useState<Set<string>>(new Set());
    const errorBoxRef = useRef<HTMLDivElement>(null);

    // History State
    const [reportHistory, setReportHistory] = useState<ReportHistoryItem[]>([]);
    const [reportsPage, setReportsPage] = useState(0);
    const [hasMoreReports, setHasMoreReports] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const REPORTS_PAGE_SIZE = 20;
    const STOCK_PAGE_SIZE = 20;
    const MOBILE_CHECKLIST_HISTORY_PAGE_SIZE = 4;
    const MOBILE_STOCK_HISTORY_PAGE_SIZE = 4;
    const [stockConferenceHistory, setStockConferenceHistory] = useState<StockConferenceHistoryItem[]>([]);
    const [stockConferencePage, setStockConferencePage] = useState(0);
    const [hasMoreStockConferences, setHasMoreStockConferences] = useState(true);
    const [isLoadingMoreStock, setIsLoadingMoreStock] = useState(false);
    const [lastHistoryCacheAt, setLastHistoryCacheAt] = useState<Date | null>(null);
    const [viewHistoryItem, setViewHistoryItem] = useState<ReportHistoryItem | null>(null);
    const [loadingReportId, setLoadingReportId] = useState<string | null>(null);
    const [loadingStockReportId, setLoadingStockReportId] = useState<string | null>(null);
    const [historyFilterUser, setHistoryFilterUser] = useState<string>('all');
    const [historySearch, setHistorySearch] = useState('');
    const [historyAreaFilter, setHistoryAreaFilter] = useState('all');
    const [historyDateRange, setHistoryDateRange] = useState<string>('all');
    const [checklistMobilePage, setChecklistMobilePage] = useState(0);
    const [isReloadingReports, setIsReloadingReports] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [stockConferenceReportsRaw, setStockConferenceReportsRaw] = useState<SupabaseService.DbStockConferenceReport[]>([]);
    const [viewingStockConferenceReport, setViewingStockConferenceReport] = useState<EnhancedStockConferenceReport | null>(null);
    const [stockBranchFilters, setStockBranchFilters] = useState<string[]>([]);
    const [stockAreaFilter, setStockAreaFilter] = useState<string>('all');
    const [stockMobilePage, setStockMobilePage] = useState(0);
    const [dashboardAuditSessions, setDashboardAuditSessions] = useState<SupabaseService.DbAuditSession[]>([]);
    const [isLoadingDashboardAudits, setIsLoadingDashboardAudits] = useState(false);
    const [dashboardAuditsError, setDashboardAuditsError] = useState<string | null>(null);
    const [dashboardAuditsFetchedAt, setDashboardAuditsFetchedAt] = useState<string | null>(null);
    const [openAuditNumberFilter, setOpenAuditNumberFilter] = useState<string>('all');
    const [dashboardCompletedAuditSessions, setDashboardCompletedAuditSessions] = useState<SupabaseService.DbAuditSession[]>([]);
    const [isLoadingCompletedDashboardAudits, setIsLoadingCompletedDashboardAudits] = useState(false);
    const [completedDashboardAuditsError, setCompletedDashboardAuditsError] = useState<string | null>(null);
    const [completedDashboardAuditsFetchedAt, setCompletedDashboardAuditsFetchedAt] = useState<string | null>(null);
    const [completedAuditNumberFilter, setCompletedAuditNumberFilter] = useState<string>('all');
    const [auditJumpFilial, setAuditJumpFilial] = useState<string>('');

    // Logs & Eventos
    const [appEventLogs, setAppEventLogs] = useState<SupabaseService.DbAppEventLog[]>([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const [logsBranchFilter, setLogsBranchFilter] = useState<string>('all');
    const [logsAreaFilter, setLogsAreaFilter] = useState<string>('all');
    const [logsAppFilter, setLogsAppFilter] = useState<string>('all');
    const [logsUserFilter, setLogsUserFilter] = useState<string>('all');
    const [logsEventFilter, setLogsEventFilter] = useState<string>('all');
    const [logsGroupRepeats, setLogsGroupRepeats] = useState(true);
    const [logsDateRange, setLogsDateRange] = useState<'7d' | '30d' | 'all'>('30d');
    const [eventsDisplayLimit, setEventsDisplayLimit] = useState(50); // paginação eventos
    const [globalBaseFiles, setGlobalBaseFiles] = useState<SupabaseService.DbGlobalBaseFile[]>([]);
    const [isLoadingGlobalBaseFiles, setIsLoadingGlobalBaseFiles] = useState(false);
    const [uploadingGlobalBaseKey, setUploadingGlobalBaseKey] = useState<string | null>(null);

    // Master User Management State
    const [newUserName, setNewUserName] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPhone, setNewUserPhone] = useState('');
    const [newUserPass, setNewUserPass] = useState('');
    const [newUserConfirmPass, setNewUserConfirmPass] = useState('');
    const [showNewUserPass, setShowNewUserPass] = useState(false);
    const [showNewUserConfirmPass, setShowNewUserConfirmPass] = useState(false);
    const [newUserRole, setNewUserRole] = useState<'MASTER' | 'ADMINISTRATIVO' | 'USER'>('USER');
    const [newUserCompanyId, setNewUserCompanyId] = useState('');
    const [newUserArea, setNewUserArea] = useState('');
    const [newUserFilial, setNewUserFilial] = useState('');
    const [internalShake, setInternalShake] = useState(false);
    const [internalPhoneError, setInternalPhoneError] = useState('');

    // Filters
    const [userFilterRole, setUserFilterRole] = useState<'ALL' | 'MASTER' | 'ADMINISTRATIVO' | 'USER'>('ALL');
    const [userFilterStatus, setUserFilterStatus] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'BANNED'>('ALL');

    // Change Password State
    const [newPassInput, setNewPassInput] = useState('');
    const [confirmPassInput, setConfirmPassInput] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
    const [saveShake, setSaveShake] = useState(false);
    const [profilePhoneError, setProfilePhoneError] = useState('');
    const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveDraftAbortControllerRef = useRef<AbortController | null>(null);
    const clientIdRef = useRef<string>(Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));

    // User Activity
    const [lastUserActivity, setLastUserActivity] = useState<number>(Date.now());
    const ACTIVITY_TIMEOUT = 5000;
    const SESSION_COMMAND_POLL_MS = 5000;
    const USER_APPROVAL_POLL_MS = 15000;
    const MASTER_SESSIONS_POLL_MS = 15000;
    const MASTER_FORCE_LOGOUT_SWEEP_MS = 5000;
    const viewStartRef = useRef<{ view: string; startedAt: number } | null>(null);
    const prevViewRef = useRef<string | null>(null);
    const autoLoginLoggedRef = useRef(false);
    const lastChecklistLogRef = useRef<string | null>(null);

    // Company Editing
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [activeSessions, setActiveSessions] = useState<SupabaseService.DbActiveSession[]>([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);
    const [isBulkSessionActionRunning, setIsBulkSessionActionRunning] = useState(false);
    const [pendingSessionCommands, setPendingSessionCommands] = useState<Record<string, { command: 'FORCE_LOGOUT' | 'RELOAD'; startedAt: number }>>({});
    const forcedSessionCleanupRef = useRef<Set<string>>(new Set());
    const logoutInFlightRef = useRef(false);
    const [remoteForceLogoutDeadline, setRemoteForceLogoutDeadline] = useState<number | null>(null);
    const [remoteForceLogoutTick, setRemoteForceLogoutTick] = useState(0);
    const [hasLoadedLogsForMetrics, setHasLoadedLogsForMetrics] = useState(false);
    const [hasLoadedSessionsForMetrics, setHasLoadedSessionsForMetrics] = useState(false);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);
    const [editCompanyName, setEditCompanyName] = useState('');
    const [editCompanyCnpj, setEditCompanyCnpj] = useState('');
    const [editCompanyPhone, setEditCompanyPhone] = useState('');
    const [editCompanyLogo, setEditCompanyLogo] = useState<string | null>(null);
    const [editCompanyAreas, setEditCompanyAreas] = useState<CompanyArea[]>([]);

    // Company Registration State
    const [newCompanyName, setNewCompanyName] = useState('');
    const [newCompanyCnpj, setNewCompanyCnpj] = useState('');
    const [newCompanyPhone, setNewCompanyPhone] = useState('');
    const [newCompanyLogo, setNewCompanyLogo] = useState<string | null>(null);
    const [newCompanyAreas, setNewCompanyAreas] = useState<CompanyArea[]>([]);
    const [accessMatrix, setAccessMatrix] = useState<Record<AccessLevelId, Record<string, boolean>>>(() => createInitialAccessMatrix());

    const getAccessLevelForRole = (role?: User['role']): AccessLevelId => {
        if (role === 'MASTER') return 'MASTER';
        if (role === 'ADMINISTRATIVO') return 'ADMINISTRATIVO';
        return 'USER';
    };

    const hasModuleAccess = (moduleId: string, levelOverride?: AccessLevelId): boolean => {
        const level = levelOverride || getAccessLevelForRole(currentUser?.role);
        if (level === 'MASTER') return true;
        return !!accessMatrix[level]?.[moduleId];
    };



    // Draft Loading
    const [draftLoaded, setDraftLoaded] = useState(false);
    const [loadedDraftEmail, setLoadedDraftEmail] = useState<string | null>(null);
    const isSavingRef = useRef(false);

    // --- SUPPORT TICKETS STATE ---
    const [tickets, setTickets] = useState<DbTicket[]>([]);
    const [newTicketTitle, setNewTicketTitle] = useState('');
    const [newTicketDesc, setNewTicketDesc] = useState('');
    const [newTicketImages, setNewTicketImages] = useState<string[]>([]);
    const [adminResponseInput, setAdminResponseInput] = useState<Record<string, string>>({});
    const [refreshTickets, setRefreshTickets] = useState(0);


    // --- PERSISTENCE & INIT EFFECTS ---

    const handleToggleAccess = async (levelId: AccessLevelId, moduleId: string) => {
        if (levelId === 'MASTER') return;
        const currentLevel = accessMatrix[levelId];
        if (!currentLevel || !(moduleId in currentLevel)) return;

        const updatedLevel = { ...currentLevel, [moduleId]: !currentLevel[moduleId] };
        setAccessMatrix(prev => ({ ...prev, [levelId]: updatedLevel }));

        try {
            await SupabaseService.upsertAccessMatrix(levelId, updatedLevel);
        } catch (error) {
            console.error('Erro ao salvar permissão de acesso:', error);
            const message = error instanceof Error ? error.message : JSON.stringify(error);
            alert(`Não foi possível salvar a alteração no Supabase (${message}).`);
            setAccessMatrix(prev => ({ ...prev, [levelId]: currentLevel }));
        }
    };

    const handleStockReportsLoaded = (reports: SupabaseService.DbStockConferenceReport[], append = false) => {
        const sortedReports = [...reports].sort((a, b) => {
            const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
            return bTime - aTime;
        });
        const dedupeById = (items: SupabaseService.DbStockConferenceReport[]) => {
            const map = new Map<string, SupabaseService.DbStockConferenceReport>();
            items.forEach(item => {
                const key = String(item.id || '').trim();
                if (!key) return;
                const existing = map.get(key);
                if (!existing) {
                    map.set(key, item);
                    return;
                }
                const existingTime = existing.created_at ? new Date(existing.created_at).getTime() : 0;
                const incomingTime = item.created_at ? new Date(item.created_at).getTime() : 0;
                if (incomingTime >= existingTime) {
                    map.set(key, item);
                }
            });
            return Array.from(map.values()).sort((a, b) => {
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bTime - aTime;
            });
        };
        if (append) {
            const merged = dedupeById([...stockConferenceReportsRaw, ...sortedReports]);
            setStockConferenceHistory(mapStockConferenceReports(merged));
            setStockConferenceReportsRaw(merged);
        } else {
            const deduped = dedupeById(sortedReports);
            setStockConferenceHistory(mapStockConferenceReports(deduped));
            setStockConferenceReportsRaw(deduped);
        }
    };

    const refreshStockConferenceReports = async () => {
        const dbStockReports = await SupabaseService.fetchStockConferenceReportsSummaryPage(0, STOCK_PAGE_SIZE);
        handleStockReportsLoaded(dbStockReports as SupabaseService.DbStockConferenceReport[]);
        setStockConferencePage(0);
        setHasMoreStockConferences(dbStockReports.length === STOCK_PAGE_SIZE);
        return dbStockReports;
    };

    const handleViewStockConferenceReport = async (historyId: string) => {
        setLoadingStockReportId(historyId);
        try {
            let report = stockConferenceReportsRaw.find(r => r.id === historyId);

            // Se o relatório não tiver os itens (que não vêm no summary), buscamos os detalhes
            if (report && (!report.items || report.items.length === 0)) {
                try {
                    console.log('🔍 Buscando detalhes da conferência:', historyId);
                    const fullReport = await CacheService.fetchWithCache(`stock_report_${historyId}`, () => SupabaseService.fetchStockConferenceReportDetails(historyId));
                    if (fullReport) {
                        // Atualizar o cache local
                        setStockConferenceReportsRaw(prev => prev.map(r => r.id === historyId ? fullReport : r));
                        report = fullReport;
                    }
                } catch (error) {
                    console.error('Error fetching stock report details:', error);
                }
            }

            if (!report) {
                alert('Não foi possível localizar o relatório de conferência solicitado.');
                return;
            }

            const historyEntry = stockConferenceHistory.find(item => item.id === historyId);
            const parsedSummary = parseJsonValue<StockConferenceSummary>(report.summary) || report.summary || { total: 0, matched: 0, divergent: 0, pending: 0, percent: 0 };
            const baseSummary: StockConferenceSummary = typeof parsedSummary === 'object' ? parsedSummary : { total: 0, matched: 0, divergent: 0, pending: 0, percent: 0 };
            const summarySignatures = parseJsonValue<{ pharmacist?: string | null; manager?: string | null }>(baseSummary.signatures) || {};
            const rootSignatures = parseJsonValue<{ pharmacist?: string | null; manager?: string | null }>((report as any).signatures) || {};
            const resolvedPharmacistSignature = historyEntry?.pharmacistSignature || summarySignatures.pharmacist || rootSignatures.pharmacist || null;
            const resolvedManagerSignature = historyEntry?.managerSignature || summarySignatures.manager || rootSignatures.manager || null;
            const enrichedSummary = {
                ...baseSummary,
                signatures: {
                    pharmacist: resolvedPharmacistSignature,
                    manager: resolvedManagerSignature
                }
            };
            const enrichedReport = {
                ...report,
                summary: enrichedSummary,
                pharmacistSignature: resolvedPharmacistSignature,
                managerSignature: resolvedManagerSignature
            };

            setViewingStockConferenceReport(enrichedReport);
            localStorage.setItem('APP_VIEWING_STOCK_REPORT_ID', historyId);
        } catch (error) {
            console.error('Error in handleViewStockConferenceReport:', error);
        } finally {
            setLoadingStockReportId(null);
        }
    };

    const handleCloseStockReport = () => {
        setViewingStockConferenceReport(null);
        localStorage.removeItem('APP_VIEWING_STOCK_REPORT_ID');
    };

    const handleCloseReport = () => {
        setViewHistoryItem(null);
        localStorage.removeItem('APP_VIEWING_REPORT_ID');
        setCurrentView('history');
    };

    useEffect(() => {
        if (currentView !== 'view_history') return;
        const handleEscToHistory = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                handleCloseReport();
            }
        };
        window.addEventListener('keydown', handleEscToHistory);
        return () => {
            window.removeEventListener('keydown', handleEscToHistory);
        };
    }, [currentView]);

    // Cache helpers
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    const CACHE_KEY_REPORTS = 'CACHE_REPORT_HISTORY';
    const CACHE_KEY_STOCK = 'CACHE_STOCK_HISTORY';

    const saveHistoryCache = (key: string, data: any[]) => {
        try {
            sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
        } catch { /* sessionStorage may be full, ignore */ }
    };

    const loadHistoryCache = (key: string): any[] | null => {
        try {
            const raw = sessionStorage.getItem(key);
            if (!raw) return null;
            const { ts, data } = JSON.parse(raw);
            if (Date.now() - ts > CACHE_TTL_MS) return null; // expired
            return data;
        } catch { return null; }
    };

    const clearHistoryCache = () => {
        sessionStorage.removeItem(CACHE_KEY_REPORTS);
        sessionStorage.removeItem(CACHE_KEY_STOCK);
    };

    const handleReloadReports = async () => {
        setIsReloadingReports(true);
        clearHistoryCache();
        try {
            console.log('🔁 Recarregando relatórios do banco...');
            setReportsPage(0);
            setHasMoreReports(true);
            setStockConferencePage(0);
            setHasMoreStockConferences(true);
            const [dbReports, dbStockReports] = await Promise.all([
                SupabaseService.fetchReportsSummary(0, REPORTS_PAGE_SIZE),
                SupabaseService.fetchStockConferenceReportsSummaryPage(0, STOCK_PAGE_SIZE)
            ]);
            const formattedReports = dbReports.map(mapDbReportToHistoryItem);
            setReportHistory(formattedReports);
            setHasMoreReports(dbReports.length === REPORTS_PAGE_SIZE);
            handleStockReportsLoaded(dbStockReports as SupabaseService.DbStockConferenceReport[]);
            setHasMoreStockConferences(dbStockReports.length === STOCK_PAGE_SIZE);
            saveHistoryCache(CACHE_KEY_REPORTS, formattedReports);
            saveHistoryCache(CACHE_KEY_STOCK, dbStockReports);
            setLastHistoryCacheAt(new Date());
            console.log('✅ Relatórios recarregados:', formattedReports.length, '| Conferências:', dbStockReports.length);
        } catch (error) {
            console.error('❌ Erro ao recarregar:', error);
            alert('Erro ao recarregar relatórios.');
        } finally {
            setIsReloadingReports(false);
        }
    };

    const handleLoadMoreReports = async () => {
        if (isLoadingMore || !hasMoreReports) return;
        setIsLoadingMore(true);
        try {
            const nextPage = reportsPage + 1;
            const dbReports = await SupabaseService.fetchReportsSummary(nextPage, REPORTS_PAGE_SIZE);
            if (dbReports.length > 0) {
                const formattedReports = dbReports.map(mapDbReportToHistoryItem);
                setReportHistory(prev => [...prev, ...formattedReports]);
                setReportsPage(nextPage);
                setHasMoreReports(dbReports.length === REPORTS_PAGE_SIZE);
            } else {
                setHasMoreReports(false);
            }
        } catch (error) {
            console.error('❌ Erro ao carregar mais relatórios:', error);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleLoadMoreStockConferences = async () => {
        if (isLoadingMoreStock || !hasMoreStockConferences) return;
        setIsLoadingMoreStock(true);
        try {
            const nextPage = stockConferencePage + 1;
            const dbStockReports = await SupabaseService.fetchStockConferenceReportsSummaryPage(nextPage, STOCK_PAGE_SIZE);
            if (dbStockReports.length > 0) {
                handleStockReportsLoaded(dbStockReports as SupabaseService.DbStockConferenceReport[], true);
                setStockConferencePage(nextPage);
                setHasMoreStockConferences(dbStockReports.length === STOCK_PAGE_SIZE);
            } else {
                setHasMoreStockConferences(false);
            }
        } catch (error) {
            console.error('❌ Erro ao carregar mais conferências:', error);
        } finally {
            setIsLoadingMoreStock(false);
        }
    };

    // MAIN INITIALIZATION - Load all data from Supabase on mount (was cut off, restoring generic structure found in previous views)
    useEffect(() => {
        const initializeData = async () => {
            try {
                setIsLoadingData(true);

                // 1. Launch all primary fetches in parallel with Cache-First strategy
                const [
                    dbUsers,
                    dbConfig,
                    dbReportsSummary,
                    dbStockReportsSummary,
                    dbCompanies,
                    dbMatrix,
                    dbTickets
                ] = await Promise.all([
                    CacheService.fetchWithCache('users_list', SupabaseService.fetchUsers, (data) => {
                        if (data && data.length > 0) {
                            setUsers(data.map(u => ({ ...u, preferredTheme: u.preferred_theme as ThemeColor | undefined })));
                        }
                    }),
                    CacheService.fetchWithCache('app_config', SupabaseService.fetchConfig, (data) => {
                        if (data) setConfig({ pharmacyName: data.pharmacy_name, logo: data.logo });
                    }),
                    CacheService.fetchWithCache(CACHE_KEY_REPORTS, () => SupabaseService.fetchReportsSummary(0, REPORTS_PAGE_SIZE), (data) => {
                        if (data && data.length > 0) setReportHistory(data.map(mapDbReportToHistoryItem));
                    }),
                    CacheService.fetchWithCache(CACHE_KEY_STOCK, () => SupabaseService.fetchStockConferenceReportsSummaryPage(0, STOCK_PAGE_SIZE), (data) => {
                        if (data) handleStockReportsLoaded(data as SupabaseService.DbStockConferenceReport[]);
                    }),
                    CacheService.fetchWithCache('companies_list', SupabaseService.fetchCompanies, (data) => {
                        if (data && data.length > 0) setCompanies(data);
                    }),
                    CacheService.fetchWithCache('access_matrix', SupabaseService.fetchAccessMatrix, (data) => {
                        if (data && data.length > 0) {
                            const mapped = data.reduce((acc: any, entry: any) => {
                                acc[entry.level] = entry.modules || {};
                                return acc;
                            }, {});
                            setAccessMatrix(mergeAccessMatrixWithDefaults(mapped));
                        }
                    }),
                    CacheService.fetchWithCache('tickets_list', SupabaseService.fetchTickets, (data) => {
                        if (data && data.length > 0) setTickets(data);
                    })
                ]);

                // 2. Initial State Population (from the result of Promise.all, which could be Cache or Remote)
                if (dbUsers && dbUsers.length > 0) {
                    setUsers(dbUsers.map(u => ({ ...u, preferredTheme: u.preferred_theme as ThemeColor | undefined })));
                }

                if (dbConfig) {
                    setConfig({ pharmacyName: dbConfig.pharmacy_name, logo: dbConfig.logo });
                }

                if (dbReportsSummary && dbReportsSummary.length > 0) {
                    const formatted = dbReportsSummary.map(mapDbReportToHistoryItem);
                    setReportHistory(formatted);
                    setHasMoreReports(dbReportsSummary.length === REPORTS_PAGE_SIZE);
                    setLastHistoryCacheAt(new Date());
                }

                if (dbStockReportsSummary) {
                    handleStockReportsLoaded(dbStockReportsSummary as SupabaseService.DbStockConferenceReport[]);
                    setHasMoreStockConferences(dbStockReportsSummary.length === STOCK_PAGE_SIZE);
                    setLastHistoryCacheAt(new Date());
                }

                if (dbCompanies) setCompanies(dbCompanies);

                if (dbMatrix && dbMatrix.length > 0) {
                    const mapped = dbMatrix.reduce((acc: any, entry: any) => {
                        acc[entry.level] = entry.modules || {};
                        return acc;
                    }, {});
                    setAccessMatrix(mergeAccessMatrixWithDefaults(mapped));
                }

                if (dbTickets) setTickets(dbTickets);

                // 8. Restore Persisted View (Reports)
                const pendingReportId = localStorage.getItem('APP_VIEWING_REPORT_ID');
                if (pendingReportId && dbReportsSummary && dbReportsSummary.length > 0) {
                    const found = dbReportsSummary.find(r => r.id === pendingReportId);
                    if (found) {
                        handleViewHistoryItem(mapDbReportToHistoryItem(found as SupabaseService.DbReport));
                    }
                }

                const pendingStockReportId = localStorage.getItem('APP_VIEWING_STOCK_REPORT_ID');
                if (pendingStockReportId && dbStockReportsSummary) {
                    handleViewStockConferenceReport(pendingStockReportId);
                }

                // Cleanup old keys if any
                localStorage.removeItem('APP_VIEW_HISTORY_ITEM');
                localStorage.removeItem('APP_VIEW_STOCK_REPORT');

            } catch (error) {
                console.error('Error initializing:', error);
                const localUsers = localStorage.getItem('APP_USERS');
                if (localUsers) setUsers(JSON.parse(localUsers));
            } finally {
                setIsLoadingData(false);
            }
        };
        initializeData();
    }, []);

    useEffect(() => {
        const loadChecklistDefinitions = async () => {
            try {
                const dbDefinitions = await SupabaseService.fetchChecklistDefinitions();
                if (!dbDefinitions || dbDefinitions.length === 0) return;
                const serverMap = dbDefinitions.reduce((acc: Record<string, ChecklistDefinition>, entry) => {
                    acc[entry.id] = entry.definition;
                    return acc;
                }, {});
                const ordered = BASE_CHECKLISTS.map(base => serverMap[base.id] || base);
                const extras = dbDefinitions
                    .filter(entry => !BASE_CHECKLISTS.some(base => base.id === entry.id))
                    .map(entry => entry.definition);
                setChecklists([...ordered, ...extras]);
            } catch (error) {
                console.error('Erro ao carregar definições dos checklists:', error);
            }
        };
        loadChecklistDefinitions();
    }, []);

    useEffect(() => {
        if (checklists.length === 0) return;
        if (!checklists.some(cl => cl.id === activeChecklistId)) {
            setActiveChecklistId(checklists[0].id);
        }
    }, [checklists, activeChecklistId]);

    useEffect(() => {
        if (!currentUser || !activeChecklistId) return;
        if (lastChecklistLogRef.current === activeChecklistId) return;
        lastChecklistLogRef.current = activeChecklistId;
        SupabaseService.insertAppEventLog({
            company_id: currentUser.company_id || null,
            branch: currentUser.filial || null,
            area: currentUser.area || null,
            user_email: currentUser.email,
            user_name: currentUser.name,
            app: 'checklists',
            event_type: 'checklist_started',
            entity_type: 'checklist',
            entity_id: activeChecklistId,
            status: 'success',
            success: true,
            source: 'web'
        }).catch(() => { });
    }, [activeChecklistId, currentUser]);

    // Save Users to LocalStorage
    useEffect(() => {
        if (!isLoadingData && users.length > 0) {
            localStorage.setItem('APP_USERS', JSON.stringify(users));
        }
    }, [users, isLoadingData]);

    // Load Draft Effect (Restoring as it was missing in view but likely needed)
    useEffect(() => {
        if (currentUser && currentUser.email !== loadedDraftEmail) {
            const loadDraft = async () => {
                const draft = await CacheService.fetchWithCache(`draft_${currentUser.email}`, () => SupabaseService.fetchDraft(currentUser.email), (newDraft) => {
                    if (newDraft) {
                        setFormData(newDraft.form_data || {});
                        setImages(newDraft.images || {});
                        setSignatures(newDraft.signatures || {});
                        setIgnoredChecklists(new Set(newDraft.ignored_checklists || []));
                    }
                });
                if (draft) {
                    setFormData(draft.form_data || {});
                    setImages(draft.images || {});
                    setSignatures(draft.signatures || {});
                    setIgnoredChecklists(new Set(draft.ignored_checklists || []));
                }
                setDraftLoaded(true);
                setLoadedDraftEmail(currentUser.email);
            };
            loadDraft();
        }
    }, [currentUser, loadedDraftEmail]);

    // Sync currentUser with users array (Restoring the broken fragment)
    useEffect(() => {
        if (currentUser) {
            const freshUser = users.find(u => u.email === currentUser.email);
            if (freshUser) {
                if (freshUser.name !== currentUser.name ||
                    freshUser.phone !== currentUser.phone ||
                    freshUser.photo !== currentUser.photo ||
                    freshUser.preferredTheme !== currentUser.preferredTheme ||
                    freshUser.company_id !== currentUser.company_id ||
                    freshUser.area !== currentUser.area ||
                    freshUser.filial !== currentUser.filial) {
                    setCurrentUser(freshUser);
                }
            }
        }
    }, [users]);

    // Restore logged-in session after users load
    useEffect(() => {
        const savedEmail = localStorage.getItem('APP_CURRENT_EMAIL');
        if (savedEmail && !currentUser) {
            const u = users.find(u => u.email === savedEmail);
            if (u) {
                const savedView = localStorage.getItem('APP_CURRENT_VIEW');
                const allowedViews = new Set([
                    'checklist',
                    'summary',
                    'dashboard',
                    'report',
                    'settings',
                    'history',
                    'view_history',
                    'support',
                    'stock',
                    'access',
                    'audit',
                    'logs',
                    'cadastros_globais',
                    ...(PRE_VENCIDOS_MODULE_ENABLED ? ['pre'] : [])
                ]);
                const restoredView = (savedView && allowedViews.has(savedView))
                    ? savedView as 'checklist' | 'summary' | 'dashboard' | 'report' | 'settings' | 'history' | 'view_history' | 'support' | 'stock' | 'access' | 'pre' | 'audit' | 'logs' | 'cadastros_globais'
                    : 'dashboard';
                setCurrentView(restoredView);
                setCurrentUser(u);
                if (!autoLoginLoggedRef.current) {
                    autoLoginLoggedRef.current = true;
                    SupabaseService.insertAppEventLog({
                        company_id: u.company_id || null,
                        branch: u.filial || null,
                        area: u.area || null,
                        user_email: u.email,
                        user_name: u.name,
                        app: 'sistema',
                        event_type: 'login_auto',
                        status: 'success',
                        success: true,
                        source: window.location.pathname || 'web',
                        event_meta: {
                            url: window.location.href,
                            view: restoredView
                        }
                    }).catch(() => { });
                }
            }
        }
    }, [users]);

    useEffect(() => {
        let cancelled = false;

        const evaluateBranchPrompt = async () => {
            if (!currentUser || isLoadingData) return;
            if (currentUser.role === 'MASTER') {
                if (!cancelled) {
                    setShowBranchSelectionModal(false);
                    setBranchPromptCheckedForUser(currentUser.email);
                }
                return;
            }
            if (currentUser.company_id && companies.length === 0) return;
            if (branchPromptCheckedForUser === currentUser.email) return;

            const currentBranch = (currentUser.filial || '').trim();

            if (isMissingBranchValue(currentBranch)) {
                if (cancelled) return;
                setBranchSelectionMode('required');
                setBranchSelectionValue('');
                setBranchSelectionArea('');
                setBranchSelectionMessage(
                    currentUser.company_id
                        ? 'Selecione sua filial para continuar. A área será preenchida automaticamente. Você pode trocar em Configurações quando necessário.'
                        : 'Selecione sua filial para continuar. Como não há empresa vinculada, a área pode permanecer em branco.'
                );
                setShowBranchSelectionModal(true);
                setBranchPromptCheckedForUser(currentUser.email);
                return;
            }

            const logs = await SupabaseService.fetchAppEventLogs({
                userEmail: currentUser.email,
                app: 'sistema',
                eventType: BRANCH_CONFIRM_EVENT_TYPE,
                limit: 1
            });

            if (cancelled) return;

            const lastCheckAt = logs[0]?.created_at ? new Date(String(logs[0].created_at)).getTime() : null;
            const checkExpired =
                !lastCheckAt ||
                Number.isNaN(lastCheckAt) ||
                (Date.now() - lastCheckAt) >= BRANCH_REVALIDATION_DAYS * 24 * 60 * 60 * 1000;

            if (checkExpired) {
                const resolvedArea = resolveAreaFromCompanyBranch(currentUser.company_id, currentBranch) || currentUser.area || '';
                setBranchSelectionMode('confirm');
                setBranchSelectionValue(currentBranch);
                setBranchSelectionArea(resolvedArea);
                setBranchSelectionMessage(`Você permanece na filial ${currentBranch}? Você pode trocar em Configurações a qualquer momento.`);
                setShowBranchSelectionModal(true);
            } else {
                setShowBranchSelectionModal(false);
            }
            setBranchPromptCheckedForUser(currentUser.email);
        };

        evaluateBranchPrompt().catch((error) => {
            console.error('Erro ao validar confirmação de filial:', error);
        });

        return () => {
            cancelled = true;
        };
    }, [
        currentUser?.email,
        currentUser?.role,
        currentUser?.company_id,
        currentUser?.filial,
        currentUser?.area,
        isLoadingData,
        branchPromptCheckedForUser,
        companies
    ]);

    useEffect(() => {
        if (!currentUser?.company_id || currentUser.role !== 'MASTER') return;
        loadGlobalBaseFiles().catch((error) => {
            console.error('Erro ao carregar cadastros globais:', error);
        });
    }, [currentUser?.company_id, currentUser?.role]);

    useEffect(() => {
        if (currentView !== 'cadastros_globais') return;
        if (!currentUser?.company_id || currentUser.role !== 'MASTER') return;
        loadGlobalBaseFiles().catch((error) => {
            console.error('Erro ao atualizar cadastros globais ao abrir a tela:', error);
        });
    }, [currentView, currentUser?.company_id, currentUser?.role]);

    useEffect(() => {
        if (!showBranchSelectionModal || !currentUser?.company_id) return;
        if (!branchSelectionValue) {
            setBranchSelectionArea('');
            return;
        }
        const nextArea = resolveAreaFromCompanyBranch(currentUser.company_id, branchSelectionValue);
        setBranchSelectionArea(nextArea || '');
    }, [showBranchSelectionModal, branchSelectionValue, currentUser?.company_id, companies]);

    const handleKeepCurrentBranch = async () => {
        if (!currentUser) return;
        setIsSavingBranchSelection(true);
        try {
            const currentBranch = (currentUser.filial || '').trim();
            if (isMissingBranchValue(currentBranch)) {
                setBranchSelectionMode('required');
                setBranchSelectionMessage('Selecione sua filial para continuar.');
                return;
            }

            const resolvedArea = resolveAreaFromCompanyBranch(currentUser.company_id, currentBranch);
            if (resolvedArea && resolvedArea !== (currentUser.area || '')) {
                await SupabaseService.updateUser(currentUser.email, { area: resolvedArea });
                setUsers(prev => prev.map(u => u.email === currentUser.email ? { ...u, area: resolvedArea } : u));
                setCurrentUser(prev => prev && prev.email === currentUser.email ? { ...prev, area: resolvedArea } : prev);
            }

            await SupabaseService.insertAppEventLog({
                company_id: currentUser.company_id || null,
                branch: currentBranch || null,
                area: resolvedArea || currentUser.area || null,
                user_email: currentUser.email,
                user_name: currentUser.name,
                app: 'sistema',
                event_type: BRANCH_CONFIRM_EVENT_TYPE,
                status: 'success',
                success: true,
                source: 'web',
                event_meta: {
                    action: 'keep',
                    interval_days: BRANCH_REVALIDATION_DAYS
                }
            });

            setShowBranchSelectionModal(false);
        } catch (error) {
            console.error('Erro ao confirmar filial atual:', error);
            alert('Não foi possível confirmar a filial agora. Tente novamente.');
        } finally {
            setIsSavingBranchSelection(false);
        }
    };

    const loadGlobalBaseFiles = async () => {
        if (!currentUser?.company_id) return;
        setIsLoadingGlobalBaseFiles(true);
        try {
            const files = await SupabaseService.fetchGlobalBaseFilesMeta(currentUser.company_id);
            setGlobalBaseFiles(files);
        } finally {
            setIsLoadingGlobalBaseFiles(false);
        }
    };

    const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const handleUploadGlobalBaseFile = async (slotKey: string, file: File) => {
        if (!currentUser?.company_id) {
            alert('Selecione uma empresa válida para carregar o arquivo.');
            return;
        }
        setUploadingGlobalBaseKey(slotKey);
        try {
            const dataUrl = await fileToDataUrl(file);
            const saved = await SupabaseService.upsertGlobalBaseFile({
                company_id: currentUser.company_id,
                module_key: slotKey,
                file_name: file.name,
                mime_type: file.type || 'application/octet-stream',
                file_size: file.size,
                file_data_base64: dataUrl,
                uploaded_by: currentUser.email
            });
            if (!saved) {
                alert('Não foi possível salvar o arquivo no Supabase.');
                return;
            }
            await loadGlobalBaseFiles();
            await CadastrosBaseService.clearCache();
            SupabaseService.insertAppEventLog({
                company_id: currentUser.company_id || null,
                branch: currentUser.filial || null,
                area: currentUser.area || null,
                user_email: currentUser.email,
                user_name: currentUser.name,
                app: 'cadastros_globais',
                event_type: 'global_base_uploaded',
                entity_type: 'global_base_file',
                entity_id: slotKey,
                status: 'success',
                success: true,
                source: 'web',
                event_meta: {
                    file_name: file.name,
                    file_size: file.size
                }
            }).catch(() => { });
        } catch (error) {
            console.error('Erro ao carregar arquivo base global:', error);
            alert('Erro ao carregar arquivo base.');
        } finally {
            setUploadingGlobalBaseKey(null);
        }
    };

    const handleSaveBranchSelection = async () => {
        if (!currentUser) return;
        const selectedBranch = (branchSelectionValue || '').trim();
        if (!selectedBranch) {
            alert('Selecione uma filial para continuar.');
            return;
        }

        const resolvedArea = resolveAreaFromCompanyBranch(currentUser.company_id, selectedBranch) || branchSelectionArea || '';
        setIsSavingBranchSelection(true);
        try {
            const updated = await SupabaseService.updateUser(currentUser.email, {
                filial: selectedBranch,
                area: resolvedArea || null
            });

            if (!updated) {
                alert('Não foi possível salvar a filial no momento.');
                return;
            }

            setUsers(prev => prev.map(u => u.email === currentUser.email ? {
                ...u,
                filial: selectedBranch,
                area: resolvedArea || null
            } : u));
            setCurrentUser(prev => prev && prev.email === currentUser.email ? {
                ...prev,
                filial: selectedBranch,
                area: resolvedArea || null
            } : prev);

            await SupabaseService.insertAppEventLog({
                company_id: currentUser.company_id || null,
                branch: selectedBranch,
                area: resolvedArea || null,
                user_email: currentUser.email,
                user_name: currentUser.name,
                app: 'sistema',
                event_type: 'branch_changed_on_login',
                entity_type: 'user',
                entity_id: currentUser.email,
                status: 'success',
                success: true,
                source: 'web',
                event_meta: {
                    previous_branch: currentUser.filial || null,
                    previous_area: currentUser.area || null,
                    new_branch: selectedBranch,
                    new_area: resolvedArea || null,
                    mode: branchSelectionMode
                }
            });

            await SupabaseService.insertAppEventLog({
                company_id: currentUser.company_id || null,
                branch: selectedBranch,
                area: resolvedArea || null,
                user_email: currentUser.email,
                user_name: currentUser.name,
                app: 'sistema',
                event_type: BRANCH_CONFIRM_EVENT_TYPE,
                status: 'success',
                success: true,
                source: 'web',
                event_meta: {
                    action: 'change',
                    interval_days: BRANCH_REVALIDATION_DAYS
                }
            });

            setShowBranchSelectionModal(false);
        } catch (error) {
            console.error('Erro ao salvar filial do usuário:', error);
            alert('Não foi possível salvar a filial no momento.');
        } finally {
            setIsSavingBranchSelection(false);
        }
    };

    const lastDraftUpdateRef = useRef<string | null>(null);

    // Sincronização bidirecional - Puxa do Supabase apenas quando usuário está INATIVO
    useEffect(() => {
        if (!currentUser || !draftLoaded) return;

        const syncInterval = setInterval(async () => {
            const timeSinceActivity = Date.now() - lastUserActivity;

            // Pausar sync se usuário está digitando/editando (ativo nos últimos 5 segundos)
            if (timeSinceActivity < ACTIVITY_TIMEOUT) {
                console.log('⏸️ Sync pausado - usuário está editando');
                return;
            }

            if (isSavingRef.current) return; // Não sincronizar durante salvamento

            try {
                // PRIMEIRO: Verifica apenas metadados para economizar transferência
                const meta = await SupabaseService.fetchDraftMetadata(currentUser.email);
                if (!meta || lastDraftUpdateRef.current === meta.updated_at) {
                    return;
                }

                console.log('🔄 Mudança detectada no rascunho remoto, baixando...');
                const remoteDraft = await CacheService.fetchWithCache(`draft_${currentUser.email}`, () => SupabaseService.fetchDraft(currentUser.email));

                if (remoteDraft) {
                    lastDraftUpdateRef.current = remoteDraft.updated_at || null;
                    // Comparar se há diferenças antes de atualizar (evita re-render desnecessário)
                    const hasChanges =
                        JSON.stringify(remoteDraft.form_data) !== JSON.stringify(formData) ||
                        JSON.stringify(remoteDraft.images) !== JSON.stringify(images) ||
                        JSON.stringify(remoteDraft.signatures) !== JSON.stringify(signatures);

                    if (hasChanges) {
                        console.log('🔄 Sincronizando mudanças remotas (usuário inativo)');
                        setFormData(remoteDraft.form_data || {});
                        setImages(remoteDraft.images || {});
                        setSignatures(remoteDraft.signatures || {});
                        setIgnoredChecklists(new Set(remoteDraft.ignored_checklists || []));
                    }
                }
            } catch (error) {
                console.error('❌ Erro na sincronização:', error);
            }
        }, 15000); // Aumentado de 3s para 15s para reduzir carga drastically

        return () => clearInterval(syncInterval);
    }, [currentUser, draftLoaded, formData, images, signatures, lastUserActivity]);

    // Auto-Save com debounce de 1 segundo (aumentado de 300ms)
    useEffect(() => {
        if (!currentUser || !draftLoaded || isLoadingData) return;

        // Registrar atividade do usuário
        setLastUserActivity(Date.now());

        // Cancel previous save
        if (saveDraftAbortControllerRef.current) {
            saveDraftAbortControllerRef.current.abort();
        }

        const abortController = new AbortController();
        saveDraftAbortControllerRef.current = abortController;

        // Debounce de 1 segundo
        const timeoutId = setTimeout(async () => {
            if (abortController.signal.aborted || isSavingRef.current) return;

            isSavingRef.current = true;
            setSyncStatus('saving');

            const result = await SupabaseService.saveDraft({
                user_email: currentUser.email,
                form_data: formData,
                images: images,
                signatures: signatures,
                ignored_checklists: Array.from(ignoredChecklists)
            });

            if (result) {
                await CacheService.set(`draft_${currentUser.email}`, result);
                lastDraftUpdateRef.current = result.updated_at || null;
                setSyncStatus('saved');
                setTimeout(() => setSyncStatus('idle'), 1000);
            } else {
                setSyncStatus('idle');
            }

            isSavingRef.current = false;
        }, 1000); // Aumentado de 300ms para 1000ms para dar mais tempo ao usuário

        return () => {
            clearTimeout(timeoutId);
            abortController.abort();
        };
    }, [formData, images, signatures, ignoredChecklists, currentUser, isLoadingData, draftLoaded]);

    // Save Config to Supabase AND LocalStorage
    useEffect(() => {
        if (!isLoadingData) {
            localStorage.setItem('APP_CONFIG', JSON.stringify(config));

            // Save to Supabase (async, with debounce)
            const timeoutId = setTimeout(async () => {
                await SupabaseService.saveConfig({
                    pharmacy_name: config.pharmacyName,
                    logo: config.logo
                });
            }, 1000);

            return () => clearTimeout(timeoutId);
        }
    }, [config, isLoadingData]);

    // Scroll to top on initial load
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    // Ensure view changes or checklist switches return to top
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [currentView, activeChecklistId]);


    // --- DERIVED STATE ---
    const activeChecklist = checklists.find(c => c.id === activeChecklistId) || checklists[0];
    const currentTheme = THEMES[currentUser?.preferredTheme || 'blue'];

    // Pending users are those NOT approved AND NOT rejected (fresh requests)
    const pendingUsers = users.filter(u => !u.approved && !u.rejected);
    const pendingUsersCount = pendingUsers.length;

    const filteredUsers = users.filter(u => {
        if (userFilterRole !== 'ALL' && u.role !== userFilterRole) return false;
        if (userFilterStatus === 'ACTIVE' && (!u.approved || u.rejected)) return false;
        if (userFilterStatus === 'PENDING' && (u.approved || u.rejected)) return false;
        if (userFilterStatus === 'BANNED' && !u.rejected) return false;
        return true;
    });

    const stockConferenceBranchOptions = useMemo(() => {
        const map = new Map<string, string>();
        stockConferenceHistory.forEach(item => {
            const branchValue = sanitizeStockBranch(item.branch);
            const key = normalizeFilterKey(branchValue);
            if (!map.has(key)) {
                map.set(key, formatBranchFilterLabel(branchValue));
            }
        });
        return Array.from(map.entries())
            .map(([key, label]) => ({ key, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [stockConferenceHistory]);
    const stockConferenceBranchKeys = useMemo(() => stockConferenceBranchOptions.map(option => option.key), [stockConferenceBranchOptions]);

    const stockConferenceAreaOptions = useMemo(() => {
        const map = new Map<string, string>();
        stockConferenceHistory.forEach(item => {
            const label = canonicalizeFilterLabel(sanitizeStockArea(item.area));
            const key = normalizeFilterKey(label);
            if (!map.has(key)) {
                map.set(key, label);
            }
        });
        return Array.from(map.entries())
            .map(([key, label]) => ({ key, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [stockConferenceHistory]);
    const stockConferenceAreaKeys = useMemo(() => stockConferenceAreaOptions.map(option => option.key), [stockConferenceAreaOptions]);

    const filteredStockConferenceHistory = useMemo(() => {
        return stockConferenceHistory.filter(item => {
            const branchKey = normalizeFilterKey(sanitizeStockBranch(item.branch));
            const areaKey = normalizeFilterKey(sanitizeStockArea(item.area));
            const matchesBranch = stockBranchFilters.length === 0 || stockBranchFilters.includes(branchKey);
            const matchesArea = stockAreaFilter === 'all' || areaKey === stockAreaFilter;
            return matchesBranch && matchesArea;
        });
    }, [stockConferenceHistory, stockBranchFilters, stockAreaFilter]);

    const stockMobileTotalPages = useMemo(() => {
        return Math.max(1, Math.ceil(filteredStockConferenceHistory.length / MOBILE_STOCK_HISTORY_PAGE_SIZE));
    }, [filteredStockConferenceHistory.length, MOBILE_STOCK_HISTORY_PAGE_SIZE]);
    const safeStockMobilePage = Math.min(stockMobilePage, Math.max(0, stockMobileTotalPages - 1));

    const pagedStockConferenceHistory = useMemo(() => {
        const start = safeStockMobilePage * MOBILE_STOCK_HISTORY_PAGE_SIZE;
        return filteredStockConferenceHistory.slice(start, start + MOBILE_STOCK_HISTORY_PAGE_SIZE);
    }, [filteredStockConferenceHistory, safeStockMobilePage, MOBILE_STOCK_HISTORY_PAGE_SIZE]);

    useEffect(() => {
        setStockBranchFilters(prev => {
            const filtered = prev.filter(branchKey => stockConferenceBranchKeys.includes(branchKey));
            return filtered.length === prev.length ? prev : filtered;
        });
    }, [stockConferenceBranchKeys]);

    useEffect(() => {
        if (stockAreaFilter !== 'all' && !stockConferenceAreaKeys.includes(stockAreaFilter)) {
            setStockAreaFilter('all');
        }
    }, [stockConferenceAreaKeys, stockAreaFilter]);

    useEffect(() => {
        setStockMobilePage(0);
    }, [stockBranchFilters, stockAreaFilter]);

    // --- HANDLERS ---

    // Migration Handlers
    const handleBackupDownload = () => {
        SupabaseService.exportLocalStorageBackup();
        alert('✅ Backup baixado com sucesso!');
    };

    const handleMigration = async () => {
        if (!confirm('Deseja migrar todos os dados para o Supabase?\n\nIsso incluirá:\n- Usuários\n- Configurações\n- Relatórios\n- Rascunhos')) {
            return;
        }

        setIsMigrating(true);
        setMigrationStatus('Migrando dados...');

        const results = await SupabaseService.migrateLocalStorageToSupabase();

        if (results) {
            const message = `✅ Migração concluída!\n\nUsuários: ${results.users}\nRelatórios: ${results.reports}\nRascunhos: ${results.drafts}\nConfig: ${results.config ? 'Sim' : 'Não'}`;
            setMigrationStatus(message);
            // Feedback explícito ao usuário
            alert(message);
            setTimeout(() => {
                setShowMigrationPanel(false);
                window.location.reload();
            }, 3000);
        } else {
            const errorMsg = '❌ Erro na migração. Tente novamente.';
            setMigrationStatus(errorMsg);
            alert(errorMsg);
        }

        setIsMigrating(false);
    };

    const handleLogin = (user: User) => {
        // Persist session so F5 doesn't log the user out
        localStorage.setItem('APP_CURRENT_EMAIL', user.email);
        localStorage.setItem('APP_CURRENT_VIEW', 'dashboard');
        setCurrentView('dashboard');
        setCurrentUser(user);
        setBranchPromptCheckedForUser(null);
        setShowBranchSelectionModal(false);

        SupabaseService.insertAppEventLog({
            company_id: user.company_id || null,
            branch: user.filial || null,
            area: user.area || null,
            user_email: user.email,
            user_name: user.name,
            app: 'sistema',
            event_type: 'login',
            status: 'success',
            success: true,
            source: window.location.pathname || 'web',
            event_meta: {
                url: window.location.href,
                view: 'dashboard'
            }
        }).catch(() => { });
    };
    const handleLogout = useCallback(async () => {
        if (logoutInFlightRef.current) return;
        logoutInFlightRef.current = true;
        const userSnapshot = currentUser;
        const viewSnapshot = currentView;

        if (userSnapshot?.email) {
            SupabaseService.insertAppEventLog({
                company_id: userSnapshot.company_id || null,
                branch: userSnapshot.filial || null,
                area: userSnapshot.area || null,
                user_email: userSnapshot.email,
                user_name: userSnapshot.name,
                app: 'sistema',
                event_type: 'logout',
                status: 'success',
                success: true,
                source: window.location.pathname || 'web',
                event_meta: { view: viewSnapshot }
            }).catch(() => { });
        }

        // Hard logout: remove active session immediately (not only via useEffect cleanup)
        try {
            await SupabaseService.sendSessionCommand(clientIdRef.current, null);
            await SupabaseService.deleteActiveSession(clientIdRef.current);
        } catch { }

        // Clear persisted session on logout
        localStorage.removeItem('APP_CURRENT_EMAIL');
        localStorage.removeItem('APP_CURRENT_VIEW');
        localStorage.removeItem('APP_VIEWING_REPORT_ID');
        localStorage.removeItem('APP_VIEWING_STOCK_REPORT_ID');
        localStorage.removeItem('APP_VIEW_HISTORY_ITEM');
        localStorage.removeItem('APP_VIEW_STOCK_REPORT');

        setBranchPromptCheckedForUser(null);
        setShowBranchSelectionModal(false);
        setCurrentUser(null);
        setFormData({}); // Clear state from memory, relies on draft re-load
        setImages({});
        setSignatures({});
        setViewHistoryItem(null);
        setViewingStockConferenceReport(null);
        setRemoteForceLogoutDeadline(null);
        setCurrentView('dashboard');
        logoutInFlightRef.current = false;
    }, [currentUser, currentView]);

    const handleRemoteForceLogoutNow = useCallback(async () => {
        setRemoteForceLogoutDeadline(null);
        try {
            await SupabaseService.deleteActiveSession(clientIdRef.current);
        } catch { }
        await handleLogout();
    }, [handleLogout]);

    // --- SESSION MANAGEMENT & HEARTBEAT ---
    useEffect(() => {
        if (!currentUser) return;

        const performHeartbeat = async () => {
            if (remoteForceLogoutDeadline) return;
            try {
                await SupabaseService.upsertActiveSession({
                    client_id: clientIdRef.current,
                    user_email: currentUser.email,
                    user_name: currentUser.name || null,
                    branch: currentUser.filial || null,
                    area: currentUser.area || null,
                    current_view: mapViewToAppName(currentView),
                    last_ping: new Date().toISOString()
                });
            } catch (err) {
                console.error('Heartbeat error:', err);
            }
        };

        performHeartbeat();
        const interval = setInterval(performHeartbeat, 20000);
        const handleWakeHeartbeat = () => {
            if (!document.hidden) performHeartbeat();
        };
        document.addEventListener('visibilitychange', handleWakeHeartbeat);
        window.addEventListener('focus', handleWakeHeartbeat);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleWakeHeartbeat);
            window.removeEventListener('focus', handleWakeHeartbeat);
            SupabaseService.deleteActiveSession(clientIdRef.current).catch(() => { });
        };
    }, [currentUser?.email, currentView, remoteForceLogoutDeadline]);

    useEffect(() => {
        if (!currentUser || !remoteForceLogoutDeadline) return;
        const timer = setInterval(() => {
            if (Date.now() >= remoteForceLogoutDeadline) {
                clearInterval(timer);
                void handleRemoteForceLogoutNow();
                return;
            }
            setRemoteForceLogoutTick(prev => prev + 1);
        }, 250);
        return () => clearInterval(timer);
    }, [currentUser?.email, remoteForceLogoutDeadline, handleRemoteForceLogoutNow]);

    useEffect(() => {
        if (!currentUser) return;
        let isCheckingCommand = false;
        const checkSessionCommand = async () => {
            if (isCheckingCommand) return;
            if (document.hidden) return;
            isCheckingCommand = true;
            try {
                const mySession = await SupabaseService.fetchActiveSessionByClientId(clientIdRef.current);

                if (mySession?.command === 'FORCE_LOGOUT') {
                    if (!remoteForceLogoutDeadline) {
                        setRemoteForceLogoutDeadline(Date.now() + 10000);
                        setRemoteForceLogoutTick(0);
                    }
                } else if (mySession?.command === 'RELOAD') {
                    await SupabaseService.sendSessionCommand(clientIdRef.current, null);
                    window.location.reload();
                }
            } catch (error) {
                console.error('Error checking session commands:', error);
            } finally {
                isCheckingCommand = false;
            }
        };

        checkSessionCommand();
        const commandInterval = setInterval(checkSessionCommand, SESSION_COMMAND_POLL_MS);
        const handleWakeCommandCheck = () => {
            if (!document.hidden) checkSessionCommand();
        };
        document.addEventListener('visibilitychange', handleWakeCommandCheck);
        window.addEventListener('focus', handleWakeCommandCheck);

        return () => {
            clearInterval(commandInterval);
            document.removeEventListener('visibilitychange', handleWakeCommandCheck);
            window.removeEventListener('focus', handleWakeCommandCheck);
        };
    }, [currentUser?.email, handleLogout, remoteForceLogoutDeadline, SESSION_COMMAND_POLL_MS]);

    // Polling curto para fila de aprovação de usuários (evita atraso para aparecer novos cadastros).
    useEffect(() => {
        if (!currentUser) return;
        if (!hasModuleAccess('userApproval')) return;
        if (currentView !== 'access') return;

        let cancelled = false;
        let inFlight = false;

        const refreshUsers = async () => {
            if (inFlight) return;
            inFlight = true;
            try {
                const dbUsers = await SupabaseService.fetchUsers();
                if (cancelled) return;
                const mapped = (dbUsers || []).map(u => ({ ...u, preferredTheme: u.preferred_theme as ThemeColor | undefined }));
                setUsers(mapped);
                await CacheService.set('users_list', dbUsers || []);
            } catch (error) {
                console.error('Erro ao atualizar usuários pendentes:', error);
            } finally {
                inFlight = false;
            }
        };

        refreshUsers();
        const interval = setInterval(refreshUsers, USER_APPROVAL_POLL_MS);
        const handleWake = () => {
            if (!document.hidden) refreshUsers();
        };
        document.addEventListener('visibilitychange', handleWake);
        window.addEventListener('focus', handleWake);

        return () => {
            cancelled = true;
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleWake);
            window.removeEventListener('focus', handleWake);
        };
    }, [currentUser?.email, currentUser?.role, accessMatrix, currentView, USER_APPROVAL_POLL_MS]);

    const handleRegister = async (newUser: User) => {
        try {
            const created = await SupabaseService.createUser(newUser);
            setUsers(prev => [...prev, created]);
            if (currentUser?.email) {
                SupabaseService.insertAppEventLog({
                    company_id: currentUser.company_id || null,
                    branch: currentUser.filial || null,
                    area: currentUser.area || null,
                    user_email: currentUser.email,
                    user_name: currentUser.name,
                    app: 'configuracoes',
                    event_type: 'user_created',
                    entity_type: 'user',
                    entity_id: created?.email || newUser.email,
                    status: 'success',
                    success: true,
                    source: 'web',
                    event_meta: { created_user: created?.email || newUser.email, role: created?.role || newUser.role }
                }).catch(() => { });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : JSON.stringify(error);
            console.error('Erro ao registrar usuário:', error);
            setUsers(prev => [...prev, newUser]);
            alert(`Falha ao enviar cadastro para o Supabase (${message}). O perfil foi salvo localmente.`);
        }
    };

    const updateUserStatus = async (email: string, approved: boolean) => {
        // Update in Supabase
        await SupabaseService.updateUser(email, { approved, rejected: false });
        // Update local state
        setUsers(prev => prev.map(u => u.email === email ? { ...u, approved, rejected: false } : u));
        if (currentUser?.email) {
            SupabaseService.insertAppEventLog({
                company_id: currentUser.company_id || null,
                branch: currentUser.filial || null,
                area: currentUser.area || null,
                user_email: currentUser.email,
                user_name: currentUser.name,
                app: 'configuracoes',
                event_type: approved ? 'user_approved' : 'user_updated',
                entity_type: 'user',
                entity_id: email,
                status: 'success',
                success: true,
                source: 'web',
                event_meta: { target_user: email, approved }
            }).catch(() => { });
        }
    };

    const handleRejectUser = async (email: string, skipConfirm = true) => {
        // Update in Supabase
        await SupabaseService.updateUser(email, { approved: false, rejected: true });
        // Update local state
        setUsers(prev => prev.map(u => u.email === email ? { ...u, approved: false, rejected: true } : u));
        if (currentUser?.email) {
            SupabaseService.insertAppEventLog({
                company_id: currentUser.company_id || null,
                branch: currentUser.filial || null,
                area: currentUser.area || null,
                user_email: currentUser.email,
                user_name: currentUser.name,
                app: 'configuracoes',
                event_type: 'user_blocked',
                entity_type: 'user',
                entity_id: email,
                status: 'success',
                success: true,
                source: 'web',
                event_meta: { target_user: email }
            }).catch(() => { });
        }
    };

     const handleDeleteUser = async (email: string) => {
         const confirmed = window.confirm("Tem certeza que deseja excluir permanentemente este usuário? Esta ação não pode ser desfeita.");
         if (!confirmed) return;
 
         try {
             const success = await SupabaseService.deleteUser(email);
             if (success) {
                 setUsers(prev => prev.filter(u => u.email !== email));
                 if (currentUser?.email) {
                     SupabaseService.insertAppEventLog({
                         company_id: currentUser.company_id || null,
                         branch: currentUser.filial || null,
                         area: currentUser.area || null,
                         user_email: currentUser.email,
                         user_name: currentUser.name,
                         app: 'configuracoes',
                         event_type: 'user_deleted',
                         entity_type: 'user',
                         entity_id: email,
                         status: 'success',
                         success: true,
                         source: 'web',
                         event_meta: { target_user: email }
                     }).catch(() => { });
                 }
             } else {
                 alert("Erro ao excluir usuário no banco de dados.");
             }
         } catch (error) {
             console.error("Erro ao excluir usuário:", error);
             alert("Ocorreu um erro ao tentar excluir o usuário.");
         }
     };

    const handleUpdateUserProfile = async (field: keyof User, value: string | null) => {
        if (!currentUser) return;

        // Custom handling for phone in profile to limit 11 digits
        if (field === 'phone') {
            const val = (value || '').replace(/\D/g, '');
            if (val.length <= 11) {
                setProfilePhoneError(''); // clear error on type
                setUsers(prevUsers => prevUsers.map(u => u.email === currentUser.email ? { ...u, phone: val } : u));
                // Update in Supabase
                await SupabaseService.updateUser(currentUser.email, { phone: val });
            }
        } else {
            setUsers(prevUsers => prevUsers.map(u => u.email === currentUser.email ? { ...u, [field]: value } : u));
            // Update in Supabase
            await SupabaseService.updateUser(currentUser.email, { [field]: value } as any);
            if (currentUser?.email && ['company_id', 'area', 'filial', 'role'].includes(field)) {
                SupabaseService.insertAppEventLog({
                    company_id: currentUser.company_id || null,
                    branch: currentUser.filial || null,
                    area: currentUser.area || null,
                    user_email: currentUser.email,
                    user_name: currentUser.name,
                    app: 'configuracoes',
                    event_type: 'user_updated',
                    entity_type: 'user',
                    entity_id: currentUser.email,
                    status: 'success',
                    success: true,
                    source: 'web',
                    event_meta: { field, value }
                }).catch(() => { });
            }
        }
    };

    const handleProfilePhoneBlur = () => {
        if (currentUser?.phone && currentUser.phone.length !== 11) {
            setProfilePhoneError('Formato inválido. Digite DDD (2) + Número (9).');
        }
    };


    const handleUserPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const photo = reader.result as string;
                // Update state
                setUsers(prevUsers => prevUsers.map(u => u.email === currentUser?.email ? { ...u, photo } : u));
                // Update in Supabase
                if (currentUser) {
                    await SupabaseService.updateUser(currentUser.email, { photo });
                    SupabaseService.insertAppEventLog({
                        company_id: currentUser.company_id || null,
                        branch: currentUser.filial || null,
                        area: currentUser.area || null,
                        user_email: currentUser.email,
                        user_name: currentUser.name,
                        app: 'configuracoes',
                        event_type: 'user_updated',
                        entity_type: 'user',
                        entity_id: currentUser.email,
                        status: 'success',
                        success: true,
                        source: 'web',
                        event_meta: { field: 'photo' }
                    }).catch(() => { });
                }
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const handleUpdateUserTheme = async (theme: ThemeColor) => {
        if (!currentUser) return;

        // Update user's preferred theme
        setUsers(prevUsers => prevUsers.map(u =>
            u.email === currentUser.email ? { ...u, preferredTheme: theme } : u
        ));

        // Save to Supabase (map camelCase to snake_case)
        await SupabaseService.updateUser(currentUser.email, { preferred_theme: theme } as any);
        SupabaseService.insertAppEventLog({
            company_id: currentUser.company_id || null,
            branch: currentUser.filial || null,
            area: currentUser.area || null,
            user_email: currentUser.email,
            user_name: currentUser.name,
            app: 'configuracoes',
            event_type: 'user_updated',
            entity_type: 'user',
            entity_id: currentUser.email,
            status: 'success',
            success: true,
            source: 'web',
            event_meta: { field: 'preferred_theme', value: theme }
        }).catch(() => { });
    }; const handleSaveProfileAndSecurity = async () => {
        if (!currentUser) return;

        // Validate Phone
        if (currentUser.phone) {
            const cleanPhone = currentUser.phone.replace(/\D/g, '');
            if (cleanPhone.length !== 11) {
                setSaveShake(true);
                setProfilePhoneError('Formato inválido. Digite DDD (2) + Número (9).');
                setTimeout(() => setSaveShake(false), 500);
                alert("O telefone deve conter exatamente 11 dígitos (DDD + Número).");
                return;
            }
        }

        // Validate Password Logic if attempted
        if (newPassInput || confirmPassInput) {
            if (newPassInput !== confirmPassInput) {
                setSaveShake(true);
                setTimeout(() => setSaveShake(false), 500);
                alert("Erro: As senhas não coincidem. Verifique os campos em vermelho.");
                return;
            }
            if (newPassInput.length < 6) {
                setSaveShake(true);
                setTimeout(() => setSaveShake(false), 500);
                alert("Erro: A senha deve ter pelo menos 6 caracteres.");
                return;
            }
            // Update Password in local state
            setUsers(prevUsers => prevUsers.map(u => u.email === currentUser.email ? { ...u, password: newPassInput } : u));
            // Update Password in Supabase
            await SupabaseService.updateUser(currentUser.email, { password: newPassInput });
        }

        // Clear password fields
        setNewPassInput('');
        setConfirmPassInput('');

        alert("Dados e configurações atualizados com sucesso!");
    };

    // Internal User Creation Handlers
    const handleInternalPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, '');
        if (val.length <= 11) {
            setNewUserPhone(val);
        }
        setInternalPhoneError('');
    };

    const handleInternalPhoneBlur = () => {
        if (newUserPhone.length > 0 && newUserPhone.length !== 11) {
            setInternalPhoneError('Formato inválido. Digite DDD (2) + Número (9).');
        }
    };


    const handleCreateUserInternal = async () => {
        if (!newUserName || !newUserEmail || !newUserPass || !newUserPhone || !newUserConfirmPass) {
            alert("Preencha todos os campos.");
            return;
        }
        if (newUserRole !== 'MASTER' && isMissingBranchValue(newUserFilial)) {
            alert("Usuários não-master devem ser criados com filial definida.");
            return;
        }

        // Validate Phone
        const cleanPhone = newUserPhone.replace(/\D/g, '');
        if (cleanPhone.length !== 11) {
            setInternalShake(true);
            setInternalPhoneError('Formato inválido. Digite DDD (2) + Número (9).');
            setTimeout(() => setInternalShake(false), 500);
            alert("⚠️ O telefone deve conter exatamente 11 dígitos (DDD + Número).");
            return;
        }

        // Validate Passwords
        if (newUserPass !== newUserConfirmPass) {
            setInternalShake(true);
            setTimeout(() => setInternalShake(false), 500);
            alert("As senhas não coincidem.");
            return;
        }

        if (newUserPass.length < 6) {
            setInternalShake(true);
            setTimeout(() => setInternalShake(false), 500);
            alert("A senha deve ter pelo menos 6 caracteres.");
            return;
        }

        if (users.find(u => u.email === newUserEmail)) {
            alert("Email já cadastrado.");
            return;
        }

        const newUser: User = {
            name: newUserName,
            email: newUserEmail,
            phone: newUserPhone,
            password: newUserPass,
            role: newUserRole,
            approved: true, // Internal creation is auto-approved
            rejected: false,
            company_id: newUserCompanyId || null,
            area: newUserArea || null,
            filial: newUserFilial || null
        };

        try {
            const created = await SupabaseService.createUser(newUser);
            setUsers(prev => [...prev, created]);
        } catch (error) {
            console.error('Erro ao criar usuário interno:', error);
            const message = error instanceof Error ? error.message : JSON.stringify(error);
            alert(`Não foi possível criar o usuário Administrativo no Supabase (${message}).`);
            return;
        }

        setNewUserName('');
        setNewUserEmail('');
        setNewUserPhone('');
        setNewUserPass('');
        setNewUserConfirmPass('');
        setInternalPhoneError('');
        setNewUserRole('USER');
        setNewUserCompanyId('');
        setNewUserArea('');
        setNewUserFilial('');
        alert("Usuário criado com sucesso!");
    };

    const handleDeleteHistoryItem = async (itemId: string) => {
        if (confirm("Atenção: Esta ação é irreversível. Tem certeza que deseja excluir permanentemente este relatório?")) {
            // Delete from Supabase
            await SupabaseService.deleteReport(itemId);
            // Delete from local state
            setReportHistory(prev => prev.filter(item => item.id !== itemId));
            // If viewing deleted item, go back to list
            if (viewHistoryItem?.id === itemId) {
                handleCloseReport();
            }
        }
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setConfig(prev => ({ ...prev, logo: reader.result as string }));
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const handleInputChange = (itemId: string, value: string | boolean | number) => {
        // Determine which checklist we are editing (Draft or History View - although history is read only)
        if (currentView === 'view_history') return;

        // --- BASIC INFO SYNC LOGIC ---
        // If updating a global field (Name, Filial, Manager, Date), sync it across all checklists
        // IDs must match those in INFO_BASICA_SECTION (empresa, nome_coordenador, filial, area, gestor, data_aplicacao)
        const isGlobalField = ['empresa', 'nome_coordenador', 'filial', 'area', 'gestor', 'data_aplicacao'].includes(itemId);

        setFormData(prev => {
            const newData = { ...prev };

            // Update the current checklist data
            newData[activeChecklistId] = {
                ...(newData[activeChecklistId] || {}),
                [itemId]: value
            };

            // If this is a global field, update it in ALL other checklists as well
            if (isGlobalField) {
                checklists.forEach(cl => {
                    if (cl.id !== activeChecklistId) {
                        newData[cl.id] = {
                            ...(newData[cl.id] || {}),
                            [itemId]: value
                        };
                    }
                });
            }

            // Salvar imediatamente no localStorage
            if (currentUser) {
                const allDrafts = JSON.parse(localStorage.getItem('APP_DRAFTS') || '{}');
                allDrafts[currentUser.email] = {
                    formData: newData,
                    images: images,
                    signatures: signatures,
                    ignoredChecklists: Array.from(ignoredChecklists)
                };
                localStorage.setItem('APP_DRAFTS', JSON.stringify(allDrafts));
            }

            return newData;
        });
    };

    const openChecklistEditor = (checklistId: string) => {
        const base = checklists.find(c => c.id === checklistId);
        if (!base) return;
        setEditingChecklistId(checklistId);
        setEditingChecklistDefinition(JSON.parse(JSON.stringify(base)));
    };

    const closeChecklistEditor = () => {
        setEditingChecklistDefinition(null);
        setEditingChecklistId(null);
    };

    const updateEditingDefinition = (updater: (draft: ChecklistDefinition) => ChecklistDefinition) => {
        setEditingChecklistDefinition(prev => {
            if (!prev) return prev;
            const draft = JSON.parse(JSON.stringify(prev)) as ChecklistDefinition;
            return updater(draft);
        });
    };

    const handleSectionTitleChange = (sectionId: string, title: string) => {
        updateEditingDefinition((draft) => ({
            ...draft,
            sections: draft.sections.map(section =>
                section.id === sectionId ? { ...section, title } : section
            )
        }));
    };

    const handleRemoveSection = (sectionId: string) => {
        updateEditingDefinition((draft) => ({
            ...draft,
            sections: draft.sections.filter(section => section.id !== sectionId)
        }));
    };

    const handleAddSection = () => {
        const newSection: ChecklistSection = {
            id: generateId('section'),
            title: 'Nova Seção',
            items: []
        };
        updateEditingDefinition((draft) => ({
            ...draft,
            sections: [...draft.sections, newSection]
        }));
    };

    const handleAddQuestion = (sectionId: string) => {
        const newItem: ChecklistItem = {
            id: generateId('item'),
            text: 'Nova pergunta',
            type: InputType.TEXT,
            required: true
        };
        updateEditingDefinition((draft) => ({
            ...draft,
            sections: draft.sections.map(section =>
                section.id === sectionId ? { ...section, items: [...section.items, newItem] } : section
            )
        }));
    };

    const handleRemoveQuestion = (sectionId: string, itemId: string) => {
        updateEditingDefinition((draft) => ({
            ...draft,
            sections: draft.sections.map(section =>
                section.id === sectionId
                    ? { ...section, items: section.items.filter(item => item.id !== itemId) }
                    : section
            )
        }));
    };

    const handleItemTextChange = (sectionId: string, itemId: string, text: string) => {
        updateEditingDefinition((draft) => ({
            ...draft,
            sections: draft.sections.map(section =>
                section.id === sectionId
                    ? {
                        ...section,
                        items: section.items.map(item =>
                            item.id === itemId ? { ...item, text } : item
                        )
                    }
                    : section
            )
        }));
    };

    const handleItemTypeChange = (sectionId: string, itemId: string, type: InputType) => {
        updateEditingDefinition((draft) => ({
            ...draft,
            sections: draft.sections.map(section =>
                section.id === sectionId
                    ? {
                        ...section,
                        items: section.items.map(item =>
                            item.id === itemId ? { ...item, type } : item
                        )
                    }
                    : section
            )
        }));
    };

    const handleItemRequiredToggle = (sectionId: string, itemId: string, required: boolean) => {
        updateEditingDefinition((draft) => ({
            ...draft,
            sections: draft.sections.map(section =>
                section.id === sectionId
                    ? {
                        ...section,
                        items: section.items.map(item =>
                            item.id === itemId ? { ...item, required } : item
                        )
                    }
                    : section
            )
        }));
    };

    const handleSaveChecklistDefinition = async () => {
        if (!editingChecklistDefinition || !editingChecklistId) return;
        setIsSavingChecklistDefinition(true);
        try {
            await SupabaseService.upsertChecklistDefinition(editingChecklistDefinition);
            setChecklists(prev => {
                const exists = prev.some(entry => entry.id === editingChecklistDefinition.id);
                const updated = prev.map(entry =>
                    entry.id === editingChecklistDefinition.id ? editingChecklistDefinition : entry
                );
                if (!exists) {
                    updated.push(editingChecklistDefinition);
                }
                return updated;
            });
            alert('Checklist atualizado com sucesso.');
            closeChecklistEditor();
        } catch (error) {
            console.error('Erro ao salvar checklist:', error);
            alert('Não foi possível salvar as alterações do checklist.');
        } finally {
            setIsSavingChecklistDefinition(false);
        }
    };

    const handleImageUpload = async (sectionId: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            alert('❌ Arquivo muito grande! O limite é 10MB.');
            e.target.value = '';
            return;
        }
        try {
            const compressedBase64 = await ImageUtils.compressImage(file, { maxWidth: 1200, quality: 0.7 });
            setImages(prev => {
                const currentListImages = prev[activeChecklistId] || {};
                const sectionImages = currentListImages[sectionId] || [];
                return {
                    ...prev,
                    [activeChecklistId]: { ...currentListImages, [sectionId]: [...sectionImages, compressedBase64] }
                };
            });
            if (currentUser?.email) {
                SupabaseService.insertAppEventLog({
                    company_id: currentUser.company_id || null,
                    branch: currentUser.filial || null,
                    area: currentUser.area || null,
                    user_email: currentUser.email,
                    user_name: currentUser.name,
                    app: 'checklists',
                    event_type: 'checklist_image_added',
                    entity_type: 'checklist_section',
                    entity_id: `${activeChecklistId || 'unknown'}:${sectionId}`,
                    status: 'success',
                    success: true,
                    source: 'web',
                    event_meta: { checklist_id: activeChecklistId, section_id: sectionId }
                }).catch(() => { });
            }
            e.target.value = '';
        } catch (error) {
            console.error('❌ Erro no upload:', error);
            alert('❌ Erro ao processar a imagem.');
            e.target.value = '';
        }
    };

    const removeImage = (sectionId: string, index: number) => {
        setImages(prev => {
            const currentListImages = prev[activeChecklistId] || {};
            const sectionImages = [...(currentListImages[sectionId] || [])];
            sectionImages.splice(index, 1);
            return {
                ...prev,
                [activeChecklistId]: {
                    ...currentListImages,
                    [sectionId]: sectionImages
                }
            };
        });
    };

    const handleSignature = async (role: string, dataUrl: string) => {
        try {
            const compressed = await ImageUtils.compressImage(dataUrl, { maxWidth: 600, quality: 0.6 });
            setSignatures(prev => {
                const updated = { ...prev };
                checklists.forEach(cl => {
                    updated[cl.id] = { ...(prev[cl.id] || {}), [role]: compressed };
                });
                if (currentUser) {
                    const allDrafts = JSON.parse(localStorage.getItem('APP_DRAFTS') || '{}');
                    allDrafts[currentUser.email] = { ...allDrafts[currentUser.email], signatures: updated };
                    localStorage.setItem('APP_DRAFTS', JSON.stringify(allDrafts));
                }
                return updated;
            });
        } catch (error) {
            console.error('❌ Erro ao comprimir assinatura:', error);
        }
    };

    // Helper to get data source (Draft or History Item)
    const getDataSource = (checkId: string) => {
        if (currentView === 'view_history' && viewHistoryItem) {
            return {
                data: viewHistoryItem.formData[checkId] || {},
                imgs: viewHistoryItem.images[checkId] || {},
                sigs: viewHistoryItem.signatures[checkId] || {}
            }
        }
        return {
            data: formData[checkId] || {},
            imgs: images[checkId] || {},
            sigs: signatures[checkId] || {}
        }
    };

    const getInputValue = (itemId: string, checklistId = activeChecklistId) => {
        const source = getDataSource(checklistId);
        return source.data[itemId] ?? '';
    };

    // --- ACTIONS ---

    const handleResetChecklist = () => {
        // Simple, direct confirmation. No event preventDefault magic needed here if connected properly.
        const shouldReset = window.confirm(
            "⚠️ TEM CERTEZA QUE DESEJA RECOMEÇAR?\n\nTodas as informações não salvas serão perdidas."
        );

        if (shouldReset) {
            if (currentUser) {
                // Delete from localStorage
                const allDrafts = JSON.parse(localStorage.getItem('APP_DRAFTS') || '{}');
                delete allDrafts[currentUser.email];
                localStorage.setItem('APP_DRAFTS', JSON.stringify(allDrafts));
                // Delete from Supabase (async, no await needed for UI reset)
                SupabaseService.deleteDraft(currentUser.email);
            }
            window.location.reload();
        }
    };

    const handleFinalizeAndSave = async () => {
        if (!currentUser) return;
        setIsSaving(true);

        try {
            // Get active checklists (not marked as "Não se Aplica")
            const activeChecklistIds = checklists.filter(cl => !ignoredChecklists.has(cl.id)).map(cl => cl.id);

            console.log('🔍 DEBUG - Checklists ativos:', activeChecklistIds);
            console.log('🔍 DEBUG - Checklists ignorados:', Array.from(ignoredChecklists));

            // VALIDAÇÃO 1: Deve ter pelo menos um checklist ativo
            if (activeChecklistIds.length === 0) {
                alert(
                    "❌ ERRO: Nenhum checklist ativo!\n\n" +
                    "Para finalizar, você precisa:\n" +
                    "✓ Preencher 100% de pelo menos UM checklist\n\n" +
                    "💡 Dica: Complete um checklist totalmente antes de finalizar."
                );
                setIsSaving(false);
                return;
            }

            // VALIDAÇÃO 2: Verificar se pelo menos UM checklist está 100% completo
            const completeChecklists = activeChecklistIds.filter(id => isChecklistComplete(id));

            console.log('🔍 DEBUG - Checklists completos:', completeChecklists);
            console.log('🔍 DEBUG - Total completos:', completeChecklists.length);

            if (completeChecklists.length === 0) {
                // Calcular percentual de cada checklist ativo
                const checklistStatus = activeChecklistIds.map(id => {
                    const cl = checklists.find(c => c.id === id);
                    const stats = getChecklistStats(id);
                    const sigs = signatures[id] || {};

                    // Contar campos obrigatórios preenchidos
                    let requiredFilled = 0;
                    let requiredTotal = 0;

                    cl?.sections.forEach(section => {
                        section.items.forEach(item => {
                            if (item.required) {
                                requiredTotal++;
                                const val = getInputValue(item.id, id);
                                if (val !== '' && val !== null && val !== undefined) {
                                    requiredFilled++;
                                }
                            }
                        });
                    });

                    // Contar assinaturas (2 obrigatórias)
                    const hasSigs = (sigs['gestor'] ? 1 : 0) + (sigs['coordenador'] ? 1 : 0);
                    const totalRequired = requiredTotal + 2; // +2 para as assinaturas
                    const totalFilled = requiredFilled + hasSigs;

                    const percentage = totalRequired > 0 ? Math.round((totalFilled / totalRequired) * 100) : 0;

                    console.log(`🔍 DEBUG - ${cl?.title}: ${percentage}% (${totalFilled}/${totalRequired})`);

                    return {
                        id: id,
                        title: cl?.title || '',
                        percentage: percentage,
                        missing: totalRequired - totalFilled
                    };
                });

                const statusText = checklistStatus
                    .map(s => `  • ${s.title}: ${s.percentage}% (faltam ${s.missing} campos)`)
                    .join('\n');

                alert(
                    "⚠️ ATENÇÃO: Nenhum checklist está 100% completo!\n\n" +
                    "📊 Status atual:\n" +
                    statusText + "\n\n" +
                    "🚫 NÃO É POSSÍVEL FINALIZAR\n\n" +
                    "Para finalizar, você DEVE:\n" +
                    "✓ Preencher 100% de pelo menos UM checklist\n" +
                    "✓ OU marcar os checklists incompletos como 'Não se Aplica'\n\n" +
                    "💡 Dica: Complete todos os campos obrigatórios e ambas as assinaturas."
                );

                // Navegar para o checklist com maior percentual
                const bestChecklist = checklistStatus.reduce((best, current) =>
                    current.percentage > best.percentage ? current : best
                );

                setActiveChecklistId(bestChecklist.id);
                setCurrentView('checklist');
                setShowErrors(true);
                setTimeout(() => {
                    scrollToFirstMissing(bestChecklist.id);
                }, 300);

                console.log('❌ BLOQUEADO - Nenhum checklist 100% completo');
                setIsSaving(false);
                return;
            }

            // VALIDAÇÃO 3: Verificar se há checklists INCOMPLETOS entre os ativos
            const incompleteChecklists = activeChecklistIds.filter(id => !isChecklistComplete(id));

            console.log('🔍 DEBUG - Checklists incompletos:', incompleteChecklists);

            if (incompleteChecklists.length > 0) {
                const incompleteNames = incompleteChecklists.map(id => {
                    const cl = checklists.find(c => c.id === id);
                    const stats = getChecklistStats(id);
                    const sigs = signatures[id] || {};

                    // Calcular percentual
                    let requiredFilled = 0;
                    let requiredTotal = 0;

                    cl?.sections.forEach(section => {
                        section.items.forEach(item => {
                            if (item.required) {
                                requiredTotal++;
                                const val = getInputValue(item.id, id);
                                if (val !== '' && val !== null && val !== undefined) {
                                    requiredFilled++;
                                }
                            }
                        });
                    });

                    const hasSigs = (sigs['gestor'] ? 1 : 0) + (sigs['coordenador'] ? 1 : 0);
                    const totalRequired = requiredTotal + 2;
                    const totalFilled = requiredFilled + hasSigs;
                    const percentage = totalRequired > 0 ? Math.round((totalFilled / totalRequired) * 100) : 0;

                    return `  • ${cl?.title}: ${percentage}% preenchido`;
                }).join('\n');

                const completeNames = completeChecklists.map(id => {
                    const cl = checklists.find(c => c.id === id);
                    return `  ✅ ${cl?.title}`;
                }).join('\n');

                alert(
                    "🚨 CHECKLISTS INCOMPLETOS DETECTADOS!\n\n" +
                    "Checklists completos (100%):\n" +
                    completeNames + "\n\n" +
                    "⚠️ Checklists incompletos:\n" +
                    incompleteNames + "\n\n" +
                    "🚫 VOCÊ NÃO PODE FINALIZAR COM CHECKLISTS INCOMPLETOS!\n\n" +
                    "Escolha UMA das opções:\n" +
                    "1️⃣ COMPLETAR: Preencher 100% dos checklists incompletos\n" +
                    "2️⃣ MARCAR 'NÃO SE APLICA': Desmarcar os checklists incompletos\n\n" +
                    "💡 Só é possível salvar quando TODOS os checklists ativos estiverem 100% completos."
                );

                // Navegar para o primeiro checklist incompleto
                setActiveChecklistId(incompleteChecklists[0]);
                setCurrentView('checklist');
                setShowErrors(true);
                setTimeout(() => {
                    scrollToFirstMissing(incompleteChecklists[0]);
                }, 300);

                console.log('❌ BLOQUEADO - Existem checklists incompletos');
                setIsSaving(false);
                return;
            }

            console.log('✅ VALIDAÇÕES PASSARAM - Salvando relatório...');

            // ✅ TUDO OK - Pode finalizar!

            const score = calculateGlobalScore();

            console.log('💾 Salvando relatório no Supabase...');

            // Checar duplicidade antes de criar
            const candidateReport = {
                user_email: currentUser.email,
                user_name: currentUser.name,
                pharmacy_name: config.pharmacyName,
                score: score,
                form_data: { ...formData },
                images: { ...images },
                signatures: { ...signatures },
                ignored_checklists: Array.from(ignoredChecklists)
            };

            // Save to Supabase first
            const dbReport = await SupabaseService.createReport(candidateReport as any);

            if (!dbReport) {
                throw new Error('Falha ao salvar relatório no Supabase');
            }

            console.log('✅ Relatório salvo:', dbReport.id);
            SupabaseService.insertAppEventLog({
                company_id: currentUser.company_id || null,
                branch: currentUser.filial || null,
                area: currentUser.area || null,
                user_email: currentUser.email,
                user_name: currentUser.name,
                app: 'checklists',
                event_type: 'checklist_report_saved',
                entity_type: 'report',
                entity_id: dbReport.id,
                status: 'success',
                success: true,
                source: 'web',
                event_meta: {
                    score,
                    ignored_checklists: Array.from(ignoredChecklists)
                }
            }).catch(() => { });

            const newReport: ReportHistoryItem = {
                id: dbReport.id,
                userEmail: currentUser.email,
                userName: currentUser.name,
                date: dbReport.created_at,
                pharmacyName: config.pharmacyName,
                score: score,
                formData: { ...formData },
                images: { ...images },
                signatures: { ...signatures },
                ignoredChecklists: Array.from(ignoredChecklists)
            };

            // Force refresh reports from Supabase to ensure sync across devices
            console.log('🔄 Recarregando todos os relatórios do Supabase...');
            const dbReports = await SupabaseService.fetchReportsSummary(0, 30);
            const formattedReports = dbReports.map(mapDbReportToHistoryItem);
            setReportHistory(formattedReports);
            await refreshStockConferenceReports();
            console.log('✅ Relatórios atualizados:', formattedReports.length, 'itens');

            // Clear Draft from state
            setFormData({});
            setImages({});
            setSignatures({});
            setIgnoredChecklists(new Set());

            // Clear from Supabase
            await SupabaseService.deleteDraft(currentUser.email);

            console.log('✅ Finalizando - redirecionando para visualização');

            // Redirect to View History (Report View)
            setIsSaving(false);
            setViewHistoryItem(newReport);
            setCurrentView('view_history');

            // Scroll to top
            window.scrollTo(0, 0);

        } catch (error) {
            console.error('❌ Erro ao finalizar relatório:', error);
            setIsSaving(false);
            alert('Erro ao salvar relatório. Por favor, tente novamente ou verifique sua conexão.');

            // Em caso de erro, tentar recarregar relatórios do Supabase
            try {
                const dbReports = await SupabaseService.fetchReports();
                const formattedReports = dbReports.map(mapDbReportToHistoryItem);
                setReportHistory(formattedReports);
                await refreshStockConferenceReports();
                setCurrentView('history');
            } catch (reloadError) {
                console.error('❌ Erro ao recarregar relatórios:', reloadError);
            }
        }
    };

    const handleViewHistoryItem = async (item: ReportHistoryItem) => {
        setLoadingReportId(item.id);
        try {
            let fullReport = item;

            // Se o relatório não tiver imagens ou assinaturas (que não vêm no summary), buscamos os detalhes
            const hasImages = Object.keys(item.images || {}).length > 0;
            const hasSignatures = Object.keys(item.signatures || {}).length > 0;

            if (!hasImages && !hasSignatures) {
                try {
                    console.log('🔍 Buscando detalhes do relatório:', item.id);
                    const detailedData = await CacheService.fetchWithCache(`checklist_report_${item.id}`, () => SupabaseService.fetchReportDetails(item.id));
                    if (detailedData) {
                        fullReport = mapDbReportToHistoryItem(detailedData);
                        // Atualizar o cache local
                        setReportHistory(prev => prev.map(r => r.id === item.id ? fullReport : r));
                    }
                } catch (error) {
                    console.error('Error fetching report details:', error);
                }
            }

            setViewHistoryItem(fullReport);
            localStorage.setItem('APP_VIEWING_REPORT_ID', fullReport.id);
            setCurrentView('view_history');
        } catch (error) {
            console.error('Error in handleViewHistoryItem:', error);
        } finally {
            setLoadingReportId(null);
        }
    };

    const handleDownloadPDF = () => {
        if (currentUser?.email) {
            SupabaseService.insertAppEventLog({
                company_id: currentUser.company_id || null,
                branch: currentUser.filial || null,
                area: currentUser.area || null,
                user_email: currentUser.email,
                user_name: currentUser.name,
                app: 'checklists',
                event_type: 'checklist_printed',
                entity_type: 'report',
                entity_id: viewHistoryItem?.id || null,
                status: 'success',
                success: true,
                source: 'web',
                event_meta: {
                    report_id: viewHistoryItem?.id || null,
                    location: window.location.href
                }
            }).catch(() => { });
        }
        // 1. Get current title
        const originalTitle = document.title;

        // 2. Try to get Filial and Date using robust scan
        let filial = 'Sem_Filial';
        const targetChecklists = ['gerencial', ...checklists.map(c => c.id)]; // Prioritize 'gerencial' where the field lives

        for (const checkId of targetChecklists) {
            const data = viewHistoryItem ? viewHistoryItem.formData[checkId] : formData[checkId];
            if (data?.filial && String(data.filial).trim() !== '') {
                filial = String(data.filial);
                break;
            }
        }

        // Date logic
        let dateRaw = new Date().toLocaleDateString('pt-BR');
        for (const checkId of targetChecklists) {
            const data = viewHistoryItem ? viewHistoryItem.formData[checkId] : formData[checkId];
            if (data?.data_aplicacao) {
                dateRaw = String(data.data_aplicacao);
                break;
            }
        }

        // 3. Format filename
        const safeFilial = filial.trim().replace(/\s+/g, '_');
        const safeDate = dateRaw.replace(/\//g, '-');
        const filename = `Relatorio_${safeFilial}_${safeDate}`;

        // 4. Set title (browser uses this as filename)
        document.title = filename;

        // 5. Open print dialog immediately
        window.print();

        // 6. Restore title after a safe delay
        setTimeout(() => {
            document.title = originalTitle;
        }, 2000);
    };


    // --- VALIDATION & SCORING LOGIC ---

    const getSectionStatus = (section: ChecklistSection, checklistId = activeChecklistId) => {
        let totalItems = 0;
        let answeredItems = 0;
        let scoreTotal = 0;
        let scorePassed = 0;
        let scoreableItems = 0; // Items that contribute to the star rating

        section.items.forEach(item => {
            if (item.type !== InputType.HEADER && item.type !== InputType.INFO) {
                totalItems++;
                const val = getInputValue(item.id, checklistId);
                if (val !== '' && val !== null && val !== undefined) {
                    answeredItems++;
                }
                if (item.type === InputType.BOOLEAN_PASS_FAIL) {
                    scoreableItems++;
                    if (val !== '' && val !== null && val !== undefined) {
                        scoreTotal++;
                        if (val === 'pass') scorePassed++;
                    }
                }
            }
        });

        const isComplete = totalItems > 0 && totalItems === answeredItems;
        const predictedScore = scoreTotal === 0 ? 0 : (scorePassed / scoreTotal) * 5;

        return { totalItems, answeredItems, isComplete, predictedScore, scoreableItems };
    };

    const isChecklistComplete = (checklistId: string) => {
        // If viewing history, consider it complete (read only)
        if (currentView === 'view_history') return true;

        const checklist = checklists.find(c => c.id === checklistId);
        if (!checklist) return false;

        for (const section of checklist.sections) {
            for (const item of section.items) {
                const val = getInputValue(item.id, checklistId);
                if (item.required && (val === '' || val === null || val === undefined)) return false;
            }
        }
        const currentSigs = signatures[checklistId] || {};
        // EXIGIR assinatura de gestor E coordenador
        if (!currentSigs['gestor'] || !currentSigs['coordenador']) return false;

        return true;
    };

    const getChecklistStats = (checklistId: string) => {
        const checklist = checklists.find(c => c.id === checklistId);
        if (!checklist) return { score: 0, passed: 0, total: 0, failedItems: [], missingItems: [], unansweredItems: [] };

        let totalBoolean = 0;
        let passed = 0;
        let failedItems: { text: string, section: string }[] = [];
        let missingItems: { text: string, section: string }[] = [];
        let unansweredItems: { text: string, section: string }[] = [];

        checklist.sections.forEach(section => {
            section.items.forEach(item => {
                const val = getInputValue(item.id, checklistId);

                // Check for missing required items
                if (item.required && (val === '' || val === null || val === undefined)) {
                    missingItems.push({ text: item.text, section: section.title });
                }

                if (item.type === InputType.BOOLEAN_PASS_FAIL) {
                    totalBoolean++;
                    if (val === 'pass') {
                        passed++;
                    } else if (val === 'fail') {
                        failedItems.push({ text: item.text, section: section.title });
                    } else if (val === '' || val === null || val === undefined) {
                        // Track unanswered items that are not strictly required but impact score
                        unansweredItems.push({ text: item.text, section: section.title });
                    }
                }
            });
        });

        const score = totalBoolean === 0 ? 0 : (passed / totalBoolean) * 5;
        return { score, passed, total: totalBoolean, failedItems, missingItems, unansweredItems };
    };

    const calculateGlobalScore = (historyItem?: ReportHistoryItem) => {
        let totalSum = 0;
        let count = 0;

        const ignoredSet = historyItem ? new Set(historyItem.ignoredChecklists) : ignoredChecklists;

        checklists.forEach(cl => {
            if (!ignoredSet.has(cl.id)) {
                const stats = getChecklistStats(cl.id);
                if (stats.total > 0) {
                    totalSum += stats.score;
                    count++;
                }
            }
        });

        return count === 0 ? "0.0" : (totalSum / count).toFixed(1);
    };

    const getScoreFeedback = (scoreNum: number) => {
        if (scoreNum >= 4.5) return { label: 'Excelente', color: 'text-purple-600', bg: 'bg-purple-100', icon: <PartyPopper size={48} className="text-purple-500 animate-bounce" />, msg: 'Parabéns! Desempenho Excepcional!' };
        if (scoreNum >= 4.0) return { label: 'Ótimo', color: 'text-blue-600', bg: 'bg-blue-100', icon: <Trophy size={48} className="text-blue-500 animate-pulse" />, msg: 'Parabéns! Muito bom trabalho!' };
        if (scoreNum >= 3.0) return { label: 'Bom', color: 'text-green-600', bg: 'bg-green-100', icon: <CheckCircle size={48} className="text-green-500" />, msg: 'Parabéns! Bom resultado.' };
        if (scoreNum >= 2.0) return { label: 'Melhorar Urgente', color: 'text-orange-600', bg: 'bg-orange-100', icon: <AlertTriangle size={48} className="text-orange-500" />, msg: 'Atenção: Pontos de melhoria necessários.' };
        return { label: 'Ruim', color: 'text-red-600', bg: 'bg-red-100', icon: <Frown size={48} className="text-red-500" />, msg: 'Crítico: Necessita revisão imediata.' };
    };

    const toggleIgnoreChecklist = (id: string) => {
        setIgnoredChecklists(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Função para scroll e highlight do primeiro item faltante
    const scrollToFirstMissing = (checklistId: string) => {
        const stats = getChecklistStats(checklistId);
        const currentSigs = signatures[checklistId] || {};

        // Verificar primeiro item faltante
        if (stats.missingItems.length > 0) {
            const firstMissing = stats.missingItems[0];
            // Encontrar o elemento no DOM pelo ID do item
            const checklist = checklists.find(c => c.id === checklistId);
            if (checklist) {
                for (const section of checklist.sections) {
                    for (const item of section.items) {
                        if (item.text === firstMissing.text) {
                            const element = document.getElementById(item.id);
                            if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                element.classList.add('highlight-missing');
                                setTimeout(() => element.classList.remove('highlight-missing'), 3000);
                                return;
                            }
                        }
                    }
                }
            }
        }

        // Verificar assinaturas faltantes
        if (!currentSigs['gestor']) {
            const gestorSig = document.querySelector('[data-signature="gestor"]');
            if (gestorSig) {
                gestorSig.scrollIntoView({ behavior: 'smooth', block: 'center' });
                gestorSig.classList.add('highlight-missing');
                setTimeout(() => gestorSig.classList.remove('highlight-missing'), 3000);
                return;
            }
        }

        if (!currentSigs['coordenador']) {
            const coordSig = document.querySelector('[data-signature="coordenador"]');
            if (coordSig) {
                coordSig.scrollIntoView({ behavior: 'smooth', block: 'center' });
                coordSig.classList.add('highlight-missing');
                setTimeout(() => coordSig.classList.remove('highlight-missing'), 3000);
                return;
            }
        }

        // Se não encontrou nada específico, scroll para o error box
        errorBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const handleVerify = () => {
        setShowErrors(true);

        const stats = getChecklistStats(activeChecklistId);
        const currentSigs = signatures[activeChecklistId] || {};
        const hasSigMissing = !currentSigs['gestor'] || !currentSigs['coordenador'];

        if (stats.missingItems.length > 0 || hasSigMissing || stats.unansweredItems.length > 0) {
            // Scroll para o primeiro item faltante com highlight
            setTimeout(() => {
                scrollToFirstMissing(activeChecklistId);
            }, 100);
        } else {
            alert("Checklist completo! Você pode prosseguir.");
        }
    };

    const handleViewChange = (view: typeof currentView) => {
        if (view === 'pre' && !PRE_VENCIDOS_MODULE_ENABLED) {
            alert('Módulo Pré-Vencidos está desativado por tempo indeterminado.');
            return;
        }
        if ((view === 'logs' || view === 'cadastros_globais') && currentUser?.role !== 'MASTER') {
            alert('Apenas usuários master podem acessar este módulo.');
            return;
        }
        if (view === 'checklist') {
            handleCloseReport(); // Clear history view if going back to draft
            setShowErrors(false);
        }
        setCurrentView(view);
        window.scrollTo(0, 0);
        setIsSidebarOpen(isMobileLayout());
    };

    const handleNextChecklist = () => {
        // Validate Current Checklist first
        const stats = getChecklistStats(activeChecklistId);
        const currentSigs = signatures[activeChecklistId] || {};
        const hasSigMissing = !currentSigs['gestor'] || !currentSigs['coordenador'];

        if (stats.missingItems.length > 0 || hasSigMissing) {
            setShowErrors(true);
            setTimeout(() => {
                scrollToFirstMissing(activeChecklistId);
            }, 100);
            return; // Block navigation
        }

        const idx = checklists.findIndex(c => c.id === activeChecklistId);
        if (idx < checklists.length - 1) {
            setActiveChecklistId(checklists[idx + 1].id);
            window.scrollTo(0, 0);
            setShowErrors(false);
        } else {
            handleViewChange('summary');
        }
    };

    // --- FILTERED HISTORY ---
    const toggleStockBranchFilter = (branchKey: string) => {
        setStockBranchFilters(prev => prev.includes(branchKey) ? prev.filter(k => k !== branchKey) : [...prev, branchKey]);
    };

    const handleResetStockBranchFilters = () => setStockBranchFilters([]);

    // --- LOGS & EVENTOS ---

    useEffect(() => {
        if (!PRE_VENCIDOS_MODULE_ENABLED && currentView === 'pre') {
            setCurrentView('dashboard');
            return;
        }
    }, [currentView]);

    useEffect(() => {
        if (!currentUser) return;
        const now = Date.now();
        const currentApp = mapViewToAppName(currentView);

        if (!viewStartRef.current) {
            viewStartRef.current = { view: currentView, startedAt: now };
            SupabaseService.insertAppEventLog({
                company_id: currentUser.company_id || null,
                branch: currentUser.filial || null,
                area: currentUser.area || null,
                user_email: currentUser.email,
                user_name: currentUser.name,
                app: currentApp,
                event_type: 'app_view_enter',
                entity_type: 'view',
                entity_id: currentView,
                status: 'success',
                success: true,
                source: 'web',
                event_meta: { view: currentView }
            }).catch(() => { });
            return;
        }

        const prev = viewStartRef.current;
        if (prev.view === currentView) return;
        const prevApp = mapViewToAppName(prev.view as typeof currentView);
        const durationMs = Math.max(0, now - prev.startedAt);

        SupabaseService.insertAppEventLog({
            company_id: currentUser.company_id || null,
            branch: currentUser.filial || null,
            area: currentUser.area || null,
            user_email: currentUser.email,
            user_name: currentUser.name,
            app: prevApp,
            event_type: 'app_view_exit',
            entity_type: 'view',
            entity_id: prev.view,
            status: 'success',
            success: true,
            duration_ms: durationMs,
            source: 'web',
            event_meta: { from: prev.view, to: currentView }
        }).catch(() => { });

        SupabaseService.insertAppEventLog({
            company_id: currentUser.company_id || null,
            branch: currentUser.filial || null,
            area: currentUser.area || null,
            user_email: currentUser.email,
            user_name: currentUser.name,
            app: currentApp,
            event_type: 'app_view_enter',
            entity_type: 'view',
            entity_id: currentView,
            status: 'success',
            success: true,
            source: 'web',
            event_meta: { view: currentView }
        }).catch(() => { });

        viewStartRef.current = { view: currentView, startedAt: now };
    }, [currentView, currentUser]);

    useEffect(() => {
        if (currentView !== 'logs') return;
        if (!currentUser?.company_id) return;

        const sinceDate = logsDateRange === '7d'
            ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            : logsDateRange === '30d'
                ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                : null;

        const effectiveBranch = currentUser.role === 'MASTER' ? null : (currentUser.filial || null);

        setIsLoadingLogs(true);
        SupabaseService.fetchAppEventLogs({
            companyId: currentUser.company_id,
            branch: effectiveBranch,
            sinceISO: sinceDate ? sinceDate.toISOString() : null,
            limit: 2000
        })
            .then(logs => {
                setAppEventLogs(logs || []);
                if (currentUser.role !== 'MASTER' && currentUser.filial) {
                    setLogsBranchFilter(currentUser.filial);
                }
            })
            .finally(() => {
                setIsLoadingLogs(false);
                setHasLoadedLogsForMetrics(true);
            });
    }, [currentView, currentUser?.company_id, currentUser?.filial, currentUser?.role, logsDateRange]);

    const refreshActiveSessions = useCallback(async () => {
        setIsLoadingSessions(true);
        try {
            const sessions = await SupabaseService.fetchActiveSessions();
            setActiveSessions(sessions);
            const activeClientIds = new Set((sessions || []).map(s => s.client_id));
            setPendingSessionCommands(prev => {
                const next: Record<string, { command: 'FORCE_LOGOUT' | 'RELOAD'; startedAt: number }> = {};
                const now = Date.now();
                Object.entries(prev).forEach(([clientId, meta]) => {
                    // Mantém FORCE_LOGOUT por até 60s mesmo que a sessão suma temporariamente,
                    // para evitar reentrada imediata sem receber o comando.
                    if (meta.command === 'FORCE_LOGOUT') {
                        if (now - meta.startedAt <= 60000 || activeClientIds.has(clientId)) {
                            next[clientId] = meta;
                        }
                        return;
                    }
                    if (activeClientIds.has(clientId)) next[clientId] = meta;
                });
                return next;
            });
        } catch (error) {
            console.error('Error fetching active sessions:', error);
        } finally {
            setIsLoadingSessions(false);
            setHasLoadedSessionsForMetrics(true);
        }
    }, []);

    useEffect(() => {
        if (currentView === 'logs' && currentUser?.role === 'MASTER') {
            setHasLoadedLogsForMetrics(false);
            setHasLoadedSessionsForMetrics(false);
        }
    }, [currentView, currentUser?.role, currentUser?.company_id]);

    useEffect(() => {
        if (currentView !== 'logs' || currentUser?.role !== 'MASTER' || !currentUser?.company_id) return;

        refreshActiveSessions();
        const interval = setInterval(refreshActiveSessions, MASTER_SESSIONS_POLL_MS);

        return () => clearInterval(interval);
    }, [currentView, currentUser?.role, currentUser?.company_id, refreshActiveSessions, MASTER_SESSIONS_POLL_MS]);

    useEffect(() => {
        if (currentView !== 'logs' || currentUser?.role !== 'MASTER') return;

        const interval = setInterval(async () => {
            if (document.hidden) return;
            const activeIds = new Set(activeSessions.map(s => s.client_id));
            const now = Date.now();
            const staleForceLogoutIds = Object.entries(pendingSessionCommands)
                .filter(([clientId, meta]) =>
                    meta.command === 'FORCE_LOGOUT' &&
                    activeIds.has(clientId) &&
                    now - meta.startedAt >= 10000 &&
                    !forcedSessionCleanupRef.current.has(clientId)
                )
                .map(([clientId]) => clientId);

            if (!staleForceLogoutIds.length) return;

            staleForceLogoutIds.forEach(clientId => forcedSessionCleanupRef.current.add(clientId));
            try {
                await Promise.all(staleForceLogoutIds.map(clientId => SupabaseService.forceExpireActiveSession(clientId)));
            } finally {
                staleForceLogoutIds.forEach(clientId => forcedSessionCleanupRef.current.delete(clientId));
                await refreshActiveSessions();
            }
        }, MASTER_FORCE_LOGOUT_SWEEP_MS);

        return () => clearInterval(interval);
    }, [currentView, currentUser?.role, activeSessions, pendingSessionCommands, refreshActiveSessions, MASTER_FORCE_LOGOUT_SWEEP_MS]);

    const filteredEventLogs = useMemo(() => {
        let filtered = [...appEventLogs];
        if (logsBranchFilter !== 'all') {
            const filterKey = normalizeBranchLabel(logsBranchFilter).toUpperCase();
            filtered = filtered.filter(l => {
                return normalizeBranchLabel(l.branch).toUpperCase() === filterKey;
            });
        }
        if (logsAreaFilter !== 'all') {
            filtered = filtered.filter(l => (l.area || '-') === logsAreaFilter);
        }
        if (logsAppFilter !== 'all') {
            filtered = filtered.filter(l => (l.app || '-') === logsAppFilter);
        }
        if (logsUserFilter !== 'all') {
            filtered = filtered.filter(l => (l.user_email || '-') === logsUserFilter);
        }
        if (logsEventFilter !== 'all') {
            filtered = filtered.filter(l => (l.event_type || '-') === logsEventFilter);
        }
        return filtered;
    }, [appEventLogs, logsBranchFilter, logsAreaFilter, logsAppFilter, logsUserFilter, logsEventFilter]);

    const displayEventLogs = useMemo(() => {
        if (!logsGroupRepeats) {
            return filteredEventLogs.map(l => ({ ...l, count: 1 }));
        }
        const collapseEntityFor = new Set(['stock_item_count_updated']);
        const grouped = new Map<string, SupabaseService.DbAppEventLog & { count: number; first_at?: string }>();
        filteredEventLogs.forEach(log => {
            const collapseEntity = log.event_type && collapseEntityFor.has(log.event_type);
            const entityId = collapseEntity ? null : (log.entity_id || null);
            const key = [
                log.app || '-',
                log.event_type || '-',
                log.branch || '-',
                log.user_email || '-',
                log.area || '-',
                log.entity_type || '-',
                entityId || '-',
                log.success === false ? 'error' : 'ok'
            ].join('|');
            const existing = grouped.get(key);
            const ts = log.created_at ? new Date(log.created_at).getTime() : 0;
            if (!existing) {
                grouped.set(key, { ...log, count: 1, first_at: log.created_at || null });
                return;
            }
            existing.count += 1;
            const existingTs = existing.created_at ? new Date(existing.created_at).getTime() : 0;
            if (ts > existingTs) {
                existing.created_at = log.created_at;
            }
        });
        return Array.from(grouped.values()).sort((a, b) => {
            const aTs = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bTs = b.created_at ? new Date(b.created_at).getTime() : 0;
            return bTs - aTs;
        });
    }, [filteredEventLogs, logsGroupRepeats]);

    // Paginação de eventos: exibe apenas os primeiros `eventsDisplayLimit` registros
    const pagedEventLogs = useMemo(() => displayEventLogs.slice(0, eventsDisplayLimit), [displayEventLogs, eventsDisplayLimit]);

    // Agrupa sessões ativas por usuário (um usuário pode ter múltiplas abas/módulos abertos)
    const groupedActiveSessions = useMemo(() => {
        const map = new Map<string, {
            user_email: string;
            user_name: string | null;
            branch: string | null;
            area: string | null;
            modules: { client_id: string; current_view: string; last_ping: string }[];
            last_ping: string;
        }>();
        activeSessions.forEach(session => {
            const key = session.user_email;
            const existing = map.get(key);
            if (!existing) {
                map.set(key, {
                    user_email: session.user_email,
                    user_name: session.user_name,
                    branch: session.branch,
                    area: session.area,
                    modules: [{ client_id: session.client_id, current_view: session.current_view || '-', last_ping: session.last_ping }],
                    last_ping: session.last_ping,
                });
            } else {
                existing.modules.push({ client_id: session.client_id, current_view: session.current_view || '-', last_ping: session.last_ping });
                // Keep the most recent ping
                if (new Date(session.last_ping) > new Date(existing.last_ping)) {
                    existing.last_ping = session.last_ping;
                }
            }
        });
        return Array.from(map.values()).sort((a, b) => new Date(b.last_ping).getTime() - new Date(a.last_ping).getTime());
    }, [activeSessions]);

    // Reset paginação de eventos ao mudar qualquer filtro
    useEffect(() => {
        setEventsDisplayLimit(50);
    }, [logsBranchFilter, logsAreaFilter, logsAppFilter, logsUserFilter, logsEventFilter, logsGroupRepeats]);

    const isMetricsInitialHydrating =
        currentView === 'logs' &&
        currentUser?.role === 'MASTER' &&
        (!hasLoadedLogsForMetrics || !hasLoadedSessionsForMetrics);
    const remoteForceLogoutSecondsRemaining = remoteForceLogoutDeadline
        ? Math.max(0, Math.ceil((remoteForceLogoutDeadline - Date.now()) / 1000))
        : 0;
    void remoteForceLogoutTick;

    const logsBranches = useMemo(() => {
        const map = new Map<string, { branch: string; count: number; lastAt: number; users: Set<string> }>();
        filteredEventLogs.forEach(l => {
            // normalizeBranchLabel converte '8' → 'Filial 8', '14' → 'Filial 14', etc.
            const label = normalizeBranchLabel(l.branch);
            const key = label.toUpperCase();
            const ts = l.created_at ? new Date(l.created_at).getTime() : 0;
            const current = map.get(key) || { branch: label, count: 0, lastAt: 0, users: new Set<string>() };
            current.count += 1;
            current.lastAt = Math.max(current.lastAt, ts);
            if (l.user_email) current.users.add(l.user_email);
            map.set(key, current);
        });
        return Array.from(map.values()).sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return b.lastAt - a.lastAt;
        });
    }, [filteredEventLogs]);

    const logsUsers = useMemo(() => {
        const map = new Map<string, { user: string; count: number; lastAt: number; branch: string | null }>();
        filteredEventLogs.forEach(l => {
            const key = l.user_email || 'Sem usuário';
            const ts = l.created_at ? new Date(l.created_at).getTime() : 0;
            const current = map.get(key) || { user: key, count: 0, lastAt: 0, branch: l.branch || null };
            current.count += 1;
            current.lastAt = Math.max(current.lastAt, ts);
            map.set(key, current);
        });
        return Array.from(map.values()).sort((a, b) => b.count - a.count);
    }, [filteredEventLogs]);

    const logsApps = useMemo(() => {
        const map = new Map<string, number>();
        filteredEventLogs.forEach(l => {
            const key = l.app || 'outros';
            map.set(key, (map.get(key) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [filteredEventLogs]);

    const userActivityStats = useMemo(() => {
        if (!currentUser) return [];
        const now = Date.now();
        const logs = appEventLogs.filter(l => !currentUser.company_id || l.company_id === currentUser.company_id);
        const byUser = new Map<string, { lastAt: number; activeDays: Set<string>; durationMs: number; eventCount: number }>();

        logs.forEach(l => {
            if (!l.user_email) return;
            const ts = l.created_at ? new Date(l.created_at).getTime() : NaN;
            if (Number.isNaN(ts)) return;
            const dateKey = new Date(ts).toISOString().slice(0, 10);
            const entry = byUser.get(l.user_email) || { lastAt: 0, activeDays: new Set<string>(), durationMs: 0, eventCount: 0 };
            entry.lastAt = Math.max(entry.lastAt, ts);
            entry.activeDays.add(dateKey);
            entry.eventCount += 1;
            if (typeof l.duration_ms === 'number' && l.duration_ms > 0) {
                entry.durationMs += l.duration_ms;
            }
            byUser.set(l.user_email, entry);
        });

        const companyUsers = currentUser.role === 'MASTER'
            ? users.filter(u => !currentUser.company_id || u.company_id === currentUser.company_id)
            : users.filter(u => u.email === currentUser.email);

        return companyUsers.map(u => {
            const stats = byUser.get(u.email);
            const lastAt = stats?.lastAt || 0;
            const daysInactive = lastAt ? Math.floor((now - lastAt) / (1000 * 60 * 60 * 24)) : null;
            return {
                email: u.email,
                name: u.name || u.email,
                filial: u.filial || '-',
                area: u.area || '-',
                lastAt: lastAt || null,
                daysInactive,
                activeDays: stats?.activeDays.size || 0,
                durationMs: stats?.durationMs || 0,
                eventCount: stats?.eventCount || 0
            };
        }).sort((a, b) => {
            // Mais ativos primeiro: menor daysInactive ou maior eventCount
            if (a.daysInactive === null && b.daysInactive === null) return b.eventCount - a.eventCount;
            if (a.daysInactive === null) return 1; // sem atividade vai pro final
            if (b.daysInactive === null) return -1;
            if (a.daysInactive !== b.daysInactive) return a.daysInactive - b.daysInactive;
            return b.eventCount - a.eventCount;
        });
    }, [appEventLogs, users, currentUser]);

    const logAppOptions = useMemo(() => {
        const set = new Set<string>();
        appEventLogs.forEach(l => {
            if (l.app) set.add(l.app);
        });
        return Array.from(set).sort();
    }, [appEventLogs]);

    const logEventOptions = useMemo(() => {
        const set = new Set<string>();
        Object.keys(EVENT_TYPE_LABELS).forEach(key => set.add(key));
        appEventLogs.forEach(l => {
            if (l.event_type) set.add(l.event_type);
        });
        return Array.from(set).sort((a, b) => formatEventTypeLabel(a).localeCompare(formatEventTypeLabel(b)));
    }, [appEventLogs]);

    const globalBaseFilesByKey = useMemo(() => {
        const map = new Map<string, SupabaseService.DbGlobalBaseFile>();
        globalBaseFiles.forEach(file => {
            if (!file?.module_key) return;
            map.set(file.module_key, file);
        });
        return map;
    }, [globalBaseFiles]);

    const globalBranchStockSlotsByArea = useMemo(() => {
        if (!currentUser?.company_id) return [] as Array<{ areaName: string; slots: GlobalBaseModuleSlot[] }>;
        const company = companies.find((c: any) => c.id === currentUser.company_id);
        if (!company?.areas) return [] as Array<{ areaName: string; slots: GlobalBaseModuleSlot[] }>;

        return (company.areas || [])
            .map((area: any) => {
                const uniqueBranches = Array.from(new Set((area.branches || [])
                    .map((branch: string) => String(branch || '').trim())
                    .filter(Boolean)));
                const slots = uniqueBranches
                    .sort((a, b) => {
                        const numA = Number((a.match(/\d+/)?.[0] || ''));
                        const numB = Number((b.match(/\d+/)?.[0] || ''));
                        const hasNumA = Number.isFinite(numA) && numA > 0;
                        const hasNumB = Number.isFinite(numB) && numB > 0;
                        if (hasNumA && hasNumB && numA !== numB) return numA - numB;
                        if (hasNumA && !hasNumB) return -1;
                        if (!hasNumA && hasNumB) return 1;
                        return normalizeBranchLabel(a).localeCompare(normalizeBranchLabel(b), 'pt-BR');
                    })
                    .map(branch => ({
                        key: buildSharedStockModuleKey(branch),
                        label: `Estoque Compartilhado (${normalizeBranchLabel(branch)})`,
                        description: 'Relatório único de estoque para Pré‑Vencidos e Auditoria.'
                    }));
                return {
                    areaName: String(area.name || 'Sem Área').trim() || 'Sem Área',
                    slots
                };
            })
            .filter(entry => entry.slots.length > 0)
            .sort((a, b) => {
                const numA = Number((a.areaName.match(/\d+/)?.[0] || ''));
                const numB = Number((b.areaName.match(/\d+/)?.[0] || ''));
                const hasNumA = Number.isFinite(numA) && numA > 0;
                const hasNumB = Number.isFinite(numB) && numB > 0;
                if (hasNumA && hasNumB && numA !== numB) return numB - numA;
                if (hasNumA && !hasNumB) return -1;
                if (!hasNumA && hasNumB) return 1;
                return a.areaName.localeCompare(b.areaName, 'pt-BR');
            });
    }, [currentUser?.company_id, companies]);

    const resolveAreaFromCompanyBranch = (companyId?: string | null, branchName?: string | null) => {
        if (!companyId || !branchName) return '';
        const company = companies.find((c: any) => c.id === companyId);
        if (!company?.areas) return '';
        const normalizedBranch = String(branchName).trim().toLowerCase();
        if (!normalizedBranch) return '';
        const foundArea = company.areas.find((area: any) =>
            Array.isArray(area.branches) &&
            area.branches.some((branch: string) => String(branch || '').trim().toLowerCase() === normalizedBranch)
        );
        return foundArea?.name || '';
    };

    const branchSelectionGroups = useMemo(() => {
        if (!currentUser?.company_id) return [] as Array<{ area: string; options: { branch: string; area: string }[] }>;
        const company = companies.find((c: any) => c.id === currentUser.company_id);
        if (!company?.areas) return [] as Array<{ area: string; options: { branch: string; area: string }[] }>;

        const sortBranchAscending = (a: string, b: string) => {
            const numA = Number((a.match(/\d+/)?.[0] || ''));
            const numB = Number((b.match(/\d+/)?.[0] || ''));
            const hasNumA = Number.isFinite(numA) && numA > 0;
            const hasNumB = Number.isFinite(numB) && numB > 0;
            if (hasNumA && hasNumB && numA !== numB) return numA - numB;
            if (hasNumA && !hasNumB) return -1;
            if (!hasNumA && hasNumB) return 1;
            return normalizeBranchLabel(a).localeCompare(normalizeBranchLabel(b), 'pt-BR');
        };

        const grouped = (company.areas || [])
            .map((area: any) => {
                const areaName = String(area?.name || 'Sem Área').trim() || 'Sem Área';
                const options = Array.from(
                    new Set(
                        (area?.branches || [])
                            .map((branch: string) => String(branch || '').trim())
                            .filter(Boolean)
                    )
                )
                    .sort(sortBranchAscending)
                    .map((branch: string) => ({ branch, area: areaName }));
                return { area: areaName, options };
            })
            .filter(group => group.options.length > 0)
            .sort((a, b) => {
                if (a.area === 'Sem Área') return 1;
                if (b.area === 'Sem Área') return -1;
                return a.area.localeCompare(b.area, 'pt-BR');
            });

        return grouped;
    }, [companies, currentUser?.company_id]);

    const branchSelectionOptions = useMemo(
        () => branchSelectionGroups.flatMap(group => group.options),
        [branchSelectionGroups]
    );

    const scopedCompanies = useMemo(() => {
        if (!currentUser?.company_id) return companies;
        return companies.filter(c => c.id === currentUser.company_id);
    }, [companies, currentUser?.company_id]);

    const scopedUsers = useMemo(() => {
        if (!currentUser) return [];
        if (currentUser.role !== 'MASTER') {
            return users.filter(u => u.email === currentUser.email);
        }
        if (currentUser.company_id) {
            return users.filter(u => u.company_id === currentUser.company_id);
        }
        return users;
    }, [users, currentUser]);

    const dashboardAuditBranchCandidates = useMemo(() => {
        const set = new Set<string>();
        if (currentUser?.filial) {
            buildBranchQueryVariants(currentUser.filial).forEach(v => set.add(v));
        }
        scopedUsers.forEach(u => {
            buildBranchQueryVariants(u.filial || '').forEach(v => set.add(v));
        });
        scopedCompanies.forEach(c => {
            (c.areas || []).forEach((area: any) => {
                (area.branches || []).forEach((branch: string) => {
                    buildBranchQueryVariants(branch).forEach(v => set.add(v));
                });
            });
        });
        return Array.from(set);
    }, [currentUser?.filial, scopedUsers, scopedCompanies]);

    const loadDashboardAuditSessions = useCallback(async () => {
        if (!currentUser) return;
        setIsLoadingDashboardAudits(true);
        setDashboardAuditsError(null);
        try {
            const queryBranches = Array.from(new Set(dashboardAuditBranchCandidates)).filter(Boolean);
            let metadataQuery = supabase
                .from('audit_sessions')
                .select('id, branch, audit_number, status, progress, user_email, created_at, updated_at')
                .eq('status', 'open')
                .order('updated_at', { ascending: false })
                .limit(300);

            if (queryBranches.length > 0) {
                metadataQuery = metadataQuery.in('branch', queryBranches);
            }

            const { data: metadataRowsRaw, error: metadataError } = await metadataQuery;
            if (metadataError) throw metadataError;

            const metadataRows = (metadataRowsRaw || []) as Array<Pick<SupabaseService.DbAuditSession, 'id' | 'branch' | 'audit_number' | 'status' | 'progress' | 'user_email' | 'created_at' | 'updated_at'>>;
            const scopedMetadata = currentUser.role === 'MASTER'
                ? metadataRows
                : metadataRows.filter(session => {
                    const currentBranch = String(currentUser.filial || '').trim();
                    if (!currentBranch) return false;
                    const sessionRaw = String(session.branch || '').trim();
                    if (sessionRaw === currentBranch) return true;
                    return normalizeBranchLabel(sessionRaw) === normalizeBranchLabel(currentBranch);
                });

            // Reduz carga: manter só a sessão aberta mais recente por filial antes de buscar o JSON pesado.
            const latestByBranch = new Map<string, typeof scopedMetadata[number]>();
            scopedMetadata.forEach((session) => {
                const branchLabel = normalizeBranchLabel(session.branch);
                const prev = latestByBranch.get(branchLabel);
                if (!prev) {
                    latestByBranch.set(branchLabel, session);
                    return;
                }
                const prevAudit = Number(prev.audit_number || 0);
                const curAudit = Number(session.audit_number || 0);
                if (curAudit > prevAudit) {
                    latestByBranch.set(branchLabel, session);
                    return;
                }
                if (curAudit < prevAudit) return;
                const prevTs = Date.parse(String(prev.updated_at || prev.created_at || '')) || 0;
                const curTs = Date.parse(String(session.updated_at || session.created_at || '')) || 0;
                if (curTs > prevTs) {
                    latestByBranch.set(branchLabel, session);
                }
            });

            const latestMetadata = Array.from(latestByBranch.values()).filter(s => !!s.id);
            const detailIds = latestMetadata.map(s => String(s.id));

            if (detailIds.length === 0) {
                setDashboardAuditSessions([]);
                setDashboardAuditsFetchedAt(new Date().toISOString());
                return;
            }

            const chunkSize = 30;
            const detailBatches: string[][] = [];
            for (let i = 0; i < detailIds.length; i += chunkSize) {
                detailBatches.push(detailIds.slice(i, i + chunkSize));
            }

            const detailResults = await Promise.all(detailBatches.map(async (batch) => {
                const { data: detailRows, error: detailError } = await supabase
                    .from('audit_sessions')
                    .select('id, branch, audit_number, status, progress, data, user_email, created_at, updated_at')
                    .in('id', batch);
                if (detailError) throw detailError;
                return (detailRows || []) as SupabaseService.DbAuditSession[];
            }));

            const detailedRows = detailResults.flat();
            const detailsById = new Map(detailedRows.map(row => [String(row.id), row]));
            const resolvedRows = latestMetadata
                .map((meta) => detailsById.get(String(meta.id)))
                .filter((row): row is SupabaseService.DbAuditSession => Boolean(row));

            setDashboardAuditSessions(resolvedRows);
            setDashboardAuditsFetchedAt(new Date().toISOString());
        } catch (error) {
            console.error('Erro ao carregar sessões abertas de auditoria para o dashboard:', error);
            setDashboardAuditSessions([]);
            setDashboardAuditsError('Não foi possível carregar auditorias abertas agora.');
        } finally {
            setIsLoadingDashboardAudits(false);
        }
    }, [currentUser, dashboardAuditBranchCandidates]);

    const loadCompletedDashboardAuditSessions = useCallback(async () => {
        if (!currentUser) return;
        setIsLoadingCompletedDashboardAudits(true);
        setCompletedDashboardAuditsError(null);
        try {
            const queryBranches = Array.from(new Set(dashboardAuditBranchCandidates)).filter(Boolean);
            let metadataQuery = supabase
                .from('audit_sessions')
                .select('id, branch, audit_number, status, progress, user_email, created_at, updated_at')
                .eq('status', 'completed')
                .order('updated_at', { ascending: false })
                .limit(1000); // We might need a larger limit for completed audits

            if (queryBranches.length > 0) {
                metadataQuery = metadataQuery.in('branch', queryBranches);
            }

            const { data: metadataRowsRaw, error: metadataError } = await metadataQuery;
            if (metadataError) throw metadataError;

            const metadataRows = (metadataRowsRaw || []) as Array<Pick<SupabaseService.DbAuditSession, 'id' | 'branch' | 'audit_number' | 'status' | 'progress' | 'user_email' | 'created_at' | 'updated_at'>>;
            const scopedMetadata = currentUser.role === 'MASTER'
                ? metadataRows
                : metadataRows.filter(session => {
                    const currentBranch = String(currentUser.filial || '').trim();
                    if (!currentBranch) return false;
                    const sessionRaw = String(session.branch || '').trim();
                    if (sessionRaw === currentBranch) return true;
                    return normalizeBranchLabel(sessionRaw) === normalizeBranchLabel(currentBranch);
                });

            // Keep the latest completed session per branch and audit_number
            const latestByBranchAndNumber = new Map<string, typeof scopedMetadata[number]>();
            scopedMetadata.forEach((session) => {
                const branchLabel = normalizeBranchLabel(session.branch);
                const auditNumber = Number(session.audit_number || 0);
                const key = `${branchLabel}_${auditNumber}`;
                const prev = latestByBranchAndNumber.get(key);
                if (!prev) {
                    latestByBranchAndNumber.set(key, session);
                    return;
                }
                const prevTs = Date.parse(String(prev.updated_at || prev.created_at || '')) || 0;
                const curTs = Date.parse(String(session.updated_at || session.created_at || '')) || 0;
                if (curTs > prevTs) {
                    latestByBranchAndNumber.set(key, session);
                }
            });

            const latestMetadata = Array.from(latestByBranchAndNumber.values()).filter(s => !!s.id);
            const detailIds = latestMetadata.map(s => String(s.id));

            if (detailIds.length === 0) {
                setDashboardCompletedAuditSessions([]);
                setCompletedDashboardAuditsFetchedAt(new Date().toISOString());
                return;
            }

            const chunkSize = 30;
            const detailBatches: string[][] = [];
            for (let i = 0; i < detailIds.length; i += chunkSize) {
                detailBatches.push(detailIds.slice(i, i + chunkSize));
            }

            const detailResults = await Promise.all(detailBatches.map(async (batch) => {
                const { data: detailRows, error: detailError } = await supabase
                    .from('audit_sessions')
                    .select('id, branch, audit_number, status, progress, data, user_email, created_at, updated_at')
                    .in('id', batch);
                if (detailError) throw detailError;
                return (detailRows || []) as SupabaseService.DbAuditSession[];
            }));

            const detailedRows = detailResults.flat();
            const detailsById = new Map(detailedRows.map(row => [String(row.id), row]));
            const resolvedRows = latestMetadata
                .map((meta) => detailsById.get(String(meta.id)))
                .filter((row): row is SupabaseService.DbAuditSession => Boolean(row));

            setDashboardCompletedAuditSessions(resolvedRows);
            setCompletedDashboardAuditsFetchedAt(new Date().toISOString());
        } catch (error) {
            console.error('Erro ao carregar sessões concluídas de auditoria para o dashboard:', error);
            setDashboardCompletedAuditSessions([]);
            setCompletedDashboardAuditsError('Não foi possível carregar auditorias concluídas agora.');
        } finally {
            setIsLoadingCompletedDashboardAudits(false);
        }
    }, [currentUser, dashboardAuditBranchCandidates]);


    useEffect(() => {
        const previousView = prevViewRef.current;
        prevViewRef.current = currentView;
        if (!currentUser || isLoadingData) return;
        if (currentView !== 'dashboard') return;
        // Atualiza automaticamente apenas ao ENTRAR na tela de dashboard.
        // Em F5, o currentUser pode chegar depois e previousView já ser "dashboard".
        // Nesse caso, se ainda não houve carga ("Aguardando carga"), deve carregar.
        if (previousView === 'dashboard' && dashboardAuditsFetchedAt && completedDashboardAuditsFetchedAt) return;
        void loadDashboardAuditSessions();
        void loadCompletedDashboardAuditSessions();
    }, [currentView, currentUser, isLoadingData, loadDashboardAuditSessions, loadCompletedDashboardAuditSessions, dashboardAuditsFetchedAt, completedDashboardAuditsFetchedAt]);

    const logBranchOptions = useMemo(() => {
        // Usa Map normalizado para deduplicar variações: '8' e 'Filial 8' → 'Filial 8'
        const normalized = new Map<string, string>(); // key=UPPERCASE, value=label canônico
        scopedUsers.forEach(u => {
            if (u.filial) {
                const label = normalizeBranchLabel(u.filial);
                const key = label.toUpperCase();
                if (!normalized.has(key)) normalized.set(key, label);
            }
        });
        scopedCompanies.forEach(c => {
            (c.areas || []).forEach((a: any) => {
                (a.branches || []).forEach((b: string) => {
                    const label = normalizeBranchLabel(b);
                    const key = label.toUpperCase();
                    if (!normalized.has(key)) normalized.set(key, label);
                });
            });
        });
        appEventLogs
            .filter(l => !currentUser?.company_id || l.company_id === currentUser.company_id)
            .forEach(l => {
                const label = normalizeBranchLabel(l.branch);
                const key = label.toUpperCase();
                if (!normalized.has(key)) normalized.set(key, label);
            });
        return Array.from(normalized.values()).sort();
    }, [scopedUsers, scopedCompanies, appEventLogs, currentUser?.company_id]);

    /**
     * Retorna filiais agrupadas por área, com filiais em ordem numérica (Filial 3 < Filial 8 < Filial 14).
     * Usado no select de filtro com <optgroup>.
     */
    const logBranchGroupedOptions = useMemo(() => {
        // Função de ordenação numérica para nomes como "Filial 8", "Filial 14"
        const sortNumeric = (a: string, b: string) => {
            const numA = parseInt(a.replace(/\D+/g, ''), 10);
            const numB = parseInt(b.replace(/\D+/g, ''), 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b, 'pt-BR');
        };

        // Mapa área → Set de labels normalizados
        const areaMap = new Map<string, Set<string>>(); // area → branch labels
        scopedCompanies.forEach(c => {
            (c.areas || []).forEach((a: any) => {
                const areaName: string = a.name || 'Sem Área';
                (a.branches || []).forEach((b: string) => {
                    const label = normalizeBranchLabel(b);
                    const set = areaMap.get(areaName) || new Set<string>();
                    set.add(label);
                    areaMap.set(areaName, set);
                });
            });
        });

        // Adiciona filiais de users não mapeadas
        scopedUsers.forEach(u => {
            if (u.filial) {
                const label = normalizeBranchLabel(u.filial);
                const area = u.area || 'Sem Área';
                const set = areaMap.get(area) || new Set<string>();
                set.add(label);
                areaMap.set(area, set);
            }
        });

        // Adiciona filiais dos eventos não mapeadas
        const allMapped = new Set(Array.from(areaMap.values()).flatMap(s => Array.from(s).map(v => v.toUpperCase())));
        const unmappedSet = new Set<string>();
        appEventLogs
            .filter(l => !currentUser?.company_id || l.company_id === currentUser.company_id)
            .forEach(l => {
                const label = normalizeBranchLabel(l.branch);
                if (!allMapped.has(label.toUpperCase())) unmappedSet.add(label);
            });
        if (unmappedSet.size > 0) {
            const existing = areaMap.get('Sem Área') || new Set<string>();
            unmappedSet.forEach(b => existing.add(b));
            areaMap.set('Sem Área', existing);
        }

        // Monta array de grupos com filiais em ordem numérica
        const groups: { area: string; branches: string[] }[] = [];
        areaMap.forEach((branchSet, area) => {
            const branches = Array.from(branchSet).sort(sortNumeric);
            if (branches.length > 0) groups.push({ area, branches });
        });
        // Áreas em ordem alfabética; 'Sem Área' por último
        groups.sort((a, b) => {
            if (a.area === 'Sem Área') return 1;
            if (b.area === 'Sem Área') return -1;
            return a.area.localeCompare(b.area, 'pt-BR');
        });
        return groups;
    }, [scopedUsers, scopedCompanies, appEventLogs, currentUser?.company_id]);

    const logAreaOptions = useMemo(() => {
        const set = new Set<string>();
        scopedUsers.forEach(u => {
            if (u.area) set.add(u.area);
        });
        scopedCompanies.forEach(c => {
            (c.areas || []).forEach((a: any) => {
                if (a.name) set.add(a.name);
            });
        });
        return Array.from(set).sort();
    }, [scopedUsers, scopedCompanies]);

    const logUserOptions = useMemo(() => {
        return scopedUsers
            .filter(u => u.email)
            .map(u => ({
                value: u.email,
                label: `${u.name || u.email} (${u.email})`
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [scopedUsers]);

    const logLastEventLabel = useMemo(() => {
        const last = filteredEventLogs[0]?.created_at;
        if (!last) return 'Sem registros';
        const date = new Date(last);
        if (Number.isNaN(date.getTime())) return 'Sem registros';
        return date.toLocaleString('pt-BR', { hour12: false });
    }, [filteredEventLogs]);

    const canModerateHistory = hasModuleAccess('historyModeration');

    const handleStockAreaFilterChange = (value: string) => setStockAreaFilter(value);

    const getFilteredHistory = () => {
        let filtered = [...reportHistory];

        // 1. Base User Filter (Permissions)
        if (canModerateHistory) {
            // Masters can see all, or filter by specific user
            if (historyFilterUser !== 'all') {
                filtered = filtered.filter(r => r.userEmail === historyFilterUser);
            }
        } else {
            // Regular users see only their own (plus allowed overrides)
            const allowed = new Set<string>(['asconavietagestor@gmail.com']);
            if (currentUser?.email) allowed.add(currentUser.email);

            // First restrict to allowed emails
            filtered = filtered.filter(r => allowed.has(r.userEmail));

            // Then apply user filter if they selected one (though UI usually hides this for non-masters, logic remains safe)
            if (historyFilterUser !== 'all' && allowed.has(historyFilterUser)) {
                filtered = filtered.filter(r => r.userEmail === historyFilterUser);
            } else if (historyFilterUser !== 'all') {
                // Tried to filter by someone not allowed
                return [];
            }
        }

        // 2. Filter by Search (Company Name)
        if (historySearch.trim()) {
            const searchLower = historySearch.toLowerCase();
            filtered = filtered.filter(r => (r.companyName || '').toLowerCase().includes(searchLower));
        }

        // 3. Filter by Area
        if (historyAreaFilter !== 'all') {
            filtered = filtered.filter(r => r.area === historyAreaFilter);
        }

        // 4. Filter by Date Range
        if (historyDateRange !== 'all') {
            const now = new Date();
            const todayStart = new Date(now.setHours(0, 0, 0, 0));

            filtered = filtered.filter(r => {
                const reportDate = new Date(r.createdAt);
                if (isNaN(reportDate.getTime())) return true;

                if (historyDateRange === 'today') {
                    return reportDate >= todayStart;
                } else if (historyDateRange === 'week') {
                    const weekAgo = new Date();
                    weekAgo.setDate(now.getDate() - 7);
                    return reportDate >= weekAgo;
                } else if (historyDateRange === 'month') {
                    const monthAgo = new Date();
                    monthAgo.setMonth(now.getMonth() - 1);
                    return reportDate >= monthAgo;
                }
                return true;
            });
        }

        return filtered.sort((a, b) => {
            const aTs = new Date((a as any).createdAt || a.date || 0).getTime();
            const bTs = new Date((b as any).createdAt || b.date || 0).getTime();
            const safeA = Number.isFinite(aTs) ? aTs : 0;
            const safeB = Number.isFinite(bTs) ? bTs : 0;
            return safeB - safeA;
        });
    };

    const filteredChecklistHistory = useMemo(() => getFilteredHistory(), [
        reportHistory,
        canModerateHistory,
        currentUser?.email,
        historyFilterUser,
        historySearch,
        historyAreaFilter,
        historyDateRange
    ]);

    const checklistMobileTotalPages = useMemo(() => {
        return Math.max(1, Math.ceil(filteredChecklistHistory.length / MOBILE_CHECKLIST_HISTORY_PAGE_SIZE));
    }, [filteredChecklistHistory.length, MOBILE_CHECKLIST_HISTORY_PAGE_SIZE]);
    const safeChecklistMobilePage = Math.min(checklistMobilePage, Math.max(0, checklistMobileTotalPages - 1));

    const pagedChecklistHistory = useMemo(() => {
        const start = safeChecklistMobilePage * MOBILE_CHECKLIST_HISTORY_PAGE_SIZE;
        return filteredChecklistHistory.slice(start, start + MOBILE_CHECKLIST_HISTORY_PAGE_SIZE);
    }, [filteredChecklistHistory, safeChecklistMobilePage, MOBILE_CHECKLIST_HISTORY_PAGE_SIZE]);

    useEffect(() => {
        setChecklistMobilePage(0);
    }, [historyFilterUser, historySearch, historyAreaFilter, historyDateRange]);

    const dashboardAuditOverview = useMemo(() => {
        type BranchMetric = {
            branch: string;
            area: string;
            auditNumber: number;
            updatedAt: string;
            progressPct: number;
            totalSkus: number;
            countedSkus: number;
            pendingSkus: number;
            totalUnits: number;
            countedUnits: number;
            pendingUnits: number;
            totalCost: number;
            pendingCost: number;
            diffQty: number;
            diffCost: number;
            countedCost: number;
            divergencePct: number;
            termsWithExcel: number;
        };

        const branchToArea = new Map<string, string>();
        scopedCompanies.forEach(c => {
            (c.areas || []).forEach((area: any) => {
                const areaName = String(area?.name || '').trim() || 'Sem Área';
                (area.branches || []).forEach((branch: string) => {
                    const normalized = normalizeBranchLabel(branch);
                    branchToArea.set(normalized, areaName);
                });
            });
        });
        scopedUsers.forEach(u => {
            const normalized = normalizeBranchLabel(u.filial || '');
            if (normalized === 'Sem Filial') return;
            if (!branchToArea.has(normalized)) {
                branchToArea.set(normalized, (u.area || 'Sem Área').trim() || 'Sem Área');
            }
        });

        let filteredSessions = dashboardAuditSessions;
        if (openAuditNumberFilter !== 'all') {
            const tgtNum = Number(openAuditNumberFilter);
            filteredSessions = filteredSessions.filter(s => Number(s.audit_number || 0) === tgtNum);
        }

        const latestByBranch = new Map<string, SupabaseService.DbAuditSession>();
        filteredSessions.forEach(session => {
            const branchLabel = normalizeBranchLabel(session.branch);
            const prev = latestByBranch.get(branchLabel);
            if (!prev) {
                latestByBranch.set(branchLabel, session);
                return;
            }
            const prevAudit = Number(prev.audit_number || 0);
            const curAudit = Number(session.audit_number || 0);
            if (curAudit > prevAudit) {
                latestByBranch.set(branchLabel, session);
                return;
            }
            if (curAudit < prevAudit) return;
            const prevTs = Date.parse(String(prev.updated_at || prev.created_at || '')) || 0;
            const curTs = Date.parse(String(session.updated_at || session.created_at || '')) || 0;
            if (curTs > prevTs || (curTs === prevTs && Number(session.audit_number || 0) > Number(prev.audit_number || 0))) {
                latestByBranch.set(branchLabel, session);
            }
        });

        const branches: BranchMetric[] = [];
        const uniqueSkuSet = new Set<string>();
        const uniqueSkuDoneSet = new Set<string>();
        const normalizeProductCode = (value: unknown) =>
            String(value ?? '')
                .trim()
                .replace(/\D/g, '')
                .replace(/^0+/, '');
        latestByBranch.forEach((session, branchLabel) => {
            const parsedData = parseJsonValue<any>(session.data) || session.data || {};
            const groups = Array.isArray(parsedData?.groups) ? parsedData.groups : [];

            const skuMap = new Map<string, { units: number; cost: number; done: boolean }>();
            const fallbackCategoryKeys = new Set<string>();
            let fallbackTotalSkus = 0;
            let fallbackCountedSkus = 0;
            let fallbackTotalUnits = 0;
            let fallbackCountedUnits = 0;
            let fallbackTotalCost = 0;
            let fallbackCountedCost = 0;

            groups.forEach((group: any) => {
                (group?.departments || []).forEach((dept: any) => {
                    (dept?.categories || []).forEach((cat: any) => {
                        const itemsCount = Number(cat?.itemsCount || 0);
                        const units = Number(cat?.totalQuantity || 0);
                        const cost = Number(cat?.totalCost || 0);
                        const status = normalizeAuditCategoryStatus(cat?.status);
                        const products = Array.isArray(cat?.products) ? cat.products : [];
                        const groupKey = String(group?.id || group?.name || '').trim();
                        const deptKey = String(dept?.numericId || dept?.id || dept?.name || '').trim();
                        const catKey = String(cat?.id || cat?.numericId || cat?.name || '').trim();
                        const fallbackKey = `${groupKey}|${deptKey}|${catKey}`;

                        if (products.length > 0) {
                            products.forEach((p: any) => {
                                const code = normalizeProductCode(p?.reducedCode || p?.code || '');
                                if (!code) return;
                                const productUnits = Number(p?.quantity || 0);
                                const unitCost = Number(p?.cost || 0);
                                const productCost = productUnits * unitCost;
                                const prev = skuMap.get(code) || { units: 0, cost: 0, done: false };
                                // Dedup defensivo: se o mesmo SKU vier duplicado na estrutura, mantém o maior valor.
                                skuMap.set(code, {
                                    units: Math.max(prev.units, productUnits),
                                    cost: Math.max(prev.cost, productCost),
                                    done: prev.done || status === 'done'
                                });
                            });
                        } else if (!fallbackCategoryKeys.has(fallbackKey)) {
                            fallbackCategoryKeys.add(fallbackKey);
                            fallbackTotalSkus += itemsCount;
                            fallbackTotalUnits += units;
                            fallbackTotalCost += cost;
                            if (status === 'done') {
                                fallbackCountedSkus += itemsCount;
                                fallbackCountedUnits += units;
                                fallbackCountedCost += cost;
                            }
                        }
                    });
                });
            });

            let totalSkus = fallbackTotalSkus;
            let countedSkus = fallbackCountedSkus;
            let totalUnits = fallbackTotalUnits;
            let countedUnits = fallbackCountedUnits;
            let totalCost = fallbackTotalCost;
            let countedCost = fallbackCountedCost;
            skuMap.forEach((sku, code) => {
                totalSkus += 1;
                totalUnits += sku.units;
                totalCost += sku.cost;
                if (sku.done) {
                    countedSkus += 1;
                    countedUnits += sku.units;
                    countedCost += sku.cost;
                }
                uniqueSkuSet.add(code);
                if (sku.done) uniqueSkuDoneSet.add(code);
            });

            let diffQty = 0;
            let diffCost = 0;
            let termsWithExcel = 0;
            const termDraftEntries: Array<[string, any]> = parsedData?.termDrafts && typeof parsedData.termDrafts === 'object'
                ? Object.entries(parsedData.termDrafts)
                : [];
            const backupMetricsByKey: Record<string, any> = parsedData?.termExcelMetricsByKey && typeof parsedData.termExcelMetricsByKey === 'object'
                ? parsedData.termExcelMetricsByKey
                : {};
            const normalizeScopeId = (value: unknown) => String(value ?? '').trim().toLowerCase();
            const normalizeDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
            const normalizeText = (value: unknown) =>
                String(value ?? '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .trim();
            const makeAliasSet = (values: unknown[]) => {
                const set = new Set<string>();
                values.forEach(v => {
                    const raw = normalizeScopeId(v);
                    if (raw) set.add(raw);
                    const digits = normalizeDigits(v);
                    if (digits) set.add(digits);
                });
                return set;
            };
            const sumRows = (rows: any[]) => rows.reduce((acc, curr) => ({
                diffQty: acc.diffQty + Number(curr?.diffQty || 0),
                diffCost: acc.diffCost + Number(curr?.diffCost || 0)
            }), { diffQty: 0, diffCost: 0 });
            const mergeExcelMetricsPools = (pools: any[]) => {
                const validPools = (pools || []).filter(Boolean);
                if (validPools.length === 0) return null;
                if (validPools.length === 1) return validPools[0];

                const uniqueItems = new Map<string, any>();
                validPools.forEach((pool: any) => {
                    (Array.isArray(pool?.items) ? pool.items : []).forEach((it: any) => {
                        const keyObj = {
                            code: normalizeDigits(it?.code || it?.reducedCode),
                            groupId: normalizeScopeId(it?.groupId),
                            deptId: normalizeScopeId(it?.deptId),
                            catId: normalizeScopeId(it?.catId),
                            groupName: normalizeText(it?.groupName),
                            deptName: normalizeText(it?.deptName),
                            catName: normalizeText(it?.catName),
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
                    const groupedMap: Record<string, any> = {};
                    items.forEach((it: any) => {
                        const gId = normalizeScopeId(it?.groupId);
                        const dId = normalizeScopeId(it?.deptId);
                        const cId = normalizeScopeId(it?.catId);
                        const g = it?.groupName || '';
                        const d = it?.deptName || '';
                        const c = it?.catName || '';
                        const key = `${gId || g}|${dId || d}|${cId || c}`;
                        if (!groupedMap[key]) {
                            groupedMap[key] = {
                                groupId: gId || undefined,
                                deptId: dId || undefined,
                                catId: cId || undefined,
                                groupName: g,
                                deptName: d,
                                catName: c,
                                diffQty: 0,
                                diffCost: 0
                            };
                        }
                        groupedMap[key].diffQty += Number(it?.diffQty || 0);
                        groupedMap[key].diffCost += Number(it?.diffCost || 0);
                    });
                    return { items, groupedDifferences: Object.values(groupedMap) };
                }

                return {
                    items: [],
                    groupedDifferences: validPools.flatMap((pool: any) => Array.isArray(pool?.groupedDifferences) ? pool.groupedDifferences : [])
                };
            };

            const termKeys = new Set<string>([
                ...termDraftEntries.map(([k]) => String(k || '')),
                ...Object.keys(backupMetricsByKey || {})
            ]);
            // Alinhamento com o módulo:
            // - pool geral considera apenas termDrafts ativos (excelMetrics presentes e não removidos)
            // - backup por key só é usado no acesso direto do escopo (getScopedMetricsLocal)
            const pools = termDraftEntries
                .map(([, draft]) => {
                    if (!draft?.excelMetrics) return null;
                    if (draft?.excelMetricsRemovedAt && !draft?.excelMetrics) return null;
                    return draft.excelMetrics;
                })
                .filter(Boolean);
            termsWithExcel = pools.length;
            const mergedMetrics = mergeExcelMetricsPools(pools as any[]);
            const scopedRows = Array.isArray(mergedMetrics?.items) && mergedMetrics.items.length > 0
                ? mergedMetrics.items
                : (Array.isArray(mergedMetrics?.groupedDifferences) ? mergedMetrics.groupedDifferences : []);

            const groupNameToIds = new Map<string, Set<string>>();
            groups.forEach((group: any) => {
                const key = normalizeText(group?.name);
                if (!key) return;
                const ids = groupNameToIds.get(key) || new Set<string>();
                makeAliasSet([group?.id]).forEach(id => ids.add(id));
                groupNameToIds.set(key, ids);
            });
            const matchByUniqueName = (nameMap: Map<string, Set<string>>, rowName: unknown, targetAliases: Set<string>) => {
                const key = normalizeText(rowName);
                if (!key) return false;
                const ids = nameMap.get(key);
                if (!ids || ids.size !== 1) return false;
                const only = Array.from(ids)[0];
                return targetAliases.has(only);
            };
            const partialScopeKey = (s: { groupId?: string; deptId?: string; catId?: string }) => [s.groupId || '', s.deptId || '', s.catId || ''].join('|');
            const getScopeCategories = (groupId?: string, deptId?: string, catId?: string) => {
                const out: Array<{ group: any; dept: any; cat: any }> = [];
                (groups || []).forEach((group: any) => {
                    if (groupId && normalizeScopeId(group.id) !== normalizeScopeId(groupId)) return;
                    (group.departments || []).forEach((dept: any) => {
                        if (deptId && normalizeScopeId(dept.id) !== normalizeScopeId(deptId)) return;
                        (dept.categories || []).forEach((cat: any) => {
                            if (catId && normalizeScopeId(cat.id) !== normalizeScopeId(catId)) return;
                            out.push({ group, dept, cat });
                        });
                    });
                });
                return out;
            };
            const buildTermKey = (scope: { type: 'group' | 'department' | 'category'; groupId: string; deptId?: string; catId?: string }) =>
                [scope.type, scope.groupId || '', scope.deptId || '', scope.catId || ''].join('|');
            const parseCustomDraftKey = (draftKey: string) => {
                const match = draftKey.match(/^custom\|([^|]*)(?:\|(.*))?$/);
                if (!match) return null as null | { batchId?: string; scopesPart: string };
                const hasNewFormat = typeof match[2] === 'string';
                if (hasNewFormat) return { batchId: (match[1] || '').trim() || undefined, scopesPart: match[2] || '' };
                return { batchId: undefined, scopesPart: match[1] || '' };
            };
            const getScopedMetricsLocal = (scope: { type: 'group' | 'department' | 'category'; group: any; dept?: any; cat?: any }) => {
                const scopeGroupId = String(scope.group?.id || '');
                const scopeDeptId = scope.dept ? String(scope.dept?.id || '') : undefined;
                const scopeCatId = scope.cat ? String(scope.cat?.id || '') : undefined;
                const key = buildTermKey({
                    type: scope.type,
                    groupId: scopeGroupId,
                    deptId: scopeDeptId,
                    catId: scopeCatId
                });
                const draft = (parsedData?.termDrafts || {})[key];
                const backup = backupMetricsByKey[key];
                if (draft?.excelMetricsRemovedAt && !draft?.excelMetrics) return null;
                const draftMetrics = draft?.excelMetrics || backup || null;

                const groupNameToIds = new Map<string, Set<string>>();
                (groups || []).forEach((g: any) => {
                    const keyName = normalizeText(g.name);
                    if (!keyName) return;
                    const ids = groupNameToIds.get(keyName) || new Set<string>();
                    makeAliasSet([g.id]).forEach(id => ids.add(id));
                    groupNameToIds.set(keyName, ids);
                });
                const deptNameToIds = new Map<string, Set<string>>();
                (scope.group?.departments || []).forEach((d: any) => {
                    const keyName = normalizeText(d.name);
                    if (!keyName) return;
                    const ids = deptNameToIds.get(keyName) || new Set<string>();
                    makeAliasSet([d.id, d.numericId]).forEach(id => ids.add(id));
                    deptNameToIds.set(keyName, ids);
                });
                const catNameToIds = new Map<string, Set<string>>();
                (scope.dept?.categories || []).forEach((c: any) => {
                    const keyName = normalizeText(c.name);
                    if (!keyName) return;
                    const ids = catNameToIds.get(keyName) || new Set<string>();
                    makeAliasSet([c.id, c.numericId]).forEach(id => ids.add(id));
                    catNameToIds.set(keyName, ids);
                });
                const groupAliases = makeAliasSet([scopeGroupId, scope.group?.id]);
                const deptAliases = makeAliasSet([scopeDeptId, scope.dept?.id, scope.dept?.numericId]);
                const catAliases = makeAliasSet([scopeCatId, scope.cat?.id, scope.cat?.numericId]);
                const groupName = normalizeText(scope.group?.name);
                const deptName = normalizeText(scope.dept?.name);
                const catName = normalizeText(scope.cat?.name);
                const matchScopeRecord = (row: any) => {
                    const rowG = normalizeScopeId(row?.groupId);
                    const rowD = normalizeScopeId(row?.deptId);
                    const rowC = normalizeScopeId(row?.catId);
                    const matchG = rowG
                        ? (groupAliases.has(rowG) || groupAliases.has(normalizeDigits(rowG)))
                        : (normalizeText(row?.groupName) === groupName && matchByUniqueName(groupNameToIds, row?.groupName, groupAliases));
                    if (!matchG) return false;
                    if (scope.type === 'group') return true;
                    const matchD = rowD
                        ? (deptAliases.has(rowD) || deptAliases.has(normalizeDigits(rowD)))
                        : (normalizeText(row?.deptName) === deptName && matchByUniqueName(deptNameToIds, row?.deptName, deptAliases));
                    if (!matchD) return false;
                    if (scope.type === 'department') return true;
                    const matchC = rowC
                        ? (catAliases.has(rowC) || catAliases.has(normalizeDigits(rowC)))
                        : (normalizeText(row?.catName) === catName && matchByUniqueName(catNameToIds, row?.catName, catAliases));
                    return matchC;
                };

                if (draftMetrics) {
                    const directItems = (Array.isArray(draftMetrics?.items) ? draftMetrics.items : []).filter((it: any) => matchScopeRecord(it));
                    const directGrouped = (Array.isArray(draftMetrics?.groupedDifferences) ? draftMetrics.groupedDifferences : []).filter((it: any) => matchScopeRecord(it));
                    const source = directItems.length > 0 ? directItems : (directGrouped.length > 0 ? directGrouped : null);
                    return source ? sumRows(source) : null;
                }

                const targetCatKeys = new Set(
                    getScopeCategories(scopeGroupId, scopeDeptId, scopeCatId)
                        .map(({ group, dept, cat }) => partialScopeKey({ groupId: group.id, deptId: dept.id, catId: cat.id }))
                );
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
                const scopedPools = termDraftEntries
                    .filter(([draftKey, draftValue]) => {
                        if (!draftValue?.excelMetrics || draftValue?.excelMetricsRemovedAt) return false;
                        return draftTouchesScope(String(draftKey || ''));
                    })
                    .map(([, draftValue]) => draftValue.excelMetrics)
                    .filter(Boolean);
                const base = mergeExcelMetricsPools(scopedPools as any[]);
                // Alinhamento exato com o módulo: no fallback sem termo direto,
                // a filtragem é feita somente em groupedDifferences.
                if (!base || !Array.isArray(base.groupedDifferences)) return null;
                const scopeGroupIdNorm = normalizeScopeId(scopeGroupId);
                const scopeDeptIdNorm = normalizeScopeId(scopeDeptId);
                const scopeCatIdNorm = normalizeScopeId(scopeCatId);
                const filtered = (base.groupedDifferences || []).filter((row: any) => {
                    const hasGroupId = !!normalizeScopeId(row?.groupId);
                    const hasDeptId = !!normalizeScopeId(row?.deptId);
                    const hasCatId = !!normalizeScopeId(row?.catId);
                    const matchG = hasGroupId
                        ? normalizeScopeId(row?.groupId) === scopeGroupIdNorm
                        : normalizeText(row?.groupName) === groupName;
                    if (scope.type === 'group') return matchG;
                    const matchD = hasDeptId
                        ? normalizeScopeId(row?.deptId) === scopeDeptIdNorm
                        : normalizeText(row?.deptName) === deptName;
                    if (scope.type === 'department') return matchG && matchD;
                    const matchC = hasCatId
                        ? normalizeScopeId(row?.catId) === scopeCatIdNorm
                        : normalizeText(row?.catName) === catName;
                    return matchG && matchD && matchC;
                });
                return filtered.length > 0 ? sumRows(filtered) : null;
            };

            groups.forEach((group: any) => {
                const groupDirect = getScopedMetricsLocal({ type: 'group', group });
                const deptMetrics = (group?.departments || [])
                    .map((dept: any) => getScopedMetricsLocal({ type: 'department', group, dept }))
                    .filter(Boolean) as Array<{ diffQty: number; diffCost: number }>;

                let groupMetric = groupDirect || { diffQty: 0, diffCost: 0 };
                if (deptMetrics.length > 0) {
                    const byDepartments = sumRows(deptMetrics as any[]);
                    if (!groupDirect) {
                        groupMetric = byDepartments;
                    } else {
                        const hasRelevantMismatch =
                            Math.abs(Number(groupDirect.diffQty || 0) - Number(byDepartments.diffQty || 0)) > 0.01 ||
                            Math.abs(Number(groupDirect.diffCost || 0) - Number(byDepartments.diffCost || 0)) > 0.01;
                        groupMetric = hasRelevantMismatch ? byDepartments : groupDirect;
                    }
                }

                diffQty += Number(groupMetric.diffQty || 0);
                diffCost += Number(groupMetric.diffCost || 0);
            });

            const pendingSkus = Math.max(0, totalSkus - countedSkus);
            const pendingUnits = Math.max(0, totalUnits - countedUnits);
            const pendingCost = Math.max(0, totalCost - countedCost);
            const progressPct = totalUnits > 0
                ? (countedUnits / totalUnits) * 100
                : Number(session.progress || 0);
            const divergencePct = countedCost > 0 ? (diffCost / countedCost) * 100 : 0;

            branches.push({
                branch: branchLabel,
                area: branchToArea.get(branchLabel) || 'Sem Área',
                auditNumber: Number(session.audit_number || 0),
                updatedAt: String(session.updated_at || session.created_at || ''),
                progressPct,
                totalSkus,
                countedSkus,
                pendingSkus,
                totalUnits,
                countedUnits,
                pendingUnits,
                totalCost,
                pendingCost,
                diffQty,
                diffCost,
                countedCost,
                divergencePct,
                termsWithExcel
            });
        });

        const getBranchOrder = (label: string) => {
            const numeric = Number((String(label || '').match(/\d+/)?.[0] || '999999'));
            return Number.isFinite(numeric) ? numeric : 999999;
        };
        branches.sort((a, b) => getBranchOrder(a.branch) - getBranchOrder(b.branch));

        const areaMap = new Map<string, {
            area: string;
            branches: number;
            totalSkus: number;
            countedSkus: number;
            pendingSkus: number;
            totalUnits: number;
            countedUnits: number;
            pendingUnits: number;
            countedCost: number;
            diffQty: number;
            diffCost: number;
        }>();

        branches.forEach(item => {
            const current = areaMap.get(item.area) || {
                area: item.area,
                branches: 0,
                totalSkus: 0,
                countedSkus: 0,
                pendingSkus: 0,
                totalUnits: 0,
                countedUnits: 0,
                pendingUnits: 0,
                countedCost: 0,
                diffQty: 0,
                diffCost: 0
            };
            current.branches += 1;
            current.totalSkus += item.totalSkus;
            current.countedSkus += item.countedSkus;
            current.pendingSkus += item.pendingSkus;
            current.totalUnits += item.totalUnits;
            current.countedUnits += item.countedUnits;
            current.pendingUnits += item.pendingUnits;
            current.countedCost += item.countedCost;
            current.diffQty += item.diffQty;
            current.diffCost += item.diffCost;
            areaMap.set(item.area, current);
        });

        const areas = Array.from(areaMap.values()).sort((a, b) => a.area.localeCompare(b.area, 'pt-BR'));
        const summary = branches.reduce((acc, item) => {
            acc.openAudits += 1;
            acc.totalSkus += item.totalSkus;
            acc.countedSkus += item.countedSkus;
            acc.pendingSkus += item.pendingSkus;
            acc.totalUnits += item.totalUnits;
            acc.countedUnits += item.countedUnits;
            acc.pendingUnits += item.pendingUnits;
            acc.totalCost += item.totalCost;
            acc.pendingCost += item.pendingCost;
            acc.countedCost += item.countedCost;
            acc.diffQty += item.diffQty;
            acc.diffCost += item.diffCost;
            return acc;
        }, {
            openAudits: 0,
            totalSkus: 0,
            countedSkus: 0,
            pendingSkus: 0,
            totalUnits: 0,
            countedUnits: 0,
            pendingUnits: 0,
            totalCost: 0,
            pendingCost: 0,
            countedCost: 0,
            diffQty: 0,
            diffCost: 0
        });

        const accumulatedPct = summary.totalUnits > 0
            ? (summary.countedUnits / summary.totalUnits) * 100
            : 0;
        const uniqueTotalSkus = uniqueSkuSet.size;
        const uniqueCountedSkus = uniqueSkuDoneSet.size;
        const uniquePendingSkus = Math.max(0, uniqueTotalSkus - uniqueCountedSkus);
        const summaryDivergencePct = summary.countedCost > 0
            ? (summary.diffCost / summary.countedCost) * 100
            : 0;

        return { summary, accumulatedPct, summaryDivergencePct, uniqueTotalSkus, uniqueCountedSkus, uniquePendingSkus, areas, branches };
    }, [dashboardAuditSessions, scopedCompanies, scopedUsers, openAuditNumberFilter]);

    const dashboardCompletedAuditOverview = useMemo(() => {
        type BranchMetric = {
            branch: string;
            area: string;
            auditNumber: number;
            updatedAt: string;
            progressPct: number;
            totalSkus: number;
            countedSkus: number;
            pendingSkus: number;
            totalUnits: number;
            countedUnits: number;
            pendingUnits: number;
            totalCost: number;
            pendingCost: number;
            diffQty: number;
            diffCost: number;
            countedCost: number;
            divergencePct: number;
            termsWithExcel: number;
        };

        const branchToArea = new Map<string, string>();
        scopedCompanies.forEach(c => {
            (c.areas || []).forEach((area: any) => {
                const areaName = String(area?.name || '').trim() || 'Sem Área';
                (area.branches || []).forEach((branch: string) => {
                    const normalized = normalizeBranchLabel(branch);
                    branchToArea.set(normalized, areaName);
                });
            });
        });
        scopedUsers.forEach(u => {
            const normalized = normalizeBranchLabel(u.filial || '');
            if (normalized === 'Sem Filial') return;
            if (!branchToArea.has(normalized)) {
                branchToArea.set(normalized, (u.area || 'Sem Área').trim() || 'Sem Área');
            }
        });

        const latestByBranch = new Map<string, SupabaseService.DbAuditSession>();
        dashboardCompletedAuditSessions.forEach(session => {
            if (completedAuditNumberFilter !== 'all' && String(session.audit_number || 0) !== completedAuditNumberFilter) {
                return;
            }
            const branchLabel = normalizeBranchLabel(session.branch);
            const prev = latestByBranch.get(branchLabel);
            if (!prev) {
                latestByBranch.set(branchLabel, session);
                return;
            }
            const prevAudit = Number(prev.audit_number || 0);
            const curAudit = Number(session.audit_number || 0);
            if (curAudit > prevAudit) {
                latestByBranch.set(branchLabel, session);
                return;
            }
            if (curAudit < prevAudit) return;
            const prevTs = Date.parse(String(prev.updated_at || prev.created_at || '')) || 0;
            const curTs = Date.parse(String(session.updated_at || session.created_at || '')) || 0;
            if (curTs > prevTs || (curTs === prevTs && Number(session.audit_number || 0) > Number(prev.audit_number || 0))) {
                latestByBranch.set(branchLabel, session);
            }
        });

        const branches: BranchMetric[] = [];
        const uniqueSkuSet = new Set<string>();
        const uniqueSkuDoneSet = new Set<string>();
        const normalizeProductCode = (value: unknown) =>
            String(value ?? '')
                .trim()
                .replace(/\D/g, '')
                .replace(/^0+/, '');
        latestByBranch.forEach((session, branchLabel) => {
            const parsedData = parseJsonValue<any>(session.data) || session.data || {};
            const groups = Array.isArray(parsedData?.groups) ? parsedData.groups : [];

            const skuMap = new Map<string, { units: number; cost: number; done: boolean }>();
            const fallbackCategoryKeys = new Set<string>();
            let fallbackTotalSkus = 0;
            let fallbackCountedSkus = 0;
            let fallbackTotalUnits = 0;
            let fallbackCountedUnits = 0;
            let fallbackTotalCost = 0;
            let fallbackCountedCost = 0;

            groups.forEach((group: any) => {
                (group?.departments || []).forEach((dept: any) => {
                    (dept?.categories || []).forEach((cat: any) => {
                        const itemsCount = Number(cat?.itemsCount || 0);
                        const units = Number(cat?.totalQuantity || 0);
                        const cost = Number(cat?.totalCost || 0);
                        const status = normalizeAuditCategoryStatus(cat?.status);
                        const products = Array.isArray(cat?.products) ? cat.products : [];
                        const groupKey = String(group?.id || group?.name || '').trim();
                        const deptKey = String(dept?.numericId || dept?.id || dept?.name || '').trim();
                        const catKey = String(cat?.id || cat?.numericId || cat?.name || '').trim();
                        const fallbackKey = `${groupKey}|${deptKey}|${catKey}`;

                        if (products.length > 0) {
                            products.forEach((p: any) => {
                                const code = normalizeProductCode(p?.reducedCode || p?.code || '');
                                if (!code) return;
                                const productUnits = Number(p?.quantity || 0);
                                const unitCost = Number(p?.cost || 0);
                                const productCost = productUnits * unitCost;
                                const prev = skuMap.get(code) || { units: 0, cost: 0, done: false };
                                // Dedup defensivo: se o mesmo SKU vier duplicado na estrutura, mantém o maior valor.
                                skuMap.set(code, {
                                    units: Math.max(prev.units, productUnits),
                                    cost: Math.max(prev.cost, productCost),
                                    done: prev.done || status === 'done'
                                });
                            });
                        } else if (!fallbackCategoryKeys.has(fallbackKey)) {
                            fallbackCategoryKeys.add(fallbackKey);
                            fallbackTotalSkus += itemsCount;
                            fallbackTotalUnits += units;
                            fallbackTotalCost += cost;
                            if (status === 'done') {
                                fallbackCountedSkus += itemsCount;
                                fallbackCountedUnits += units;
                                fallbackCountedCost += cost;
                            }
                        }
                    });
                });
            });

            let totalSkus = fallbackTotalSkus;
            let countedSkus = fallbackCountedSkus;
            let totalUnits = fallbackTotalUnits;
            let countedUnits = fallbackCountedUnits;
            let totalCost = fallbackTotalCost;
            let countedCost = fallbackCountedCost;
            skuMap.forEach((sku, code) => {
                totalSkus += 1;
                totalUnits += sku.units;
                totalCost += sku.cost;
                if (sku.done) {
                    countedSkus += 1;
                    countedUnits += sku.units;
                    countedCost += sku.cost;
                }
                uniqueSkuSet.add(code);
                if (sku.done) uniqueSkuDoneSet.add(code);
            });

            let diffQty = 0;
            let diffCost = 0;
            let termsWithExcel = 0;
            const termDraftEntries: Array<[string, any]> = parsedData?.termDrafts && typeof parsedData.termDrafts === 'object'
                ? Object.entries(parsedData.termDrafts)
                : [];
            const backupMetricsByKey: Record<string, any> = parsedData?.termExcelMetricsByKey && typeof parsedData.termExcelMetricsByKey === 'object'
                ? parsedData.termExcelMetricsByKey
                : {};
            const normalizeScopeId = (value: unknown) => String(value ?? '').trim().toLowerCase();
            const normalizeDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
            const normalizeText = (value: unknown) =>
                String(value ?? '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .trim();
            const makeAliasSet = (values: unknown[]) => {
                const set = new Set<string>();
                values.forEach(v => {
                    const raw = normalizeScopeId(v);
                    if (raw) set.add(raw);
                    const digits = normalizeDigits(v);
                    if (digits) set.add(digits);
                });
                return set;
            };
            const sumRows = (rows: any[]) => rows.reduce((acc, curr) => ({
                diffQty: acc.diffQty + Number(curr?.diffQty || 0),
                diffCost: acc.diffCost + Number(curr?.diffCost || 0)
            }), { diffQty: 0, diffCost: 0 });
            const mergeExcelMetricsPools = (pools: any[]) => {
                const validPools = (pools || []).filter(Boolean);
                if (validPools.length === 0) return null;
                if (validPools.length === 1) return validPools[0];

                const uniqueItems = new Map<string, any>();
                validPools.forEach((pool: any) => {
                    (Array.isArray(pool?.items) ? pool.items : []).forEach((it: any) => {
                        const keyObj = {
                            code: normalizeDigits(it?.code || it?.reducedCode),
                            groupId: normalizeScopeId(it?.groupId),
                            deptId: normalizeScopeId(it?.deptId),
                            catId: normalizeScopeId(it?.catId),
                            groupName: normalizeText(it?.groupName),
                            deptName: normalizeText(it?.deptName),
                            catName: normalizeText(it?.catName),
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
                    const groupedMap: Record<string, any> = {};
                    items.forEach((it: any) => {
                        const gId = normalizeScopeId(it?.groupId);
                        const dId = normalizeScopeId(it?.deptId);
                        const cId = normalizeScopeId(it?.catId);
                        const g = it?.groupName || '';
                        const d = it?.deptName || '';
                        const c = it?.catName || '';
                        const key = `${gId || g}|${dId || d}|${cId || c}`;
                        if (!groupedMap[key]) {
                            groupedMap[key] = {
                                groupId: gId || undefined,
                                deptId: dId || undefined,
                                catId: cId || undefined,
                                groupName: g,
                                deptName: d,
                                catName: c,
                                diffQty: 0,
                                diffCost: 0
                            };
                        }
                        groupedMap[key].diffQty += Number(it?.diffQty || 0);
                        groupedMap[key].diffCost += Number(it?.diffCost || 0);
                    });
                    return { items, groupedDifferences: Object.values(groupedMap) };
                }

                return {
                    items: [],
                    groupedDifferences: validPools.flatMap((pool: any) => Array.isArray(pool?.groupedDifferences) ? pool.groupedDifferences : [])
                };
            };

            const termKeys = new Set<string>([
                ...termDraftEntries.map(([k]) => String(k || '')),
                ...Object.keys(backupMetricsByKey || {})
            ]);
            // Alinhamento com o módulo:
            // - pool geral considera apenas termDrafts ativos (excelMetrics presentes e não removidos)
            // - backup por key só é usado no acesso direto do escopo (getScopedMetricsLocal)
            const pools = termDraftEntries
                .map(([, draft]) => {
                    if (!draft?.excelMetrics) return null;
                    if (draft?.excelMetricsRemovedAt && !draft?.excelMetrics) return null;
                    return draft.excelMetrics;
                })
                .filter(Boolean);
            termsWithExcel = pools.length;
            const mergedMetrics = mergeExcelMetricsPools(pools as any[]);
            const scopedRows = Array.isArray(mergedMetrics?.items) && mergedMetrics.items.length > 0
                ? mergedMetrics.items
                : (Array.isArray(mergedMetrics?.groupedDifferences) ? mergedMetrics.groupedDifferences : []);

            const groupNameToIds = new Map<string, Set<string>>();
            groups.forEach((group: any) => {
                const key = normalizeText(group?.name);
                if (!key) return;
                const ids = groupNameToIds.get(key) || new Set<string>();
                makeAliasSet([group?.id]).forEach(id => ids.add(id));
                groupNameToIds.set(key, ids);
            });
            const matchByUniqueName = (nameMap: Map<string, Set<string>>, rowName: unknown, targetAliases: Set<string>) => {
                const key = normalizeText(rowName);
                if (!key) return false;
                const ids = nameMap.get(key);
                if (!ids || ids.size !== 1) return false;
                const only = Array.from(ids)[0];
                return targetAliases.has(only);
            };
            const partialScopeKey = (s: { groupId?: string; deptId?: string; catId?: string }) => [s.groupId || '', s.deptId || '', s.catId || ''].join('|');
            const getScopeCategories = (groupId?: string, deptId?: string, catId?: string) => {
                const out: Array<{ group: any; dept: any; cat: any }> = [];
                (groups || []).forEach((group: any) => {
                    if (groupId && normalizeScopeId(group.id) !== normalizeScopeId(groupId)) return;
                    (group.departments || []).forEach((dept: any) => {
                        if (deptId && normalizeScopeId(dept.id) !== normalizeScopeId(deptId)) return;
                        (dept.categories || []).forEach((cat: any) => {
                            if (catId && normalizeScopeId(cat.id) !== normalizeScopeId(catId)) return;
                            out.push({ group, dept, cat });
                        });
                    });
                });
                return out;
            };
            const buildTermKey = (scope: { type: 'group' | 'department' | 'category'; groupId: string; deptId?: string; catId?: string }) =>
                [scope.type, scope.groupId || '', scope.deptId || '', scope.catId || ''].join('|');
            const parseCustomDraftKey = (draftKey: string) => {
                const match = draftKey.match(/^custom\|([^|]*)(?:\|(.*))?$/);
                if (!match) return null as null | { batchId?: string; scopesPart: string };
                const hasNewFormat = typeof match[2] === 'string';
                if (hasNewFormat) return { batchId: (match[1] || '').trim() || undefined, scopesPart: match[2] || '' };
                return { batchId: undefined, scopesPart: match[1] || '' };
            };
            const getScopedMetricsLocal = (scope: { type: 'group' | 'department' | 'category'; group: any; dept?: any; cat?: any }) => {
                const scopeGroupId = String(scope.group?.id || '');
                const scopeDeptId = scope.dept ? String(scope.dept?.id || '') : undefined;
                const scopeCatId = scope.cat ? String(scope.cat?.id || '') : undefined;
                const key = buildTermKey({
                    type: scope.type,
                    groupId: scopeGroupId,
                    deptId: scopeDeptId,
                    catId: scopeCatId
                });
                const draft = (parsedData?.termDrafts || {})[key];
                const backup = backupMetricsByKey[key];
                if (draft?.excelMetricsRemovedAt && !draft?.excelMetrics) return null;
                const draftMetrics = draft?.excelMetrics || backup || null;

                const groupNameToIds = new Map<string, Set<string>>();
                (groups || []).forEach((g: any) => {
                    const keyName = normalizeText(g.name);
                    if (!keyName) return;
                    const ids = groupNameToIds.get(keyName) || new Set<string>();
                    makeAliasSet([g.id]).forEach(id => ids.add(id));
                    groupNameToIds.set(keyName, ids);
                });
                const deptNameToIds = new Map<string, Set<string>>();
                (scope.group?.departments || []).forEach((d: any) => {
                    const keyName = normalizeText(d.name);
                    if (!keyName) return;
                    const ids = deptNameToIds.get(keyName) || new Set<string>();
                    makeAliasSet([d.id, d.numericId]).forEach(id => ids.add(id));
                    deptNameToIds.set(keyName, ids);
                });
                const catNameToIds = new Map<string, Set<string>>();
                (scope.dept?.categories || []).forEach((c: any) => {
                    const keyName = normalizeText(c.name);
                    if (!keyName) return;
                    const ids = catNameToIds.get(keyName) || new Set<string>();
                    makeAliasSet([c.id, c.numericId]).forEach(id => ids.add(id));
                    catNameToIds.set(keyName, ids);
                });
                const groupAliases = makeAliasSet([scopeGroupId, scope.group?.id]);
                const deptAliases = makeAliasSet([scopeDeptId, scope.dept?.id, scope.dept?.numericId]);
                const catAliases = makeAliasSet([scopeCatId, scope.cat?.id, scope.cat?.numericId]);
                const groupName = normalizeText(scope.group?.name);
                const deptName = normalizeText(scope.dept?.name);
                const catName = normalizeText(scope.cat?.name);
                const matchScopeRecord = (row: any) => {
                    const rowG = normalizeScopeId(row?.groupId);
                    const rowD = normalizeScopeId(row?.deptId);
                    const rowC = normalizeScopeId(row?.catId);
                    const matchG = rowG
                        ? (groupAliases.has(rowG) || groupAliases.has(normalizeDigits(rowG)))
                        : (normalizeText(row?.groupName) === groupName && matchByUniqueName(groupNameToIds, row?.groupName, groupAliases));
                    if (!matchG) return false;
                    if (scope.type === 'group') return true;
                    const matchD = rowD
                        ? (deptAliases.has(rowD) || deptAliases.has(normalizeDigits(rowD)))
                        : (normalizeText(row?.deptName) === deptName && matchByUniqueName(deptNameToIds, row?.deptName, deptAliases));
                    if (!matchD) return false;
                    if (scope.type === 'department') return true;
                    const matchC = rowC
                        ? (catAliases.has(rowC) || catAliases.has(normalizeDigits(rowC)))
                        : (normalizeText(row?.catName) === catName && matchByUniqueName(catNameToIds, row?.catName, catAliases));
                    return matchC;
                };

                if (draftMetrics) {
                    const directItems = (Array.isArray(draftMetrics?.items) ? draftMetrics.items : []).filter((it: any) => matchScopeRecord(it));
                    const directGrouped = (Array.isArray(draftMetrics?.groupedDifferences) ? draftMetrics.groupedDifferences : []).filter((it: any) => matchScopeRecord(it));
                    const source = directItems.length > 0 ? directItems : (directGrouped.length > 0 ? directGrouped : null);
                    return source ? sumRows(source) : null;
                }

                const targetCatKeys = new Set(
                    getScopeCategories(scopeGroupId, scopeDeptId, scopeCatId)
                        .map(({ group, dept, cat }) => partialScopeKey({ groupId: group.id, deptId: dept.id, catId: cat.id }))
                );
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
                const scopedPools = termDraftEntries
                    .filter(([draftKey, draftValue]) => {
                        if (!draftValue?.excelMetrics || draftValue?.excelMetricsRemovedAt) return false;
                        return draftTouchesScope(String(draftKey || ''));
                    })
                    .map(([, draftValue]) => draftValue.excelMetrics)
                    .filter(Boolean);
                const base = mergeExcelMetricsPools(scopedPools as any[]);
                // Alinhamento exato com o módulo: no fallback sem termo direto,
                // a filtragem é feita somente em groupedDifferences.
                if (!base || !Array.isArray(base.groupedDifferences)) return null;
                const scopeGroupIdNorm = normalizeScopeId(scopeGroupId);
                const scopeDeptIdNorm = normalizeScopeId(scopeDeptId);
                const scopeCatIdNorm = normalizeScopeId(scopeCatId);
                const filtered = (base.groupedDifferences || []).filter((row: any) => {
                    const hasGroupId = !!normalizeScopeId(row?.groupId);
                    const hasDeptId = !!normalizeScopeId(row?.deptId);
                    const hasCatId = !!normalizeScopeId(row?.catId);
                    const matchG = hasGroupId
                        ? normalizeScopeId(row?.groupId) === scopeGroupIdNorm
                        : normalizeText(row?.groupName) === groupName;
                    if (scope.type === 'group') return matchG;
                    const matchD = hasDeptId
                        ? normalizeScopeId(row?.deptId) === scopeDeptIdNorm
                        : normalizeText(row?.deptName) === deptName;
                    if (scope.type === 'department') return matchG && matchD;
                    const matchC = hasCatId
                        ? normalizeScopeId(row?.catId) === scopeCatIdNorm
                        : normalizeText(row?.catName) === catName;
                    return matchG && matchD && matchC;
                });
                return filtered.length > 0 ? sumRows(filtered) : null;
            };

            groups.forEach((group: any) => {
                const groupDirect = getScopedMetricsLocal({ type: 'group', group });
                const deptMetrics = (group?.departments || [])
                    .map((dept: any) => getScopedMetricsLocal({ type: 'department', group, dept }))
                    .filter(Boolean) as Array<{ diffQty: number; diffCost: number }>;

                let groupMetric = groupDirect || { diffQty: 0, diffCost: 0 };
                if (deptMetrics.length > 0) {
                    const byDepartments = sumRows(deptMetrics as any[]);
                    if (!groupDirect) {
                        groupMetric = byDepartments;
                    } else {
                        const hasRelevantMismatch =
                            Math.abs(Number(groupDirect.diffQty || 0) - Number(byDepartments.diffQty || 0)) > 0.01 ||
                            Math.abs(Number(groupDirect.diffCost || 0) - Number(byDepartments.diffCost || 0)) > 0.01;
                        groupMetric = hasRelevantMismatch ? byDepartments : groupDirect;
                    }
                }

                diffQty += Number(groupMetric.diffQty || 0);
                diffCost += Number(groupMetric.diffCost || 0);
            });

            const pendingSkus = Math.max(0, totalSkus - countedSkus);
            const pendingUnits = Math.max(0, totalUnits - countedUnits);
            const pendingCost = Math.max(0, totalCost - countedCost);
            const progressPct = totalUnits > 0
                ? (countedUnits / totalUnits) * 100
                : Number(session.progress || 0);
            const divergencePct = countedCost > 0 ? (diffCost / countedCost) * 100 : 0;

            branches.push({
                branch: branchLabel,
                area: branchToArea.get(branchLabel) || 'Sem Área',
                auditNumber: Number(session.audit_number || 0),
                updatedAt: String(session.updated_at || session.created_at || ''),
                progressPct,
                totalSkus,
                countedSkus,
                pendingSkus,
                totalUnits,
                countedUnits,
                pendingUnits,
                totalCost,
                pendingCost,
                diffQty,
                diffCost,
                countedCost,
                divergencePct,
                termsWithExcel
            });
        });

        const getBranchOrder = (label: string) => {
            const numeric = Number((String(label || '').match(/\d+/)?.[0] || '999999'));
            return Number.isFinite(numeric) ? numeric : 999999;
        };
        branches.sort((a, b) => getBranchOrder(a.branch) - getBranchOrder(b.branch));

        const areaMap = new Map<string, {
            area: string;
            branches: number;
            totalSkus: number;
            countedSkus: number;
            pendingSkus: number;
            totalUnits: number;
            countedUnits: number;
            pendingUnits: number;
            countedCost: number;
            diffQty: number;
            diffCost: number;
        }>();

        branches.forEach(item => {
            const current = areaMap.get(item.area) || {
                area: item.area,
                branches: 0,
                totalSkus: 0,
                countedSkus: 0,
                pendingSkus: 0,
                totalUnits: 0,
                countedUnits: 0,
                pendingUnits: 0,
                countedCost: 0,
                diffQty: 0,
                diffCost: 0
            };
            current.branches += 1;
            current.totalSkus += item.totalSkus;
            current.countedSkus += item.countedSkus;
            current.pendingSkus += item.pendingSkus;
            current.totalUnits += item.totalUnits;
            current.countedUnits += item.countedUnits;
            current.pendingUnits += item.pendingUnits;
            current.countedCost += item.countedCost;
            current.diffQty += item.diffQty;
            current.diffCost += item.diffCost;
            areaMap.set(item.area, current);
        });

        const areas = Array.from(areaMap.values()).sort((a, b) => a.area.localeCompare(b.area, 'pt-BR'));
        const summary = branches.reduce((acc, item) => {
            acc.openAudits += 1;
            acc.totalSkus += item.totalSkus;
            acc.countedSkus += item.countedSkus;
            acc.pendingSkus += item.pendingSkus;
            acc.totalUnits += item.totalUnits;
            acc.countedUnits += item.countedUnits;
            acc.pendingUnits += item.pendingUnits;
            acc.totalCost += item.totalCost;
            acc.pendingCost += item.pendingCost;
            acc.countedCost += item.countedCost;
            acc.diffQty += item.diffQty;
            acc.diffCost += item.diffCost;
            return acc;
        }, {
            openAudits: 0,
            totalSkus: 0,
            countedSkus: 0,
            pendingSkus: 0,
            totalUnits: 0,
            countedUnits: 0,
            pendingUnits: 0,
            totalCost: 0,
            pendingCost: 0,
            countedCost: 0,
            diffQty: 0,
            diffCost: 0
        });

        const accumulatedPct = summary.totalUnits > 0
            ? (summary.countedUnits / summary.totalUnits) * 100
            : 0;
        const uniqueTotalSkus = uniqueSkuSet.size;
        const uniqueCountedSkus = uniqueSkuDoneSet.size;
        const uniquePendingSkus = Math.max(0, uniqueTotalSkus - uniqueCountedSkus);
        const summaryDivergencePct = summary.countedCost > 0
            ? (summary.diffCost / summary.countedCost) * 100
            : 0;

        return { summary, accumulatedPct, summaryDivergencePct, uniqueTotalSkus, uniqueCountedSkus, uniquePendingSkus, areas, branches };
    }, [dashboardCompletedAuditSessions, scopedCompanies, scopedUsers, completedAuditNumberFilter]);


    const handleOpenAuditFromDashboardBranch = useCallback((branchLabel: string) => {
        const raw = String(branchLabel || '').trim();
        if (!raw) return;
        const numeric = raw.match(/\d+/)?.[0] || '';
        const filial = numeric || raw;
        setAuditJumpFilial(filial);
        setCurrentView('audit');
        window.scrollTo(0, 0);
        setIsSidebarOpen(isMobileLayout());
    }, []);

    useEffect(() => {
        if (currentView !== 'audit' && auditJumpFilial) {
            setAuditJumpFilial('');
        }
    }, [currentView, auditJumpFilial]);

    // --- RENDER ---

    // Loading Screen
    if (isLoadingData) {
        return (
            <div className="min-h-screen relative overflow-hidden flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 30%, #2563eb 60%, #0ea5e9 100%)' }}>
                {/* Animated background orbs */}
                <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full opacity-20 animate-pulse"
                    style={{ background: 'radial-gradient(circle, #60a5fa, transparent)', animationDuration: '3s' }}></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full opacity-15 animate-pulse"
                    style={{ background: 'radial-gradient(circle, #818cf8, transparent)', animationDuration: '4s', animationDelay: '1s' }}></div>
                <div className="absolute top-[40%] right-[10%] w-[300px] h-[300px] rounded-full opacity-10 animate-pulse"
                    style={{ background: 'radial-gradient(circle, #38bdf8, transparent)', animationDuration: '5s', animationDelay: '0.5s' }}></div>

                {/* Glassmorphism card */}
                <div className="relative z-10 text-center px-12 py-14 rounded-3xl"
                    style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        boxShadow: '0 25px 50px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
                    }}>
                    {/* Logo */}
                    <div className="w-28 h-28 mx-auto mb-8 relative">
                        <div className="absolute inset-0 rounded-full animate-ping opacity-30"
                            style={{ background: 'rgba(255,255,255,0.3)', animationDuration: '2s' }}></div>
                        <div className="relative w-full h-full rounded-full p-3"
                            style={{ background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)' }}>
                            <MFLogo className="w-full h-full" />
                        </div>
                    </div>

                    {/* Premium spinner */}
                    <div className="relative w-16 h-16 mx-auto mb-8">
                        <div className="absolute inset-0 rounded-full border-4 border-white/20"></div>
                        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-white animate-spin"></div>
                        <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-blue-300 animate-spin"
                            style={{ animationDuration: '0.8s', animationDirection: 'reverse' }}></div>
                    </div>

                    {/* Text */}
                    <h2 className="text-white font-bold text-2xl mb-2 tracking-tight">
                        Carregando dados...
                    </h2>
                    <p className="text-white/70 text-sm font-medium">
                        Conectando ao banco de dados
                    </p>

                    {/* Progress dots */}
                    <div className="flex items-center justify-center gap-2 mt-6">
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} className="w-2 h-2 rounded-full bg-white/60 animate-bounce"
                                style={{ animationDelay: `${i * 0.15}s`, animationDuration: '1s' }}></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!currentUser) {
        return (
            <>
                <LoginScreen onLogin={handleLogin} users={users} onRegister={handleRegister} companies={companies} />
            </>
        );
    }

    // Determine if we are in "Read Only" mode (History View)
    const canControlChecklists = hasModuleAccess('checklistControl');
    const canEditCompanies = hasModuleAccess('companyEditing');
    const canManageUsers = hasModuleAccess('userManagement');
    const canRespondTickets = hasModuleAccess('supportTickets');
    const canApproveUsers = hasModuleAccess('userApproval');
    const isReadOnly = currentView === 'view_history' || !canControlChecklists;

    // Dynamic Header Logic: Use 'filial' input if available, otherwise default config
    const getDynamicPharmacyName = () => {
        if (viewHistoryItem) return viewHistoryItem.pharmacyName;

        // Try to find 'filial' in active draft data (prioritize 'gerencial')
        const targetChecklists = ['gerencial', ...checklists.map(c => c.id)];
        for (const checkId of targetChecklists) {
            const data = formData[checkId];
            if (data?.filial && String(data.filial).trim() !== '') {
                return String(data.filial);
            }
        }
        return config.pharmacyName;
    };

    const displayConfig = { ...config, pharmacyName: getDynamicPharmacyName() };

    // Calculate current checklist specific stats for render
    const currentChecklistStats = getChecklistStats(activeChecklistId);
    const currentMissingItems = currentChecklistStats.missingItems;
    const currentUnansweredItems = currentChecklistStats.unansweredItems;
    const currentSigMissing = !signatures[activeChecklistId]?.['gestor'];

    // Get Basic Info from First Active Checklist
    // We assume all checklists have synced info, so we take from the first one in the list.
    const basicInfoSourceChecklist = checklists[0]?.id || 'gerencial'; // Always defaults to 'gerencial', or first one. 
    // If 'gerencial' is ignored, we still have the data because syncing happens on input.
    // Actually, for display in report, we should just use the first checklist in the definitions, as they are synced.

    const isImmersivePreView = PRE_VENCIDOS_MODULE_ENABLED && currentView === 'pre';

    const ConnectivityIndicator = () => {
        if (isOnline) return null;
        return (
            <div className="fixed bottom-6 right-6 z-[9999] animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-red-600/90 backdrop-blur-md text-white px-5 py-2.5 rounded-2xl shadow-[0_8px_32px_rgba(220,38,38,0.3)] border border-red-400/50 flex items-center gap-3">
                    <div className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Modo Offline</span>
                    <WifiOff size={14} className="opacity-80" />
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
            <ConnectivityIndicator />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50/50 relative">
                <Topbar
                    isSidebarOpen={isSidebarOpen}
                    setIsSidebarOpen={setIsSidebarOpen}
                    currentUser={currentUser}
                    currentTheme={currentTheme}
                    displayConfig={displayConfig}
                    companies={companies}
                    handleViewChange={handleViewChange}
                    currentView={currentView}
                    activeChecklistId={activeChecklistId}
                    setActiveChecklistId={setActiveChecklistId}
                    checklists={checklists}
                    isChecklistComplete={isChecklistComplete}
                    ignoredChecklists={ignoredChecklists}
                    canControlChecklists={canControlChecklists}
                    handleLogout={handleLogout}
                />

                {/* Main Content */}
                {/* Background Mesh Gradient */}
                <div className="absolute inset-0 z-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-gray-200 via-transparent to-transparent"></div>

                {!isImmersivePreView && (
                    <Header
                        isSidebarOpen={isSidebarOpen}
                        setIsSidebarOpen={setIsSidebarOpen}
                        currentTheme={currentTheme}
                        displayConfig={displayConfig}
                        companies={companies}
                        currentView={currentView}
                        activeChecklist={activeChecklist}
                        canControlChecklists={canControlChecklists}
                        handleResetChecklist={handleResetChecklist}
                        currentUser={currentUser}
                        activeChecklistId={activeChecklistId}
                        openChecklistEditor={openChecklistEditor}
                    />
                )}

                {/* Main Body */}
                <main className={`flex-1 overflow-y-auto z-10 scroll-smooth ${isImmersivePreView ? 'p-4' : 'p-4 lg:p-10'}`}>
                    {/* Prominent Pending Users Alert at Top */}
                    {canApproveUsers && pendingUsersCount > 0 && (
                        <div className="mb-8 bg-red-600 rounded-2xl p-6 text-white shadow-2xl shadow-red-200 relative overflow-hidden group transform hover:-translate-y-1 transition-all max-w-2xl mx-auto">
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagonal-stripes.png')] opacity-10"></div>

                            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-white text-red-600 flex items-center justify-center font-black text-xl shadow-inner animate-pulse shrink-0">
                                        {pendingUsersCount}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black uppercase tracking-tight mb-1">Aprovação Pendente</h3>
                                        <p className="text-red-100 font-medium text-sm">Usuários aguardando liberação de acesso.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Inline List of Pending Users */}
                            <div className="relative z-10 mt-6 space-y-3">
                                {pendingUsers.map(u => (
                                    <div key={u.email} className="bg-white/10 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 border border-white/20">
                                        <div className="flex flex-col text-center sm:text-left">
                                            <span className="font-bold text-sm">{u.name}</span>
                                            <span className="text-xs opacity-80">{u.email}</span>
                                        </div>
                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <button
                                                onClick={() => updateUserStatus(u.email, true)}
                                                className="flex-1 sm:flex-none bg-green-500 hover:bg-green-400 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm"
                                            >
                                                Aprovar
                                            </button>
                                            <button
                                                onClick={() => handleRejectUser(u.email)}
                                                className="flex-1 sm:flex-none bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                            >
                                                Recusar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* --- STOCK CONFERENCE VIEW --- */}
                    {currentView === 'stock' && (
                        <div className="h-full animate-fade-in relative pb-24">
                            <StockConference
                                userEmail={currentUser?.email || ''}
                                userName={currentUser?.name || ''}
                                companies={companies}
                                onReportSaved={async () => { await refreshStockConferenceReports(); }}
                            />
                        </div>
                    )}

                    {PRE_VENCIDOS_MODULE_ENABLED && currentView === 'pre' && PreVencidosManager && (
                        <div className="h-full animate-fade-in relative pb-24">
                            <Suspense fallback={<div className="p-6 text-sm font-semibold text-slate-500">Carregando módulo...</div>}>
                                <PreVencidosManager
                                    userEmail={currentUser?.email || ''}
                                    userName={currentUser?.name || ''}
                                    userRole={currentUser?.role || 'USER'}
                                    companies={companies}
                                    onLogout={handleLogout}
                                />
                            </Suspense>
                        </div>
                    )}

                    {currentView === 'audit' && (
                        <div className="h-full animate-fade-in relative pb-24">
                            <AuditModule
                                userEmail={currentUser?.email || ''}
                                userName={currentUser?.name || ''}
                                userRole={currentUser?.role || 'USER'}
                                companies={companies}
                                initialFilial={auditJumpFilial}
                            />
                        </div>
                    )}

                    {/* --- SETTINGS VIEW --- */}
                    {currentView === 'settings' && (
                        <div className="max-w-5xl mx-auto space-y-10 animate-fade-in relative pb-32">

                            {/* Settings Header Block */}
                            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-4">
                                <div>
                                    <h1 className="text-4xl font-black text-gray-900 tracking-tight leading-tight">Configurações</h1>
                                    <p className="text-gray-500 font-bold text-lg mt-1">Gerencie sua conta, empresa e preferências</p>
                                </div>
                                <div className="flex items-center gap-3 bg-white/50 backdrop-blur-md p-2 rounded-2xl border border-white/50 shadow-sm">
                                    <div className={`p-2 rounded-xl ${currentTheme.lightBg} ${currentTheme.text}`}>
                                        <Settings size={20} />
                                    </div>
                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest px-2">Ajustes do Sistema</span>
                                </div>
                            </div>

                            {/* Appearance & Company (Primary Card) */}
                            <div className="bg-white/80 backdrop-blur-2xl rounded-[48px] shadow-card border border-white/60 overflow-hidden">
                                <div className="p-10 md:p-14">
                                    <h2 className="text-2xl font-black text-gray-900 mb-10 flex items-center gap-4">
                                        <div className={`p-4 rounded-[24px] ${currentTheme.lightBg} ${currentTheme.text} shadow-inner-light`}>
                                            <Palette size={32} strokeWidth={2.5} />
                                        </div>
                                        Área da Empresa
                                    </h2>

                                    <div className="space-y-12">
                                        {/* Company View for Standard Users (Read Only) */}
                                        {currentUser.role !== 'MASTER' && currentUser.company_id && (() => {
                                            const userCompany = companies.find(c => c.id === currentUser.company_id);
                                            if (!userCompany) return (
                                                <div className="bg-red-50/50 backdrop-blur-sm border border-red-100 rounded-[32px] p-8 flex items-center gap-5">
                                                    <div className="p-3 bg-red-100 text-red-600 rounded-2xl">
                                                        <AlertTriangle size={32} />
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-black text-red-900 uppercase tracking-tight">Vínculo não encontrado</p>
                                                        <p className="text-sm font-bold text-red-700/70">Os dados da empresa vinculada à sua conta não foram localizados no sistema.</p>
                                                    </div>
                                                </div>
                                            );

                                            return (
                                                <div className="space-y-10 animate-fade-in">
                                                    {/* Read Only Status Badge */}
                                                    <div className="bg-blue-50/50 backdrop-blur-sm border border-blue-100 rounded-[32px] p-6 flex items-center gap-5">
                                                        <div className="p-4 bg-blue-100/50 text-blue-600 rounded-2xl shadow-inner-light">
                                                            <Building2 size={28} strokeWidth={2.5} />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-blue-900 uppercase tracking-widest">Empresa Vinculada</p>
                                                            <p className="text-xs font-bold text-blue-700 opacity-60">Visualização restrita à sua organização atual.</p>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                                        <div className="space-y-3">
                                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Razão Social</label>
                                                            <div className="w-full bg-gray-50/50 border border-gray-100 rounded-[24px] p-5 text-gray-600 font-bold shadow-inner-light flex items-center gap-3">
                                                                <FileText size={18} className="text-gray-300" />
                                                                {userCompany.name}
                                                            </div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">CNPJ / Documento</label>
                                                            <div className="w-full bg-gray-50/50 border border-gray-100 rounded-[24px] p-5 text-gray-600 font-bold shadow-inner-light flex items-center gap-3">
                                                                <ShieldCheck size={18} className="text-gray-300" />
                                                                {userCompany.cnpj || 'Não informado'}
                                                            </div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Contato Corporativo</label>
                                                            <div className="w-full bg-gray-50/50 border border-gray-100 rounded-[24px] p-5 text-gray-600 font-bold shadow-inner-light flex items-center gap-3">
                                                                <Phone size={18} className="text-gray-300" />
                                                                {userCompany.phone || 'Não informado'}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-4">
                                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Identidade Visual</label>
                                                        <div className="h-40 w-full max-w-sm bg-white rounded-[40px] border border-gray-100 shadow-sm flex items-center justify-center overflow-hidden group transition-all duration-500 hover:shadow-lg">
                                                            {userCompany.logo ? (
                                                                <img src={userCompany.logo} alt="Logo da Empresa" className="max-h-24 max-w-[80%] object-contain transition-transform duration-700 group-hover:scale-110" />
                                                            ) : (
                                                                <div className="flex flex-col items-center gap-3 opacity-20 group-hover:opacity-30 transition-opacity">
                                                                    <ImageIcon size={48} className="text-gray-400" />
                                                                    <span className="text-xs font-black uppercase tracking-widest">Sem Logomarca</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="h-px bg-gradient-to-r from-transparent via-gray-100 to-transparent my-10"></div>
                                                </div>
                                            );
                                        })()}

                                        {/* Company Selection Dropdown (MASTER ONLY) */}
                                        {canEditCompanies && (
                                            <div className="space-y-8">
                                                <div className="space-y-4">
                                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Explorar Organizações</label>
                                                    <div className="relative group">
                                                        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-gray-600 transition-colors">
                                                            <Search size={22} />
                                                        </div>
                                                        <select
                                                            value={selectedCompanyId || ''}
                                                            onChange={(e) => {
                                                                const companyId = e.target.value;
                                                                setSelectedCompanyId(companyId);
                                                                if (companyId) {
                                                                    const company = companies.find(c => c.id === companyId);
                                                                    if (company) {
                                                                        setEditCompanyName(company.name);
                                                                        setEditCompanyCnpj(company.cnpj || '');
                                                                        setEditCompanyPhone(company.phone || '');
                                                                        setEditCompanyLogo(company.logo || null);
                                                                        setEditCompanyAreas(company.areas || []);

                                                                        // Bidirectional sync: Update empresa in all checklists
                                                                        setFormData(prev => {
                                                                            const newData = { ...prev };
                                                                            checklists.forEach(cl => {
                                                                                newData[cl.id] = {
                                                                                    ...(newData[cl.id] || {}),
                                                                                    empresa: company.name
                                                                                };
                                                                            });
                                                                            return newData;
                                                                        });
                                                                    }
                                                                }
                                                            }}
                                                            className="w-full bg-white border border-gray-100 rounded-[32px] pl-16 pr-8 py-5 text-lg font-black text-gray-900 focus:ring-4 focus:ring-gray-100 outline-none shadow-sm transition-all appearance-none cursor-pointer"
                                                        >
                                                            <option value="">-- Selecione uma Empresa para Gestão --</option>
                                                            {companies.map(company => (
                                                                <option key={company.id} value={company.id}>{company.name}</option>
                                                            ))}
                                                        </select>
                                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                            <ChevronDown size={24} />
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-gray-400 ml-4 font-bold flex items-center gap-2">
                                                        <Info size={14} className="text-blue-500" />
                                                        Selecione uma empresa para configurar áreas, filiais e identidade visual.
                                                    </p>
                                                </div>

                                                {/* Editable Company Fields (only show if company is selected AND user is MASTER) */}
                                                {selectedCompanyId && (
                                                    <div className="space-y-10 pt-8 border-t border-gray-100 animate-slide-up">
                                                        {/* Basic Company Info */}
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                            <div className="space-y-3">
                                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Nome da Empresa</label>
                                                                <input
                                                                    type="text"
                                                                    value={editCompanyName}
                                                                    onChange={(e) => setEditCompanyName(e.target.value)}
                                                                    placeholder="Nome da Empresa"
                                                                    className="w-full bg-gray-50/50 border border-gray-100 rounded-[24px] p-5 text-gray-900 font-bold focus:ring-4 focus:ring-blue-100 outline-none shadow-inner-light transition-all"
                                                                />
                                                            </div>
                                                            <div className="space-y-3">
                                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">CNPJ / Inscrição</label>
                                                                <input
                                                                    type="text"
                                                                    value={editCompanyCnpj}
                                                                    onChange={(e) => setEditCompanyCnpj(e.target.value)}
                                                                    placeholder="CNPJ (Opcional)"
                                                                    className="w-full bg-gray-50/50 border border-gray-100 rounded-[24px] p-5 text-gray-900 font-bold focus:ring-4 focus:ring-blue-100 outline-none shadow-inner-light transition-all"
                                                                />
                                                            </div>
                                                            <div className="md:col-span-2 space-y-3">
                                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Telefone de Contato</label>
                                                                <input
                                                                    type="text"
                                                                    value={editCompanyPhone}
                                                                    onChange={(e) => setEditCompanyPhone(e.target.value)}
                                                                    placeholder="Telefone (Opcional)"
                                                                    className="w-full bg-gray-50/50 border border-gray-100 rounded-[24px] p-5 text-gray-900 font-bold focus:ring-4 focus:ring-blue-100 outline-none shadow-inner-light transition-all"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Logo Upload */}
                                                        <div className="space-y-4">
                                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Logo Corporativa</label>
                                                            <div className="flex flex-col md:flex-row items-center gap-10 bg-gray-50/50 p-8 rounded-[40px] border border-gray-100 shadow-inner-light">
                                                                <div className="h-32 w-48 bg-white rounded-[32px] shadow-sm border border-gray-100 flex items-center justify-center overflow-hidden relative group">
                                                                    {editCompanyLogo ? (
                                                                        <img src={editCompanyLogo} alt="Preview" className="h-full w-full object-contain p-4 group-hover:scale-110 transition-transform duration-500" />
                                                                    ) : (
                                                                        <ImageIcon className="text-gray-200" size={48} />
                                                                    )}
                                                                </div>
                                                                <div className="flex flex-col gap-4 items-center md:items-start">
                                                                    <label className="cursor-pointer inline-flex items-center gap-3 px-8 py-4 bg-white border border-gray-100 shadow-sm text-sm font-black rounded-2xl text-gray-700 hover:bg-gray-50 hover:shadow-md hover:-translate-y-0.5 transition-all">
                                                                        <Upload size={20} className="text-blue-500" />
                                                                        Alterar Logomarca
                                                                        <input
                                                                            type="file"
                                                                            className="hidden"
                                                                            accept="image/*"
                                                                            onChange={(e) => {
                                                                                const file = e.target.files?.[0];
                                                                                if (file) {
                                                                                    const reader = new FileReader();
                                                                                    reader.onloadend = () => {
                                                                                        setEditCompanyLogo(reader.result as string);
                                                                                    };
                                                                                    reader.readAsDataURL(file);
                                                                                }
                                                                            }}
                                                                        />
                                                                    </label>
                                                                    {editCompanyLogo && (
                                                                        <button
                                                                            onClick={() => setEditCompanyLogo(null)}
                                                                            className="text-xs text-red-500 hover:text-red-700 font-black uppercase tracking-widest px-2"
                                                                        >
                                                                            Remover Imagem
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Areas and Branches Management */}
                                                        <div className="space-y-6">
                                                            <div className="flex justify-between items-center px-2">
                                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Canais e Regionais</label>
                                                                <button
                                                                    onClick={() => {
                                                                        if (editCompanyAreas.length < 5) {
                                                                            setEditCompanyAreas([...editCompanyAreas, { name: '', branches: [] }]);
                                                                        }
                                                                    }}
                                                                    disabled={editCompanyAreas.length >= 5}
                                                                    className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all shadow-sm ${editCompanyAreas.length >= 5
                                                                        ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                                                        : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/20'
                                                                        }`}
                                                                >
                                                                    <UserPlus size={16} /> Adicionar Área
                                                                </button>
                                                            </div>
                                                            <div className="grid grid-cols-1 gap-4">
                                                                {editCompanyAreas.map((area, index) => (
                                                                    <div key={index} className="bg-gray-50/50 p-6 rounded-[32px] border border-gray-100 relative group animate-fade-in shadow-inner-light">
                                                                        <button
                                                                            onClick={() => setEditCompanyAreas(editCompanyAreas.filter((_, i) => i !== index))}
                                                                            className="absolute top-4 right-4 p-2 bg-white/50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-sm"
                                                                        >
                                                                            <X size={18} />
                                                                        </button>
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                            <div className="space-y-2">
                                                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Nome da Região / Canal</label>
                                                                                <input
                                                                                    type="text"
                                                                                    value={area.name}
                                                                                    onChange={(e) => {
                                                                                        const newAreas = [...editCompanyAreas];
                                                                                        newAreas[index].name = e.target.value;
                                                                                        setEditCompanyAreas(newAreas);
                                                                                    }}
                                                                                    placeholder="Ex: Área 01"
                                                                                    className="w-full bg-white border border-gray-100 rounded-2xl p-4 text-sm font-bold text-gray-900 focus:ring-4 focus:ring-blue-50/50 outline-none"
                                                                                />
                                                                            </div>
                                                                            <div className="space-y-2">
                                                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Bandeiras / Filiais (Separadas por ;)</label>
                                                                                <input
                                                                                    type="text"
                                                                                    defaultValue={area.branches.join('; ')}
                                                                                    onBlur={(e) => {
                                                                                        const newAreas = [...editCompanyAreas];
                                                                                        newAreas[index].branches = e.target.value.split(';').map(b => b.trim()).filter(Boolean);
                                                                                        setEditCompanyAreas(newAreas);
                                                                                    }}
                                                                                    placeholder="Filial A; Filial B..."
                                                                                    className="w-full bg-white border border-gray-100 rounded-2xl p-4 text-sm font-bold text-gray-900 focus:ring-4 focus:ring-blue-50/50 outline-none"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Action Buttons */}
                                                        <div className="flex justify-end pt-4">
                                                            <button
                                                                onClick={async () => {
                                                                    if (!selectedCompanyId) return;
                                                                    try {
                                                                        await updateCompany(selectedCompanyId, {
                                                                            name: editCompanyName,
                                                                            cnpj: editCompanyCnpj,
                                                                            phone: editCompanyPhone,
                                                                            logo: editCompanyLogo,
                                                                            areas: editCompanyAreas
                                                                        });
                                                                        setCompanies(companies.map(c =>
                                                                            c.id === selectedCompanyId
                                                                                ? { ...c, name: editCompanyName, cnpj: editCompanyCnpj, phone: editCompanyPhone, logo: editCompanyLogo, areas: editCompanyAreas }
                                                                                : c
                                                                        ));
                                                                        if (config.pharmacyName === companies.find(c => c.id === selectedCompanyId)?.name) {
                                                                            setConfig({ pharmacyName: editCompanyName, logo: editCompanyLogo });
                                                                            await saveConfig({ pharmacy_name: editCompanyName, logo: editCompanyLogo });
                                                                        }
                                                                        alert('Alterações salvas com sucesso!');
                                                                        if (currentUser?.email) {
                                                                            SupabaseService.insertAppEventLog({
                                                                                company_id: currentUser.company_id || null,
                                                                                branch: currentUser.filial || null,
                                                                                area: currentUser.area || null,
                                                                                user_email: currentUser.email,
                                                                                user_name: currentUser.name,
                                                                                app: 'configuracoes',
                                                                                event_type: 'company_updated',
                                                                                entity_type: 'company',
                                                                                entity_id: selectedCompanyId,
                                                                                status: 'success',
                                                                                success: true,
                                                                                source: 'web',
                                                                                event_meta: { name: editCompanyName }
                                                                            }).catch(() => { });
                                                                        }
                                                                    } catch (error) {
                                                                        console.error(error);
                                                                        alert('Erro ao salvar.');
                                                                    }
                                                                }
                                                                }
                                                                className="flex items-center gap-3 bg-gray-900 hover:bg-black text-white font-black uppercase tracking-widest px-10 py-5 rounded-[24px] shadow-xl hover:shadow-gray-200/50 transition-all hover:-translate-y-1 active:translate-y-0"
                                                            >
                                                                <Save size={20} /> Atualizar Registro
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Theme Customization */}
                                        <div className="pt-12 border-t border-gray-100 mt-12">
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                                                <div>
                                                    <h3 className="text-xl font-black text-gray-900">Personalização Visual</h3>
                                                    <p className="text-gray-400 font-bold text-sm">Escolha a cor que melhor define sua experiência</p>
                                                </div>
                                                <div className="flex gap-4 bg-gray-50/50 p-2 rounded-[28px] border border-gray-100 shadow-inner-light">
                                                    {(['red', 'green', 'blue', 'yellow'] as ThemeColor[]).map(color => (
                                                        <button
                                                            key={color}
                                                            onClick={() => handleUpdateUserTheme(color)}
                                                            className={`w-14 h-14 rounded-[20px] shadow-sm border-4 transition-all duration-500 transform hover:scale-110 active:scale-95 ${THEMES[color].bg} ${(currentUser?.preferredTheme || 'blue') === color ? 'border-gray-900 ring-8 ring-gray-100 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'} `}
                                                            title={`Tema ${color}`}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Company Management Section (MASTER only) */}
                            {canEditCompanies && (
                                <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-8">
                                    <h2 className="text-xl font-bold text-gray-800 mb-8 flex items-center gap-3 border-b border-gray-100 pb-4">
                                        <div className={`p-2 rounded-lg ${currentTheme.lightBg}`}>
                                            <Upload size={24} className={currentTheme.text} />
                                        </div>
                                        Gerenciamento de Empresas
                                    </h2>

                                    {/* Company Registration Form */}
                                    <div className="mb-8 bg-gray-50 p-6 rounded-xl border border-gray-200">
                                        <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 flex items-center gap-2">
                                            <UserPlus size={16} /> Cadastrar Nova Empresa
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Nome da Empresa *</label>
                                                <input
                                                    type="text"
                                                    value={newCompanyName}
                                                    onChange={(e) => setNewCompanyName(e.target.value)}
                                                    placeholder="Nome da Empresa"
                                                    className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">CNPJ</label>
                                                <input
                                                    type="text"
                                                    value={newCompanyCnpj}
                                                    onChange={(e) => setNewCompanyCnpj(e.target.value)}
                                                    placeholder="CNPJ (Opcional)"
                                                    className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Telefone</label>
                                                <input
                                                    type="text"
                                                    value={newCompanyPhone}
                                                    onChange={(e) => setNewCompanyPhone(e.target.value)}
                                                    placeholder="Telefone (Opcional)"
                                                    className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                        </div>

                                        {/* Logo Upload for New Company */}
                                        <div className="mb-6">
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Logo da Empresa</label>
                                            <div className="flex items-center gap-4">
                                                <label className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-bold rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-all">
                                                    <Upload size={16} className="mr-2" />
                                                    Carregar Logo
                                                    <input
                                                        type="file"
                                                        className="hidden"
                                                        accept="image/*"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                const reader = new FileReader();
                                                                reader.onloadend = () => {
                                                                    setNewCompanyLogo(reader.result as string);
                                                                };
                                                                reader.readAsDataURL(file);
                                                            }
                                                        }}
                                                    />
                                                </label>
                                                {newCompanyLogo && (
                                                    <div className="h-10 w-10 relative">
                                                        <img src={newCompanyLogo} className="h-full w-full object-contain rounded border" />
                                                        <button onClick={() => setNewCompanyLogo(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"><X size={10} /></button>
                                                    </div>
                                                )}
                                                <span className="text-xs text-gray-400">PNG ou JPG (Recomendado: PNG Transparente)</span>
                                            </div>
                                        </div>

                                        {/* Areas and Branches for New Company */}
                                        <div className="mb-6">
                                            <div className="flex justify-between items-center mb-3">
                                                <label className="block text-xs font-bold text-gray-600 uppercase">Áreas e Filiais</label>
                                                <button
                                                    onClick={() => {
                                                        if (newCompanyAreas.length < 5) {
                                                            setNewCompanyAreas([...newCompanyAreas, { name: '', branches: [] }]);
                                                        }
                                                    }}
                                                    disabled={newCompanyAreas.length >= 5}
                                                    className="text-sm font-bold px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-50"
                                                >
                                                    + Adicionar Área
                                                </button>
                                            </div>
                                            <p className="text-xs text-gray-500 mb-3">Adicione até 5 áreas com suas respectivas filiais</p>
                                            <div className="space-y-3">
                                                {newCompanyAreas.map((area, index) => (
                                                    <div key={index} className="bg-white p-3 rounded border border-gray-200 relative">
                                                        <button
                                                            onClick={() => setNewCompanyAreas(newCompanyAreas.filter((_, i) => i !== index))}
                                                            className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nome da Área</label>
                                                                <input
                                                                    type="text"
                                                                    value={area.name}
                                                                    onChange={(e) => {
                                                                        const copy = [...newCompanyAreas];
                                                                        copy[index].name = e.target.value;
                                                                        setNewCompanyAreas(copy);
                                                                    }}
                                                                    placeholder="Ex: Área 1"
                                                                    className="w-full border border-gray-200 rounded p-2 text-sm outline-none focus:border-blue-500"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Filiais (Separadas por ponto e vírgula)</label>
                                                                <input
                                                                    type="text"
                                                                    value={area.branches.join('; ')}
                                                                    onChange={(e) => {
                                                                        const copy = [...newCompanyAreas];
                                                                        copy[index].branches = e.target.value.split(';').map(b => b.trim());
                                                                        setNewCompanyAreas(copy);
                                                                    }}
                                                                    placeholder="Ex: Filial 1; Filial 2; Matriz..."
                                                                    className="w-full border border-gray-200 rounded p-2 text-sm outline-none focus:border-blue-500"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex justify-end">
                                            <button
                                                onClick={async () => {
                                                    if (!newCompanyName.trim()) {
                                                        alert('Nome da empresa é obrigatório');
                                                        return;
                                                    }
                                                    try {
                                                        const newCompany: any = { // Using 'any' briefly to bypass potential type mismatch during quick dev, strictly typed ideally
                                                            name: newCompanyName,
                                                            cnpj: newCompanyCnpj,
                                                            logo: newCompanyLogo,
                                                            phone: newCompanyPhone,
                                                            areas: newCompanyAreas
                                                        };
                                                        const created = await createCompany(newCompany);
                                                        if (created) {
                                                            setCompanies([...companies, created]);
                                                            setNewCompanyName('');
                                                            setNewCompanyCnpj('');
                                                            setNewCompanyPhone('');
                                                            setNewCompanyLogo(null);
                                                            setNewCompanyAreas([]);
                                                            alert('Empresa cadastrada com sucesso!');
                                                            if (currentUser?.email) {
                                                                SupabaseService.insertAppEventLog({
                                                                    company_id: currentUser.company_id || null,
                                                                    branch: currentUser.filial || null,
                                                                    area: currentUser.area || null,
                                                                    user_email: currentUser.email,
                                                                    user_name: currentUser.name,
                                                                    app: 'configuracoes',
                                                                    event_type: 'company_created',
                                                                    entity_type: 'company',
                                                                    entity_id: created.id,
                                                                    status: 'success',
                                                                    success: true,
                                                                    source: 'web',
                                                                    event_meta: { name: created.name }
                                                                }).catch(() => { });
                                                            }
                                                        } else {
                                                            alert('Erro ao cadastrar empresa.');
                                                        }
                                                    } catch (err) {
                                                        console.error(err);
                                                        alert('Erro ao cadastrar empresa.');
                                                    }
                                                }}
                                                className="bg-green-600 hover:bg-green-700 text-white font-bold text-sm px-6 py-2.5 rounded-lg shadow-sm transition-all"
                                            >
                                                Cadastrar Empresa
                                            </button>
                                        </div>
                                    </div>

                                    {/* List of Existing Companies */}
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 flex items-center gap-2">
                                            <FileText size={16} /> Empresas Cadastradas
                                        </h3>
                                        <div className="space-y-3">
                                            {companies.length === 0 ? (
                                                <p className="text-sm text-gray-500 text-center py-8">Nenhuma empresa cadastrada ainda.</p>
                                            ) : (
                                                companies.map((company: any) => (
                                                    <div key={company.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            {company.logo && (
                                                                <div className="h-12 w-16 bg-white rounded border border-gray-200 flex items-center justify-center p-1">
                                                                    <img src={company.logo} alt={company.name} className="h-full w-full object-contain" />
                                                                </div>
                                                            )}
                                                            <div>
                                                                <h4 className="font-bold text-gray-800">{company.name}</h4>
                                                                {company.cnpj && <p className="text-xs text-gray-500">CNPJ: {company.cnpj}</p>}
                                                                {company.phone && <p className="text-xs text-gray-500">Tel: {company.phone}</p>}
                                                            </div>
                                                        </div>
                                                        <button
                                                            className="text-red-600 hover:text-red-800 font-semibold text-sm"
                                                        >
                                                            Excluir
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Unified Profile & Security Settings */}
                            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-8">
                                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3 border-b border-gray-100 pb-4">
                                    <div className={`p-2 rounded-lg ${currentTheme.lightBg}`}>
                                        <UserIcon size={24} className={currentTheme.text} />
                                    </div>
                                    Meus Dados & Segurança
                                </h2>

                                <div className="flex flex-col md:flex-row gap-8 items-start">
                                    {/* Profile Picture Upload */}
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="relative group w-32 h-32">
                                            <div className={`w-full h-full rounded-full border-4 ${currentTheme.border} shadow-lg overflow-hidden bg-white flex items-center justify-center`}>
                                                {currentUser.photo ? (
                                                    <img src={currentUser.photo} alt="Profile" className="w-full h-full object-cover" />
                                                ) : (
                                                    <UserIcon size={64} className="text-gray-300" />
                                                )}
                                            </div>
                                            <label className="absolute bottom-0 right-0 bg-white p-2 rounded-full shadow-md border border-gray-200 cursor-pointer hover:bg-gray-50 hover:scale-110 transition-transform">
                                                <Camera size={18} className="text-gray-600" />
                                                <input type="file" className="hidden" accept="image/*" onChange={handleUserPhotoUpload} />
                                            </label>
                                        </div>
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Foto de Perfil</span>
                                    </div>

                                    <div className="flex-1 w-full space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Meu Nome</label>
                                                <input
                                                    type="text"
                                                    value={currentUser.name}
                                                    onChange={(e) => handleUpdateUserProfile('name', e.target.value)}
                                                    className={`w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 ${currentTheme.ring} outline-none shadow-inner-light`}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Meu Telefone</label>
                                                <input
                                                    type="text"
                                                    value={currentUser.phone || ''}
                                                    onChange={(e) => handleUpdateUserProfile('phone', e.target.value)}
                                                    onBlur={handleProfilePhoneBlur}
                                                    placeholder="(00) 00000-0000"
                                                    className={`w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 ${currentTheme.ring} outline-none shadow-inner-light ${profilePhoneError ? 'bg-red-50 border-red-500 focus:ring-red-200' : ''}`}
                                                />
                                                {profilePhoneError && <p className="text-red-500 text-xs mt-1 font-bold">{profilePhoneError}</p>}
                                            </div>
                                        </div>

                                        {/* Company, Area, and Filial Fields */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-gray-200">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
                                                    Empresa <span className="text-red-500">*</span>
                                                </label>
                                                <select
                                                    value={currentUser.company_id || ''}
                                                    onChange={(e) => {
                                                        handleUpdateUserProfile('company_id', e.target.value);
                                                        // Reset area and filial when company changes
                                                        handleUpdateUserProfile('area', null);
                                                        handleUpdateUserProfile('filial', null);
                                                    }}
                                                    className={`w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 ${currentTheme.ring} outline-none shadow-inner-light`}
                                                >
                                                    <option value="">-- Selecione a Empresa --</option>
                                                    {companies.map((company: any) => (
                                                        <option key={company.id} value={company.id}>{company.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Filial</label>
                                                <select
                                                    value={currentUser.filial || ''}
                                                    onChange={(e) => {
                                                        const selectedFilial = e.target.value;
                                                        handleUpdateUserProfile('filial', selectedFilial);

                                                        // Auto-populate area based on selected filial
                                                        const selectedCompany = companies.find((c: any) => c.id === currentUser.company_id);
                                                        if (selectedCompany && selectedCompany.areas) {
                                                            const areaForFilial = selectedCompany.areas.find((area: any) =>
                                                                area.branches && area.branches.includes(selectedFilial)
                                                            );
                                                            if (areaForFilial) {
                                                                handleUpdateUserProfile('area', areaForFilial.name);
                                                            }
                                                        }
                                                    }}
                                                    disabled={!currentUser.company_id}
                                                    className={`w-full bg-white border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 ${currentTheme.ring} outline-none shadow-inner-light ${!currentUser.company_id ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                                >
                                                    <option value="">-- Selecione uma Filial --</option>
                                                    {(() => {
                                                        const selectedCompany = companies.find((c: any) => c.id === currentUser.company_id);
                                                        if (selectedCompany && selectedCompany.areas) {
                                                            const allBranches = selectedCompany.areas.flatMap((area: any) => area.branches || []);
                                                            return allBranches.map((branch: string, idx: number) => (
                                                                <option key={idx} value={branch}>{branch}</option>
                                                            ));
                                                        }
                                                        return null;
                                                    })()}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Área</label>
                                                <input
                                                    type="text"
                                                    value={currentUser.area || ''}
                                                    readOnly
                                                    disabled
                                                    placeholder="Preenchida automaticamente"
                                                    className="w-full bg-gray-100 border border-gray-300 rounded-lg p-3 text-gray-700 cursor-not-allowed shadow-inner-light"
                                                />
                                            </div>
                                        </div>

                                        <div className="border-t border-gray-200 pt-6 mt-4">
                                            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                                                <Lock size={16} className="text-gray-400" /> Alterar Senha (Opcional)
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Nova Senha</label>
                                                    <div className="relative">
                                                        <input
                                                            type={showNewPassword ? "text" : "password"}
                                                            value={newPassInput}
                                                            onChange={(e) => setNewPassInput(e.target.value)}
                                                            placeholder="Preencher apenas para alterar"
                                                            autoComplete="new-password"
                                                            className={`w-full rounded-lg p-3 pr-12 outline-none shadow-inner-light transition-all ${newPassInput && confirmPassInput && newPassInput !== confirmPassInput
                                                                ? 'bg-red-50 border border-red-500 text-red-900 focus:ring-2 focus:ring-red-200'
                                                                : newPassInput && confirmPassInput && newPassInput === confirmPassInput
                                                                    ? 'bg-green-50 border border-green-500 text-gray-900 focus:ring-2 focus:ring-green-200'
                                                                    : `bg-white border border-gray-300 text-gray-900 focus:ring-2 ${currentTheme.ring}`
                                                                }`}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                                        >
                                                            {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                                        </button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Confirmar Nova Senha</label>
                                                    <div className="relative">
                                                        <input
                                                            type={showConfirmNewPassword ? "text" : "password"}
                                                            value={confirmPassInput}
                                                            onChange={(e) => setConfirmPassInput(e.target.value)}
                                                            placeholder="Confirme a nova senha"
                                                            autoComplete="new-password"
                                                            className={`w-full rounded-lg p-3 pr-12 outline-none shadow-inner-light transition-all ${newPassInput && confirmPassInput && newPassInput !== confirmPassInput
                                                                ? 'bg-red-50 border border-red-500 text-red-900 focus:ring-2 focus:ring-red-200'
                                                                : newPassInput && confirmPassInput && newPassInput === confirmPassInput
                                                                    ? 'bg-green-50 border border-green-500 text-gray-900 focus:ring-2 focus:ring-green-200'
                                                                    : `bg-white border border-gray-300 text-gray-900 focus:ring-2 ${currentTheme.ring}`
                                                                }`}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                                        >
                                                            {showConfirmNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex justify-end pt-2">
                                            <button
                                                onClick={handleSaveProfileAndSecurity}
                                                className={`${saveShake ? 'animate-shake bg-red-600' : 'bg-gray-800 hover:bg-gray-900'} text-white font-bold text-sm px-6 py-3 rounded-lg shadow-sm hover:shadow-md transition-all flex items-center gap-2`}
                                            >
                                                <Save size={16} />
                                                Salvar Alterações
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Master User Management */}
                            {/* Modernized Master User Management */}
                            {canManageUsers && (
                                <div id="user-management" className="bg-white/80 backdrop-blur-2xl rounded-[32px] shadow-card border border-white/60 p-8 mt-10">
                                    <h2 className="text-2xl font-black text-gray-900 mb-8 flex items-center gap-3">
                                        <div className={`p-2.5 rounded-xl ${currentTheme.lightBg} ${currentTheme.text}`}>
                                            <Users size={24} />
                                        </div>
                                        Gerenciamento de Equipe
                                    </h2>

                                    {/* Modernized Internal User Creation Form */}
                                    <div className="mb-8 bg-white/50 backdrop-blur-sm p-8 rounded-[24px] border border-white/60 shadow-sm relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

                                        <h3 className="text-sm font-black text-gray-600 uppercase tracking-widest mb-6 flex items-center gap-2">
                                            <UserPlus size={16} className="text-gray-400" /> Adicionar Novo Membro
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                                            <input
                                                type="text"
                                                placeholder="Nome Completo"
                                                value={newUserName}
                                                onChange={(e) => setNewUserName(e.target.value)}
                                                className="w-full bg-white/70 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 font-medium"
                                            />
                                            <input
                                                type="email"
                                                placeholder="Email Corporativo"
                                                value={newUserEmail}
                                                onChange={(e) => setNewUserEmail(e.target.value)}
                                                className="w-full bg-white/70 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 font-medium"
                                            />
                                            <div className="w-full relative">
                                                <input
                                                    type="text"
                                                    placeholder="Telefone / WhatsApp"
                                                    value={newUserPhone}
                                                    onChange={handleInternalPhoneChange}
                                                    onBlur={handleInternalPhoneBlur}
                                                    className={`w-full bg-white/70 border rounded-xl p-3 text-sm text-gray-900 outline-none transition-all font-medium ${internalPhoneError ? 'border-red-300 bg-red-50/50 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-500'}`}
                                                />
                                                {internalPhoneError && <p className="text-red-500 text-[10px] absolute -bottom-5 left-1 font-bold flex items-center gap-1"><AlertCircle size={10} /> {internalPhoneError}</p>}
                                            </div>

                                            {/* Company Selection */}
                                            <div className="relative">
                                                <select
                                                    value={newUserCompanyId}
                                                    onChange={(e) => {
                                                        setNewUserCompanyId(e.target.value);
                                                        setNewUserArea('');
                                                        setNewUserFilial('');
                                                    }}
                                                    className={`w-full bg-white/70 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none appearance-none font-medium transition-all ${!newUserCompanyId ? 'text-gray-400' : ''}`}
                                                >
                                                    <option value="" className="text-gray-400">Selecione a Empresa</option>
                                                    {companies.map((company: any) => (
                                                        <option key={company.id} value={company.id} className="text-gray-900">{company.name}</option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                    <ChevronDown size={14} strokeWidth={3} />
                                                </div>
                                            </div>

                                            {/* Filial Selection */}
                                            <div className="relative">
                                                <select
                                                    value={newUserFilial}
                                                    onChange={(e) => {
                                                        const selectedFilial = e.target.value;
                                                        setNewUserFilial(selectedFilial);
                                                        const selectedCompany = companies.find((c: any) => c.id === newUserCompanyId);
                                                        if (selectedCompany && selectedCompany.areas) {
                                                            const areaForFilial = selectedCompany.areas.find((area: any) =>
                                                                area.branches && area.branches.includes(selectedFilial)
                                                            );
                                                            if (areaForFilial) {
                                                                setNewUserArea(areaForFilial.name);
                                                            }
                                                        }
                                                    }}
                                                    disabled={!newUserCompanyId}
                                                    className={`w-full bg-white/70 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none appearance-none font-medium transition-all ${!newUserCompanyId ? 'bg-gray-50 cursor-not-allowed opacity-60' : ''}`}
                                                >
                                                    <option value="">Selecione a Filial</option>
                                                    {(() => {
                                                        const selectedCompany = companies.find((c: any) => c.id === newUserCompanyId);
                                                        if (selectedCompany && selectedCompany.areas) {
                                                            const allBranches = selectedCompany.areas.flatMap((area: any) => area.branches || []);
                                                            return allBranches.map((branch: string, idx: number) => (
                                                                <option key={idx} value={branch}>{branch}</option>
                                                            ));
                                                        }
                                                        return null;
                                                    })()}
                                                </select>
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                    <ChevronDown size={14} strokeWidth={3} />
                                                </div>
                                            </div>

                                            {/* Area (Read-only) */}
                                            <input
                                                type="text"
                                                placeholder="Área Automática"
                                                value={newUserArea}
                                                readOnly
                                                disabled
                                                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl p-3 text-sm text-gray-500 cursor-not-allowed font-medium italic"
                                            />

                                            <div className="relative group/pass">
                                                <input
                                                    type={showNewUserPass ? "text" : "password"}
                                                    placeholder="Senha Provisória"
                                                    value={newUserPass}
                                                    onChange={(e) => setNewUserPass(e.target.value)}
                                                    autoComplete="new-password"
                                                    className="w-full bg-white/70 border border-gray-200 rounded-xl p-3 pr-10 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowNewUserPass(!showNewUserPass)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors opacity-0 group-hover/pass:opacity-100"
                                                >
                                                    {showNewUserPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </button>
                                            </div>

                                            <div className="relative group/confirm">
                                                <input
                                                    type={showNewUserConfirmPass ? "text" : "password"}
                                                    placeholder="Confirmar Senha"
                                                    value={newUserConfirmPass}
                                                    onChange={(e) => setNewUserConfirmPass(e.target.value)}
                                                    autoComplete="new-password"
                                                    className={`w-full bg-white/70 border border-gray-200 rounded-xl p-3 pr-10 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium ${newUserPass && newUserConfirmPass && newUserPass !== newUserConfirmPass ? 'border-red-300 bg-red-50/10' : ''}`}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowNewUserConfirmPass(!showNewUserConfirmPass)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors opacity-0 group-hover/confirm:opacity-100"
                                                >
                                                    {showNewUserConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </button>
                                            </div>

                                            <div className="relative lg:col-span-4">
                                                <select
                                                    value={newUserRole}
                                                    onChange={(e) => setNewUserRole(e.target.value as 'MASTER' | 'ADMINISTRATIVO' | 'USER')}
                                                    className="w-full bg-white/70 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none appearance-none font-bold transition-all"
                                                >
                                                    <option value="USER">Usuário Comum (Acesso Padrão)</option>
                                                    <option value="ADMINISTRATIVO">Administrativo</option>
                                                    <option value="MASTER">Administrador Master (Acesso Total)</option>
                                                </select>
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                    <ChevronDown size={14} strokeWidth={3} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-6 flex justify-end">
                                            <button
                                                onClick={handleCreateUserInternal}
                                                className={`${internalShake ? 'animate-shake bg-red-600' : 'bg-gray-900 hover:bg-black hover:-translate-y-0.5 hover:shadow-lg'} text-white font-bold text-sm px-8 py-3 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2`}
                                            >
                                                <Plus size={16} strokeWidth={3} />
                                                Criar Usuário
                                            </button>
                                        </div>
                                    </div>

                                    {/* Modernized Filter Toolbar */}
                                    <div className="flex flex-col sm:flex-row gap-4 mb-6 items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-2 rounded-lg ${currentTheme.lightBg} text-gray-500`}>
                                                <Filter size={16} />
                                            </div>
                                            <span className="text-xs font-black uppercase tracking-widest text-gray-400">Filtros</span>
                                        </div>

                                        <div className="flex gap-3 w-full sm:w-auto">
                                            <div className="relative flex-1 sm:flex-none">
                                                <select
                                                    value={userFilterRole}
                                                    onChange={(e) => setUserFilterRole(e.target.value as any)}
                                                    className="w-full sm:w-48 appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:border-blue-500 hover:border-gray-300 transition-colors"
                                                >
                                                    <option value="ALL">Todas Funções</option>
                                                    <option value="MASTER">Master</option>
                                                    <option value="ADMINISTRATIVO">Administrativo</option>
                                                    <option value="USER">Comum</option>
                                                </select>
                                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                            </div>

                                            <div className="relative flex-1 sm:flex-none">
                                                <select
                                                    value={userFilterStatus}
                                                    onChange={(e) => setUserFilterStatus(e.target.value as any)}
                                                    className="w-full sm:w-48 appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:border-blue-500 hover:border-gray-300 transition-colors"
                                                >
                                                    <option value="ALL">Todos Status</option>
                                                    <option value="ACTIVE">Ativo</option>
                                                    <option value="PENDING">Pendente</option>
                                                    <option value="BANNED">Inativo</option>
                                                </select>
                                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto overflow-y-hidden rounded-[24px] border border-gray-100 shadow-sm bg-white">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-gray-50/80 border-b border-gray-100">
                                                <tr>
                                                    <th className="px-4 py-4 font-black text-gray-400 uppercase tracking-wider text-[10px] min-w-[120px]">Nome</th>
                                                    <th className="px-4 py-4 font-black text-gray-400 uppercase tracking-wider text-[10px] min-w-[150px]">Contato</th>
                                                    <th className="px-4 py-4 font-black text-gray-400 uppercase tracking-wider text-[10px] whitespace-nowrap min-w-[90px]">Filial</th>
                                                    <th className="px-4 py-4 font-black text-gray-400 uppercase tracking-wider text-[10px] whitespace-nowrap min-w-[90px]">Área</th>
                                                    <th className="px-4 py-4 font-black text-gray-400 uppercase tracking-wider text-[10px] whitespace-nowrap min-w-[110px]">Função</th>
                                                    <th className="px-4 py-4 font-black text-gray-400 uppercase tracking-wider text-[10px] whitespace-nowrap min-w-[100px]">Status</th>
                                                    <th className="px-4 py-4 font-black text-gray-400 uppercase tracking-wider text-[10px] whitespace-nowrap text-right min-w-[110px]">Ações</th>
                                                    {currentUser?.role === 'MASTER' && (
                                                        <th className="px-4 py-4 font-black text-gray-400 uppercase tracking-wider text-[10px] whitespace-nowrap text-center min-w-[60px]">Excluir</th>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {filteredUsers.map((u, idx) => (
                                                    <tr key={idx} className="group hover:bg-blue-50/30 transition-colors duration-200">
                                                        <td className="px-4 py-4">
                                                            <div className="font-bold text-gray-900 break-words">{u.name}</div>
                                                        </td>
                                                        <td className="px-4 py-4 min-w-[200px]">
                                                            <div className="flex flex-col">
                                                                <span className="text-gray-600 font-medium break-all text-xs" title={u.email}>{u.email}</span>
                                                                <span className="text-gray-400 text-xs mt-0.5 break-all text-xs" title={u.phone || '-'}>{u.phone || '-'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border bg-blue-50/60 text-blue-700 border-blue-100 whitespace-nowrap">
                                                                {u.filial || '-'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-4 whitespace-nowrap">
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border bg-indigo-50/60 text-indigo-700 border-indigo-100 whitespace-nowrap">
                                                                {u.area || '-'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-4 whitespace-nowrap">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${u.role === 'MASTER' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                                    u.role === 'ADMINISTRATIVO' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                                        'bg-gray-100 text-gray-600 border-gray-200'
                                                                    } whitespace-nowrap`}>
                                                                    {u.role === 'MASTER' ? 'Master' : u.role === 'ADMINISTRATIVO' ? 'Admin' : 'Usuário'}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4 whitespace-nowrap">
                                                            {u.rejected ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100/50 text-red-700 border border-red-100 whitespace-nowrap">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> Bloqueado
                                                                </span>
                                                            ) : u.approved ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100/50 text-green-700 border border-green-100 whitespace-nowrap">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Ativo
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100/50 text-yellow-700 border border-yellow-100 animate-pulse whitespace-nowrap">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div> Pendente
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-4 text-right">
                                                            {u.role !== 'MASTER' && (
                                                                <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                                                    {u.rejected ? (
                                                                        <button
                                                                            onClick={() => updateUserStatus(u.email, true)}
                                                                            className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100"
                                                                            title="Restaurar Acesso"
                                                                        >
                                                                            <Undo2 size={16} strokeWidth={2.5} />
                                                                        </button>
                                                                    ) : !u.approved ? (
                                                                        <>
                                                                            <button
                                                                                onClick={() => updateUserStatus(u.email, true)}
                                                                                className="p-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors border border-green-100"
                                                                                title="Aprovar"
                                                                            >
                                                                                <Check size={16} strokeWidth={2.5} />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleRejectUser(u.email)}
                                                                                className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors border border-red-100"
                                                                                title="Rejeitar"
                                                                            >
                                                                                <Ban size={16} strokeWidth={2.5} />
                                                                            </button>
                                                                        </>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => handleRejectUser(u.email)}
                                                                            className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-lg transition-colors"
                                                                            title="Bloquear Acesso"
                                                                        >
                                                                            <Ban size={16} strokeWidth={2} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                        {currentUser?.role === 'MASTER' && (
                                                            <td className="px-4 py-4 text-center">
                                                                {u.role !== 'MASTER' && (
                                                                    <button
                                                                        onClick={() => handleDeleteUser(u.email)}
                                                                        className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-all duration-300 border border-red-100 shadow-sm hover:shadow-red-200/50 active:scale-90 inline-flex items-center justify-center"
                                                                        title="Excluir Usuário"
                                                                    >
                                                                        <Trash2 size={16} strokeWidth={2.5} />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                                {filteredUsers.length === 0 && (
                                                    <tr>
                                                        <td colSpan={7} className="px-6 py-12 text-center">
                                                            <div className="flex flex-col items-center justify-center text-gray-400 gap-3">
                                                                <SearchX size={32} strokeWidth={1.5} className="text-gray-300" />
                                                                <p className="font-medium">Nenhum usuário encontrado</p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}



                        </div>
                    )}

                    {/* --- LOGS & EVENTOS VIEW --- */}
                    {currentView === 'logs' && currentUser?.role === 'MASTER' && (
                        <div className="max-w-6xl mx-auto space-y-10 animate-fade-in pb-24">
                            {isMetricsInitialHydrating ? (
                                <div className="min-h-[320px] bg-white rounded-3xl border border-slate-200 shadow-sm flex items-center justify-center">
                                    <div className="px-8 py-6 flex flex-col items-center gap-3">
                                        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                                        <p className="text-sm font-black text-slate-700 uppercase tracking-wider">Sincronizando Métricas</p>
                                        <p className="text-xs text-slate-500 font-semibold">Carregando eventos e sessões ativas em tempo real...</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                <div>
                                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Métricas Gerenciais</h1>
                                    <p className="text-gray-500 font-bold text-sm mt-1">Acompanhe o uso do sistema por filial, usuário e app (últimos 30 dias).</p>
                                </div>
                                <button
                                    onClick={() => {
                                        if (!currentUser?.company_id) return;
                                        setIsLoadingLogs(true);
                                        SupabaseService.fetchAppEventLogs({
                                            companyId: currentUser.company_id,
                                            branch: currentUser.role === 'MASTER' ? null : (currentUser.filial || null),
                                            sinceISO: logsDateRange === '7d'
                                                ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
                                                : logsDateRange === '30d'
                                                    ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
                                                    : null,
                                            limit: 200
                                        }).then(logs => setAppEventLogs(logs || []))
                                            .finally(() => setIsLoadingLogs(false));
                                    }}
                                    className="px-5 py-2 rounded-2xl border border-gray-200 bg-white text-gray-600 text-[10px] font-black uppercase tracking-widest hover:bg-gray-50"
                                >
                                    {isLoadingLogs ? 'Atualizando...' : 'Atualizar Logs'}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                {/* Card: Total Eventos — limpa todos os filtros */}
                                <button
                                    type="button"
                                    onClick={() => { setLogsBranchFilter('all'); setLogsAreaFilter('all'); setLogsAppFilter('all'); setLogsUserFilter('all'); setLogsEventFilter('all'); }}
                                    className={`p-4 rounded-2xl border-2 text-left transition-all hover:shadow-md active:scale-95 ${logsBranchFilter === 'all' && logsUserFilter === 'all' && logsAppFilter === 'all' && logsEventFilter === 'all'
                                        ? 'border-slate-300 bg-slate-50'
                                        : 'border-gray-100 bg-white hover:border-slate-200'
                                        }`}
                                    title="Clique para limpar todos os filtros"
                                >
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Eventos (filtro)</p>
                                    <p className="text-2xl font-black text-slate-900 mt-1">{filteredEventLogs.length}</p>
                                    <p className="text-[9px] text-gray-400 mt-0.5">de {appEventLogs.length} total</p>
                                </button>

                                {/* Card: Filiais Ativas — clique filtra pela mais ativa */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (logsBranchFilter !== 'all') { setLogsBranchFilter('all'); }
                                        else if (logsBranches.length > 0) { setLogsBranchFilter(logsBranches[0].branch); }
                                    }}
                                    className={`p-4 rounded-2xl border-2 text-left transition-all hover:shadow-md active:scale-95 ${logsBranchFilter !== 'all' ? 'border-blue-300 bg-blue-50' : 'border-gray-100 bg-white hover:border-blue-200'
                                        }`}
                                    title={logsBranchFilter !== 'all' ? `Filial: ${logsBranchFilter} — clique para limpar` : 'Clique para filtrar pela filial mais ativa'}
                                >
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Filiais Ativas</p>
                                    <p className="text-2xl font-black text-blue-600 mt-1">{logsBranches.length}</p>
                                    <p className="text-[9px] text-blue-400 mt-0.5 truncate">{logsBranchFilter !== 'all' ? `▸ ${logsBranchFilter}` : 'clique p/ filtrar'}</p>
                                </button>

                                {/* Card: Usuários Ativos — clique filtra pelo mais ativo */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (logsUserFilter !== 'all') { setLogsUserFilter('all'); }
                                        else if (logsUsers.length > 0) { setLogsUserFilter(logsUsers[0].user); }
                                    }}
                                    className={`p-4 rounded-2xl border-2 text-left transition-all hover:shadow-md active:scale-95 ${logsUserFilter !== 'all' ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100 bg-white hover:border-emerald-200'
                                        }`}
                                    title={logsUserFilter !== 'all' ? `Usuário: ${logsUserFilter} — clique para limpar` : 'Clique para filtrar pelo usuário mais ativo'}
                                >
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Usuários Ativos</p>
                                    <p className="text-2xl font-black text-emerald-600 mt-1">{logsUsers.length}</p>
                                    <p className="text-[9px] text-emerald-400 mt-0.5 truncate">{logsUserFilter !== 'all' ? `▸ ${logsUserFilter.split('@')[0]}` : 'clique p/ filtrar'}</p>
                                </button>

                                {/* Card: Apps usados */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (logsAppFilter !== 'all') { setLogsAppFilter('all'); }
                                        else if (logsApps.length > 0) { setLogsAppFilter(logsApps[0][0]); }
                                    }}
                                    className={`p-4 rounded-2xl border-2 text-left transition-all hover:shadow-md active:scale-95 ${logsAppFilter !== 'all' ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-white hover:border-indigo-200'
                                        }`}
                                    title={logsAppFilter !== 'all' ? `App: ${logsAppFilter} — clique para limpar` : 'Clique para filtrar pelo app mais usado'}
                                >
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Apps Usados</p>
                                    <p className="text-2xl font-black text-indigo-600 mt-1">{logsApps.length}</p>
                                    <p className="text-[9px] text-indigo-400 mt-0.5 truncate">{logsAppFilter !== 'all' ? `▸ ${logsAppFilter}` : 'clique p/ filtrar'}</p>
                                </button>

                                {/* Card: Taxa de Erros */}
                                <div className="p-4 rounded-2xl border-2 border-gray-100 bg-white">
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Taxa de Erros</p>
                                    <p className="text-2xl font-black text-red-500 mt-1">
                                        {filteredEventLogs.length > 0
                                            ? `${((filteredEventLogs.filter(l => l.success === false).length / filteredEventLogs.length) * 100).toFixed(1)}%`
                                            : '—'}
                                    </p>
                                    <p className="text-[9px] text-gray-400 mt-0.5">{filteredEventLogs.filter(l => l.success === false).length} erro(s)</p>
                                </div>

                                {/* Card: Última Atividade */}
                                <div className="p-4 rounded-2xl border-2 border-gray-100 bg-white">
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Última Atividade</p>
                                    <p className="text-sm font-black text-slate-700 mt-1 leading-tight">{logLastEventLabel}</p>
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm space-y-4">
                                <div className="flex flex-wrap gap-3">
                                    <div className="flex flex-col">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Filial</label>
                                        <select
                                            value={logsBranchFilter}
                                            onChange={e => setLogsBranchFilter(e.target.value)}
                                            className="text-xs font-bold rounded-xl border border-gray-200 px-3 py-2 bg-white"
                                        >
                                            <option value="all">Todas</option>
                                            {logBranchGroupedOptions.length > 0
                                                ? logBranchGroupedOptions.map(group => (
                                                    <optgroup key={group.area} label={group.area}>
                                                        {group.branches.map(b => (
                                                            <option key={b} value={b}>{b}</option>
                                                        ))}
                                                    </optgroup>
                                                ))
                                                : logBranchOptions.map(b => (
                                                    <option key={b} value={b}>{b}</option>
                                                ))
                                            }
                                        </select>
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Área</label>
                                        <select value={logsAreaFilter} onChange={e => setLogsAreaFilter(e.target.value)} className="text-xs font-bold rounded-xl border border-gray-200 px-3 py-2 bg-white">
                                            <option value="all">Todas</option>
                                            {logAreaOptions.map(a => <option key={a} value={a}>{a}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">App</label>
                                        <select value={logsAppFilter} onChange={e => setLogsAppFilter(e.target.value)} className="text-xs font-bold rounded-xl border border-gray-200 px-3 py-2 bg-white">
                                            <option value="all">Todos</option>
                                            {logAppOptions.map(a => <option key={a} value={a}>{a}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Usuário</label>
                                        <select value={logsUserFilter} onChange={e => setLogsUserFilter(e.target.value)} className="text-xs font-bold rounded-xl border border-gray-200 px-3 py-2 bg-white">
                                            <option value="all">Todos</option>
                                            {logUserOptions.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Evento</label>
                                        <select value={logsEventFilter} onChange={e => setLogsEventFilter(e.target.value)} className="text-xs font-bold rounded-xl border border-gray-200 px-3 py-2 bg-white">
                                            <option value="all">Todos</option>
                                            {logEventOptions.map(e => <option key={e} value={e}>{formatEventTypeLabel(e)}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex flex-col justify-end">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Agrupar</label>
                                        <button
                                            type="button"
                                            onClick={() => setLogsGroupRepeats(prev => !prev)}
                                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${logsGroupRepeats ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-500'}`}
                                        >
                                            {logsGroupRepeats ? 'Ativo' : 'Desativado'}
                                        </button>
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Período</label>
                                        <select value={logsDateRange} onChange={e => setLogsDateRange(e.target.value as any)} className="text-xs font-bold rounded-xl border border-gray-200 px-3 py-2 bg-white">
                                            <option value="7d">Últimos 7 dias</option>
                                            <option value="30d">Últimos 30 dias</option>
                                            <option value="all">Todos</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm flex flex-col">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Atividade por Filial</h3>
                                        <span className="text-[10px] font-bold text-gray-400">{logsBranches.length} filial(is)</span>
                                    </div>
                                    {/* Agrupa filiais por área quando disponível */}
                                    <div className="space-y-1 overflow-y-auto" style={{ maxHeight: 320 }}>
                                        {(() => {
                                            // Constrói mapa área → lista de branches com dados
                                            const areaMap = new Map<string, string[]>(); // area → branch labels
                                            scopedCompanies.forEach(c => {
                                                (c.areas || []).forEach((a: any) => {
                                                    (a.branches || []).forEach((b: string) => {
                                                        const label = normalizeBranchLabel(b);
                                                        const key = a.name || 'Sem Área';
                                                        const list = areaMap.get(key) || [];
                                                        if (!list.includes(label)) list.push(label);
                                                        areaMap.set(key, list);
                                                    });
                                                });
                                            });

                                            // Identifica filiais sem área mapeada
                                            const mappedBranches = new Set(Array.from(areaMap.values()).flat().map(b => b.toUpperCase()));

                                            // Renderiza por área; filiais sem área vão no grupo Sem Área
                                            const groups: { area: string; branches: { branch: string; count: number; lastAt: number; users: Set<string> }[] }[] = [];
                                            const usedKeys = new Set<string>();

                                            areaMap.forEach((branchLabels, area) => {
                                                const matched = logsBranches.filter(b => branchLabels.map(bl => bl.toUpperCase()).includes(b.branch.toUpperCase()));
                                                matched.forEach(b => usedKeys.add(b.branch.toUpperCase()));
                                                if (matched.length > 0) groups.push({ area, branches: matched });
                                            });

                                            // filiais que não foram mapeadas para nenhuma área
                                            const unmapped = logsBranches.filter(b => !usedKeys.has(b.branch.toUpperCase()));
                                            if (unmapped.length > 0) groups.push({ area: 'Sem Área', branches: unmapped });

                                            // Fallback: se não há dados de empresa, mostra tudo plano
                                            if (groups.length === 0) {
                                                return logsBranches.map(branch => {
                                                    const branchFilterValue = branch.branch;
                                                    const isActive = normalizeBranchLabel(logsBranchFilter).toUpperCase() === branchFilterValue.toUpperCase();
                                                    return (
                                                        <button key={branch.branch} type="button"
                                                            onClick={() => setLogsBranchFilter(isActive ? 'all' : branchFilterValue)}
                                                            className={`w-full flex items-center justify-between rounded-2xl border px-4 py-2 gap-3 text-left transition-all ${isActive ? 'border-blue-200 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}
                                                        >
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-black text-gray-800 truncate">{branch.branch}</p>
                                                                <p className="text-[10px] text-gray-400 font-bold">{branch.users.size} usuário(s)</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-sm font-black text-blue-600">{branch.count}</p>
                                                                <p className="text-[9px] text-gray-400">{branch.lastAt ? new Date(branch.lastAt).toLocaleString('pt-BR', { hour12: false }) : '-'}</p>
                                                            </div>
                                                        </button>
                                                    );
                                                });
                                            }

                                            return groups.map(({ area, branches }) => (
                                                <div key={area}>
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-300 px-1 pt-2 pb-1">{area}</p>
                                                    {branches.map(branch => {
                                                        const branchFilterValue = branch.branch;
                                                        const isActive = normalizeBranchLabel(logsBranchFilter).toUpperCase() === branchFilterValue.toUpperCase();
                                                        return (
                                                            <button key={branch.branch} type="button"
                                                                onClick={() => setLogsBranchFilter(isActive ? 'all' : branchFilterValue)}
                                                                className={`w-full flex items-center justify-between rounded-2xl border px-4 py-2 gap-3 text-left transition-all mb-1 ${isActive ? 'border-blue-200 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}
                                                            >
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-black text-gray-800 truncate">{branch.branch}</p>
                                                                    <p className="text-[10px] text-gray-400 font-bold">{branch.users.size} usuário(s)</p>
                                                                </div>
                                                                <div className="text-right min-w-[80px]">
                                                                    <p className="text-sm font-black text-blue-600">{branch.count}</p>
                                                                    <p className="text-[9px] text-gray-400">{branch.lastAt ? new Date(branch.lastAt).toLocaleString('pt-BR', { hour12: false }) : '-'}</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            ));
                                        })()}
                                        {logsBranches.length === 0 && (
                                            <div className="text-sm text-gray-400 font-semibold">Sem eventos ainda.</div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm flex flex-col">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Usuários mais ativos</h3>
                                        <span className="text-[10px] font-bold text-gray-400">{logsUsers.length} usuário(s)</span>
                                    </div>
                                    <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 320 }}>
                                        {logsUsers.map(user => {
                                            const userFilterValue = user.user === 'Sem usuário' ? '-' : user.user;
                                            const isActive = logsUserFilter === userFilterValue;
                                            return (
                                                <button
                                                    key={user.user}
                                                    type="button"
                                                    onClick={() => setLogsUserFilter(isActive ? 'all' : userFilterValue)}
                                                    className={`w-full flex items-center justify-between rounded-2xl border px-4 py-3 gap-3 text-left transition-all ${isActive ? 'border-emerald-200 bg-emerald-50' : 'border-gray-100 hover:bg-gray-50'}`}
                                                    title="Clique para filtrar por usuário"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-black text-gray-800 truncate">{user.user}</p>
                                                        <p className="text-[10px] text-gray-400 font-bold truncate">{user.branch || '-'}</p>
                                                    </div>
                                                    <div className="text-right min-w-[96px]">
                                                        <p className="text-sm font-black text-emerald-600 whitespace-nowrap">{user.count}</p>
                                                        <p className="text-[9px] text-gray-400 font-bold whitespace-nowrap">{user.lastAt ? new Date(user.lastAt).toLocaleString('pt-BR', { hour12: false }) : '-'}</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                        {logsUsers.length === 0 && (
                                            <div className="text-sm text-gray-400 font-semibold">Sem eventos ainda.</div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm flex flex-col">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Apps mais usados</h3>
                                        <span className="text-[10px] font-bold text-gray-400">{logsApps.length} app(s)</span>
                                    </div>
                                    <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 320 }}>
                                        {logsApps.map(app => {
                                            const isActive = logsAppFilter === app[0];
                                            return (
                                                <button
                                                    key={app[0]}
                                                    type="button"
                                                    onClick={() => setLogsAppFilter(isActive ? 'all' : app[0])}
                                                    className={`w-full flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all ${isActive ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 hover:bg-gray-50'}`}
                                                    title="Clique para filtrar eventos deste app"
                                                >
                                                    <p className="text-sm font-black text-gray-800 truncate min-w-0">{app[0]}</p>
                                                    <p className="text-sm font-black text-indigo-600 whitespace-nowrap">{app[1]}</p>
                                                </button>
                                            );
                                        })}
                                        {logsApps.length === 0 && (
                                            <div className="text-sm text-gray-400 font-semibold">Sem eventos ainda.</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* --- MONITORAMENTO DE SESSÕES ATIVAS --- */}
                            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mt-8">
                                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
                                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                        Sessões Ativas em Tempo Real
                                    </h3>
                                    <div className="flex items-center gap-4">
                                        <button
                                            type="button"
                                            disabled={activeSessions.length === 0 || isBulkSessionActionRunning}
                                            onClick={async () => {
                                                if (!activeSessions.length) return;
                                                const ok = confirm(`Forçar logout de todas as ${activeSessions.length} sessão(ões) ativas?`);
                                                if (!ok) return;
                                                setIsBulkSessionActionRunning(true);
                                                try {
                                                    const targetClientIds = activeSessions.map(session => session.client_id);
                                                    setPendingSessionCommands(prev => {
                                                        const next = { ...prev };
                                                        targetClientIds.forEach(clientId => {
                                                            next[clientId] = { command: 'FORCE_LOGOUT', startedAt: Date.now() };
                                                        });
                                                        return next;
                                                    });
                                                    const results = await Promise.all(targetClientIds.map(clientId => SupabaseService.sendSessionCommand(clientId, 'FORCE_LOGOUT')));
                                                    const successCount = results.filter(Boolean).length;
                                                    const failCount = results.length - successCount;
                                                    if (failCount > 0) {
                                                        setPendingSessionCommands(prev => {
                                                            const next = { ...prev };
                                                            targetClientIds.forEach((clientId, index) => {
                                                                if (!results[index]) delete next[clientId];
                                                            });
                                                            return next;
                                                        });
                                                    }
                                                    if (successCount === 0) {
                                                        alert('Nenhuma sessão foi atualizada. Verifique permissões/políticas do Supabase para update em active_sessions.');
                                                    } else if (failCount > 0) {
                                                        alert(`Logout enviado para ${successCount} sessão(ões). ${failCount} falharam.`);
                                                    } else {
                                                        alert('Comando de logout enviado para todas as sessões ativas!');
                                                    }
                                                    await refreshActiveSessions();
                                                } catch (error) {
                                                    console.error('Error sending force logout to all sessions:', error);
                                                    alert('Falha ao enviar comando para todas as sessões.');
                                                } finally {
                                                    setIsBulkSessionActionRunning(false);
                                                }
                                            }}
                                            className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-black hover:bg-red-100 transition-colors border border-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isBulkSessionActionRunning ? 'ENCERRANDO...' : 'ENCERRAR TODAS'}
                                        </button>
                                        {isLoadingSessions && <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin"></div>}
                                        <span className="text-xs font-bold text-slate-400">{groupedActiveSessions.length} usuário(s) online · {activeSessions.length} sessão(ões)</span>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-white text-gray-400 text-[10px] uppercase tracking-widest border-b border-gray-100">
                                            <tr>
                                                <th className="px-6 py-3 text-left">Usuário</th>
                                                <th className="px-6 py-3 text-left">Filial / Área</th>
                                                <th className="px-6 py-3 text-left">Módulos Ativos</th>
                                                <th className="px-6 py-3 text-left">Último Sinal</th>
                                                <th className="px-6 py-3 text-left">Status</th>
                                                <th className="px-6 py-3 text-right">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {groupedActiveSessions.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400 font-medium italic">
                                                        Nenhuma sessão ativa detectada no momento.
                                                    </td>
                                                </tr>
                                            ) : (
                                                groupedActiveSessions.map(user => {
                                                    const pendingForUser = user.modules.filter(mod => !!pendingSessionCommands[mod.client_id]);
                                                    const isPendingForceLogout = pendingForUser.some(mod => pendingSessionCommands[mod.client_id]?.command === 'FORCE_LOGOUT');
                                                    return (
                                                    <tr key={user.user_email} className="hover:bg-blue-50/30 transition-colors">
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-black text-xs shrink-0">
                                                                    {(user.user_name || user.user_email).charAt(0).toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <div className="font-bold text-gray-900">{user.user_name || user.user_email}</div>
                                                                    <div className="text-[10px] text-gray-400">{user.user_email}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="text-gray-700 font-medium">{user.branch || '-'}</div>
                                                            <div className="text-[10px] text-gray-400">{user.area || '-'}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {user.modules.map((mod, idx) => (
                                                                    <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>
                                                                        {mod.current_view}
                                                                    </span>
                                                                ))}
                                                                {user.modules.length > 1 && (
                                                                    <span className="text-[10px] text-gray-400 font-bold self-center">({user.modules.length} abas)</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-xs font-bold text-gray-500">
                                                            {new Date(user.last_ping).toLocaleTimeString('pt-BR')}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {isPendingForceLogout ? (
                                                                <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                    Encerrando...
                                                                </div>
                                                            ) : (
                                                                <span className="text-[10px] font-bold text-slate-300">-</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 text-right space-x-2">
                                                            <button
                                                                onClick={async () => {
                                                                    if (confirm(`Forçar logout de ${user.user_name || user.user_email}? (${user.modules.length} sessão(ões))`)) {
                                                                        const targetClientIds = user.modules.map(m => m.client_id);
                                                                        setPendingSessionCommands(prev => {
                                                                            const next = { ...prev };
                                                                            targetClientIds.forEach(clientId => {
                                                                                next[clientId] = { command: 'FORCE_LOGOUT', startedAt: Date.now() };
                                                                            });
                                                                            return next;
                                                                        });
                                                                        const results = await Promise.all(targetClientIds.map(clientId => SupabaseService.sendSessionCommand(clientId, 'FORCE_LOGOUT')));
                                                                        const successCount = results.filter(Boolean).length;
                                                                        const failCount = results.length - successCount;
                                                                        if (failCount > 0) {
                                                                            setPendingSessionCommands(prev => {
                                                                                const next = { ...prev };
                                                                                targetClientIds.forEach((clientId, index) => {
                                                                                    if (!results[index]) delete next[clientId];
                                                                                });
                                                                                return next;
                                                                            });
                                                                        }
                                                                        if (successCount === 0) {
                                                                            alert('Nenhuma sessão foi atualizada. Verifique permissões/políticas do Supabase para update em active_sessions.');
                                                                        } else if (failCount > 0) {
                                                                            alert(`Logout enviado para ${successCount} sessão(ões). ${failCount} falharam.`);
                                                                        } else {
                                                                            alert('Comando de logout enviado para todas as sessões!');
                                                                        }
                                                                        await refreshActiveSessions();
                                                                    }
                                                                }}
                                                                className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-black hover:bg-red-100 transition-colors border border-red-100"
                                                            >
                                                                DERRUBAR
                                                            </button>
                                                            <button
                                                                onClick={async () => {
                                                                    const results = await Promise.all(user.modules.map(m => SupabaseService.sendSessionCommand(m.client_id, 'RELOAD')));
                                                                    const successCount = results.filter(Boolean).length;
                                                                    const failCount = results.length - successCount;
                                                                    if (successCount === 0) {
                                                                        alert('Nenhuma sessão foi atualizada. Verifique permissões/políticas do Supabase para update em active_sessions.');
                                                                    } else if (failCount > 0) {
                                                                        alert(`Reload enviado para ${successCount} sessão(ões). ${failCount} falharam.`);
                                                                    } else {
                                                                        alert('Reload enviado para todas as sessões!');
                                                                    }
                                                                }}
                                                                className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black hover:bg-blue-100 transition-colors border border-blue-100"
                                                            >
                                                                RELOAD
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )})
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mt-8">
                                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Eventos Detalhados</h3>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-gray-400">
                                            exibindo {Math.min(eventsDisplayLimit, displayEventLogs.length)} de {displayEventLogs.length}
                                        </span>
                                        {eventsDisplayLimit < displayEventLogs.length && (
                                            <span className="text-[9px] font-black text-orange-400 uppercase tracking-widest animate-pulse">↓ role para mais</span>
                                        )}
                                        {eventsDisplayLimit >= displayEventLogs.length && displayEventLogs.length > 0 && (
                                            <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">fim</span>
                                        )}
                                    </div>
                                </div>
                                <div
                                    className="overflow-auto"
                                    style={{ maxHeight: 400 }}
                                    onScroll={e => {
                                        const el = e.currentTarget;
                                        const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight * 0.9;
                                        if (nearBottom && eventsDisplayLimit < Math.min(displayEventLogs.length, 200)) {
                                            setEventsDisplayLimit(prev => Math.min(prev + 50, 200));
                                        }
                                    }}
                                >
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-widest sticky top-0 z-10">
                                            <tr>
                                                <th className="px-6 py-3 text-left">Data/Hora</th>
                                                <th className="px-6 py-3 text-left">App</th>
                                                <th className="px-6 py-3 text-left">Evento</th>
                                                <th className="px-6 py-3 text-left">Filial</th>
                                                <th className="px-6 py-3 text-left">Usuário</th>
                                                <th className="px-6 py-3 text-left">Local</th>
                                                <th className="px-6 py-3 text-left">Qtde</th>
                                                <th className="px-6 py-3 text-left">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {pagedEventLogs.map(log => (
                                                <tr key={log.id} className="hover:bg-gray-50/50">
                                                    <td className="px-6 py-3 text-xs font-bold text-gray-600 whitespace-nowrap">{log.created_at ? new Date(log.created_at).toLocaleString('pt-BR', { hour12: false }) : '-'}</td>
                                                    <td className="px-6 py-3 font-bold text-gray-800 whitespace-nowrap">{log.app}</td>
                                                    <td className="px-6 py-3 text-gray-600 whitespace-nowrap">{formatEventTypeLabel(log.event_type)}</td>
                                                    <td className="px-6 py-3 text-gray-600 whitespace-nowrap">{log.branch || '-'}</td>
                                                    <td className="px-6 py-3 text-gray-600 whitespace-nowrap">{log.user_email || '-'}</td>
                                                    <td className="px-6 py-3 text-gray-600 whitespace-nowrap max-w-[280px] truncate" title={extractEventLocation(log)}>{extractEventLocation(log)}</td>
                                                    <td className="px-6 py-3 text-gray-700 font-bold whitespace-nowrap">{(log as any).count || 1}</td>
                                                    <td className="px-6 py-3">
                                                        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg whitespace-nowrap ${log.success === false ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                            {log.success === false ? 'Erro' : 'OK'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {displayEventLogs.length === 0 && (
                                                <tr>
                                                    <td colSpan={8} className="px-6 py-10 text-center text-gray-400 font-semibold">
                                                        Nenhum evento encontrado.
                                                    </td>
                                                </tr>
                                            )}
                                            {eventsDisplayLimit >= 200 && displayEventLogs.length >= 200 && (
                                                <tr>
                                                    <td colSpan={8} className="px-4 py-3 text-center text-[10px] font-black text-gray-300 uppercase tracking-widest bg-gray-50">
                                                        Limite de 200 registros — use filtros para refinar
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* ====== EVENTOS POR FILIAL E DIA ====== */}
                            {(() => {
                                const todayStr = new Date().toLocaleDateString('pt-BR');

                                // byBranchDay: Map<branch, Map<day, {count, errors, users}>>
                                type DayData = { count: number; errors: number; users: Set<string> };
                                const byBranchDay = new Map<string, Map<string, DayData>>();
                                const allDaysSet = new Set<string>();

                                filteredEventLogs.forEach(log => {
                                    if (!log.created_at) return;
                                    const branch = normalizeBranchLabel(log.branch);
                                    const day = new Date(log.created_at).toLocaleDateString('pt-BR');
                                    allDaysSet.add(day);
                                    if (!byBranchDay.has(branch)) byBranchDay.set(branch, new Map());
                                    const dayMap = byBranchDay.get(branch)!;
                                    const cur = dayMap.get(day) || { count: 0, errors: 0, users: new Set<string>() };
                                    cur.count += 1;
                                    if (log.success === false) cur.errors += 1;
                                    if (log.user_email) cur.users.add(log.user_email);
                                    dayMap.set(day, cur);
                                });

                                // Dias ordenados: hoje primeiro, depois mais recentes
                                const allDays = Array.from(allDaysSet).sort((a, b) => {
                                    if (a === todayStr) return -1;
                                    if (b === todayStr) return 1;
                                    const [da, ma, ya] = a.split('/').map(Number);
                                    const [db, mb, yb] = b.split('/').map(Number);
                                    return new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime();
                                }).slice(0, 7); // máximo 7 dias visíveis

                                // Branches ordenadas por total de eventos
                                const branches = Array.from(byBranchDay.entries())
                                    .map(([br, dm]) => ({ branch: br, total: Array.from(dm.values()).reduce((s, d) => s + d.count, 0) }))
                                    .sort((a, b) => b.total - a.total);

                                const maxInDay = Math.max(
                                    ...Array.from(byBranchDay.values()).flatMap(dm => Array.from(dm.values()).map(d => d.count)), 1
                                );

                                if (branches.length === 0) return null;
                                return (
                                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mt-6">
                                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                            <div>
                                                <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Eventos por Filial e Dia</h3>
                                                <p className="text-[10px] text-gray-400 mt-0.5">Hoje aparece sempre primeiro · máximo 7 dias · clique na filial para filtrar</p>
                                            </div>
                                            <span className="text-xs font-bold text-gray-400">{allDays.length} dia(s)</span>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full text-xs">
                                                <thead>
                                                    <tr className="bg-gray-50">
                                                        <th className="px-4 py-3 text-left font-black text-gray-400 uppercase tracking-widest whitespace-nowrap w-32">Filial</th>
                                                        {allDays.map(day => (
                                                            <th key={day} className={`px-3 py-3 text-center font-black uppercase tracking-widest whitespace-nowrap ${day === todayStr ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400'}`}>
                                                                {day === todayStr ? '📅 Hoje' : day}
                                                            </th>
                                                        ))}
                                                        <th className="px-4 py-3 text-right font-black text-gray-400 uppercase tracking-widest">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {branches.map(({ branch, total }) => {
                                                        const dm = byBranchDay.get(branch)!;
                                                        const isFiltered = normalizeBranchLabel(logsBranchFilter).toUpperCase() === branch.toUpperCase();
                                                        return (
                                                            <tr
                                                                key={branch}
                                                                className={`cursor-pointer transition-colors ${isFiltered ? 'bg-blue-50' : 'hover:bg-gray-50/50'}`}
                                                                onClick={() => setLogsBranchFilter(isFiltered ? 'all' : branch)}
                                                                title={`Clique para filtrar: ${branch}`}
                                                            >
                                                                <td className="px-4 py-3 font-black text-gray-800 whitespace-nowrap">
                                                                    {isFiltered && <span className="text-blue-500 mr-1">▸</span>}{branch}
                                                                </td>
                                                                {allDays.map(day => {
                                                                    const d = dm.get(day);
                                                                    const intensity = d ? Math.max(0.08, d.count / maxInDay) : 0;
                                                                    const isToday = day === todayStr;
                                                                    return (
                                                                        <td key={day} className={`px-3 py-3 text-center ${isToday ? 'bg-indigo-50/50' : ''}`}>
                                                                            {d ? (
                                                                                <div className="flex flex-col items-center gap-0.5">
                                                                                    <span
                                                                                        className="font-black rounded-lg px-2 py-0.5 text-white text-[11px]"
                                                                                        style={{ background: d.errors > 0 ? `rgba(239,68,68,${intensity})` : `rgba(99,102,241,${intensity})`, color: intensity > 0.4 ? '#fff' : d.errors > 0 ? '#dc2626' : '#4f46e5' }}
                                                                                    >
                                                                                        {d.count}
                                                                                    </span>
                                                                                    {d.errors > 0 && (
                                                                                        <span className="text-[8px] font-black text-red-500">{d.errors}⚠</span>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <span className="text-gray-200 text-[10px]">—</span>
                                                                            )}
                                                                        </td>
                                                                    );
                                                                })}
                                                                <td className="px-4 py-3 text-right font-black text-indigo-600">{total}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ====== UPLOADS E DOWNLOADS POR DIA ====== */}
                            {(() => {
                                // Taxa de Erros: eventos com success=false / total de eventos.
                                // Indica quando ações do usuário falharam no sistema.
                                // Upload = envio de arquivo ao banco (planilhas de venda/estoque/base global)
                                // Download/Export = exportação de dados (CSV, ranking, etc.)
                                const UPLOAD_TYPES = new Set([
                                    'pv_sales_upload_success', 'pv_sales_upload_error',
                                    'pv_inventory_upload_success', 'pv_inventory_upload_error',
                                    'global_base_uploaded',
                                ]);
                                const DOWNLOAD_TYPES = new Set([
                                    'pv_dashboard_downloaded', 'stock_conference_export_csv',
                                    'checklist_printed', 'audit_term_printed', 'audit_report_printed',
                                    'pv_analysis_printed', 'pv_dashboard_printed', 'pv_registration_printed',
                                    'stock_conference_printed',
                                ]);

                                type FileOp = { date: string; uploads: number; uploadErrors: number; downloads: number; users: Set<string>; branches: Set<string> };
                                const byDay = new Map<string, FileOp>();
                                const todayStr = new Date().toLocaleDateString('pt-BR');

                                // Varre TODOS os eventos (sem filtro de branch) para mostrar movimentação global
                                appEventLogs.forEach(log => {
                                    if (!log.created_at || !log.event_type) return;
                                    const isUpload = UPLOAD_TYPES.has(log.event_type);
                                    const isDownload = DOWNLOAD_TYPES.has(log.event_type);
                                    if (!isUpload && !isDownload) return;
                                    const day = new Date(log.created_at).toLocaleDateString('pt-BR');
                                    const cur = byDay.get(day) || { date: day, uploads: 0, uploadErrors: 0, downloads: 0, users: new Set<string>(), branches: new Set<string>() };
                                    if (isUpload) {
                                        cur.uploads += 1;
                                        if (log.success === false || log.event_type.includes('_error')) cur.uploadErrors += 1;
                                    }
                                    if (isDownload) cur.downloads += 1;
                                    if (log.user_email) cur.users.add(log.user_email);
                                    if (log.branch) cur.branches.add(normalizeBranchLabel(log.branch));
                                    byDay.set(day, cur);
                                });

                                const days = Array.from(byDay.values()).sort((a, b) => {
                                    if (a.date === todayStr) return -1;
                                    if (b.date === todayStr) return 1;
                                    const [da, ma, ya] = a.date.split('/').map(Number);
                                    const [db, mb, yb] = b.date.split('/').map(Number);
                                    return new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime();
                                });

                                if (days.length === 0) return null;
                                const maxUploads = Math.max(...days.map(d => d.uploads), 1);
                                const maxDownloads = Math.max(...days.map(d => d.downloads), 1);

                                // ── GASTO DE DADOS COM SERVIDOR (SUPABASE) ─────────────────────────
                                // Leitura: tamanho real do JSON dos event_logs carregados nesta sessão
                                const dbReadBytes = (() => {
                                    try { return new Blob([JSON.stringify(appEventLogs)]).size; }
                                    catch { return appEventLogs.length * 600; }
                                })();
                                // Escrita: soma do tamanho serializado de cada evento individualmente
                                const dbWriteBytes = appEventLogs.reduce((acc, log) => {
                                    try { return acc + new Blob([JSON.stringify(log)]).size; }
                                    catch { return acc + 512; }
                                }, 0);
                                // Arquivos: bytes reais registrados em event_meta.file_size no momento do upload
                                const fileUploadBytes = appEventLogs.reduce((acc, log) => {
                                    if (!UPLOAD_TYPES.has(log.event_type || '')) return acc;
                                    const meta = log.event_meta as Record<string, unknown> | null;
                                    const sz = meta?.file_size ?? meta?.fileSize ?? meta?.size;
                                    return acc + (typeof sz === 'number' && sz > 0 ? sz : 0);
                                }, 0);

                                return (
                                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mt-6">
                                        <div className="px-6 py-4 border-b border-gray-100">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Uploads e Exportações por Dia</h3>
                                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                                        <span className="text-emerald-600 font-bold">↑ Upload</span> = planilhas enviadas ao sistema (vendas, estoque, base global) ·&nbsp;
                                                        <span className="text-indigo-600 font-bold">↓ Export</span> = relatórios gerados/impressos/exportados
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[9px] text-gray-400 font-bold">Total período</p>
                                                    <p className="text-xs font-black text-emerald-600">{days.reduce((s, d) => s + d.uploads, 0)} uploads · <span className="text-indigo-600">{days.reduce((s, d) => s + d.downloads, 0)} exports</span></p>
                                                </div>
                                            </div>
                                            {/* ── Cards de Gasto de Dados ── */}
                                            <div className="grid grid-cols-3 gap-3 mt-4">
                                                <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-blue-400 mb-1">📥 Leitura do BD</p>
                                                    <p className="text-xl font-black text-blue-700">{formatFileSize(dbReadBytes)}</p>
                                                    <p className="text-[9px] text-blue-400 font-semibold mt-0.5">{appEventLogs.length} registros carregados</p>
                                                </div>
                                                <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-1">📤 Escrita no BD</p>
                                                    <p className="text-xl font-black text-amber-700">{formatFileSize(dbWriteBytes)}</p>
                                                    <p className="text-[9px] text-amber-400 font-semibold mt-0.5">estimativa por evento gravado</p>
                                                </div>
                                                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-1">🗂 Arquivos Enviados</p>
                                                    <p className="text-xl font-black text-emerald-700">{fileUploadBytes > 0 ? formatFileSize(fileUploadBytes) : '—'}</p>
                                                    <p className="text-[9px] text-emerald-400 font-semibold mt-0.5">{fileUploadBytes > 0 ? 'tamanho real dos uploads' : 'sem meta de tamanho'}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-5 space-y-2 overflow-y-auto" style={{ maxHeight: 320 }}>
                                            {days.map(day => (
                                                <div key={day.date} className={`rounded-xl border px-4 py-3 ${day.date === todayStr ? 'border-indigo-100 bg-indigo-50/40' : 'border-gray-100'}`}>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[11px] font-black ${day.date === todayStr ? 'text-indigo-600' : 'text-gray-600'}`}>
                                                                {day.date === todayStr ? '📅 Hoje' : day.date}
                                                            </span>
                                                            <span className="text-[9px] text-gray-400">{day.users.size} usr · {day.branches.size} filial(is)</span>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-[11px] font-black text-emerald-600">↑ {day.uploads}</span>
                                                            {day.uploadErrors > 0 && <span className="text-[9px] font-black text-red-500 bg-red-50 px-1.5 py-0.5 rounded">{day.uploadErrors} falha(s)</span>}
                                                            <span className="text-[11px] font-black text-indigo-600">↓ {day.downloads}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1.5">
                                                        <div className="flex-1">
                                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                                <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${(day.uploads / maxUploads) * 100}%` }} />
                                                            </div>
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                                <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${(day.downloads / maxDownloads) * 100}%` }} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Atividade por Usuário</h3>
                                    <span className="text-xs font-bold text-gray-400">{userActivityStats.length} usuários · mais ativos primeiro</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-widest">
                                            <tr>
                                                <th className="px-6 py-3 text-left">Usuário</th>
                                                <th className="px-6 py-3 text-left">Filial</th>
                                                <th className="px-4 py-3 text-right">Eventos</th>
                                                <th className="px-6 py-3 text-left">Dias Ativos (30d)</th>
                                                <th className="px-6 py-3 text-left">Tempo Ativo</th>
                                                <th className="px-6 py-3 text-left">Última Atividade</th>
                                                <th className="px-6 py-3 text-left">Dias Sem Atividade</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {userActivityStats.map((user, idx) => (
                                                <tr key={user.email} className={`hover:bg-gray-50/50 ${idx === 0 ? 'bg-emerald-50/30' : ''}`}>
                                                    <td className="px-6 py-3">
                                                        <div className="flex items-center gap-2">
                                                            {idx === 0 && <span className="text-[10px] text-emerald-600 font-black bg-emerald-100 px-1.5 py-0.5 rounded-md">🏆</span>}
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-gray-800 whitespace-nowrap">{user.name}</span>
                                                                <span className="text-[10px] text-gray-400 font-bold whitespace-nowrap">{user.email}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 text-gray-600 whitespace-nowrap">{user.filial}</td>
                                                    <td className="px-4 py-3 text-right font-black text-indigo-600">{user.eventCount || 0}</td>
                                                    <td className="px-6 py-3 font-bold text-slate-700 whitespace-nowrap">{user.activeDays}</td>
                                                    <td className="px-6 py-3 text-gray-600 whitespace-nowrap">{formatDurationMs(user.durationMs) || '00:00'}</td>
                                                    <td className="px-6 py-3 text-gray-600 whitespace-nowrap">
                                                        {user.lastAt ? new Date(user.lastAt).toLocaleString('pt-BR', { hour12: false }) : 'Sem atividade'}
                                                    </td>
                                                    <td className="px-6 py-3 whitespace-nowrap">
                                                        {user.daysInactive === null ? (
                                                            <span className="text-xs font-bold text-gray-400">Sem registro</span>
                                                        ) : user.daysInactive === 0 ? (
                                                            <span className="text-xs font-bold text-emerald-600">Hoje</span>
                                                        ) : (
                                                            <span className={`text-xs font-bold ${user.daysInactive >= 7 ? 'text-red-600' : 'text-amber-600'}`}>
                                                                {user.daysInactive} dia(s)
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {userActivityStats.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} className="px-6 py-10 text-center text-gray-400 font-semibold">
                                                        Nenhum usuário encontrado.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                                </>
                            )}
                        </div>
                    )}
                    {currentView === 'logs' && currentUser?.role !== 'MASTER' && (
                        <div className="max-w-4xl mx-auto p-10 text-center bg-white rounded-3xl border border-gray-100 shadow-sm">
                            <h2 className="text-xl font-black text-gray-800">Acesso restrito</h2>
                            <p className="text-sm text-gray-500 mt-2">A aba Métricas Gerenciais está disponível apenas para usuários master.</p>
                        </div>
                    )}

                    {/* --- CADASTROS BASE GLOBAIS (MASTER) --- */}
                    {currentView === 'cadastros_globais' && currentUser?.role === 'MASTER' && (
                        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-24">
                            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                                <div className="space-y-2">
                                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Cadastros Base Globais</h1>
                                    <p className="text-sm font-bold text-gray-500 max-w-3xl">
                                        Carregue aqui os arquivos fixos dos módulos. Eles ficam centralizados por empresa e disponíveis para todas as filiais.
                                    </p>
                                </div>
                                <button
                                    onClick={() => loadGlobalBaseFiles()}
                                    disabled={isLoadingGlobalBaseFiles}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-gray-200 bg-white text-gray-700 text-xs font-black uppercase tracking-wider hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <RefreshCw size={14} className={isLoadingGlobalBaseFiles ? 'animate-spin' : ''} />
                                    {isLoadingGlobalBaseFiles ? 'Atualizando...' : 'Atualizar Lista'}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {GLOBAL_BASE_MODULE_SLOTS.map(slot => {
                                    const uploadedFile = globalBaseFilesByKey.get(slot.key);
                                    const isUploading = uploadingGlobalBaseKey === slot.key;
                                    const inputId = `global-base-upload-${slot.key}`;
                                    return (
                                        <div key={slot.key} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-4">
                                            <div className="space-y-1">
                                                <h3 className="text-sm font-black text-gray-900 tracking-tight">{slot.label}</h3>
                                                <p className="text-xs text-gray-500 font-medium leading-relaxed">{slot.description}</p>
                                            </div>

                                            <div className={`rounded-2xl border px-4 py-3 ${uploadedFile ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/50'}`}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-[10px] font-black uppercase tracking-widest ${uploadedFile ? 'text-emerald-700' : 'text-amber-700'}`}>
                                                        {uploadedFile ? 'Arquivo carregado' : 'Aguardando upload'}
                                                    </span>
                                                    {uploadedFile ? <CheckCircle size={14} className="text-emerald-600" /> : <AlertCircle size={14} className="text-amber-600" />}
                                                </div>
                                                <p className="mt-2 text-xs font-bold text-gray-700 truncate" title={uploadedFile?.file_name || 'Sem arquivo'}>
                                                    {uploadedFile?.file_name || 'Sem arquivo'}
                                                </p>
                                                <p className="mt-1 text-[11px] text-gray-500 font-semibold">
                                                    {uploadedFile ? `${formatFileSize(uploadedFile.file_size)} • ${formatFullDateTime(uploadedFile.uploaded_at)}` : 'Nenhum envio registrado'}
                                                </p>
                                                <p className="mt-1 text-[11px] text-gray-400 font-semibold truncate">
                                                    {uploadedFile?.uploaded_by ? `Responsável: ${uploadedFile.uploaded_by}` : 'Responsável: —'}
                                                </p>
                                            </div>

                                            <input
                                                id={inputId}
                                                type="file"
                                                accept=".xls,.xlsx,.csv,.xml,.txt"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const selectedFile = e.target.files?.[0];
                                                    if (!selectedFile) return;
                                                    handleUploadGlobalBaseFile(slot.key, selectedFile);
                                                    e.currentTarget.value = '';
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => document.getElementById(inputId)?.click()}
                                                disabled={isUploading}
                                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                                {isUploading ? 'Enviando...' : 'Carregar arquivo'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* --- ANÁLISE DE RESULTADOS --- */}
                            <div className="pt-6">
                                <h2 className="text-xl font-black text-gray-900 tracking-tight mb-2">Análise de Resultados</h2>
                                <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Arquivos com dados de Vendas Totais e Pedidos.</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {RESULT_ANALYSIS_SLOTS.map(slot => {
                                    const uploadedFile = globalBaseFilesByKey.get(slot.key);
                                    const isUploading = uploadingGlobalBaseKey === slot.key;
                                    const inputId = `global-base-upload-${slot.key}`;
                                    return (
                                        <div key={slot.key} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-4">
                                            <div className="space-y-1">
                                                <h3 className="text-sm font-black text-gray-900 tracking-tight">{slot.label}</h3>
                                                <p className="text-xs text-gray-500 font-medium leading-relaxed">{slot.description}</p>
                                            </div>

                                            <div className={`rounded-2xl border px-4 py-3 ${uploadedFile ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/50'}`}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-[10px] font-black uppercase tracking-widest ${uploadedFile ? 'text-emerald-700' : 'text-amber-700'}`}>
                                                        {uploadedFile ? 'Arquivo carregado' : 'Aguardando upload'}
                                                    </span>
                                                    {uploadedFile ? <CheckCircle size={14} className="text-emerald-600" /> : <AlertCircle size={14} className="text-amber-600" />}
                                                </div>
                                                <p className="mt-2 text-xs font-bold text-gray-700 truncate" title={uploadedFile?.file_name || 'Sem arquivo'}>
                                                    {uploadedFile?.file_name || 'Sem arquivo'}
                                                </p>
                                                <p className="mt-1 text-[11px] text-gray-500 font-semibold">
                                                    {uploadedFile ? `${formatFileSize(uploadedFile.file_size)} • ${formatFullDateTime(uploadedFile.uploaded_at)}` : 'Nenhum envio registrado'}
                                                </p>
                                                <p className="mt-1 text-[11px] text-gray-400 font-semibold truncate">
                                                    {uploadedFile?.uploaded_by ? `Responsável: ${uploadedFile.uploaded_by}` : 'Responsável: —'}
                                                </p>
                                            </div>

                                            <input
                                                id={inputId}
                                                type="file"
                                                accept=".xls,.xlsx,.csv,.xml,.txt"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const selectedFile = e.target.files?.[0];
                                                    if (!selectedFile) return;
                                                    handleUploadGlobalBaseFile(slot.key, selectedFile);
                                                    e.currentTarget.value = '';
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => document.getElementById(inputId)?.click()}
                                                disabled={isUploading}
                                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                                {isUploading ? 'Enviando...' : 'Carregar arquivo'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            {globalBranchStockSlotsByArea.length > 0 && (
                                <>
                                    <div className="pt-2">
                                        <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Estoque Compartilhado por Filial</p>
                                        <p className="text-sm font-semibold text-gray-500">Carregue aqui o saldo da filial para uso imediato em Pré‑Vencidos e Auditoria.</p>
                                    </div>
                                    {globalBranchStockSlotsByArea.map(area => (
                                        <div key={area.areaName} className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">{area.areaName}</h3>
                                                <span className="text-[11px] font-bold text-gray-400">{area.slots.length} filial(is)</span>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                                {area.slots.map(slot => {
                                                    const uploadedFile = globalBaseFilesByKey.get(slot.key);
                                                    const isUploading = uploadingGlobalBaseKey === slot.key;
                                                    const inputId = `global-base-upload-${slot.key}`;
                                                    return (
                                                        <div key={slot.key} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-4">
                                                            <div className="space-y-1">
                                                                <h3 className="text-sm font-black text-gray-900 tracking-tight">{slot.label}</h3>
                                                                <p className="text-xs text-gray-500 font-medium leading-relaxed">{slot.description}</p>
                                                            </div>

                                                            <div className={`rounded-2xl border px-4 py-3 ${uploadedFile ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/50'}`}>
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className={`text-[10px] font-black uppercase tracking-widest ${uploadedFile ? 'text-emerald-700' : 'text-amber-700'}`}>
                                                                        {uploadedFile ? 'Arquivo carregado (atual)' : 'Aguardando upload'}
                                                                    </span>
                                                                    {uploadedFile ? <CheckCircle size={14} className="text-emerald-600" /> : <AlertCircle size={14} className="text-amber-600" />}
                                                                </div>
                                                                <p className="mt-2 text-xs font-bold text-gray-700 truncate" title={uploadedFile?.file_name || 'Sem arquivo'}>
                                                                    {uploadedFile?.file_name || 'Sem arquivo'}
                                                                </p>
                                                                <p className="mt-1 text-[11px] text-gray-500 font-semibold">
                                                                    {uploadedFile ? `${formatFileSize(uploadedFile.file_size)} • ${formatFullDateTime(uploadedFile.uploaded_at)}` : 'Nenhum envio registrado'}
                                                                </p>
                                                                <p className="mt-1 text-[11px] text-gray-400 font-semibold truncate">
                                                                    {uploadedFile?.uploaded_by ? `Responsável: ${uploadedFile.uploaded_by}` : 'Responsável: —'}
                                                                </p>
                                                            </div>

                                                            <input
                                                                id={inputId}
                                                                type="file"
                                                                accept=".xls,.xlsx,.csv,.xml,.txt"
                                                                className="hidden"
                                                                onChange={(e) => {
                                                                    const selectedFile = e.target.files?.[0];
                                                                    if (!selectedFile) return;
                                                                    handleUploadGlobalBaseFile(slot.key, selectedFile);
                                                                    e.currentTarget.value = '';
                                                                }}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => document.getElementById(inputId)?.click()}
                                                                disabled={isUploading}
                                                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                                            >
                                                                {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                                                {isUploading ? 'Enviando...' : 'Carregar arquivo'}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}

                            <div className="bg-blue-50/70 border border-blue-100 rounded-3xl p-5">
                                <p className="text-xs font-black text-blue-900 uppercase tracking-widest mb-2">Escopo do módulo</p>
                                <p className="text-sm font-semibold text-blue-800">
                                    Esses arquivos são salvos por empresa e compartilhados entre as filiais. Use esta tela para manter as bases fixas atualizadas sem depender de envio por filial.
                                </p>
                            </div>
                        </div>
                    )}
                    {currentView === 'cadastros_globais' && currentUser?.role !== 'MASTER' && (
                        <div className="max-w-4xl mx-auto p-10 text-center bg-white rounded-3xl border border-gray-100 shadow-sm">
                            <h2 className="text-xl font-black text-gray-800">Acesso restrito</h2>
                            <p className="text-sm text-gray-500 mt-2">A aba Cadastros Base está disponível apenas para usuários master.</p>
                        </div>
                    )}

                    {/* --- SUPPORT/TICKETS VIEW --- */}
                    {currentView === 'support' && (
                        <div className="max-w-5xl mx-auto space-y-10 animate-fade-in relative pb-32">

                            {/* Header */}
                            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-4">
                                <div>
                                    <h1 className="text-4xl font-black text-gray-900 tracking-tight leading-tight">Suporte e Melhorias</h1>
                                    <p className="text-gray-500 font-bold text-lg mt-1">Relate problemas ou sugira novas funcionalidades</p>
                                </div>
                                <div className="flex items-center gap-3 bg-white/50 backdrop-blur-md p-2 rounded-2xl border border-white/50 shadow-sm">
                                    <div className={`p-2 rounded-xl ${currentTheme.lightBg} ${currentTheme.text}`}>
                                        <MessageSquareQuote size={20} />
                                    </div>
                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest px-2">Central de Ajuda</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                                {/* Create Ticket Form - Modernized */}
                                <div className="lg:col-span-1 bg-white/80 backdrop-blur-2xl rounded-[32px] shadow-card border border-white/60 p-8 sticky top-24">
                                    <h3 className="text-xl font-black text-gray-800 mb-6 flex items-center gap-3">
                                        <div className={`p-2.5 rounded-xl ${currentTheme.lightBg} ${currentTheme.text}`}>
                                            <Lightbulb size={20} />
                                        </div>
                                        Novo Ticket
                                    </h3>

                                    <div className="space-y-5">
                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-wider ml-1">Título do Assunto</label>
                                            <div className="relative group">
                                                <input
                                                    type="text"
                                                    value={newTicketTitle}
                                                    onChange={(e) => setNewTicketTitle(e.target.value)}
                                                    placeholder="Ex: Erro ao salvar / Sugestão de cor"
                                                    className="w-full bg-white border border-gray-200 rounded-2xl p-4 text-gray-900 font-bold outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all shadow-sm"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-wider ml-1">Descrição Detalhada</label>
                                            <textarea
                                                value={newTicketDesc}
                                                onChange={(e) => setNewTicketDesc(e.target.value)}
                                                placeholder="Descreva o que aconteceu ou sua ideia..."
                                                rows={6}
                                                className="w-full bg-white border border-gray-200 rounded-2xl p-4 text-gray-900 font-medium outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all shadow-sm resize-none"
                                            />
                                        </div>

                                        <div className="pt-2">
                                            <label className="cursor-pointer group block">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            const reader = new FileReader();
                                                            reader.onloadend = () => {
                                                                setNewTicketImages([reader.result as string]);
                                                            };
                                                            reader.readAsDataURL(file);
                                                        }
                                                    }}
                                                />
                                                <div className={`border-2 border-dashed border-gray-200 rounded-2xl p-4 flex items-center justify-center gap-3 transition-colors ${newTicketImages.length > 0 ? 'bg-green-50 border-green-200' : 'hover:bg-gray-50 hover:border-gray-300'}`}>
                                                    {newTicketImages.length > 0 ? (
                                                        <>
                                                            <div className="w-10 h-10 rounded-xl overflow-hidden border border-green-200 shadow-sm">
                                                                <img src={newTicketImages[0]} className="w-full h-full object-cover" />
                                                            </div>
                                                            <div className="text-left">
                                                                <p className="text-xs font-bold text-green-700 uppercase">Imagem Anexada</p>
                                                                <p className="text-[10px] text-green-600 font-medium">Clique para alterar</p>
                                                            </div>
                                                            <CheckCircle size={18} className="text-green-500 ml-auto" />
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="p-2 bg-gray-100 rounded-xl text-gray-400 group-hover:bg-white group-hover:text-blue-500 transition-colors">
                                                                <ImageIcon size={20} />
                                                            </div>
                                                            <span className="text-sm font-bold text-gray-400 group-hover:text-gray-600 transition-colors">Anexar Print (Opcional)</span>
                                                        </>
                                                    )}
                                                </div>
                                            </label>
                                        </div>

                                        <button
                                            onClick={async () => {
                                                if (!newTicketTitle.trim() || !newTicketDesc.trim()) {
                                                    alert('Preencha título e descrição.');
                                                    return;
                                                }
                                                if (!currentUser) return;

                                                const ticket = {
                                                    title: newTicketTitle,
                                                    description: newTicketDesc,
                                                    images: newTicketImages,
                                                    user_email: currentUser.email,
                                                    user_name: currentUser.name
                                                };
                                                const created = await createTicket(ticket as DbTicket);
                                                if (created) {
                                                    setTickets([created, ...tickets]);
                                                    setNewTicketTitle('');
                                                    setNewTicketDesc('');
                                                    setNewTicketImages([]);
                                                    alert('Solicitação enviada com sucesso! Obrigado.');
                                                    SupabaseService.insertAppEventLog({
                                                        company_id: currentUser.company_id || null,
                                                        branch: currentUser.filial || null,
                                                        area: currentUser.area || null,
                                                        user_email: currentUser.email,
                                                        user_name: currentUser.name,
                                                        app: 'suporte',
                                                        event_type: 'ticket_created',
                                                        entity_type: 'ticket',
                                                        entity_id: created.id,
                                                        status: 'success',
                                                        success: true,
                                                        source: 'web',
                                                        event_meta: { title: created.title }
                                                    }).catch(() => { });
                                                } else {
                                                    alert('Erro ao enviar solicitação.');
                                                }
                                            }}
                                            className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all active:scale-95 flex items-center justify-center gap-2"
                                        >
                                            <Send size={18} />
                                            Enviar Solicitação
                                        </button>
                                    </div>
                                </div>

                                {/* Ticket List - Modernized */}
                                <div className="lg:col-span-2 space-y-6">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xl font-black text-gray-800 flex items-center gap-3">
                                            <History size={20} className="text-gray-400" />
                                            Histórico
                                        </h3>
                                        <div className="bg-gray-100 text-gray-500 text-xs font-bold px-3 py-1 rounded-full">
                                            {tickets.length} tickets
                                        </div>
                                    </div>

                                    {tickets.length === 0 ? (
                                        <div className="bg-white/50 border-2 border-dashed border-gray-200 rounded-[32px] p-12 text-center">
                                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                                                <MessageSquare size={32} />
                                            </div>
                                            <p className="text-gray-400 font-bold mb-1">Nenhum ticket encontrado</p>
                                            <p className="text-sm text-gray-400 opacity-60">Suas solicitações aparecerão aqui.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {tickets.map(ticket => (
                                                <div key={ticket.id} className="bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all group">
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div className="flex gap-4">
                                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold shadow-inner-light ${ticket.status === 'DONE' ? 'bg-green-100 text-green-600' :
                                                                ticket.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-600' :
                                                                    ticket.status === 'IGNORED' ? 'bg-gray-100 text-gray-500' :
                                                                        'bg-yellow-100 text-yellow-600'
                                                                }`}>
                                                                {ticket.status === 'DONE' ? <CheckCircle size={24} /> :
                                                                    ticket.status === 'IN_PROGRESS' ? <Loader2 size={24} className="animate-spin" /> :
                                                                        ticket.status === 'IGNORED' ? <X size={24} /> :
                                                                            <Clock size={24} />}
                                                            </div>
                                                            <div>
                                                                <h4 className="font-bold text-gray-900 text-lg leading-tight group-hover:text-blue-600 transition-colors">
                                                                    {ticket.title}
                                                                </h4>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className={`text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-lg ${ticket.status === 'DONE' ? 'bg-green-50 text-green-700' :
                                                                        ticket.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700' :
                                                                            ticket.status === 'IGNORED' ? 'bg-gray-50 text-gray-500' :
                                                                                'bg-yellow-50 text-yellow-700'
                                                                        }`}>
                                                                        {ticket.status === 'DONE' ? 'Concluído' :
                                                                            ticket.status === 'IN_PROGRESS' ? 'Em Análise' :
                                                                                ticket.status === 'IGNORED' ? 'Arquivado' : 'Aberto'}
                                                                    </span>
                                                                    <span className="text-gray-300 text-xs">•</span>
                                                                    <span className="text-xs font-bold text-gray-400">
                                                                        {ticket.user_name}
                                                                    </span>
                                                                    <span className="text-gray-300 text-xs">•</span>
                                                                    <span className="text-xs font-bold text-gray-400">
                                                                        {new Date(ticket.created_at || '').toLocaleDateString()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="pl-[4rem]">
                                                        <p className="text-gray-600 text-sm leading-relaxed mb-4 bg-gray-50/50 p-4 rounded-2xl border border-gray-100/50">
                                                            {ticket.description}
                                                        </p>

                                                        {ticket.images && ticket.images.length > 0 && (
                                                            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                                                                {ticket.images.map((img, idx) => (
                                                                    <div key={idx} className="relative group/img cursor-pointer shrink-0" onClick={() => window.open(img, '_blank')}>
                                                                        <img src={img} className="h-16 w-16 object-cover rounded-xl border border-gray-200 hover:scale-105 transition-transform" />
                                                                        <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 rounded-xl transition-colors" />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {ticket.admin_response && (
                                                            <div className="bg-gradient-to-r from-green-50 to-emerald-50/30 p-5 rounded-2xl border border-green-100/50 relative overflow-hidden">
                                                                <div className="absolute top-0 right-0 p-3 opacity-10">
                                                                    <MessageSquareQuote size={40} className="text-green-600" />
                                                                </div>
                                                                <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> Resposta Oficial
                                                                </p>
                                                                <p className="text-sm font-medium text-green-900 leading-relaxed relative z-10">{ticket.admin_response}</p>
                                                            </div>
                                                        )}

                                                        {/* Admin Actions (Master Only) */}
                                                        {canRespondTickets && (
                                                            <div className="mt-6 pt-6 border-t border-dashed border-gray-100 animate-fade-in">
                                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Gerenciar Ticket</label>
                                                                <div className="flex flex-col gap-3">
                                                                    <textarea
                                                                        placeholder="Escreva uma resposta para o usuário..."
                                                                        className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                                                                        rows={2}
                                                                        value={adminResponseInput[ticket.id!] || ''}
                                                                        onChange={(e) => setAdminResponseInput(prev => ({ ...prev, [ticket.id!]: e.target.value }))}
                                                                    />
                                                                    <div className="flex gap-2 justify-end">
                                                                        <button
                                                                            onClick={async () => {
                                                                                const responseText = adminResponseInput[ticket.id!] || '';
                                                                                const success = await updateTicketStatus(ticket.id!, 'IN_PROGRESS', responseText);
                                                                                if (success) {
                                                                                    setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, status: 'IN_PROGRESS', admin_response: responseText } : t));
                                                                                    alert('Status alterado para "Em Análise"!');
                                                                                }
                                                                            }}
                                                                            className="text-xs bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-bold hover:bg-blue-100 transition-colors"
                                                                        >
                                                                            Em Análise
                                                                        </button>
                                                                        <button
                                                                            onClick={async () => {
                                                                                const responseText = adminResponseInput[ticket.id!] || '';
                                                                                const success = await updateTicketStatus(ticket.id!, 'IGNORED', responseText);
                                                                                if (success) {
                                                                                    setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, status: 'IGNORED', admin_response: responseText } : t));
                                                                                    alert('Ticket arquivado!');
                                                                                }
                                                                            }}
                                                                            className="text-xs bg-gray-100 text-gray-600 px-4 py-2 rounded-lg font-bold hover:bg-gray-200 transition-colors"
                                                                        >
                                                                            Arquivar
                                                                        </button>
                                                                        <button
                                                                            onClick={async () => {
                                                                                const responseText = adminResponseInput[ticket.id!] || '';
                                                                                const success = await updateTicketStatus(ticket.id!, 'DONE', responseText);
                                                                                if (success) {
                                                                                    setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, status: 'DONE', admin_response: responseText } : t));
                                                                                    alert('Ticket concluído!');
                                                                                }
                                                                            }}
                                                                            className="text-xs bg-green-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-600 shadow-md hover:shadow-lg transition-all"
                                                                        >
                                                                            Concluir & Responder
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- ACCESS MATRIX --- */}
                    {currentView === 'access' && currentUser.role === 'MASTER' && (
                        <div className="max-w-6xl mx-auto space-y-10 animate-fade-in pb-32">
                            {/* Header */}
                            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-4">
                                <div>
                                    <h1 className="text-4xl font-black text-gray-900 tracking-tight leading-tight">Controle de Acessos</h1>
                                    <p className="text-gray-500 font-bold text-lg mt-1">Gerencie permissões para cada nível hierárquico</p>
                                </div>
                                <div className="flex items-center gap-3 bg-white/50 backdrop-blur-md p-2 rounded-2xl border border-white/50 shadow-sm">
                                    <div className={`p-2 rounded-xl ${currentTheme.lightBg} ${currentTheme.text}`}>
                                        <ShieldCheck size={20} />
                                    </div>
                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest px-2">Segurança</span>
                                </div>
                            </div>

                            <div className="bg-white/80 backdrop-blur-2xl rounded-[40px] shadow-card border border-white/60 p-10 overflow-hidden">
                                <div className="grid gap-8 lg:grid-cols-3">
                                    {ACCESS_LEVELS.map(level => (
                                        <div key={level.id} className="flex flex-col gap-6 rounded-[32px] border border-gray-100 bg-white p-8 shadow-sm hover:shadow-xl transition-all duration-500 group">
                                            <div className="space-y-4 border-b border-gray-100 pb-6">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-2xl font-black tracking-tight text-gray-900 group-hover:text-blue-600 transition-colors">{level.title}</p>
                                                        <p className="text-sm font-medium text-gray-400 mt-2 leading-relaxed">
                                                            {level.description}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className={`inline-block px-4 py-1.5 text-[10px] font-black uppercase rounded-full tracking-widest shadow-sm ${level.badgeClasses}`}>
                                                    {level.badgeLabel}
                                                </span>
                                            </div>

                                            <div className="space-y-4">
                                                {ACCESS_MODULES.map(module => {
                                                    const enabled = level.id === 'MASTER' ? true : accessMatrix[level.id]?.[module.id];
                                                    return (
                                                        <div
                                                            key={`${level.id}-${module.id}`}
                                                            className={`flex items-center justify-between gap-4 rounded-2xl border px-5 py-4 transition-all duration-300 ${enabled
                                                                ? 'bg-blue-50/50 border-blue-100 shadow-sm'
                                                                : 'bg-gray-50/50 border-gray-100 opacity-60 hover:opacity-100'
                                                                }`}
                                                        >
                                                            <div>
                                                                <p className={`text-sm font-bold transition-colors ${enabled ? 'text-gray-900' : 'text-gray-500'}`}>{module.label}</p>
                                                                {module.note && <p className="text-[10px] text-gray-400 font-medium mt-0.5">{module.note}</p>}
                                                            </div>

                                                            {level.id === 'MASTER' ? (
                                                                <div className="h-8 w-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center shadow-sm">
                                                                    <Check size={16} strokeWidth={3} />
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleToggleAccess(level.id, module.id)}
                                                                    className={`relative h-7 w-12 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${enabled ? 'bg-blue-600' : 'bg-gray-200'
                                                                        }`}
                                                                >
                                                                    <span
                                                                        className={`block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${enabled ? 'translate-x-6' : 'translate-x-1'
                                                                            } mt-1`}
                                                                    />
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- CHECKLIST VIEW --- */}
                    {currentView === 'checklist' && (
                        <div className="max-w-4xl mx-auto space-y-10 animate-fade-in pb-32">
                            {/* Checklist Info Header - Premium Glassmorphism */}
                            <div className="bg-white/80 backdrop-blur-xl border border-white/50 rounded-[32px] p-8 shadow-card overflow-hidden relative group">
                                <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${currentTheme.bgGradient}`} />
                                <div className="flex items-center gap-5">
                                    <div className={`p-4 rounded-2xl ${currentTheme.lightBg} ${currentTheme.text} transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-inner-light`}>
                                        <ClipboardList size={32} strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black text-gray-900 leading-tight tracking-tight">
                                            {activeChecklist?.title}
                                        </h2>
                                        <p className="text-gray-500 font-bold text-lg mt-1">{activeChecklist?.description}</p>
                                    </div>
                                </div>
                            </div>

                            {/* PENDING ITEMS ALERT BOX (Modernized) */}
                            {showErrors && (currentMissingItems.length > 0 || currentSigMissing || currentUnansweredItems.length > 0) && (
                                <div ref={errorBoxRef} className="bg-white/90 backdrop-blur-2xl border-2 border-red-500/20 rounded-[32px] shadow-2xl overflow-hidden mb-12 animate-shake ring-4 ring-red-500/5">
                                    <div className="p-8 border-b border-red-100 bg-gradient-to-r from-red-50 to-white flex items-center gap-5">
                                        <div className="p-3.5 bg-red-500 rounded-2xl text-white shadow-lg shadow-red-500/20 animate-pulse">
                                            <AlertTriangle size={28} strokeWidth={2.5} />
                                        </div>
                                        <div>
                                            <h4 className="text-red-900 font-black text-xl uppercase tracking-widest">
                                                Pendências Identificadas
                                            </h4>
                                            <p className="text-red-700/80 font-bold">Por favor, complete os itens obrigatórios para prosseguir.</p>
                                        </div>
                                    </div>

                                    <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 bg-white/50">
                                        {(currentMissingItems.length > 0 || currentSigMissing) && (
                                            <div className="space-y-4">
                                                <h5 className="text-xs font-black uppercase tracking-[0.2em] text-red-500 flex items-center gap-2">
                                                    <span className="w-8 h-[2px] bg-red-500 rounded-full" />
                                                    Obrigatórios
                                                </h5>
                                                <div className="space-y-3 max-h-72 overflow-y-auto custom-scrollbar pr-3">
                                                    {currentMissingItems.map((item, i) => (
                                                        <div key={i} className="group bg-red-50/50 hover:bg-red-50 border border-red-100 p-4 rounded-2xl transition-all duration-300 hover:shadow-md">
                                                            <div className="flex items-start gap-3">
                                                                <div className="mt-1 text-red-400">
                                                                    <AlertCircle size={16} strokeWidth={3} />
                                                                </div>
                                                                <span className="text-sm font-bold text-red-900 leading-snug">
                                                                    <span className="uppercase text-[10px] tracking-widest opacity-60 block mb-0.5">{item.section}</span>
                                                                    {item.text}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {currentSigMissing && (
                                                        <div className="bg-red-500 text-white p-4 rounded-2xl shadow-lg shadow-red-500/20 flex items-center gap-3">
                                                            <CheckCircle size={18} />
                                                            <span className="font-bold text-sm tracking-wide">Assinatura do Gestor necessária</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {currentUnansweredItems.length > 0 && (
                                            <div className="space-y-4">
                                                <h5 className="text-xs font-black uppercase tracking-[0.2em] text-yellow-600 flex items-center gap-2">
                                                    <span className="w-8 h-[2px] bg-yellow-500 rounded-full" />
                                                    Atenção (Nota)
                                                </h5>
                                                <div className="space-y-3 max-h-72 overflow-y-auto custom-scrollbar pr-3">
                                                    {currentUnansweredItems.map((item, i) => (
                                                        <div key={i} className="group bg-yellow-50/50 hover:bg-yellow-50 border border-yellow-100 p-4 rounded-2xl transition-all duration-300 hover:shadow-md">
                                                            <div className="flex items-start gap-3">
                                                                <div className="mt-1 text-yellow-500">
                                                                    <HelpCircle size={16} strokeWidth={3} />
                                                                </div>
                                                                <span className="text-sm font-bold text-yellow-900 leading-snug">
                                                                    <span className="uppercase text-[10px] tracking-widest opacity-60 block mb-0.5">{item.section}</span>
                                                                    {item.text}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeChecklist.sections.map((section, sIdx) => {
                                const status = getSectionStatus(section);
                                return (
                                    <div
                                        key={section.id}
                                        className="bg-white/70 backdrop-blur-xl border border-white/40 rounded-[40px] shadow-card overflow-hidden transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 group"
                                        style={{ animationDelay: `${sIdx * 100}ms` }}
                                    >
                                        <div className={`px-10 py-7 border-b border-gray-100/50 bg-gradient-to-r from-white to-transparent flex justify-between items-center relative`}>
                                            <div className="flex items-center gap-4">
                                                <div className={`w-2 h-10 rounded-full bg-gradient-to-b ${currentTheme.bgGradient}`} />
                                                <h3 className={`font-black text-xl tracking-tight text-gray-900`}>
                                                    {section.title}
                                                </h3>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-3 bg-white/80 backdrop-blur shadow-inner-light px-5 py-2.5 rounded-2xl border border-gray-100">
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Progresso</span>
                                                        <span className="text-sm font-black text-gray-800">{status.answeredItems}/{status.totalItems}</span>
                                                    </div>

                                                    {status.scoreableItems > 0 && (
                                                        <div className="h-8 w-[1px] bg-gray-100 mx-1" />
                                                    )}

                                                    {status.scoreableItems > 0 && (
                                                        <div className="flex gap-1">
                                                            {[1, 2, 3, 4, 5].map(star => (
                                                                <Star
                                                                    key={star}
                                                                    size={16}
                                                                    fill={star <= Math.round(status.predictedScore || 0) ? "#facc15" : "none"}
                                                                    stroke={star <= Math.round(status.predictedScore || 0) ? "#facc15" : "#e2e8f0"}
                                                                    strokeWidth={3}
                                                                    className="transition-all duration-500 hover:scale-125"
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-10 space-y-10 bg-white/30">
                                            {section.items.map(item => {
                                                const value = getInputValue(item.id);
                                                const hasError = showErrors && item.required && !value;
                                                const isUnanswered = showErrors && item.type === InputType.BOOLEAN_PASS_FAIL && (value === '' || value === null || value === undefined);

                                                if (item.type === InputType.HEADER) {
                                                    return (
                                                        <div key={item.id} className="pt-6 relative group/header">
                                                            <h4 className="font-black text-gray-900 text-lg uppercase tracking-[0.2em] flex items-center gap-3">
                                                                <span className={`w-2 h-6 rounded-full bg-gradient-to-b ${currentTheme.bgGradient}`} />
                                                                {item.text}
                                                            </h4>
                                                            <div className="mt-2 h-[1px] w-full bg-gray-100 group-hover/header:bg-blue-100 transition-colors" />
                                                        </div>
                                                    );
                                                }
                                                if (item.type === InputType.INFO) {
                                                    return (
                                                        <div key={item.id} className="bg-blue-50/50 backdrop-blur-sm border border-blue-100 p-5 rounded-[24px] flex items-start gap-4 transition-all hover:bg-blue-50 group/info">
                                                            <div className="bg-white p-2.5 rounded-xl shadow-sm border border-blue-100 text-blue-500 group-hover/info:rotate-12 transition-transform">
                                                                <AlertCircle size={22} strokeWidth={2.5} />
                                                            </div>
                                                            <p className="text-sm font-bold text-blue-900/80 leading-relaxed pt-1 italic">{item.text}</p>
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div key={item.id} className="space-y-4 group/item">
                                                        <div className="flex justify-between items-center">
                                                            <label className={`block text-xs font-black uppercase tracking-widest transition-colors ${hasError ? 'text-red-500' : isUnanswered ? 'text-yellow-600' : 'text-gray-500 group-focus-within/item:text-gray-900 mt-2'}`}>
                                                                {item.text} {item.required && <span className="text-red-500 ml-1 font-black">*</span>}
                                                            </label>
                                                            {item.helpText && (
                                                                <div className="group/help relative">
                                                                    <div className="p-1.5 rounded-full bg-gray-50 text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-all cursor-help border border-gray-100 shadow-sm">
                                                                        <Info size={14} strokeWidth={3} />
                                                                    </div>
                                                                    <div className="absolute bottom-full right-0 mb-3 w-64 bg-gray-900 text-white text-[10px] font-bold p-3 rounded-2xl opacity-0 group-hover/help:opacity-100 transition-all pointer-events-none shadow-2xl z-20 leading-relaxed uppercase tracking-wider">
                                                                        {item.helpText}
                                                                        <div className="absolute top-full right-4 border-8 border-transparent border-t-gray-900" />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="relative">
                                                            {item.id === 'empresa' ? (
                                                                <select
                                                                    value={value as string || ''}
                                                                    onChange={(e) => {
                                                                        const selectedCompanyName = e.target.value;
                                                                        handleInputChange(item.id, selectedCompanyName);
                                                                        handleInputChange('filial', '');
                                                                        handleInputChange('area', '');
                                                                        const selectedCompany = companies.find((c: any) => c.name === selectedCompanyName);
                                                                        if (selectedCompany) {
                                                                            setSelectedCompanyId(selectedCompany.id);
                                                                            setEditCompanyName(selectedCompany.name);
                                                                            setEditCompanyCnpj(selectedCompany.cnpj || '');
                                                                            setEditCompanyPhone(selectedCompany.phone || '');
                                                                            setEditCompanyLogo(selectedCompany.logo || null);
                                                                            setEditCompanyAreas(selectedCompany.areas || []);
                                                                        }
                                                                    }}
                                                                    disabled={isReadOnly}
                                                                    className={`w-full bg-white border-2 ${hasError ? 'border-red-200 ring-4 ring-red-50' : isUnanswered ? 'border-yellow-200 ring-4 ring-yellow-50' : 'border-gray-100'} rounded-2xl p-4.5 font-bold text-gray-800 placeholder:text-gray-300 focus:bg-white focus:ring-4 ${currentTheme.ring} outline-none transition-all shadow-inner-light hover:border-gray-200 appearance-none`}
                                                                >
                                                                    <option value="">-- SELECIONE A EMPRESA --</option>
                                                                    {companies.map((company: any) => (
                                                                        <option key={company.id} value={company.name}>{company.name}</option>
                                                                    ))}
                                                                </select>
                                                            ) : item.id === 'filial' ? (
                                                                <select
                                                                    value={value as string || ''}
                                                                    onChange={(e) => {
                                                                        const selectedFilial = e.target.value;
                                                                        handleInputChange(item.id, selectedFilial);
                                                                        const empresaValue = getInputValue('empresa');
                                                                        const selectedCompany = companies.find((c: any) => c.name === empresaValue);
                                                                        if (selectedCompany && selectedCompany.areas) {
                                                                            const areaForFilial = selectedCompany.areas.find((area: any) =>
                                                                                area.branches && area.branches.includes(selectedFilial)
                                                                            );
                                                                            if (areaForFilial) {
                                                                                handleInputChange('area', areaForFilial.name);
                                                                            }
                                                                        }
                                                                    }}
                                                                    disabled={isReadOnly || !getInputValue('empresa')}
                                                                    className={`w-full bg-white border-2 ${hasError ? 'border-red-200 ring-4 ring-red-50' : isUnanswered ? 'border-yellow-200 ring-4 ring-yellow-50' : 'border-gray-100'} rounded-2xl p-4.5 font-bold text-gray-800 placeholder:text-gray-300 focus:bg-white focus:ring-4 ${currentTheme.ring} outline-none transition-all shadow-inner-light hover:border-gray-200 appearance-none ${isReadOnly || !getInputValue('empresa') ? 'opacity-50 cursor-not-allowed bg-gray-50/50' : ''}`}
                                                                >
                                                                    <option value="">-- SELECIONE A FILIAL --</option>
                                                                    {(() => {
                                                                        const empresaValue = getInputValue('empresa');
                                                                        const selectedCompany = companies.find((c: any) => c.name === empresaValue);
                                                                        if (selectedCompany && selectedCompany.areas) {
                                                                            const allBranches = selectedCompany.areas.flatMap((area: any) => area.branches || []);
                                                                            return allBranches.map((branch: string, idx: number) => (
                                                                                <option key={idx} value={branch}>{branch}</option>
                                                                            ));
                                                                        }
                                                                        return null;
                                                                    })()}
                                                                </select>
                                                            ) : item.id === 'area' ? (
                                                                <input
                                                                    type="text"
                                                                    value={value as string || ''}
                                                                    readOnly
                                                                    placeholder="Área automática ao selecionar filial"
                                                                    className="w-full border-2 border-gray-100 bg-gray-50/80 text-gray-500 font-bold rounded-2xl p-4.5 cursor-not-allowed shadow-inner-light tracking-wide"
                                                                />
                                                            ) : item.type === InputType.TEXT ? (
                                                                <input
                                                                    type="text"
                                                                    value={value as string || ''}
                                                                    onChange={(e) => handleInputChange(item.id, e.target.value)}
                                                                    disabled={isReadOnly}
                                                                    placeholder={`Preencha o campo ${item.text.toLowerCase()}...`}
                                                                    className={`w-full border-2 ${hasError ? 'border-red-200 ring-4 ring-red-50' : isUnanswered ? 'border-yellow-200 ring-4 ring-yellow-50' : 'border-gray-100'} bg-white rounded-2xl p-4.5 font-bold text-gray-800 placeholder:text-gray-300 focus:bg-white focus:ring-4 ${currentTheme.ring} outline-none transition-all shadow-inner-light hover:border-gray-200`}
                                                                />
                                                            ) : item.type === InputType.TEXTAREA ? (
                                                                <textarea
                                                                    value={value as string || ''}
                                                                    onChange={(e) => handleInputChange(item.id, e.target.value)}
                                                                    disabled={isReadOnly}
                                                                    rows={3}
                                                                    placeholder={`Detalhes ou observações sobre ${item.text.toLowerCase()}...`}
                                                                    className={`w-full border-2 ${hasError ? 'border-red-200 ring-4 ring-red-50' : isUnanswered ? 'border-yellow-200 ring-4 ring-yellow-50' : 'border-gray-100'} bg-white rounded-2xl p-4.5 font-bold text-gray-800 placeholder:text-gray-300 focus:bg-white focus:ring-4 ${currentTheme.ring} outline-none transition-all shadow-inner-light hover:border-gray-200 resize-none`}
                                                                />
                                                            ) : null}

                                                            {item.type === InputType.DATE && (
                                                                <DateInput value={value as string || ''} onChange={(val) => handleInputChange(item.id, val)} theme={currentTheme} hasError={hasError} disabled={isReadOnly} />
                                                            )}

                                                            {item.type === InputType.BOOLEAN_PASS_FAIL && (
                                                                <div className="flex gap-5">
                                                                    <button
                                                                        onClick={() => handleInputChange(item.id, 'pass')}
                                                                        disabled={isReadOnly}
                                                                        className={`flex-1 py-5 rounded-[24px] border-3 font-black text-xs md:text-sm tracking-[0.2em] uppercase transition-all duration-300 flex items-center justify-center gap-4 active:scale-95 shadow-sm group/btn ${value === 'pass'
                                                                            ? 'bg-green-500 text-white border-green-400 shadow-xl shadow-green-500/30'
                                                                            : 'bg-white text-gray-400 border-gray-100 hover:border-green-300 hover:text-green-600 hover:shadow-lg'
                                                                            } ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                    >
                                                                        <div className={`p-1.5 rounded-full transition-all duration-500 ${value === 'pass' ? 'bg-white text-green-500 scale-110 shadow-lg' : 'bg-gray-50 text-gray-300 group-hover/btn:bg-green-50 group-hover/btn:text-green-500'}`}>
                                                                            <Check size={18} strokeWidth={4} />
                                                                        </div>
                                                                        <span className="relative z-10">Conforme</span>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleInputChange(item.id, 'fail')}
                                                                        disabled={isReadOnly}
                                                                        className={`flex-1 py-5 rounded-[24px] border-3 font-black text-xs md:text-sm tracking-[0.2em] uppercase transition-all duration-300 flex items-center justify-center gap-4 active:scale-95 shadow-sm group/btn ${value === 'fail'
                                                                            ? 'bg-red-500 text-white border-red-400 shadow-xl shadow-red-500/30'
                                                                            : 'bg-white text-gray-400 border-gray-100 hover:border-red-300 hover:text-red-600 hover:shadow-lg'
                                                                            } ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                    >
                                                                        <div className={`p-1.5 rounded-full transition-all duration-500 ${value === 'fail' ? 'bg-white text-red-500 scale-110 shadow-lg' : 'bg-gray-50 text-gray-300 group-hover/btn:bg-red-50 group-hover/btn:text-red-500'}`}>
                                                                            <AlertTriangle size={18} strokeWidth={4} />
                                                                        </div>
                                                                        <span className="relative z-10">NÃO Conforme</span>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleInputChange(item.id, 'na')}
                                                                        disabled={isReadOnly}
                                                                        className={`w-24 md:w-32 py-5 rounded-[24px] border-3 font-black text-xs md:text-sm tracking-[0.2em] transition-all duration-300 active:scale-95 shadow-sm ${value === 'na'
                                                                            ? 'bg-gray-800 text-white border-gray-700 shadow-xl shadow-gray-900/30'
                                                                            : 'bg-white text-gray-400 border-gray-100 hover:border-gray-400 hover:text-gray-800 hover:shadow-lg'
                                                                            } ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                    >
                                                                        N/A
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* Image Upload Area (Modernized) */}
                                            {section.id !== 'info_basica' && (
                                                <div className="mt-14 pt-12 border-t border-gray-100/80">
                                                    <div className="flex items-center justify-between mb-10">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`p-3 rounded-2xl bg-gradient-to-br ${currentTheme.bgGradient} text-white shadow-xl shadow-blue-500/20`}>
                                                                <ImageIcon size={24} strokeWidth={2.5} />
                                                            </div>
                                                            <div>
                                                                <h4 className="font-black text-gray-900 uppercase tracking-widest text-base">Evidências Fotográficas</h4>
                                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-0.5">Capture e anexe provas visuais da seção</p>
                                                            </div>
                                                        </div>
                                                        <div className="bg-gray-50 border border-gray-100 px-4 py-2 rounded-2xl shadow-inner-light">
                                                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">
                                                                {(getDataSource(activeChecklistId).imgs[section.id] || []).length} / 10 Fotos
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
                                                        {(getDataSource(activeChecklistId).imgs[section.id] || []).map((img, idx) => (
                                                            <div key={idx} className="relative aspect-square rounded-[32px] overflow-hidden border-4 border-white shadow-2xl group/img ring-4 ring-gray-100/50">
                                                                <img src={img} className="w-full h-full object-cover transition-transform duration-1000 group-hover/img:scale-125" />
                                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                                                                    {!isReadOnly && (
                                                                        <button
                                                                            onClick={() => removeImage(section.id, idx)}
                                                                            className="bg-red-500 text-white rounded-2xl p-4 shadow-2xl transform translate-y-4 group-hover/img:translate-y-0 opacity-0 group-hover/img:opacity-100 transition-all duration-500 hover:bg-red-600 active:scale-90"
                                                                        >
                                                                            <Trash2 size={24} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur px-2 py-0.5 rounded-full shadow-sm">
                                                                    <span className="text-[8px] font-black text-gray-800">#{idx + 1}</span>
                                                                </div>
                                                            </div>
                                                        ))}

                                                        {!isReadOnly && (
                                                            <>
                                                                <label className="aspect-square flex flex-col items-center justify-center border-3 border-dashed border-gray-100 rounded-[32px] cursor-pointer hover:bg-white hover:border-blue-400 hover:text-blue-600 text-gray-300 transition-all duration-500 bg-gray-50/50 group/upload relative overflow-hidden active:scale-95 shadow-inner-light">
                                                                    <div className="bg-white p-4.5 rounded-[24px] shadow-xl border border-gray-50 group-hover/upload:scale-110 group-hover/upload:rotate-6 transition-all duration-500">
                                                                        <Camera size={32} strokeWidth={2.5} />
                                                                    </div>
                                                                    <span className="text-[10px] font-black mt-4 uppercase tracking-[0.3em] group-hover/upload:tracking-[0.4em] transition-all">Câmera</span>
                                                                    <input type="file" className="hidden" accept="image/*" capture="environment" onChange={(e) => handleImageUpload(section.id, e)} />
                                                                    <div className="absolute inset-x-0 bottom-0 h-1.5 bg-blue-500/10 opacity-0 group-hover/upload:opacity-100 transition-opacity" />
                                                                </label>

                                                                <label className="aspect-square flex flex-col items-center justify-center border-3 border-dashed border-gray-100 rounded-[32px] cursor-pointer hover:bg-white hover:border-indigo-400 hover:text-indigo-600 text-gray-300 transition-all duration-500 bg-gray-50/50 group/upload relative overflow-hidden active:scale-95 shadow-inner-light">
                                                                    <div className="bg-white p-4.5 rounded-[24px] shadow-xl border border-gray-50 group-hover/upload:scale-110 group-hover/upload:-rotate-6 transition-all duration-500">
                                                                        <Upload size={32} strokeWidth={2.5} />
                                                                    </div>
                                                                    <span className="text-[10px] font-black mt-4 uppercase tracking-[0.3em] group-hover/upload:tracking-[0.4em] transition-all">Galeria</span>
                                                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(section.id, e)} />
                                                                    <div className="absolute inset-x-0 bottom-0 h-1.5 bg-indigo-500/10 opacity-0 group-hover/upload:opacity-100 transition-opacity" />
                                                                </label>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Signatures Section - Premium Card */}
                            {!isReadOnly && (
                                <div className="bg-white/80 backdrop-blur-2xl border border-white/60 rounded-[48px] p-12 shadow-card relative overflow-hidden">
                                    <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${currentTheme.bgGradient} opacity-5 rounded-full -mr-32 -mt-32 blur-3xl`} />
                                    <div className="flex items-center gap-5 mb-12 relative z-10">
                                        <div className={`p-4 rounded-2xl ${currentTheme.lightBg} ${currentTheme.text} shadow-inner-light`}>
                                            <FileCheck size={32} strokeWidth={2.5} />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-gray-900 leading-tight tracking-tight uppercase tracking-widest">
                                                Validação do Checklist
                                            </h3>
                                            <p className="text-gray-500 font-bold mt-1">Capture as assinaturas digitais finais para oficializar este relatório.</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
                                        <div data-signature="gestor" className="group/sig shadow-xl p-2 rounded-[32px] bg-white/50 border border-white transition-all hover:shadow-2xl">
                                            <SignaturePad
                                                label="ASSINATURA DO GESTOR RESPONSÁVEL"
                                                onEnd={(data) => handleSignature('gestor', data)}
                                            />
                                        </div>
                                        <div data-signature="coordenador" className="group/sig shadow-xl p-2 rounded-[32px] bg-white/50 border border-white transition-all hover:shadow-2xl">
                                            <SignaturePad
                                                label="ASSINATURA COORDENADOR / APLICADOR"
                                                onEnd={(data) => handleSignature('coordenador', data)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Bottom Navigation (Modern Primary/Secondary Flow) */}
                            {!isReadOnly && (
                                <div className="flex flex-col md:flex-row items-center justify-between gap-8 pt-12 animate-fade-in-up">
                                    <button
                                        onClick={handleVerify}
                                        className="w-full md:w-auto px-12 py-6 rounded-[32px] font-black text-gray-600 bg-white border border-gray-100 hover:bg-gray-50 hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 flex items-center justify-center gap-4 group active:scale-95 shadow-xl"
                                    >
                                        <div className="p-2.5 bg-red-100 text-red-600 rounded-2xl group-hover:rotate-[15deg] transition-transform shadow-sm">
                                            <CheckSquareIcon size={22} strokeWidth={2.5} />
                                        </div>
                                        <span className="tracking-[0.1em]">VERIFICAR PENDÊNCIAS</span>
                                    </button>

                                    <div className="flex flex-col sm:flex-row gap-5 w-full md:w-auto">
                                        <button
                                            onClick={() => handleViewChange('summary')}
                                            className="px-10 py-6 rounded-[32px] font-black text-gray-500 bg-white/50 border border-white/60 backdrop-blur hover:bg-white hover:shadow-2xl hover:text-gray-800 transition-all duration-500 active:scale-95 tracking-wide"
                                        >
                                            PULAR PARA RESUMO
                                        </button>

                                        <button
                                            onClick={handleNextChecklist}
                                            className={`group px-14 py-6 rounded-[32px] text-white font-black text-xl transition-all duration-500 shadow-2xl hover:shadow-[0_20px_40px_rgba(34,197,94,0.3)] hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-5 relative overflow-hidden ${currentTheme.button}`}
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                            {checklists.findIndex(c => c.id === activeChecklistId) < checklists.length - 1 ? (
                                                <>
                                                    PRÓXIMO CHECKLIST
                                                    <div className="p-2 bg-white/20 rounded-xl group-hover:translate-x-2 transition-transform shadow-inner-light">
                                                        <ChevronRight size={24} strokeWidth={3} />
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    REVISAR E FINALIZAR
                                                    <div className="p-2 bg-white/20 rounded-xl group-hover:scale-125 group-hover:rotate-[10deg] transition-transform shadow-inner-light">
                                                        <CheckCircle size={24} strokeWidth={3} />
                                                    </div>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}


                    {/* --- SUMMARY VIEW --- */}
                    {currentView === 'summary' && (
                        <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-24">
                            {/* Summary Cards Grid */}
                            <div className="grid grid-cols-1 gap-8">
                                {checklists.map((cl, idx) => {
                                    const stats = getChecklistStats(cl.id);
                                    const isIgnored = ignoredChecklists.has(cl.id);
                                    const isComplete = isChecklistComplete(cl.id);
                                    const percentPassed = stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;
                                    const percentFailed = 100 - percentPassed;

                                    const isPerfect = stats.score === 5;
                                    const isGood = stats.score >= 4;
                                    const isBad = stats.score < 3;

                                    return (
                                        <div
                                            key={cl.id}
                                            className={`group relative overflow-hidden transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 ${isIgnored
                                                ? 'opacity-60 grayscale border-gray-200 bg-gray-50/50'
                                                : 'bg-white/80 backdrop-blur-xl border border-white/50 shadow-card rounded-[32px]'
                                                }`}
                                            style={{ animationDelay: `${idx * 100}ms` }}
                                        >
                                            {/* Top Theme Accent Bar */}
                                            {!isIgnored && (
                                                <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${currentTheme.bgGradient}`} />
                                            )}

                                            <div className="p-8 md:p-10">
                                                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-10">
                                                    <div className="flex-1 space-y-2">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2.5 rounded-2xl ${isIgnored ? 'bg-gray-200' : currentTheme.lightBg} transition-colors group-hover:scale-110 duration-500`}>
                                                                <FileCheck size={24} className={isIgnored ? 'text-gray-400' : currentTheme.text} />
                                                            </div>
                                                            <h3 className="font-black text-gray-800 text-2xl tracking-tight">
                                                                {cl.title}
                                                                {isComplete && !isIgnored && (
                                                                    <div className="inline-flex ml-3 align-middle bg-green-100 text-green-600 p-1 rounded-full animate-bounce-subtle">
                                                                        <CheckCircle size={20} fill="currentColor" className="text-white" />
                                                                    </div>
                                                                )}
                                                            </h3>
                                                        </div>
                                                        <p className="text-gray-500 font-medium leading-relaxed max-w-2xl">{cl.description}</p>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                                                        <button
                                                            onClick={() => toggleIgnoreChecklist(cl.id)}
                                                            className="flex-1 lg:flex-none px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 hover:bg-gray-100/50 transition-all border border-transparent hover:border-gray-200"
                                                        >
                                                            {isIgnored ? 'Incluir na Avaliação' : 'Não se Aplica'}
                                                        </button>
                                                        {!isIgnored && (
                                                            <button
                                                                onClick={() => { setActiveChecklistId(cl.id); handleViewChange('checklist'); }}
                                                                className={`flex-1 lg:flex-none px-8 py-3.5 rounded-2xl text-sm font-black transition-all shadow-lg hover:shadow-xl active:scale-95 flex items-center justify-center gap-2 ${isComplete
                                                                    ? 'bg-gray-800 text-white hover:bg-gray-900'
                                                                    : `${currentTheme.button} text-white`
                                                                    }`}
                                                            >
                                                                {isComplete ? 'Revisar Checklist' : 'Continuar Preenchimento'}
                                                                <ChevronRight size={18} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {!isIgnored && (
                                                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                                                        {/* Compliance Progress - Col 1-7 */}
                                                        <div className="xl:col-span-7 space-y-8">
                                                            <div className="relative pt-4">
                                                                <div className="flex justify-between items-end mb-4">
                                                                    <div>
                                                                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 block mb-1">Status de Conformidade</span>
                                                                        <div className="flex items-baseline gap-2">
                                                                            <span className={`text-4xl font-black ${percentPassed >= 90 ? 'text-green-600' : percentPassed >= 70 ? 'text-blue-600' : 'text-orange-600'}`}>
                                                                                {Math.round(percentPassed)}%
                                                                            </span>
                                                                            <span className="text-gray-400 font-bold text-sm">conforme</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <span className="text-lg font-black text-gray-800">{stats.passed}</span>
                                                                        <span className="text-xs font-bold text-gray-400 ml-1">/ {stats.total} itens</span>
                                                                    </div>
                                                                </div>

                                                                {/* Ultra Modern Progress Bar */}
                                                                <div className="h-6 w-full bg-gray-100/50 rounded-2xl overflow-hidden flex p-1 border border-gray-100 shadow-inner">
                                                                    <div
                                                                        style={{ width: `${percentPassed}%` }}
                                                                        className={`h-full rounded-xl transition-all duration-1000 ease-out shadow-lg relative overflow-hidden bg-gradient-to-r ${percentPassed >= 70 ? 'from-green-400 to-green-600' : 'from-orange-400 to-orange-600'}`}
                                                                    >
                                                                        <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:24px_24px] animate-shimmer" />
                                                                    </div>
                                                                    <div
                                                                        style={{ width: `${percentFailed}%` }}
                                                                        className="h-full bg-red-100/50 transition-all duration-1000 ease-out"
                                                                    ></div>
                                                                </div>
                                                            </div>

                                                            {/* Detailed Stats Grid */}
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                <div className="bg-green-50/50 p-6 rounded-[24px] border border-green-100/50 flex items-center gap-4 group/stat">
                                                                    <div className="p-3 bg-green-100 rounded-2xl text-green-600 transition-transform group-hover/stat:rotate-12">
                                                                        <ShieldCheck size={24} />
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-[10px] font-black uppercase tracking-widest text-green-600/70 mb-0.5">Itens Conformes</div>
                                                                        <div className="text-2xl font-black text-green-700">{stats.passed}</div>
                                                                    </div>
                                                                </div>

                                                                <div className={`p-6 rounded-[24px] border flex items-center gap-4 group/stat ${stats.failedItems.length > 0 ? 'bg-red-50/50 border-red-100/50' : 'bg-gray-50/50 border-gray-100/50'}`}>
                                                                    <div className={`p-3 rounded-2xl transition-transform group-hover/stat:rotate-12 ${stats.failedItems.length > 0 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                                                                        {stats.failedItems.length > 0 ? <AlertTriangle size={24} /> : <ThumbsUp size={24} />}
                                                                    </div>
                                                                    <div>
                                                                        <div className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${stats.failedItems.length > 0 ? 'text-red-600/70' : 'text-gray-400'}`}>Não Conformidades</div>
                                                                        <div className={`text-2xl font-black ${stats.failedItems.length > 0 ? 'text-red-700' : 'text-gray-400'}`}>{stats.failedItems.length}</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Score and Rank - Col 8-12 */}
                                                        <div className="xl:col-span-5 flex flex-col gap-6">
                                                            <div className="flex-1 bg-gray-50/30 rounded-[32px] border border-gray-200/50 p-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
                                                                {/* Decorative Background Icon */}
                                                                <Star size={120} className="absolute -bottom-6 -right-6 text-gray-200/20 rotate-12" />

                                                                <div className="relative z-10">
                                                                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 block mb-6">Desempenho Geral</span>

                                                                    <div className="flex flex-col items-center gap-2 mb-6">
                                                                        <div className="text-6xl font-black text-gray-900 leading-none tracking-tighter">
                                                                            {stats.score.toFixed(1)}
                                                                        </div>
                                                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">escala de 5.0</div>
                                                                    </div>

                                                                    <div className="flex gap-1.5 justify-center mb-6">
                                                                        {[1, 2, 3, 4, 5].map(star => (
                                                                            <div key={star} className="relative transition-transform duration-500 hover:scale-125">
                                                                                <Star
                                                                                    size={32}
                                                                                    className={`${isPerfect ? 'animate-bounce-subtle' : ''}`}
                                                                                    fill={star <= Math.round(stats.score) ? "#FBBF24" : "none"}
                                                                                    color={star <= Math.round(stats.score) ? "#FBBF24" : "#E5E7EB"}
                                                                                    strokeWidth={2.5}
                                                                                />
                                                                            </div>
                                                                        ))}
                                                                    </div>

                                                                    <div className="inline-flex items-center gap-2 bg-white px-5 py-2.5 rounded-2xl shadow-sm border border-gray-100">
                                                                        {isPerfect && <><span className="text-lg">🔥</span> <span className="text-xs font-black uppercase text-yellow-600">Excelência Absoluta</span></>}
                                                                        {isGood && !isPerfect && <><span className="text-lg">🏆</span> <span className="text-xs font-black uppercase text-blue-600">Alto Padrão</span></>}
                                                                        {!isGood && !isBad && <><span className="text-lg">📈</span> <span className="text-xs font-black uppercase text-orange-600">Em Evolução</span></>}
                                                                        {isBad && <><span className="text-lg">⚠️</span> <span className="text-xs font-black uppercase text-red-600">Atenção Crítica</span></>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Alerts / Missing Items */}
                                                {!isIgnored && stats.missingItems.length > 0 && (
                                                    <div className="mt-8 bg-amber-50/50 backdrop-blur-sm rounded-[24px] border border-amber-100 p-6 flex flex-col md:flex-row items-start gap-4">
                                                        <div className="p-3 bg-amber-100 rounded-2xl text-amber-600">
                                                            <AlertCircle size={24} />
                                                        </div>
                                                        <div className="flex-1">
                                                            <h4 className="font-black text-amber-900 text-sm uppercase tracking-wide mb-3">Itens Obrigatórios Pendentes</h4>
                                                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                                                                {stats.missingItems.map((miss, i) => (
                                                                    <li key={i} className="flex items-start gap-2 text-xs font-bold text-amber-800/80 leading-snug">
                                                                        <div className="mt-1 min-w-[8px] h-2 w-2 rounded-full bg-amber-400" />
                                                                        <span><span className="opacity-60">{miss.section}:</span> {miss.text}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Final Footer Result */}
                            <div className="relative mt-12 mb-8">
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 blur-3xl -z-10 rounded-full opacity-50" />
                                <div className="bg-slate-900 text-white rounded-[40px] shadow-2xl overflow-hidden border border-white/10">
                                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                                        <Trophy size={160} />
                                    </div>

                                    <div className="p-8 md:p-12">
                                        <div className="flex flex-col md:flex-row items-center justify-between gap-10">
                                            <div className="text-center md:text-left space-y-2">
                                                <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-none">Resultado Final</h2>
                                                <p className="text-slate-400 font-medium md:text-lg">Consolidado global de todos os checklists ativos</p>
                                                <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-6">
                                                    <div className="px-4 py-2 bg-white/10 rounded-full text-xs font-black uppercase tracking-widest border border-white/5">
                                                        {checklists.filter(c => !ignoredChecklists.has(c.id)).length} Módulos Ativos
                                                    </div>
                                                    <div className="px-4 py-2 bg-white/10 rounded-full text-xs font-black uppercase tracking-widest border border-white/5">
                                                        {checklists.filter(c => isChecklistComplete(c.id)).length} Completos
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-col items-center gap-1">
                                                <div className="text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-blue-300 drop-shadow-2xl">
                                                    {calculateGlobalScore()}
                                                </div>
                                                <div className="text-[11px] font-black uppercase tracking-[0.4em] text-blue-400/80">SCORE FINAL</div>
                                            </div>

                                            <div className="w-full md:w-auto">
                                                <button
                                                    onClick={handleFinalizeAndSave}
                                                    disabled={isSaving}
                                                    className={`group w-full md:w-auto px-10 py-6 rounded-[28px] text-white font-black text-xl shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-4 relative overflow-hidden ${isSaving
                                                        ? 'bg-slate-800'
                                                        : 'bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800'
                                                        }`}
                                                >
                                                    {isSaving ? (
                                                        <>
                                                            <Loader2 size={24} className="animate-spin" />
                                                            <span className="tracking-tight">PROCESSANDO...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="relative z-10">FINALIZAR RELATÓRIO</span>
                                                            <div className="relative z-10 p-2 bg-white/20 rounded-2xl group-hover:translate-x-1 transition-transform">
                                                                <ArrowRight size={24} />
                                                            </div>
                                                            {/* Shine Effect */}
                                                            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- ANÁLISE DE RESULTADOS VIEW (MASTER ONLY) --- */}
                    {currentView === 'analise_resultados' && currentUser?.role === 'MASTER' && (
                        <div className="max-w-[1800px] w-full mx-auto space-y-8 animate-fade-in pb-24 px-2 xl:px-8">
                            <div className="bg-white/80 backdrop-blur-xl border border-white/50 rounded-[32px] shadow-card p-10">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div>
                                        <h2 className="text-3xl font-black text-gray-900 tracking-tight leading-tight">Dashboard de Resultados</h2>
                                        <p className="text-gray-500 font-bold text-base mt-2">
                                            Módulo em Construção. Aqui você montará os painéis visuais conectando as Vendas Totais e Pedidos carregados.
                                        </p>
                                    </div>
                                    <div className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                        <LineChart size={14} />
                                        <span>BI Analítico</span>
                                    </div>
                                </div>
                            </div>
                            
                            <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-500" size={32} /></div>}>
                                <AnaliseDashboard currentUser={currentUser!} companies={companies} />
                            </Suspense>
                        </div>
                    )}

                    {/* --- DASHBOARD VIEW (BI EM CONSTRUÇÃO) --- */}
{/* --- DASHBOARD VIEW (BI EM CONSTRUÇÃO) --- */}
                    {currentView === 'dashboard' && (
                        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-24">
                            <div className="bg-white/80 backdrop-blur-xl border border-white/50 rounded-[32px] shadow-card p-10">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div>
                                        <h2 className="text-3xl font-black text-gray-900 tracking-tight leading-tight">BI em construção</h2>
                                        <p className="text-gray-500 font-bold text-base mt-2">
                                            Área preparada para widgets móveis (cards). Você poderá arrastar, redimensionar e montar painéis por loja.
                                        </p>
                                    </div>
                                    <div className="bg-blue-50 text-blue-600 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest">
                                        Radar ativo
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div className="sm:col-span-2 lg:col-span-3 bg-white border border-gray-100 rounded-[28px] p-6 shadow-sm space-y-5">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Auditoria de Estoque</p>
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-xl font-black text-gray-900">Resumo de Auditorias Abertas</h3>
                                                {dashboardCompletedAuditOverview.summary.openAudits > 0 && (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800 border border-green-200 uppercase tracking-widest">
                                                        {dashboardCompletedAuditOverview.summary.openAudits} concluída{dashboardCompletedAuditOverview.summary.openAudits !== 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <select
                                                    value={openAuditNumberFilter}
                                                    onChange={(e) => setOpenAuditNumberFilter(e.target.value)}
                                                    className="appearance-none bg-white border border-gray-200 text-gray-700 text-xs font-black uppercase tracking-widest rounded-xl px-4 py-2 pr-8 hover:bg-gray-50 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                                                >
                                                    <option value="all">Todas as auditorias</option>
                                                    {Array.from(new Set(dashboardAuditSessions.map(s => Number(s.audit_number || 0)).filter(n => n > 0)))
                                                        .sort((a, b) => a - b)
                                                        .map(num => (
                                                            <option key={num} value={String(num)}>Auditoria {num}</option>
                                                        ))
                                                    }
                                                </select>
                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-end gap-3">
                                            <span className="text-[10px] leading-none font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap text-right">
                                                {dashboardAuditsFetchedAt ? `Atualizado: ${formatFullDateTime(dashboardAuditsFetchedAt)}` : 'Aguardando carga'}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => void loadDashboardAuditSessions()}
                                                disabled={isLoadingDashboardAudits}
                                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-xs font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                <RefreshCw size={14} className={isLoadingDashboardAudits ? 'animate-spin' : ''} />
                                                {isLoadingDashboardAudits ? 'Atualizando' : 'Atualizar'}
                                            </button>
                                        </div>
                                    </div>

                                    {dashboardAuditsError && (
                                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                                            {dashboardAuditsError}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-3">
                                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Auditorias abertas</p>
                                            <p className="text-[1.65rem] leading-none font-black text-indigo-700 whitespace-nowrap tabular-nums">{dashboardAuditOverview.summary.openAudits}</p>
                                            <p className="text-[9px] font-bold text-indigo-500/80 leading-none">Inventários em andamento no momento</p>
                                        </div>
                                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Qtde conferida</p>
                                            <p className="text-[1.65rem] leading-none font-black text-emerald-700 whitespace-nowrap tabular-nums">{dashboardAuditOverview.summary.countedUnits.toLocaleString('pt-BR')}</p>
                                            <p className="text-[9px] font-bold text-emerald-600/80 leading-none">Unidades já conferidas no físico</p>
                                            <p className="text-[9px] font-bold text-emerald-600/80 leading-none">Falta conferir un.: {dashboardAuditOverview.summary.pendingUnits.toLocaleString('pt-BR')}</p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Qtde divergência</p>
                                            <p className={`text-[1.65rem] leading-none font-black whitespace-nowrap tabular-nums ${dashboardAuditOverview.summary.diffQty < 0 ? 'text-red-600' : dashboardAuditOverview.summary.diffQty > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                                {dashboardAuditOverview.summary.diffQty > 0 ? '+' : ''}{dashboardAuditOverview.summary.diffQty.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                            </p>
                                            <p className="text-[9px] font-bold text-slate-500/80 leading-none">Diferença líquida entre sistema e físico</p>
                                        </div>
                                        <div className="rounded-2xl border border-amber-100 bg-amber-50/50 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Falta conferir</p>
                                            <p className="text-[1.65rem] leading-none font-black text-amber-700 whitespace-nowrap tabular-nums">{dashboardAuditOverview.uniquePendingSkus.toLocaleString('pt-BR')}</p>
                                            <p className="text-[9px] font-bold text-amber-700/80 leading-none">SKU único pendente: {dashboardAuditOverview.uniquePendingSkus.toLocaleString('pt-BR')}</p>
                                            <p className="text-[9px] font-bold text-amber-700/80 leading-none">SKU único conferido: {dashboardAuditOverview.uniqueCountedSkus.toLocaleString('pt-BR')}</p>
                                        </div>
                                        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">% conferido acumulado</p>
                                            <p className="text-[1.65rem] leading-none font-black text-blue-700 whitespace-nowrap tabular-nums">{(dashboardAuditOverview.accumulatedPct === 100 ? "100" : dashboardAuditOverview.accumulatedPct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}%</p>
                                            <p className="text-[9px] font-bold text-blue-500/80 leading-none">Unidades conferidas / unidades previstas</p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Divergência R$</p>
                                            <p className={`text-[1.5rem] leading-none font-black whitespace-nowrap tabular-nums ${dashboardAuditOverview.summary.diffCost < 0 ? 'text-red-600' : dashboardAuditOverview.summary.diffCost > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                                {dashboardAuditOverview.summary.diffCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </p>
                                            <p className="text-[9px] font-bold text-slate-500/80 leading-none">Impacto financeiro total das divergências</p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total conferido R$</p>
                                            <p className="text-[1.5rem] leading-none font-black text-slate-700 whitespace-nowrap tabular-nums">
                                                {dashboardAuditOverview.summary.countedCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </p>
                                            <p className="text-[9px] font-bold text-slate-500/80 leading-none">Valor em custo do que já foi conferido</p>
                                            <p className="text-[9px] font-bold text-slate-500/80 leading-none">Falta conferir R$: {dashboardAuditOverview.summary.pendingCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rep. divergência</p>
                                            <p className={`text-[1.65rem] leading-none font-black whitespace-nowrap tabular-nums ${dashboardAuditOverview.summaryDivergencePct < 0 ? 'text-red-600' : dashboardAuditOverview.summaryDivergencePct > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                                {dashboardAuditOverview.summaryDivergencePct > 0 ? '+' : ''}{dashboardAuditOverview.summaryDivergencePct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                            </p>
                                            <p className="text-[9px] font-bold text-slate-500/80 leading-none">Divergência R$ sobre o total conferido</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                        <div className="rounded-2xl border border-gray-100 bg-white p-4">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Por Área</p>
                                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                                {dashboardAuditOverview.areas.length === 0 ? (
                                                    <p className="text-sm font-semibold text-gray-400">Sem auditorias abertas no momento.</p>
                                                ) : (
                                                    dashboardAuditOverview.areas.map(area => {
                                                        const pct = area.totalUnits > 0 ? (area.countedUnits / area.totalUnits) * 100 : 0;
                                                        const areaDivergencePct = area.countedCost > 0 ? (area.diffCost / area.countedCost) * 100 : 0;
                                                        return (
                                                            <div key={area.area} className="rounded-xl border border-gray-100 px-3 py-2">
                                                                <div className="flex items-center justify-between">
                                                                    <p className="text-sm font-black text-gray-800">{area.area}</p>
                                                                    <p className="text-[11px] font-bold text-gray-500">{area.branches} filial(is)</p>
                                                                </div>
                                                                <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] font-bold">
                                                                    <span className="text-emerald-600 whitespace-nowrap tabular-nums">{area.countedUnits.toLocaleString('pt-BR')} un. conferidas</span>
                                                                    <span className={`text-right ${area.diffQty < 0 ? 'text-red-600' : area.diffQty > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                                        {area.diffQty > 0 ? '+' : ''}{area.diffQty.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} un.
                                                                    </span>
                                                                    <span className="text-slate-600 whitespace-nowrap tabular-nums">{area.countedCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                                                    <span className={`text-right ${area.diffCost < 0 ? 'text-red-600' : area.diffCost > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                                        {area.diffCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                    </span>
                                                                    <span className="text-slate-500">Rep. divergência</span>
                                                                    <span className={`text-right whitespace-nowrap tabular-nums ${areaDivergencePct < 0 ? 'text-red-600' : areaDivergencePct > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                                        {areaDivergencePct > 0 ? '+' : ''}{areaDivergencePct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                                                    </span>
                                                                </div>
                                                                <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                                                                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                                                                </div>
                                                                <p className="mt-1 text-[10px] font-black text-indigo-500 uppercase tracking-widest text-right">
                                                                    {(pct === 100 ? "100" : pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}%
                                                                </p>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-gray-100 bg-white p-4">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Por Filial</p>
                                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                                {dashboardAuditOverview.branches.length === 0 ? (
                                                    <p className="text-sm font-semibold text-gray-400">Nenhuma filial com auditoria aberta.</p>
                                                ) : (
                                                    dashboardAuditOverview.branches.map(branch => (
                                                        <button
                                                            key={`${branch.branch}_${branch.auditNumber}`}
                                                            type="button"
                                                            onClick={() => handleOpenAuditFromDashboardBranch(branch.branch)}
                                                            className="w-full text-left rounded-xl border border-gray-100 px-3 py-2 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors"
                                                            title={`Abrir Auditoria da ${branch.branch}`}
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <p className="text-sm font-black text-gray-800">{branch.branch}</p>
                                                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Inv. {branch.auditNumber}</span>
                                                            </div>
                                                            <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] font-bold">
                                                                <span className="text-gray-600 whitespace-nowrap tabular-nums">{branch.countedUnits.toLocaleString('pt-BR')} un. conferidas</span>
                                                                <span className={`text-right ${branch.diffQty < 0 ? 'text-red-600' : branch.diffQty > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                                    {branch.diffQty > 0 ? '+' : ''}{branch.diffQty.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} un.
                                                                </span>
                                                                <span className="text-gray-500">{branch.area}</span>
                                                                <span className={`text-right whitespace-nowrap tabular-nums ${branch.diffCost < 0 ? 'text-red-600' : branch.diffCost > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                                    {branch.diffCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                </span>
                                                                <span className="text-slate-600 whitespace-nowrap tabular-nums">{branch.countedCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                                                <span className={`text-right whitespace-nowrap tabular-nums ${branch.divergencePct < 0 ? 'text-red-600' : branch.divergencePct > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                                    {branch.divergencePct > 0 ? '+' : ''}{branch.divergencePct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                                                </span>
                                                            </div>
                                                            <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                                                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, branch.progressPct))}%` }} />
                                                            </div>
                                                            <p className="mt-1 text-[10px] font-black text-emerald-600 uppercase tracking-widest text-right">
                                                                {(branch.progressPct === 100 ? "100" : branch.progressPct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}%
                                                            </p>
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="sm:col-span-2 lg:col-span-3 bg-white border border-gray-100 rounded-[28px] p-6 shadow-sm space-y-5">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Auditoria de Estoque</p>
                                            <h3 className="text-xl font-black text-gray-900">Resumo de Auditorias Concluídas</h3>
                                        </div>
                                        <div className="flex items-center justify-end gap-3">
                                            <select value={completedAuditNumberFilter} onChange={e => setCompletedAuditNumberFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                                <option value="all">Todas as auditorias</option>
                                                {Array.from(new Set(dashboardCompletedAuditSessions.map(s => String(s.audit_number || 0)))).sort((a,b)=>Number(b)-Number(a)).map(num => (<option key={num} value={num}>Auditoria {num}</option>))}
                                            </select>
                                            <span className="text-[10px] leading-none font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap text-right">
                                                {completedDashboardAuditsFetchedAt ? `Atualizado: ${formatFullDateTime(completedDashboardAuditsFetchedAt)}` : 'Aguardando carga'}
                                            </span>
                                        </div>
                                    </div>

                                    {completedDashboardAuditsError && (
                                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                                            {completedDashboardAuditsError}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-3">
                                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Auditorias concluídas</p>
                                            <p className="text-[1.65rem] leading-none font-black text-indigo-700 whitespace-nowrap tabular-nums">{dashboardCompletedAuditOverview.summary.openAudits}</p>
                                            <p className="text-[9px] font-bold text-indigo-500/80 leading-none">Inventários concluídos com sucesso</p>
                                        </div>
                                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Qtde conferida</p>
                                            <p className="text-[1.65rem] leading-none font-black text-emerald-700 whitespace-nowrap tabular-nums">{dashboardCompletedAuditOverview.summary.countedUnits.toLocaleString('pt-BR')}</p>
                                            <p className="text-[9px] font-bold text-emerald-600/80 leading-none">Unidades já conferidas no físico</p>
                                            <p className="text-[9px] font-bold text-emerald-600/80 leading-none">Falta conferir un.: {dashboardCompletedAuditOverview.summary.pendingUnits.toLocaleString('pt-BR')}</p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Qtde divergência</p>
                                            <p className={`text-[1.65rem] leading-none font-black whitespace-nowrap tabular-nums ${dashboardCompletedAuditOverview.summary.diffQty < 0 ? 'text-red-600' : dashboardCompletedAuditOverview.summary.diffQty > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                                {dashboardCompletedAuditOverview.summary.diffQty > 0 ? '+' : ''}{dashboardCompletedAuditOverview.summary.diffQty.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                            </p>
                                            <p className="text-[9px] font-bold text-slate-500/80 leading-none">Diferença líquida entre sistema e físico</p>
                                        </div>
                                        <div className="rounded-2xl border border-amber-100 bg-amber-50/50 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Falta conferir</p>
                                            <p className="text-[1.65rem] leading-none font-black text-amber-700 whitespace-nowrap tabular-nums">{dashboardCompletedAuditOverview.uniquePendingSkus.toLocaleString('pt-BR')}</p>
                                            <p className="text-[9px] font-bold text-amber-700/80 leading-none">SKU único pendente: {dashboardCompletedAuditOverview.uniquePendingSkus.toLocaleString('pt-BR')}</p>
                                            <p className="text-[9px] font-bold text-amber-700/80 leading-none">SKU único conferido: {dashboardCompletedAuditOverview.uniqueCountedSkus.toLocaleString('pt-BR')}</p>
                                        </div>
                                        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">% conferido acumulado</p>
                                            <p className="text-[1.65rem] leading-none font-black text-blue-700 whitespace-nowrap tabular-nums">{(dashboardCompletedAuditOverview.accumulatedPct === 100 ? "100" : dashboardCompletedAuditOverview.accumulatedPct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}%</p>
                                            <p className="text-[9px] font-bold text-blue-500/80 leading-none">Unidades conferidas / unidades previstas</p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Divergência R$</p>
                                            <p className={`text-[1.5rem] leading-none font-black whitespace-nowrap tabular-nums ${dashboardCompletedAuditOverview.summary.diffCost < 0 ? 'text-red-600' : dashboardCompletedAuditOverview.summary.diffCost > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                                {dashboardCompletedAuditOverview.summary.diffCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </p>
                                            <p className="text-[9px] font-bold text-slate-500/80 leading-none">Impacto financeiro total das divergências</p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total conferido R$</p>
                                            <p className="text-[1.5rem] leading-none font-black text-slate-700 whitespace-nowrap tabular-nums">
                                                {dashboardCompletedAuditOverview.summary.countedCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </p>
                                            <p className="text-[9px] font-bold text-slate-500/80 leading-none">Valor em custo do que já foi conferido</p>
                                            <p className="text-[9px] font-bold text-slate-500/80 leading-none">Falta conferir R$: {dashboardCompletedAuditOverview.summary.pendingCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 h-36 min-w-0 flex flex-col items-center justify-center text-center gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rep. divergência</p>
                                            <p className={`text-[1.65rem] leading-none font-black whitespace-nowrap tabular-nums ${dashboardCompletedAuditOverview.summaryDivergencePct < 0 ? 'text-red-600' : dashboardCompletedAuditOverview.summaryDivergencePct > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                                {dashboardCompletedAuditOverview.summaryDivergencePct > 0 ? '+' : ''}{dashboardCompletedAuditOverview.summaryDivergencePct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                            </p>
                                            <p className="text-[9px] font-bold text-slate-500/80 leading-none">Divergência R$ sobre o total conferido</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                        <div className="rounded-2xl border border-gray-100 bg-white p-4">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Por Área</p>
                                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                                {dashboardCompletedAuditOverview.areas.length === 0 ? (
                                                    <p className="text-sm font-semibold text-gray-400">Nenhuma filial com auditoria concluída.</p>
                                                ) : (
                                                    dashboardCompletedAuditOverview.areas.map(area => {
                                                        const pct = area.totalUnits > 0 ? (area.countedUnits / area.totalUnits) * 100 : 0;
                                                        const areaDivergencePct = area.countedCost > 0 ? (area.diffCost / area.countedCost) * 100 : 0;
                                                        return (
                                                            <div key={area.area} className="rounded-xl border border-gray-100 px-3 py-2">
                                                                <div className="flex items-center justify-between">
                                                                    <p className="text-sm font-black text-gray-800">{area.area}</p>
                                                                    <p className="text-[11px] font-bold text-gray-500">{area.branches} filial(is)</p>
                                                                </div>
                                                                <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] font-bold">
                                                                    <span className="text-emerald-600 whitespace-nowrap tabular-nums">{area.countedUnits.toLocaleString('pt-BR')} un. conferidas</span>
                                                                    <span className={`text-right ${area.diffQty < 0 ? 'text-red-600' : area.diffQty > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                                        {area.diffQty > 0 ? '+' : ''}{area.diffQty.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} un.
                                                                    </span>
                                                                    <span className="text-slate-600 whitespace-nowrap tabular-nums">{area.countedCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                                                    <span className={`text-right ${area.diffCost < 0 ? 'text-red-600' : area.diffCost > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                                        {area.diffCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                    </span>
                                                                    <span className="text-slate-500">Rep. divergência</span>
                                                                    <span className={`text-right whitespace-nowrap tabular-nums ${areaDivergencePct < 0 ? 'text-red-600' : areaDivergencePct > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                                        {areaDivergencePct > 0 ? '+' : ''}{areaDivergencePct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                                                    </span>
                                                                </div>
                                                                <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                                                                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                                                                </div>
                                                                <p className="mt-1 text-[10px] font-black text-indigo-500 uppercase tracking-widest text-right">
                                                                    {(pct === 100 ? "100" : pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}%
                                                                </p>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-gray-100 bg-white p-4">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Por Filial</p>
                                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                                {dashboardCompletedAuditOverview.branches.length === 0 ? (
                                                    <p className="text-sm font-semibold text-gray-400">Nenhuma filial com auditoria concluída.</p>
                                                ) : (
                                                    dashboardCompletedAuditOverview.branches.map(branch => (
                                                        <button
                                                            key={`${branch.branch}_${branch.auditNumber}`}
                                                            type="button"
                                                            onClick={() => handleOpenAuditFromDashboardBranch(branch.branch)}
                                                            className="w-full text-left rounded-xl border border-gray-100 px-3 py-2 bg-gray-50/50 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors"
                                                            title={`Abrir Auditoria da ${branch.branch} concluída`}
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <p className="text-sm font-black text-gray-800">{branch.branch}</p>
                                                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Inv. {branch.auditNumber}</span>
                                                            </div>
                                                            <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] font-bold">
                                                                <span className="text-gray-600 whitespace-nowrap tabular-nums">{branch.countedUnits.toLocaleString('pt-BR')} un. conferidas</span>
                                                                <span className={`text-right ${branch.diffQty < 0 ? 'text-red-600' : branch.diffQty > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                                    {branch.diffQty > 0 ? '+' : ''}{branch.diffQty.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} un.
                                                                </span>
                                                                <span className="text-gray-500">{branch.area}</span>
                                                                <span className={`text-right whitespace-nowrap tabular-nums ${branch.diffCost < 0 ? 'text-red-600' : branch.diffCost > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                                    {branch.diffCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                </span>
                                                                <span className="text-slate-600 whitespace-nowrap tabular-nums">{branch.countedCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                                                <span className={`text-right whitespace-nowrap tabular-nums ${branch.divergencePct < 0 ? 'text-red-600' : branch.divergencePct > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                                    {branch.divergencePct > 0 ? '+' : ''}{branch.divergencePct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                                                </span>
                                                            </div>
                                                            <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                                                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, branch.progressPct))}%` }} />
                                                            </div>
                                                            <p className="mt-1 text-[10px] font-black text-emerald-600 uppercase tracking-widest text-right">
                                                                {(branch.progressPct === 100 ? "100" : branch.progressPct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}%
                                                            </p>
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {Array.from({ length: 5 }).map((_, idx) => (
                                    <div
                                        key={`bi-placeholder-${idx}`}
                                        className="bg-white/60 border border-dashed border-gray-200 rounded-[28px] h-44 flex flex-col items-center justify-center text-gray-400 font-bold text-sm uppercase tracking-widest"
                                    >
                                        Widget {idx + 2}
                                        <span className="text-[10px] font-black text-gray-300 mt-2">Arraste aqui</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}


                    {/* --- REPORT / HISTORY VIEW (READ ONLY) --- */}
                    {(currentView === 'report' || currentView === 'view_history') && (
                        <div className="max-w-5xl mx-auto bg-white/80 backdrop-blur-2xl p-10 md:p-16 shadow-2xl rounded-[48px] border border-white/60 animate-fade-in mb-24 relative overflow-hidden">
                            {/* Decorative Background Elements */}
                            <div className={`absolute top-0 right-0 w-96 h-96 bg-gradient-to-br ${currentTheme.bgGradient} opacity-5 rounded-full -mr-48 -mt-48 blur-3xl p-print-hidden`} />
                            {currentView === 'view_history' && (
                                <div className="absolute top-6 right-6 z-20 no-print">
                                    <button
                                        onClick={handleCloseReport}
                                        className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 shadow-sm transition hover:bg-gray-50 hover:text-blue-700"
                                        title="Voltar para Histórico de Checklists (Esc)"
                                    >
                                        <ArrowLeft size={16} />
                                        Voltar para Histórico
                                    </button>
                                </div>
                            )}

                            <div className="relative z-10">
                                <LogoPrint config={displayConfig} theme={currentTheme} />

                                {/* Basic Info Block (Premium Card) */}
                                <div className="mb-12 mt-10 bg-white/50 border border-white rounded-3xl p-8 shadow-sm">
                                    <h3 className={`text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-3 ${currentTheme.text}`}>
                                        <div className={`w-8 h-1 rounded-full bg-gradient-to-r ${currentTheme.bgGradient}`} />
                                        Informações Básicas
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Empresa Avaliada</p>
                                            <p className="text-xl font-black text-gray-800 flex items-center gap-2">
                                                <Building2 size={18} className="text-blue-500" />
                                                {viewHistoryItem?.empresa_avaliada || getInputValue('empresa', basicInfoSourceChecklist) || 'Sem Empresa'}
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Área / Setor</p>
                                            <p className="text-xl font-bold text-gray-800">
                                                {viewHistoryItem?.area || getInputValue('area', basicInfoSourceChecklist) || 'N/A'}
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Filial</p>
                                            <p className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                                <Store size={18} className="text-indigo-500" />
                                                {viewHistoryItem?.filial || getInputValue('filial', basicInfoSourceChecklist) || 'Sem Filial'}
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Coordenador / Aplicador</p>
                                            <p className="text-lg font-bold text-gray-700">
                                                {getInputValue('nome_coordenador', basicInfoSourceChecklist) || '-'}
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Gestor(a) Responsável</p>
                                            <p className="text-lg font-bold text-gray-700">
                                                {viewHistoryItem?.gestor || getInputValue('gestor', basicInfoSourceChecklist) || 'N/A'}
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data de Aplicação</p>
                                            <p className="text-lg font-extrabold text-blue-600">
                                                {getInputValue('data_aplicacao', basicInfoSourceChecklist) || '-'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                                    <div className="bg-white/40 border border-white rounded-[32px] p-6 flex flex-col justify-center">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <UserCircle size={14} /> Responsável Logado no Sistema
                                        </p>
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${currentTheme.bgGradient} flex items-center justify-center text-white font-black text-xl shadow-lg`}>
                                                {(viewHistoryItem ? viewHistoryItem.userName : currentUser.name).charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-lg font-black text-gray-800 leading-tight">{viewHistoryItem ? viewHistoryItem.userName : currentUser.name}</p>
                                                <p className="text-xs font-bold text-gray-500">{viewHistoryItem ? viewHistoryItem.userEmail : currentUser.email}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white/40 border border-white rounded-[32px] p-6 text-right flex flex-col justify-center">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center justify-end gap-2">
                                            <Calendar size={14} /> Data do Relatório Oficial
                                        </p>
                                        <p className="text-2xl font-black text-gray-900 tracking-tight leading-none">
                                            {new Date(viewHistoryItem ? viewHistoryItem.date : new Date().toISOString()).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                        </p>
                                        <p className="text-sm font-bold text-blue-500 mt-1">
                                            às {new Date(viewHistoryItem ? viewHistoryItem.date : new Date().toISOString()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>

                                {/* Score Feedback Container (Premium Glass) */}
                                {(() => {
                                    const scoreNum = Number(viewHistoryItem ? viewHistoryItem.score : calculateGlobalScore());
                                    const feedback = getScoreFeedback(scoreNum);

                                    return (
                                        <div className="relative group mb-12">
                                            <div className={`absolute inset-0 bg-gradient-to-br ${currentTheme.bgGradient} opacity-10 blur-2xl rounded-[48px] -z-10 transition-all duration-700 group-hover:opacity-20`} />
                                            <div className="bg-white/70 backdrop-blur-xl rounded-[40px] border border-white p-10 flex flex-col items-center text-center shadow-card relative overflow-hidden">
                                                <div className="absolute top-0 right-0 p-6 opacity-5 rotate-12">
                                                    <Trophy size={140} />
                                                </div>

                                                <span className="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">Nota Global de Conformidade</span>

                                                <div className="flex items-center gap-6 mb-4">
                                                    <div className="p-5 bg-white rounded-[24px] shadow-xl border border-gray-100 transform -rotate-3 transition-transform group-hover:rotate-0 duration-500">
                                                        {feedback.icon}
                                                    </div>
                                                    <div className="flex flex-col items-start leading-none">
                                                        <span className={`text-7xl font-black tracking-tighter ${feedback.color}`}>{scoreNum.toFixed(1)}</span>
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">de 5.0 pontos</span>
                                                    </div>
                                                </div>

                                                <div className={`px-8 py-3 rounded-2xl text-sm font-black uppercase tracking-widest shadow-lg ${feedback.bg} ${feedback.color} border border-white/20 mb-4 animate-bounce-subtle`}>
                                                    {feedback.label}
                                                </div>

                                                {scoreNum >= 3.0 && <p className="text-lg font-bold text-gray-600 max-w-lg mt-2 italic">"{feedback.msg}"</p>}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Checklist Sections (Modern Cards) */}
                                <div className="space-y-12">
                                    {checklists.map(cl => {
                                        const isIgnored = viewHistoryItem ? viewHistoryItem.ignoredChecklists.includes(cl.id) : ignoredChecklists.has(cl.id);
                                        if (isIgnored) return null;

                                        return (
                                            <div key={cl.id} className="break-inside-avoid">
                                                <div className="flex items-center gap-4 mb-6">
                                                    <div className={`h-10 w-2.5 rounded-full bg-gradient-to-b ${currentTheme.bgGradient}`} />
                                                    <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight">{cl.title}</h3>
                                                </div>

                                                <div className="grid grid-cols-1 gap-6">
                                                    {cl.sections.map(sec => {
                                                        if (sec.id === 'info_basica') return null;

                                                        return (
                                                            <div key={sec.id} className="bg-white/50 border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow group/section">
                                                                <h4 className="font-black text-blue-900 border-b border-gray-100 pb-3 mb-5 uppercase text-xs tracking-[0.2em] flex items-center justify-between">
                                                                    {sec.title}
                                                                    <div className="h-1 w-12 bg-blue-100 rounded-full" />
                                                                </h4>

                                                                <div className="space-y-4">
                                                                    {sec.items.map(item => {
                                                                        const val = getInputValue(item.id, cl.id);
                                                                        if (item.type === InputType.HEADER) return <h5 key={item.id} className="font-black text-gray-800 mt-8 mb-4 border-l-4 border-blue-500 pl-4 py-1 text-sm">{item.text}</h5>;
                                                                        if (item.type === InputType.INFO) return null;
                                                                        if (item.type === InputType.TEXTAREA) {
                                                                            return (
                                                                                <div key={item.id} className="py-3 border-b border-gray-50/50 group-hover/section:border-blue-50 transition-colors">
                                                                                    <span className="block text-sm font-bold text-gray-600 leading-relaxed mb-2">{item.text}</span>
                                                                                    <div className="w-full rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm font-semibold text-gray-800 whitespace-pre-wrap break-words leading-relaxed shadow-sm min-h-[56px]">
                                                                                        {String(val || '-')}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        }

                                                                        return (
                                                                            <div key={item.id} className="flex justify-between items-start gap-6 py-3 border-b border-gray-50/50 group-hover/section:border-blue-50 transition-colors">
                                                                                <span className="text-sm font-bold text-gray-600 leading-relaxed w-full">{item.text}</span>
                                                                                <div className="min-w-fit flex items-center">
                                                                                    {item.type === InputType.BOOLEAN_PASS_FAIL ? (
                                                                                        val === 'pass' ? <span className="px-4 py-1.5 bg-green-100 text-green-700 rounded-full text-[10px] font-black shadow-sm ring-4 ring-green-500/5">CONFORME</span> :
                                                                                            val === 'fail' ? <span className="px-4 py-1.5 bg-red-100 text-red-700 rounded-full text-[10px] font-black shadow-sm ring-4 ring-red-500/5">NÃO CONFORME</span> :
                                                                                                val === 'na' ? <span className="px-4 py-1.5 bg-gray-100 text-gray-400 rounded-full text-[10px] font-black">N/A</span> : <span className="text-gray-300">-</span>
                                                                                    ) : (
                                                                                        <span className="text-sm font-black text-gray-800 bg-white px-3 py-1 rounded-lg border border-gray-100 shadow-sm">{val || '-'}</span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>

                                                                {/* Images in Section with Premium Layout */}
                                                                {(() => {
                                                                    const sectionImages = getDataSource(cl.id).imgs[sec.id] || [];
                                                                    if (sectionImages.length === 0) return null;

                                                                    return (
                                                                        <div className="mt-8">
                                                                            <div className="flex items-center justify-between mb-3">
                                                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Anexos / Evidências</span>
                                                                                <span className="text-[10px] font-bold text-gray-400">Clique para abrir em tamanho original</span>
                                                                            </div>
                                                                            <div className="grid grid-cols-2 gap-4">
                                                                                {sectionImages.map((img, idx) => (
                                                                                    <a
                                                                                        key={idx}
                                                                                        href={img}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        title={`Abrir evidência ${idx + 1} em tamanho original`}
                                                                                        className="report-image-container relative aspect-video rounded-[24px] overflow-hidden border-2 border-white shadow-lg group/img block"
                                                                                    >
                                                                                        <img src={img} alt={`Evidência ${idx + 1}`} className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-700" />
                                                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity p-4 flex flex-end items-end no-print">
                                                                                            <span className="text-white font-black text-[10px] tracking-widest uppercase">Evidência #{idx + 1}</span>
                                                                                        </div>
                                                                                    </a>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        )
                                                    })}
                                                </div>

                                                {/* Final Signatures (Premium Cards) */}
                                                <div className="mt-12 flex flex-wrap justify-end gap-6 p-print-hidden">
                                                    {getDataSource(cl.id).sigs['gestor'] && (
                                                        <div className="bg-white/60 p-6 rounded-[32px] border border-white shadow-sm flex flex-col items-center">
                                                            <div className="bg-white p-2 rounded-2xl mb-3 shadow-inner border border-gray-50">
                                                                <img src={getDataSource(cl.id).sigs['gestor']} className="h-24 max-w-[200px] object-contain" />
                                                            </div>
                                                            <div className="text-center">
                                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-0.5">Assinatura Digital</p>
                                                                <p className="text-xs font-black text-gray-800 uppercase">Gestor Responsável</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {getDataSource(cl.id).sigs['coordenador'] && (
                                                        <div className="bg-white/60 p-6 rounded-[32px] border border-white shadow-sm flex flex-col items-center">
                                                            <div className="bg-white p-2 rounded-2xl mb-3 shadow-inner border border-gray-50">
                                                                <img src={getDataSource(cl.id).sigs['coordenador']} className="h-24 max-w-[200px] object-contain" />
                                                            </div>
                                                            <div className="text-center">
                                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-0.5">Assinatura Digital</p>
                                                                <p className="text-xs font-black text-gray-800 uppercase">Coordenador / Aplicador</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-16 flex justify-center no-print">
                                    <button
                                        onClick={handleDownloadPDF}
                                        className={`group flex items-center gap-4 bg-gray-900 text-white px-12 py-6 rounded-[32px] font-black text-xl transition-all duration-500 shadow-2xl hover:-translate-y-1 hover:shadow-gray-400/30 active:scale-95 relative overflow-hidden`}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <div className="relative z-10 p-2.5 bg-white/10 rounded-2xl group-hover:rotate-6 transition-transform">
                                            <Download size={24} />
                                        </div>
                                        <span className="relative z-10 tracking-tight">EXPORTAR PDF PREMIUM</span>
                                        {/* Shine Effect */}
                                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}


                    {/* --- HISTORY LIST VIEW --- */}
                    {currentView === 'history' && (
                        <div className="max-w-6xl mx-auto flex flex-col gap-10 animate-fade-in pb-24">
                            <div className="flex items-center gap-3 justify-end">
                                {lastHistoryCacheAt && !isReloadingReports && (
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                        sincronizado {Math.floor((Date.now() - lastHistoryCacheAt.getTime()) / 60000) === 0
                                            ? 'agora mesmo'
                                            : `há ${Math.floor((Date.now() - lastHistoryCacheAt.getTime()) / 60000)} min`}
                                    </span>
                                )}
                                <button
                                    onClick={handleReloadReports}
                                    disabled={isReloadingReports}
                                    className={`relative group flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-black text-sm transition-all active:scale-95 shadow-lg overflow-hidden ${isReloadingReports
                                        ? 'bg-gray-100 text-gray-400 cursor-wait'
                                        : 'bg-white hover:bg-gray-50 text-gray-800 border-2 border-gray-100'
                                        }`}
                                >
                                    {isReloadingReports ? (
                                        <Loader2 size={20} className="animate-spin" />
                                    ) : (
                                        <RefreshCw size={20} className="group-hover:rotate-180 transition-transform duration-700" />
                                    )}
                                    <span className="relative z-10">{isReloadingReports ? 'VERIFICANDO...' : 'VERIFICAR ATUALIZAÇÕES'}</span>
                                    {!isReloadingReports && (
                                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    )}
                                </button>
                            </div>
                            {/* Main History Header Card */}
                            <div className="order-2 bg-white/80 backdrop-blur-xl border border-white/50 rounded-[40px] shadow-card overflow-hidden relative">
                                <div className={`h-1.5 w-full bg-gradient-to-r ${currentTheme.bgGradient}`} />
                                <div className="p-8 md:p-12">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                                        <div className="flex items-center gap-6">
                                            <div className={`p-5 rounded-[24px] ${currentTheme.lightBg} ${currentTheme.text} shadow-inner-light transition-transform hover:scale-105 duration-500`}>
                                                <History size={36} strokeWidth={2.5} />
                                            </div>
                                            <div>
                                                <h2 className="text-3xl font-black text-gray-900 tracking-tight leading-tight">Histórico de Checklists</h2>
                                                <p className="text-gray-500 font-bold text-lg">Gerenciamento centralizado de relatórios e desempenho</p>
                                            </div>
                                        </div>

                                    </div>

                                    {/* Advanced Filters Bar */}
                                    <div className="bg-gray-50/40 backdrop-blur-sm p-8 rounded-[32px] border border-gray-100 mb-10">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Buscar por Empresa</label>
                                                <div className="relative group">
                                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                                                    <input
                                                        type="text"
                                                        placeholder="Digite o nome da empresa..."
                                                        value={historySearch}
                                                        onChange={(e) => setHistorySearch(e.target.value)}
                                                        className="w-full bg-white border border-gray-200 rounded-2xl pl-12 pr-4 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700 shadow-sm"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Filtrar por Área</label>
                                                <div className="relative">
                                                    <LayoutGrid className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                                    <select
                                                        value={historyAreaFilter}
                                                        onChange={(e) => setHistoryAreaFilter(e.target.value)}
                                                        className="w-full bg-white border border-gray-200 rounded-2xl pl-12 pr-10 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700 flex appearance-none cursor-pointer shadow-sm"
                                                    >
                                                        <option value="all">Todas as Áreas / Setores</option>
                                                        {Array.from(new Set(reportHistory.map(r => r.area))).filter(Boolean).sort().map(area => (
                                                            <option key={area} value={area}>{area}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                                                </div>
                                            </div>

                                            {canModerateHistory ? (
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Responsável (Master Only)</label>
                                                    <div className="relative">
                                                        <UserCircle2 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                                        <select
                                                            value={historyFilterUser}
                                                            onChange={(e) => setHistoryFilterUser(e.target.value)}
                                                            className="w-full bg-white border border-gray-200 rounded-2xl pl-12 pr-10 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700 flex appearance-none cursor-pointer shadow-sm"
                                                        >
                                                            <option value="all">Todos os Auditores</option>
                                                            {Array.from(new Set(reportHistory.map(r => r.userEmail))).map(email => (
                                                                <option key={email} value={email}>{users.find(u => u.email === email)?.name || email}</option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Período</label>
                                                    <div className="relative">
                                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                                        <select
                                                            value={historyDateRange}
                                                            onChange={(e) => setHistoryDateRange(e.target.value)}
                                                            className="w-full bg-white border border-gray-200 rounded-2xl pl-12 pr-10 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700 flex appearance-none cursor-pointer shadow-sm"
                                                        >
                                                            <option value="all">Todo o Período</option>
                                                            <option value="today">Apenas Hoje</option>
                                                            <option value="week">Últimos 7 dias</option>
                                                            <option value="month">Últimos 30 dias</option>
                                                        </select>
                                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Data Table */}
                                    <div className="overflow-hidden rounded-[32px] border border-gray-100 shadow-sm bg-white">
                                        <div className="md:hidden p-4 space-y-3">
                                            {filteredChecklistHistory.length === 0 ? (
                                                <div className="py-10 text-center">
                                                    <div className="flex flex-col items-center gap-3">
                                                        <div className="p-4 bg-gray-50 rounded-full text-gray-200">
                                                            <FileSearch size={36} strokeWidth={1.2} />
                                                        </div>
                                                        <p className="text-sm font-bold text-gray-400">Nenhum registro encontrado</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {pagedChecklistHistory.map(report => {
                                                        const scoreNum = Number(report.score);
                                                        const scoreFeedback = getScoreFeedback(scoreNum);
                                                        return (
                                                            <div key={report.id} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div className="min-w-0">
                                                                        <p className="text-[11px] font-bold text-gray-700">
                                                                            {new Date(report.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às {new Date(report.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                                        </p>
                                                                        <p className="text-sm font-black text-gray-900 truncate">{report.empresa_avaliada || 'Empresa não informada'}</p>
                                                                        <p className="text-xs text-gray-500">{report.filial || 'Filial N/A'} • {report.area || 'Setor Geral'}</p>
                                                                    </div>
                                                                    <div className={`inline-flex flex-col items-center justify-center w-12 h-12 rounded-xl ${scoreFeedback.bg} ${scoreFeedback.color} border border-white/60 shadow-sm`}>
                                                                        <span className="text-sm font-black leading-none">{scoreNum.toFixed(1)}</span>
                                                                        <span className="text-[8px] font-black opacity-60 mt-0.5">SCORE</span>
                                                                    </div>
                                                                </div>
                                                                <div className="mt-3 flex items-center justify-between">
                                                                    <span className="text-[11px] text-gray-500 truncate">{report.userName}</span>
                                                                    <button
                                                                        onClick={() => handleViewHistoryItem(report)}
                                                                        disabled={loadingReportId === report.id}
                                                                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 bg-blue-600 text-white text-[11px] font-bold shadow hover:bg-blue-700 transition disabled:opacity-50"
                                                                    >
                                                                        {loadingReportId === report.id ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                                                                        Ver
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 flex items-center justify-between">
                                                        <button
                                                            type="button"
                                                            onClick={() => setChecklistMobilePage(prev => Math.max(0, prev - 1))}
                                                            disabled={safeChecklistMobilePage === 0}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-bold text-gray-700 disabled:opacity-40"
                                                        >
                                                            <ArrowLeft size={12} />
                                                            Anterior
                                                        </button>
                                                        <span className="text-[11px] font-bold text-gray-500">
                                                            Página {safeChecklistMobilePage + 1} de {checklistMobileTotalPages}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setChecklistMobilePage(prev => Math.min(checklistMobileTotalPages - 1, prev + 1))}
                                                            disabled={safeChecklistMobilePage >= checklistMobileTotalPages - 1}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-bold text-gray-700 disabled:opacity-40"
                                                        >
                                                            Próxima
                                                            <ArrowRight size={12} />
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <div className="hidden md:block overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-50/50 border-b border-gray-100">
                                                        <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] w-48">Data e Hora</th>
                                                        <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Empresa / Filial</th>
                                                        <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Detalhes</th>
                                                        <th className="px-8 py-6 text-center text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Score</th>
                                                        <th className="px-8 py-6 text-right text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Ações</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {filteredChecklistHistory.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={5} className="px-8 py-24 text-center">
                                                                <div className="flex flex-col items-center gap-4">
                                                                    <div className="p-6 bg-gray-50 rounded-full text-gray-200">
                                                                        <FileSearch size={64} strokeWidth={1} />
                                                                    </div>
                                                                    <p className="text-xl font-black text-gray-300">Nenhum registro encontrado</p>
                                                                    <button onClick={handleReloadReports} className="text-blue-500 font-bold hover:underline">Limpar filtros ou recarregar</button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        filteredChecklistHistory.map(report => {
                                                            const scoreNum = Number(report.score);
                                                            const scoreFeedback = getScoreFeedback(scoreNum);

                                                            return (
                                                                <tr key={report.id} className="group hover:bg-blue-50/20 transition-all duration-300">
                                                                    <td className="px-8 py-6">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-sm font-black text-gray-800 tracking-tight">
                                                                                {new Date(report.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                                            </span>
                                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                                                                ás {new Date(report.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-8 py-6">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight">{report.empresa_avaliada || 'Empresa não informada'}</span>
                                                                            <span className="text-xs font-bold text-gray-500 flex items-center gap-1.5 mt-1">
                                                                                <Store size={12} className="text-gray-400" /> {report.filial || 'Filial N/A'}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-8 py-6">
                                                                        <div className="flex flex-col gap-1.5">
                                                                            <span className="inline-flex w-fit px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-gray-200">
                                                                                {report.area || 'Setor Geral'}
                                                                            </span>
                                                                            <div className="flex items-center gap-2">
                                                                                <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${currentTheme.bgGradient} flex items-center justify-center text-[8px] text-white font-black shadow-sm`}>
                                                                                    {report.userName?.charAt(0)}
                                                                                </div>
                                                                                <span className="text-[10px] font-bold text-gray-400 truncate max-w-[150px]">{report.userName}</span>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-8 py-6">
                                                                        <div className="flex justify-center">
                                                                            <div className={`inline-flex flex-col items-center justify-center w-16 h-16 rounded-[20px] ${scoreFeedback.bg} ${scoreFeedback.color} shadow-sm border border-white/60 transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
                                                                                <span className="text-xl font-black leading-none">{scoreNum.toFixed(1)}</span>
                                                                                <span className="text-[9px] font-black opacity-60 mt-0.5">SCORE</span>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-8 py-6 text-right">
                                                                        <div className="flex items-center justify-end gap-3">
                                                                            <button
                                                                                onClick={() => handleViewHistoryItem(report)}
                                                                                disabled={loadingReportId === report.id}
                                                                                className="p-3.5 bg-white text-blue-600 hover:bg-blue-600 hover:text-white rounded-2xl border border-blue-100 shadow-sm transition-all active:scale-90 group/btn relative overflow-hidden disabled:opacity-50"
                                                                                title="Visualizar Auditoria Completa"
                                                                            >
                                                                                {loadingReportId === report.id ? (
                                                                                    <Loader2 size={18} className="animate-spin" />
                                                                                ) : (
                                                                                    <Eye size={18} className="relative z-10 group-hover/btn:scale-110 transition-transform" />
                                                                                )}
                                                                            </button>
                                                                            {canModerateHistory && (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        if (window.confirm('Excluir permanentemente este relatório das auditorias?')) {
                                                                                            handleDeleteHistoryItem(report.id!);
                                                                                        }
                                                                                    }}
                                                                                    className="p-3.5 bg-white text-gray-300 hover:bg-red-50 hover:text-red-600 rounded-2xl border border-gray-100 transition-all active:scale-95 group/btn"
                                                                                    title="Remover Registro"
                                                                                >
                                                                                    <Trash2 size={18} />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className="mt-12 flex flex-col items-center gap-4 border-t border-gray-100/50 pt-12 pb-6">
                                            {hasMoreReports ? (
                                                <button
                                                    onClick={handleLoadMoreReports}
                                                    disabled={isLoadingMore}
                                                    className={`group relative flex items-center justify-center gap-4 px-12 py-4.5 rounded-[22px] font-black text-white transition-all active:scale-95 shadow-xl hover:shadow-2xl overflow-hidden ${isLoadingMore ? 'bg-gray-400 cursor-wait' : 'bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-700 hover:scale-[1.02] active:brightness-90'
                                                        }`}
                                                >
                                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite] pointer-events-none" />
                                                    {isLoadingMore ? (
                                                        <Loader2 size={20} className="animate-spin" />
                                                    ) : (
                                                        <ChevronDown size={20} className="group-hover:translate-y-1 transition-transform" />
                                                    )}
                                                    <span className="tracking-widest uppercase text-xs">
                                                        {isLoadingMore ? 'Carregando...' : 'Carregar Mais Avaliações'}
                                                    </span>
                                                </button>
                                            ) : (
                                                reportHistory.length > 0 && (
                                                    <div className="flex flex-col items-center gap-2 text-gray-400 group">
                                                        <div className="w-8 h-0.5 bg-gray-100 rounded-full group-hover:w-16 transition-all duration-700" />
                                                        <span className="font-black text-[9px] uppercase tracking-[0.3em]">Fim do Histórico</span>
                                                    </div>
                                                )
                                            )}

                                            {reportHistory.length > 0 && (
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest opacity-60">
                                                    Mostrando {filteredChecklistHistory.length} avaliações
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="order-1 bg-white/90 backdrop-blur-xl rounded-[40px] shadow-card border border-white/60 overflow-hidden">
                                <div className={`h-1.5 w-full bg-gradient-to-r ${currentTheme.bgGradient}`} />
                                <div className="p-8">
                                    <div className="flex items-center justify-between mb-6">
                                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${currentTheme.lightBg}`}>
                                                <Package size={24} className={currentTheme.text} />
                                            </div>
                                            Histórico de Conferências de Estoque
                                        </h2>
                                    </div>
                                    {stockConferenceHistory.length === 0 ? (
                                        <div className="text-center py-12 text-sm text-gray-500">
                                            Nenhuma conferência de estoque registrada ainda.
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="space-y-4 border-b border-gray-100 pb-4">
                                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                                        <Filter size={16} className="text-gray-400" />
                                                        <span className="font-semibold text-gray-700">Filtrar conferências</span>
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        Mostrando {filteredStockConferenceHistory.length} de {stockConferenceHistory.length} conferência(s)
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="text-[10px] uppercase tracking-widest text-gray-400">Filiais</div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {stockConferenceBranchOptions.map(option => (
                                                            <button
                                                                key={option.key}
                                                                type="button"
                                                                onClick={() => toggleStockBranchFilter(option.key)}
                                                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${stockBranchFilters.includes(option.key) ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}
                                                            >
                                                                {option.label}
                                                            </button>
                                                        ))}
                                                        {stockBranchFilters.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={handleResetStockBranchFilters}
                                                                className="px-3 py-1.5 rounded-full border border-gray-200 bg-white text-xs text-gray-500 hover:bg-gray-50 transition"
                                                            >
                                                                Limpar
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                    <span className="text-[10px] uppercase tracking-widest text-gray-400">Área</span>
                                                    <select
                                                        value={stockAreaFilter}
                                                        onChange={(e) => handleStockAreaFilterChange(e.target.value)}
                                                        className="ml-0 w-full max-w-xs text-sm rounded-xl border border-gray-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    >
                                                        <option value="all">Todas as Áreas</option>
                                                        {stockConferenceAreaOptions.map(option => (
                                                            <option key={option.key} value={option.key}>{option.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            {filteredStockConferenceHistory.length === 0 ? (
                                                <div className="text-center py-12 text-sm text-gray-500">
                                                    Nenhuma conferência de estoque encontrada com os filtros aplicados.
                                                </div>
                                            ) : (
                                                <>
                                                <div className="md:hidden space-y-3">
                                                    {pagedStockConferenceHistory.map(item => {
                                                        const createdDate = new Date(item.createdAt);
                                                        return (
                                                            <div key={item.id} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div>
                                                                        <p className="text-[11px] font-bold text-gray-800">
                                                                            {createdDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} {createdDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                                        </p>
                                                                        <p className="text-sm font-black text-gray-900 mt-0.5">{item.branch}</p>
                                                                        <p className="text-xs text-gray-500">{item.area}</p>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleViewStockConferenceReport(item.id)}
                                                                        disabled={loadingStockReportId === item.id}
                                                                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 bg-blue-600 text-white text-[11px] font-bold shadow hover:bg-blue-700 transition disabled:opacity-50"
                                                                    >
                                                                        {loadingStockReportId === item.id ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                                                                        Ver
                                                                    </button>
                                                                </div>
                                                                <div className="mt-3 grid grid-cols-3 gap-2">
                                                                    <div className="rounded-xl bg-gray-50 border border-gray-100 p-2 text-center">
                                                                        <p className="text-[9px] uppercase tracking-widest text-gray-400 font-black">Total</p>
                                                                        <p className="text-lg font-black text-gray-800 leading-none mt-1">{item.total}</p>
                                                                    </div>
                                                                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2 text-center">
                                                                        <p className="text-[9px] uppercase tracking-widest text-emerald-600 font-black">Corretos</p>
                                                                        <p className="text-lg font-black text-emerald-700 leading-none mt-1">{item.matched}</p>
                                                                    </div>
                                                                    <div className="rounded-xl bg-red-50 border border-red-100 p-2 text-center">
                                                                        <p className="text-[9px] uppercase tracking-widest text-red-500 font-black">Diverg.</p>
                                                                        <p className="text-lg font-black text-red-600 leading-none mt-1">{item.divergent}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 flex items-center justify-between">
                                                        <button
                                                            type="button"
                                                            onClick={() => setStockMobilePage(prev => Math.max(0, prev - 1))}
                                                            disabled={safeStockMobilePage === 0}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-bold text-gray-700 disabled:opacity-40"
                                                        >
                                                            <ArrowLeft size={12} />
                                                            Anterior
                                                        </button>
                                                        <span className="text-[11px] font-bold text-gray-500">
                                                            Página {safeStockMobilePage + 1} de {stockMobileTotalPages}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setStockMobilePage(prev => Math.min(stockMobileTotalPages - 1, prev + 1))}
                                                            disabled={safeStockMobilePage >= stockMobileTotalPages - 1}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-bold text-gray-700 disabled:opacity-40"
                                                        >
                                                            Próxima
                                                            <ArrowRight size={12} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-100 bg-white">
                                                    <div className="max-h-[780px] overflow-auto">
                                                        <table className="w-full min-w-[980px] text-left">
                                                            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-100">
                                                                <tr>
                                                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Data/Hora</th>
                                                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Filial</th>
                                                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Área</th>
                                                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Total</th>
                                                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-green-600 text-center">Corretos</th>
                                                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-red-500 text-center">Diverg.</th>
                                                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Responsável</th>
                                                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Ação</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {filteredStockConferenceHistory.map(item => {
                                                                    const createdDate = new Date(item.createdAt);
                                                                    return (
                                                                        <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                                                                            <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                                                                                {createdDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} {createdDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                                            </td>
                                                                            <td className="px-4 py-3 text-sm font-bold text-gray-800 whitespace-nowrap">{item.branch}</td>
                                                                            <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{item.area}</td>
                                                                            <td className="px-4 py-3 text-sm font-bold text-gray-700 text-center">{item.total}</td>
                                                                            <td className="px-4 py-3 text-sm font-bold text-green-700 text-center">{item.matched}</td>
                                                                            <td className="px-4 py-3 text-sm font-bold text-red-600 text-center">{item.divergent}</td>
                                                                            <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{item.userName}</td>
                                                                            <td className="px-4 py-3 text-right">
                                                                                <button
                                                                                    onClick={() => handleViewStockConferenceReport(item.id)}
                                                                                    disabled={loadingStockReportId === item.id}
                                                                                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 bg-blue-600 text-white text-xs font-bold shadow hover:bg-blue-700 transition disabled:opacity-50 whitespace-nowrap"
                                                                                >
                                                                                    {loadingStockReportId === item.id ? (
                                                                                        <Loader2 size={14} className="animate-spin" />
                                                                                    ) : (
                                                                                        <FileText size={14} />
                                                                                    )}
                                                                                    {loadingStockReportId === item.id ? 'Carregando...' : 'Ver Conferência'}
                                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                                    <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                                                        <span className="text-[11px] text-gray-500">
                                                            {stockConferenceHistory.length} conferência(s) carregada(s)
                                                        </span>
                                                        {hasMoreStockConferences && (
                                                            <button
                                                                onClick={handleLoadMoreStockConferences}
                                                                disabled={isLoadingMoreStock}
                                                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs text-white transition-all active:scale-95 disabled:opacity-50 shadow-md"
                                                                style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)' }}
                                                            >
                                                                {isLoadingMoreStock ? (
                                                                    <><Loader2 size={14} className="animate-spin" /> Carregando...</>
                                                                ) : (
                                                                    <><ChevronDown size={14} /> CARREGAR MAIS</>
                                                                )}
                                                            </button>
                                                        )}
                                                        {!hasMoreStockConferences && stockConferenceHistory.length > 0 && (
                                                            <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Fim do histórico</span>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {viewingStockConferenceReport && (
                        <StockConferenceReportViewer
                            report={viewingStockConferenceReport}
                            onClose={handleCloseStockReport}
                            currentUser={currentUser}
                        />
                    )}

                    {editingChecklistDefinition && (
                        <div className="fixed inset-0 z-[80] flex items-end justify-center px-4 pt-10 pb-10 lg:pt-12 lg:pb-16">
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeChecklistEditor} />
                            <div className="relative z-10 w-full max-w-4xl lg:max-w-[calc(100vw-20rem)] bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 overflow-y-auto max-h-[calc(100vh-9rem)] lg:ml-[18rem]">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">Editar Checklist</p>
                                        <h3 className="text-xl font-bold text-gray-900">{editingChecklistDefinition.title}</h3>
                                        <p className="text-sm text-gray-500">{editingChecklistDefinition.description}</p>
                                    </div>
                                    <button
                                        onClick={closeChecklistEditor}
                                        className="text-gray-500 hover:text-gray-900 rounded-full p-2 transition"
                                        aria-label="Fechar edição"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="mt-6 space-y-5">
                                    {editingChecklistDefinition.sections.map(section => (
                                        <div key={section.id} className="bg-gray-50 rounded-2xl border border-gray-200 p-4 space-y-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <input
                                                    value={section.title}
                                                    onChange={(e) => handleSectionTitleChange(section.id, e.target.value)}
                                                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                                />
                                                <button
                                                    onClick={() => handleRemoveSection(section.id)}
                                                    className="text-red-600 text-xs font-bold uppercase tracking-widest"
                                                >
                                                    Remover seção
                                                </button>
                                            </div>
                                            <div className="space-y-3">
                                                {section.items.map(item => (
                                                    <div key={item.id} className="grid gap-2 lg:grid-cols-[2fr,1fr,1fr] items-center">
                                                        <input
                                                            value={item.text}
                                                            onChange={(e) => handleItemTextChange(section.id, item.id, e.target.value)}
                                                            className="col-span-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                                        />
                                                        <select
                                                            value={item.type}
                                                            onChange={(e) => handleItemTypeChange(section.id, item.id, e.target.value as InputType)}
                                                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                                                        >
                                                            {Object.values(InputType).map(typeValue => (
                                                                <option key={typeValue} value={typeValue}>
                                                                    {INPUT_TYPE_LABELS[typeValue as InputType] || typeValue}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <div className="flex items-center gap-3 text-xs">
                                                            <label className="flex items-center gap-1 text-gray-600">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={item.required ?? false}
                                                                    onChange={(e) => handleItemRequiredToggle(section.id, item.id, e.target.checked)}
                                                                    className="h-4 w-4"
                                                                />
                                                                Obrigatório
                                                            </label>
                                                            <button
                                                                onClick={() => handleRemoveQuestion(section.id, item.id)}
                                                                className="text-red-500 font-semibold uppercase tracking-widest text-[11px]"
                                                            >
                                                                Excluir
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <button
                                                onClick={() => handleAddQuestion(section.id)}
                                                className="text-blue-600 text-sm font-semibold flex items-center gap-2"
                                            >
                                                + Adicionar pergunta
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4">
                                    <button
                                        onClick={handleAddSection}
                                        className="text-blue-600 font-semibold text-sm flex items-center gap-2"
                                    >
                                        + Adicionar seção
                                    </button>
                                </div>
                                <div className="mt-6 flex justify-end gap-3">
                                    <button
                                        onClick={closeChecklistEditor}
                                        className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-100"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        disabled={isSavingChecklistDefinition}
                                        onClick={handleSaveChecklistDefinition}
                                        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-70 disabled:cursor-wait"
                                    >
                                        {isSavingChecklistDefinition ? 'Salvando...' : 'Salvar checklist'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {remoteForceLogoutDeadline && currentUser && (
                        <div className="fixed inset-0 z-[9998] bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center p-4">
                            <div className="w-full max-w-md rounded-3xl border border-red-200 bg-white shadow-2xl p-6">
                                <div className="flex items-start gap-3">
                                    <div className="h-10 w-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                                        <UserX size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-widest text-red-500 font-black">Encerramento Remoto</p>
                                        <h3 className="text-lg font-black text-slate-900">Sua sessão será encerrada</h3>
                                        <p className="text-sm text-slate-600 mt-1">
                                            Um administrador solicitou o encerramento desta sessão.
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 flex items-center justify-between">
                                    <span className="text-xs font-black uppercase tracking-wider text-red-600">Tempo restante</span>
                                    <span className="text-xl font-black text-red-700">{remoteForceLogoutSecondsRemaining}s</span>
                                </div>
                                <div className="mt-5 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => { void handleRemoteForceLogoutNow(); }}
                                        className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-wider hover:bg-red-700 transition"
                                    >
                                        Sair Agora
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {showBranchSelectionModal && currentUser && currentUser.role !== 'MASTER' && typeof document !== 'undefined' && createPortal(
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                            <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
                            <div className="relative w-full max-w-xl rounded-3xl border border-white/30 bg-white shadow-2xl p-6 md:p-8">
                                <div className="flex items-start gap-3">
                                    <div className="h-11 w-11 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                                        <Store size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Validação de Filial</p>
                                        <h3 className="text-xl font-black text-gray-900">
                                            {branchSelectionMode === 'required' ? 'Selecione sua filial' : 'Confirmar filial atual'}
                                        </h3>
                                        <p className="text-sm text-gray-600 mt-1">
                                            {branchSelectionMessage}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Filial</label>
                                        {branchSelectionOptions.length > 0 ? (
                                            <select
                                                value={branchSelectionValue}
                                                onChange={(e) => setBranchSelectionValue(e.target.value)}
                                                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm font-semibold text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                disabled={isSavingBranchSelection}
                                            >
                                                <option value="">Selecione...</option>
                                                {branchSelectionGroups.map(group => (
                                                    <optgroup key={group.area} label={group.area}>
                                                        {group.options.map(option => (
                                                            <option key={`${group.area}-${option.branch}`} value={option.branch}>
                                                                {option.branch}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                value={branchSelectionValue}
                                                onChange={(e) => setBranchSelectionValue(e.target.value)}
                                                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm font-semibold text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="Digite a filial"
                                                disabled={isSavingBranchSelection}
                                            />
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Área (automática)</label>
                                        <input
                                            type="text"
                                            value={branchSelectionArea || 'Área não identificada'}
                                            readOnly
                                            className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm font-semibold text-gray-700 bg-gray-50"
                                        />
                                    </div>
                                </div>

                                <div className="mt-6 flex flex-wrap justify-end gap-3">
                                    {branchSelectionMode === 'confirm' && (
                                        <button
                                            type="button"
                                            onClick={handleKeepCurrentBranch}
                                            disabled={isSavingBranchSelection}
                                            className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                                        >
                                            OK, manter filial
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleSaveBranchSelection}
                                        disabled={isSavingBranchSelection || !branchSelectionValue.trim()}
                                        className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition disabled:opacity-50"
                                    >
                                        {isSavingBranchSelection ? 'Salvando...' : branchSelectionMode === 'required' ? 'Salvar e continuar' : 'Trocar filial'}
                                    </button>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}

                </main>
            </div>
        </div>
    );
};

export default App;
