import { supabase } from './supabaseClient';
import { ChecklistDefinition } from './types';
import { Product, PVRecord, PVSaleClassification, SalesUploadRecord, SalesRecord, InventoryCostRecord } from './preVencidos/types';
import { AnalysisReportPayload } from './preVencidos/analysisReport';

// ==================== TYPES ====================

const pvSalesHistoryExcludedColumns = new Set<string>();
const pvReportsExcludedColumns = new Set<string>(['updated_at']);
const STOCK_SYNC_DEBUG = import.meta.env.DEV && Boolean((globalThis as any).__STOCK_DEBUG);
const stockSyncDebugLog = (...args: any[]) => {
  if (STOCK_SYNC_DEBUG) console.log(...args);
};

export interface DbUser {
  id?: string;
  email: string;
  password: string;
  name: string;
  phone: string;
  role: 'MASTER' | 'ADMINISTRATIVO' | 'USER';
  approved: boolean;
  rejected?: boolean;
  photo?: string;
  preferred_theme?: 'red' | 'green' | 'blue' | 'yellow';
  company_id?: string | null;
  area?: string | null;
  filial?: string | null;
  created_at?: string;
}

export interface CompanyArea {
  name: string;
  branches: string[];
}

export interface DbCompany {
  id?: string;
  name: string;
  cnpj?: string;
  phone?: string;
  logo?: string;
  areas?: CompanyArea[]; // JSONB column
  created_at?: string;
}

export interface DbConfig {
  id?: string;
  pharmacy_name: string;
  logo: string | null;
  updated_at?: string;
}

export interface DbReport {
  id?: string;
  user_email: string;
  user_name: string;
  pharmacy_name: string;
  score: string;
  form_data: any;
  images: any;
  signatures: any;
  ignored_checklists: any;
  created_at?: string;
}

export interface DbStockConferenceSession {
  id?: string;
  user_email: string;
  branch: string;
  area?: string | null;
  company_id?: string | null;
  pharmacist: string;
  manager: string;
  step: 'setup' | 'conference' | 'divergence' | 'report';
  products: {
    reduced_code: string;
    barcode?: string | null;
    description?: string | null;
  }[];
  inventory: {
    reduced_code: string;
    system_qty: number;
    counted_qty: number;
    status: 'pending' | 'matched' | 'divergent';
    last_updated?: string | null;
  }[];
  recount_targets?: string[];
  updated_at?: string;
}

export interface DbStockConferenceReport {
  id?: string;
  user_email: string;
  user_name: string;
  branch: string;
  area?: string | null;
  pharmacist: string;
  manager: string;
  summary: {
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
  items: {
    reduced_code: string;
    barcode?: string | null;
    description?: string | null;
    system_qty: number;
    counted_qty: number;
    status: 'pending' | 'matched' | 'divergent';
    difference: number;
    last_updated?: string | null;
  }[];
  created_at?: string;
}

export interface DbPVSalesHistory {
  id?: string;
  company_id: string;
  branch: string;
  user_email: string;
  sale_period: string;
  seller_name: string;
  reduced_code: string;
  product_name: string;
  qty_sold_pv: number;
  qty_ignored: number;
  qty_neutral: number;
  unit_price?: number;
  value_sold_pv?: number;
  value_ignored?: number;
  finalized_at?: string;
}

export interface DbActiveSession {
  client_id: string;
  user_email: string;
  user_name: string | null;
  branch: string | null;
  area: string | null;
  current_view: string | null;
  last_ping: string;
  command: 'FORCE_LOGOUT' | 'RELOAD' | null;
  updated_at: string;
}

export type DbPVSalesUpload = SalesUploadRecord;

export interface DbPVInventoryReport {
  id?: string;
  company_id: string;
  branch: string;
  file_name?: string | null;
  uploaded_at?: string | null;
  records: InventoryCostRecord[];
  created_at?: string;
  updated_at?: string;
}

export interface DbPVSalesAnalysisReport {
  id?: string;
  company_id: string;
  branch: string;
  period_label: string;
  period_start?: string | null;
  period_end?: string | null;
  file_name?: string | null;
  uploaded_at?: string | null;
  analysis_payload: AnalysisReportPayload;
  created_at?: string;
  updated_at?: string;
}

export interface DbPVDashboardReport {
  id?: string;
  company_id: string;
  branch: string;
  report_type: 'FINAL' | 'PREVIEW';
  period_label?: string | null;
  user_email?: string | null;
  file_name?: string | null;
  pdf_base64: string;
  created_at?: string;
}

export interface DbPVBranchRecordEvent {
  id?: string;
  company_id: string;
  branch: string;
  record_id?: string | null;
  reduced_code?: string | null;
  event_type: 'CREATED' | 'UPDATED' | 'DELETED';
  previous_quantity?: number | null;
  new_quantity?: number | null;
  user_email?: string | null;
  created_at?: string;
}

export interface DbAppEventLog {
  id?: string;
  company_id?: string | null;
  branch?: string | null;
  area?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  app: string;
  event_type: string;
  entity_type?: string | null;
  entity_id?: string | null;
  status?: string | null;
  success?: boolean | null;
  duration_ms?: number | null;
  error_code?: string | null;
  source?: string | null;
  event_meta?: any;
  created_at?: string | null;
}

export interface DbGlobalBaseFile {
  id?: string;
  company_id: string;
  module_key: string;
  file_name?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  file_data_base64?: string | null;
  uploaded_by?: string | null;
  uploaded_at?: string | null;
  updated_at?: string | null;
}

export interface DbPVSessionData {
  master_products?: Product[];
  system_products?: Product[];
  dcb_products?: Product[];
  pv_records?: PVRecord[];
  confirmed_pv_sales?: Record<string, PVSaleClassification>;
  finalized_reds_by_period?: Record<string, string[]>;
  sales_period?: string;
  companyName?: string;
  currentView?: string;
}

export interface DbPVSession {
  id?: string;
  user_email: string;
  company_id?: string | null;
  branch?: string | null;
  area?: string | null;
  pharmacist?: string | null;
  manager?: string | null;
  session_data?: DbPVSessionData | null;
  created_at?: string;
  updated_at?: string;
}

export interface DbPVReport {
  id?: string;
  user_email: string;
  company_id?: string | null;
  branch?: string | null;
  report_type: 'system' | 'dcb';
  products: Product[];
  created_at?: string;
  updated_at?: string;
}

export interface DbChecklistDefinition {
  id: string;
  definition: ChecklistDefinition;
  created_at?: string;
  updated_at?: string;
}

export async function fetchChecklistDefinitions(): Promise<DbChecklistDefinition[]> {
  try {
    const { data, error } = await supabase
      .from('checklist_definitions')
      .select('*');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching checklist definitions:', error);
    return [];
  }
}

export async function upsertChecklistDefinition(definition: ChecklistDefinition): Promise<DbChecklistDefinition | null> {
  try {
    const { data, error } = await supabase
      .from('checklist_definitions')
      .upsert({
        id: definition.id,
        definition,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.error('Error upserting checklist definition:', error);
    return null;
  }
}

export interface DbDraft {
  id?: string;
  user_email: string;
  form_data?: any;
  images?: any;
  signatures?: any;
  ignored_checklists?: any;
  updated_at?: string;
}


// ==================== USERS ====================

export async function fetchUsers(): Promise<DbUser[]> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
}

export async function createUser(user: DbUser): Promise<DbUser> {
  const { data, error } = await supabase
    .from('users')
    .insert([{
      email: user.email,
      password: user.password,
      name: user.name,
      phone: user.phone,
      role: user.role,
      approved: user.approved,
      rejected: user.rejected || false,
      photo: user.photo,
      preferred_theme: user.preferred_theme || 'blue',
      company_id: user.company_id,
      area: user.area,
      filial: user.filial
    }])
    .select()
    .single();

  if (error) {
    console.error('Error creating user:', error);
    throw error;
  }

  return data;
}

export async function updateUser(email: string, updates: Partial<DbUser>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('email', email);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating user:', error);
    return false;
  }
}

export async function deleteUser(email: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('email', email);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting user:', error);
    return false;
  }
}

// ==================== COMPANIES ====================

export async function fetchCompanies(): Promise<DbCompany[]> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching companies:', error);
    return [];
  }
}

export interface DbAccessMatrix {
  level: string;
  modules: Record<string, boolean>;
  created_at?: string;
  updated_at?: string;
}

export async function fetchAccessMatrix(): Promise<DbAccessMatrix[]> {
  try {
    const { data, error } = await supabase
      .from('access_matrix')
      .select('*');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching access matrix:', error);
    return [];
  }
}

export async function upsertAccessMatrix(level: string, modules: Record<string, boolean>): Promise<DbAccessMatrix | null> {
  try {
    const { data, error } = await supabase
      .from('access_matrix')
      .upsert({
        level,
        modules,
        updated_at: new Date().toISOString()
      }, { onConflict: 'level' })
      .select()
      .single();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.error('Error upserting access matrix:', error);
    return null;
  }
}

export async function createCompany(company: DbCompany): Promise<DbCompany | null> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .insert([{
        name: company.name,
        cnpj: company.cnpj,
        phone: company.phone,
        logo: company.logo
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating company:', error);
    return null;
  }
}

export async function deleteCompany(id: string): Promise<boolean> {
  try {
    // Verificar se existem usuários vinculados
    const { count, error: checkError } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', id);

    if (checkError) throw checkError;

    if (count && count > 0) {
      alert('Não é possível excluir esta empresa pois existem usuários vinculados a ela.');
      return false;
    }

    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting company:', error);
    return false;
  }
}

// ==================== CONFIGS ====================

export async function updateCompany(id: string, updates: Partial<DbCompany>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating company:', error);
    return false;
  }
}

export async function fetchConfig(): Promise<DbConfig | null> {
  try {
    const { data, error } = await supabase
      .from('configs')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data;
  } catch (error) {
    console.error('Error fetching config:', error);
    return null;
  }
}

export async function saveConfig(config: DbConfig): Promise<boolean> {
  try {
    // Verificar se já existe config
    const existing = await fetchConfig();

    if (existing && existing.id) {
      // Update
      const { error } = await supabase
        .from('configs')
        .update({
          pharmacy_name: config.pharmacy_name,
          logo: config.logo,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (error) throw error;
    } else {
      // Insert
      const { error } = await supabase
        .from('configs')
        .insert([{
          pharmacy_name: config.pharmacy_name,
          logo: config.logo
        }]);

      if (error) throw error;
    }

    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
}

// ==================== REPORTS ====================

// Retorna apenas metadados para listagem rápida
export async function fetchReportsSummary(page: number = 0, pageSize: number = 20): Promise<Partial<DbReport>[]> {
  try {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from('reports')
      .select('id, user_email, user_name, pharmacy_name, score, created_at, form_data')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching reports summary:', error);
    return [];
  }
}

export async function fetchReportDetails(id: string): Promise<DbReport | null> {
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching report details:', error);
    return null;
  }
}

export async function fetchReports(page: number = 0, pageSize: number = 100): Promise<DbReport[]> {
  try {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .range(from, to);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching reports:', error);
    return [];
  }
}

export async function createReport(report: DbReport): Promise<DbReport | null> {
  try {
    const { data, error } = await supabase
      .from('reports')
      .insert([{
        user_email: report.user_email,
        user_name: report.user_name,
        pharmacy_name: report.pharmacy_name,
        score: report.score,
        form_data: report.form_data,
        images: report.images,
        signatures: report.signatures,
        ignored_checklists: report.ignored_checklists
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating report:', error);
    return null;
  }
}

// Retorna apenas metadados para listagem rápida
export async function fetchStockConferenceReportsSummary(page: number = 0, pageSize: number = 20): Promise<Partial<DbStockConferenceReport>[]> {
  try {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from('stock_conference_reports')
      .select('id, user_email, user_name, branch, area, created_at, pharmacist, manager, summary')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching stock conference reports summary:', error);
    return [];
  }
}

export async function fetchStockConferenceReportsSummaryAll(pageSize: number = 200): Promise<Partial<DbStockConferenceReport>[]> {
  const all: Partial<DbStockConferenceReport>[] = [];
  try {
    let page = 0;
    while (true) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from('stock_conference_reports')
        .select('id, user_email, user_name, branch, area, created_at, pharmacist, manager, summary')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      page += 1;
    }
    return all;
  } catch (error) {
    console.error('Error fetching stock conference reports summary (all):', error);
    return all;
  }
}

// Paginated version: load page by page (lighter)
export async function fetchStockConferenceReportsSummaryPage(page: number = 0, pageSize: number = 20): Promise<Partial<DbStockConferenceReport>[]> {
  try {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('stock_conference_reports')
      .select('id, user_email, user_name, branch, area, created_at, pharmacist, manager, summary')
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching stock conference reports summary page:', error);
    return [];
  }
}

export async function fetchStockConferenceReportDetails(id: string): Promise<DbStockConferenceReport | null> {
  try {
    const { data, error } = await supabase
      .from('stock_conference_reports')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching stock conference report details:', error);
    return null;
  }
}

export async function fetchStockConferenceReports(page: number = 0, pageSize: number = 100): Promise<DbStockConferenceReport[]> {
  try {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from('stock_conference_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching stock conference reports:', error);
    return [];
  }
}

const normalizeConferenceString = (value?: string | null): string => (value || '').trim().toLowerCase();

const normalizeConferenceSummary = (summary: DbStockConferenceReport['summary']) => ({
  total: Number(summary?.total || 0),
  matched: Number(summary?.matched || 0),
  divergent: Number(summary?.divergent || 0),
  pending: Number(summary?.pending || 0),
  percent: Number(summary?.percent || 0),
  started_at: summary?.started_at || summary?.startedAt || null,
  ended_at: summary?.ended_at || summary?.endedAt || null
});

const normalizeConferenceItems = (items: DbStockConferenceReport['items'] = []) =>
  items.map(item => ({
    reduced_code: item.reduced_code,
    barcode: item.barcode || null,
    description: item.description || null,
    system_qty: Number(item.system_qty || 0),
    counted_qty: Number(item.counted_qty || 0),
    status: item.status,
    difference: Number(item.difference || 0),
    last_updated: item.last_updated || null
  }));

const isDuplicatedStockConferenceReport = (candidate: DbStockConferenceReport, incoming: DbStockConferenceReport): boolean => {
  if (normalizeConferenceString(candidate.user_email) !== normalizeConferenceString(incoming.user_email)) return false;
  if (normalizeConferenceString(candidate.branch) !== normalizeConferenceString(incoming.branch)) return false;
  if (normalizeConferenceString(candidate.area || null) !== normalizeConferenceString(incoming.area || null)) return false;
  if (normalizeConferenceString(candidate.pharmacist) !== normalizeConferenceString(incoming.pharmacist)) return false;
  if (normalizeConferenceString(candidate.manager) !== normalizeConferenceString(incoming.manager)) return false;

  const candidateSummary = JSON.stringify(normalizeConferenceSummary(candidate.summary));
  const incomingSummary = JSON.stringify(normalizeConferenceSummary(incoming.summary));
  if (candidateSummary !== incomingSummary) return false;

  const candidateItems = JSON.stringify(normalizeConferenceItems(candidate.items || []));
  const incomingItems = JSON.stringify(normalizeConferenceItems(incoming.items || []));
  return candidateItems === incomingItems;
};

export async function createStockConferenceReport(report: DbStockConferenceReport): Promise<DbStockConferenceReport | null> {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentReports, error: recentError } = await supabase
      .from('stock_conference_reports')
      .select('*')
      .eq('user_email', report.user_email)
      .eq('branch', report.branch)
      .gte('created_at', tenMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(20);

    if (recentError) throw recentError;

    const duplicated = (recentReports || []).find(existing =>
      isDuplicatedStockConferenceReport(existing as DbStockConferenceReport, report)
    ) as DbStockConferenceReport | undefined;

    if (duplicated) {
      console.warn('⚠️ Duplicate stock conference report detected. Returning existing row:', duplicated.id);
      return duplicated;
    }

    const { data, error } = await supabase
      .from('stock_conference_reports')
      .insert([{
        user_email: report.user_email,
        user_name: report.user_name,
        branch: report.branch,
        area: report.area,
        pharmacist: report.pharmacist,
        manager: report.manager,
        summary: report.summary,
        items: report.items
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating stock conference report:', error);
    return null;
  }
}

export async function updateStockConferenceReportSummary(id: string, summary: DbStockConferenceReport['summary']): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('stock_conference_reports')
      .update({ summary })
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating stock conference summary:', error);
    return false;
  }
}

// Check if a similar report already exists to avoid duplicates
export async function reportExists(report: DbReport): Promise<boolean> {
  try {
    // Verificar se já existe relatório do mesmo usuário/farmácia/nota nos últimos 5 minutos
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('reports')
      .select('id, score')
      .eq('user_email', report.user_email)
      .eq('pharmacy_name', report.pharmacy_name)
      .eq('score', report.score)
      .gte('created_at', fiveMinutesAgo)
      .limit(1);

    if (error) throw error;
    return !!(data && data.length > 0);
  } catch (error) {
    console.error('Error checking report existence:', error);
    return false;
  }
}

export async function deleteReport(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('reports')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting report:', error);
    return false;
  }
}

export async function fetchStockConferenceSession(userEmail: string): Promise<DbStockConferenceSession | null> {
  try {
    const { data, error } = await supabase
      .from('stock_conference_sessions')
      .select('*')
      .eq('user_email', userEmail)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching stock conference session:', error);
    return null;
  }
}

export async function upsertStockConferenceSession(session: DbStockConferenceSession): Promise<DbStockConferenceSession | null> {
  try {
    // Preparar payload sem campos undefined
    const payload: any = {
      user_email: session.user_email,
      branch: session.branch,
      area: session.area,
      company_id: session.company_id,
      pharmacist: session.pharmacist,
      manager: session.manager,
      step: session.step,
      products: session.products,
      inventory: session.inventory,
      recount_targets: session.recount_targets || [],
      updated_at: session.updated_at || new Date().toISOString()
    };

    // Só adicionar ID se existir
    if (session.id) {
      payload.id = session.id;
    }

    stockSyncDebugLog('📤 Sending to Supabase:', {
      user_email: payload.user_email,
      hasId: !!payload.id,
      productsCount: payload.products.length,
      inventoryCount: payload.inventory.length
    });

    const { data, error } = await supabase
      .from('stock_conference_sessions')
      .upsert([payload], { onConflict: 'user_email' })
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase Upsert Error:', error);
      throw error;
    }

    stockSyncDebugLog('✅ Stock session persisted to Supabase:', data?.id);
    return data;
  } catch (error) {
    console.error('❌ Error upserting stock conference session:', error);
    return null;
  }
}

export async function deleteStockConferenceSession(userEmail: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('stock_conference_sessions')
      .delete()
      .eq('user_email', userEmail);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting stock conference session:', error);
    return false;
  }
}

export async function fetchPVSession(userEmail: string): Promise<DbPVSession | null> {
  try {
    const { data, error } = await supabase
      .from('pv_sessions')
      .select('*')
      .eq('user_email', userEmail)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Erro ao carregar sessÆo PV do Supabase:', error);
    return null;
  }
}

export interface DbPVConfirmedSalesMeta {
  finalized_reds_by_period?: Record<string, string[]>;
}

export type DbPVConfirmedSalesPayload = Record<string, PVSaleClassification | DbPVConfirmedSalesMeta>;

export interface DbActiveSalesReport {
  id?: string;
  company_id: string;
  branch: string;
  sales_records: SalesRecord[];
  sales_period: string;
  confirmed_sales?: DbPVConfirmedSalesPayload;
  uploaded_at?: string;
  status: 'pending' | 'processed';
  user_email?: string;
  file_name?: string;
  updated_at?: string;
}

// ==================== AUDITORIA ====================

export interface DbAuditSession {
  id?: string;
  branch: string;
  audit_number: number;
  status: 'open' | 'completed';
  data: any; // Full AuditData JSON
  progress: number;
  user_email?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbAuditTermDraft {
  id?: string;
  branch: string;
  audit_number: number;
  term_key: string;
  payload: any;
  user_email?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbAuditPartialTerm {
  id?: string;
  branch: string;
  audit_number: number;
  batch_id: string;
  group_id: string;
  dept_id?: string;
  cat_id?: string;
  started_at?: string;
  completed_at: string;
  user_email?: string;
  created_at?: string;
}

export async function fetchAuditSession(branch: string, auditNumber: number): Promise<DbAuditSession | null> {
  try {
    const { data, error } = await supabase
      .from('audit_sessions')
      .select('*')
      .eq('branch', branch)
      .eq('audit_number', auditNumber)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    return data;
  } catch (error) {
    console.error('Error fetching audit session:', error);
    return null;
  }
}

export async function fetchLatestAudit(branch: string): Promise<DbAuditSession | null> {
  // Use a targeted selection instead of * if possible, but for now we keep it to match existing usage
  // until we verify where all properties are used.
  try {
    const { data, error } = await supabase
      .from('audit_sessions')
      .select('*')
      .eq('branch', branch)
      .order('audit_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching latest audit:', error);
    return null;
  }
}

/**
 * Lightweight check for audit changes
 */
export async function fetchLatestAuditMetadata(branch: string): Promise<{ id: string, updated_at: string, audit_number: number } | null> {
  try {
    const { data, error } = await supabase
      .from('audit_sessions')
      .select('id, updated_at, audit_number')
      .eq('branch', branch)
      .order('audit_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching latest audit metadata:', error);
    return null;
  }
}

export async function upsertAuditSession(session: DbAuditSession): Promise<DbAuditSession | null> {
  try {
    let safeData = session.data ? JSON.parse(JSON.stringify(session.data)) : null;

    const payload: any = {
      branch: String(session.branch), // Ensure string
      audit_number: session.audit_number,
      status: session.status,
      data: safeData,
      progress: session.progress,
      user_email: session.user_email,
      updated_at: new Date().toISOString()
    };

    // If ID exists, we try to use it, but onConflict should handle the identity based on branch/number
    if (session.id) {
      payload.id = session.id;
    }

    const { data, error } = await supabase
      .from('audit_sessions')
      .upsert(payload, { onConflict: 'branch,audit_number' })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error upserting audit session:', error);
    return null;
  }
}

export async function fetchAuditsHistory(branch: string): Promise<DbAuditSession[]> {
  try {
    const { data, error } = await supabase
      .from('audit_sessions')
      .select('id, branch, audit_number, status, progress, user_email, created_at, updated_at')
      .eq('branch', branch)
      .order('updated_at', { ascending: false })
      .order('audit_number', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching audit history:', error);
    return [];
  }
}



export async function fetchActiveSalesReport(companyId: string, branch: string): Promise<DbActiveSalesReport | null> {
  try {
    const hasSalesRows = (row: any) => {
      if (Array.isArray(row?.sales_records)) return row.sales_records.length > 0;
      if (typeof row?.sales_records === 'string') {
        try {
          const parsed = JSON.parse(row.sales_records);
          return Array.isArray(parsed) ? parsed.length > 0 : !!parsed;
        } catch {
          return false;
        }
      }
      return false;
    };

    const sortByRecency = (rows: any[]) => {
      const safe = Array.isArray(rows) ? [...rows] : [];
      safe.sort((a, b) => {
        const qa = hasSalesRows(a) ? 1 : 0;
        const qb = hasSalesRows(b) ? 1 : 0;
        if (qa !== qb) return qb - qa;
        const ta = Date.parse(String(a?.updated_at || a?.uploaded_at || a?.created_at || '')) || 0;
        const tb = Date.parse(String(b?.updated_at || b?.uploaded_at || b?.created_at || '')) || 0;
        return tb - ta;
      });
      return safe;
    };

    if (companyId) {
      const exact = await supabase
        .from('pv_active_sales_reports')
        .select('*')
        .eq('branch', branch)
        .eq('company_id', companyId);
      if (!exact.error) {
        const sorted = sortByRecency(exact.data || []);
        if (sorted.length > 0) return sorted[0];
      }
    }

    // Fallback legado: sem company_id e sem colunas novas de ordenação.
    const legacy = await supabase
      .from('pv_active_sales_reports')
      .select('*')
      .eq('branch', branch);
    if (!legacy.error) {
      const sorted = sortByRecency(legacy.data || []);
      if (sorted.length > 0) return sorted[0];
    }
    return null;
  } catch (error) {
    console.error('Error fetching active sales report:', error);
    return null;
  }
}

export async function fetchAuditTermDrafts(branch: string, auditNumber: number): Promise<DbAuditTermDraft[]> {
  // Persistence consolidated in audit_sessions table (data field)
  return [];
}

export async function upsertAuditTermDrafts(drafts: DbAuditTermDraft[]): Promise<boolean> {
  // Persistence consolidated in audit_sessions table (data field)
  return true;
}

export async function deleteAuditTermDraftsForAudit(branch: string, auditNumber: number): Promise<boolean> {
  // Persistence consolidated in audit_sessions table (data field)
  return true;
}

export async function fetchAuditPartialTerms(branch: string, auditNumber: number): Promise<DbAuditPartialTerm[]> {
  // Persistence consolidated in audit_sessions table (data field)
  return [];
}

export async function upsertAuditPartialTerms(terms: DbAuditPartialTerm[]): Promise<boolean> {
  // Persistence consolidated in audit_sessions table (data field)
  return true;
}

export async function deleteAuditPartialTerms(
  branch: string,
  auditNumber: number,
  groupId: string,
  deptId?: string,
  catId?: string
): Promise<boolean> {
  // Persistence consolidated in audit_sessions table (data field)
  return true;
}

export async function deleteAuditPartialTermsForAudit(
  branch: string,
  auditNumber: number
): Promise<boolean> {
  // Persistence consolidated in audit_sessions table (data field)
  return true;
}

export async function upsertActiveSalesReport(report: DbActiveSalesReport): Promise<boolean> {
  try {
    const payloadBase: any = {
      company_id: report.company_id,
      branch: report.branch,
      sales_records: report.sales_records,
      sales_period: report.sales_period,
      confirmed_sales: report.confirmed_sales,
      user_email: report.user_email,
      file_name: report.file_name,
      updated_at: new Date().toISOString()
    };

    // Keep original report extraction timestamp unless an explicit value is provided.
    const payload: any = { ...payloadBase };
    if (report.uploaded_at !== undefined) {
      payload.uploaded_at = report.uploaded_at;
    }

    let result = await supabase
      .from('pv_active_sales_reports')
      .upsert(payload, { onConflict: 'company_id,branch' });

    // Fallback 1: schema sem uploaded_at ou sem unique(company_id,branch)
    if (result.error) {
      const noUploaded = { ...payloadBase };
      result = await supabase
        .from('pv_active_sales_reports')
        .upsert(noUploaded, { onConflict: 'company_id,branch' });
    }

    // Fallback 2: schema legado com unique somente por branch.
    if (result.error) {
      const legacyPayload = { ...payloadBase };
      delete legacyPayload.company_id;
      result = await supabase
        .from('pv_active_sales_reports')
        .upsert(legacyPayload, { onConflict: 'branch' });
    }

    if (result.error) throw result.error;
    return true;
  } catch (error) {
    console.error('Error upserting active sales report:', error);
    return false;
  }
}

export async function upsertPVSession(session: DbPVSession): Promise<DbPVSession | null> {
  try {
    const payload: any = {
      id: session.id,
      user_email: session.user_email,
      company_id: session.company_id,
      branch: session.branch,
      area: session.area,
      pharmacist: session.pharmacist,
      manager: session.manager,
      session_data: session.session_data || {},
      updated_at: session.updated_at || new Date().toISOString()
    };

    if (!session.id) {
      delete payload.id;
    }

    const { data, error } = await supabase
      .from('pv_sessions')
      .upsert([payload], { onConflict: 'user_email' })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Erro salvando sessÆo PV no Supabase:', error);
    return null;
  }
}

export interface DbPVBranchRecord {
  id?: string;
  company_id: string | null;
  branch: string;
  reduced_code: string;
  product_name: string;
  dcb: string;
  quantity: number;
  origin_branch?: string | null;
  sector_responsible?: string | null;
  expiry_date: string;
  entry_date: string;
  user_email: string;
  created_at?: string;
}

export async function fetchPVBranchRecords(companyId: string, branch: string): Promise<DbPVBranchRecord[]> {
  try {
    const normalizedBranch = String(branch || '').trim();
    if (!normalizedBranch) return [];

    const buildBaseQuery = () => {
      let query = supabase
        .from('pv_branch_records')
        .select('*')
        .order('created_at', { ascending: false });
      if (companyId) {
        query = query.or(`company_id.eq.${companyId},company_id.is.null`);
      }
      return query;
    };

    const { data, error } = await buildBaseQuery()
      .eq('branch', normalizedBranch);

    if (error) throw error;
    if (data && data.length > 0) return data;

    // Fallback 1: case-insensitive exact-ish match
    const { data: ilikeData, error: ilikeError } = await buildBaseQuery()
      .ilike('branch', normalizedBranch);
    if (ilikeError) throw ilikeError;
    if (ilikeData && ilikeData.length > 0) return ilikeData;

    // Fallback 2: trim-normalized comparison in memory (handles trailing spaces in DB)
    const { data: looseData, error: looseError } = await buildBaseQuery();
    if (looseError) throw looseError;
    const branchKey = normalizedBranch.toLowerCase();
    return (looseData || []).filter((record) => (
      String(record.branch || '').trim().toLowerCase() === branchKey
    ));
  } catch (error) {
    console.error('Error fetching PV branch records:', error);
    return [];
  }
}

export async function insertPVBranchRecord(record: DbPVBranchRecord): Promise<DbPVBranchRecord | null> {
  try {
    const { data, error } = await supabase
      .from('pv_branch_records')
      .insert([{
        company_id: record.company_id,
        branch: record.branch,
        reduced_code: record.reduced_code,
        product_name: record.product_name,
        dcb: record.dcb,
        quantity: record.quantity,
        origin_branch: record.origin_branch ?? null,
        sector_responsible: record.sector_responsible ?? null,
        expiry_date: record.expiry_date,
        entry_date: record.entry_date,
        user_email: record.user_email
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error inserting PV branch record:', JSON.stringify(error, null, 2));
    return null;
  }
}

export async function deletePVBranchRecord(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('pv_branch_records')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting PV branch record:', error);
    return false;
  }
}

export async function updatePVBranchRecord(id: string, quantity: number): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('pv_branch_records')
      .update({ quantity })
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating PV branch record:', error);
    return false;
  }
}

export async function insertPVSalesHistory(records: DbPVSalesHistory[]): Promise<boolean> {
  if (!records.length) return true;
  let payload: Record<string, any>[] = records.map(record => {
    const base = { ...record };
    pvSalesHistoryExcludedColumns.forEach(column => {
      if (column in base) delete base[column];
    });
    return base;
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { error } = await supabase
        .from('pv_sales_history')
        .insert(payload);

      if (error) throw error;
      return true;
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : '';
      const code = error?.code;
      const match = /'([^']+)' column/i.exec(message);
      if (code === 'PGRST204' && match?.[1]) {
        const missingColumn = match[1];
        if (pvSalesHistoryExcludedColumns.has(missingColumn)) break;
        pvSalesHistoryExcludedColumns.add(missingColumn);
        payload = payload.map(item => {
          const { [missingColumn]: _omit, ...rest } = item;
          return rest;
        });
        continue;
      }
      console.error('Error inserting PV sales history:', JSON.stringify(error, null, 2));
      return false;
    }
  }
  console.error('Error inserting PV sales history: coluna(s) ausente(s) e fallback falhou.');
  return false;
}

export async function fetchPVSalesHistory(companyId: string, branch: string): Promise<DbPVSalesHistory[]> {
  try {
    let query = supabase
      .from('pv_sales_history')
      .select('*')
      .eq('branch', branch)
      .order('finalized_at', { ascending: false });

    if (companyId) {
      query = query.or(`company_id.eq.${companyId},company_id.is.null`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching PV sales history:', error);
    try {
      const { data, error: retryError } = await supabase
        .from('pv_sales_history')
        .select('*')
        .eq('company_id', companyId)
        .eq('branch', branch);

      if (retryError) throw retryError;
      return data || [];
    } catch (retryError) {
      console.error('Error fetching PV sales history (fallback):', retryError);
      return [];
    }
  }
}

export async function updatePVBranchRecordDetails(
  id: string,
  updates: {
    quantity?: number;
    origin_branch?: string | null;
    sector_responsible?: string | null;
  }
): Promise<boolean> {
  try {
    const payload: Record<string, any> = {};
    if (typeof updates.quantity === 'number') payload.quantity = updates.quantity;
    if (updates.origin_branch !== undefined) payload.origin_branch = updates.origin_branch;
    if (updates.sector_responsible !== undefined) payload.sector_responsible = updates.sector_responsible;

    if (Object.keys(payload).length === 0) return true;

    const { error } = await supabase
      .from('pv_branch_records')
      .update(payload)
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating PV branch record details:', error);
    return false;
  }
}

export async function fetchPVSalesUploads(companyId: string, branch: string): Promise<DbPVSalesUpload[]> {
  try {
    const sortByRecency = (rows: any[]) => {
      const safe = Array.isArray(rows) ? [...rows] : [];
      safe.sort((a, b) => {
        const ta = Date.parse(String(a?.uploaded_at || a?.created_at || a?.updated_at || '')) || 0;
        const tb = Date.parse(String(b?.uploaded_at || b?.created_at || b?.updated_at || '')) || 0;
        return tb - ta;
      });
      return safe as DbPVSalesUpload[];
    };

    if (companyId) {
      const exact = await supabase
        .from('pv_sales_uploads')
        .select('*')
        .eq('branch', branch)
        .eq('company_id', companyId);
      if (!exact.error) {
        const sorted = sortByRecency(exact.data || []);
        if (sorted.length > 0) return sorted;
      }
    }

    // Fallback legado: sem company_id.
    const legacy = await supabase
      .from('pv_sales_uploads')
      .select('*')
      .eq('branch', branch);
    if (!legacy.error) return sortByRecency(legacy.data || []);
    return [];
  } catch (error) {
    console.error('Error fetching PV sales uploads:', error);
    return [];
  }
}

export async function deleteAuditSession(branch: string, auditNumber: number): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('audit_sessions')
      .delete()
      .eq('branch', branch)
      .eq('audit_number', auditNumber);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting audit session:', error);
    return false;
  }
}

export async function insertPVSalesUpload(upload: DbPVSalesUpload): Promise<DbPVSalesUpload | null> {
  try {
    const payload = {
      user_email: upload.user_email,
      company_id: upload.company_id,
      branch: upload.branch,
      period_label: upload.period_label,
      period_start: upload.period_start,
      period_end: upload.period_end,
      file_name: upload.file_name,
      uploaded_at: upload.uploaded_at ?? null
    };

    const { data, error } = await supabase
      .from('pv_sales_uploads')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.error('Error inserting PV sales upload:', error);
    return null;
  }
}

export async function fetchPVSalesAnalysisReports(companyId: string, branch: string): Promise<DbPVSalesAnalysisReport[]> {
  try {
    const sortByRecency = (rows: any[]) => {
      const safe = Array.isArray(rows) ? [...rows] : [];
      safe.sort((a, b) => {
        const ta = Date.parse(String(a?.uploaded_at || a?.updated_at || a?.created_at || '')) || 0;
        const tb = Date.parse(String(b?.uploaded_at || b?.updated_at || b?.created_at || '')) || 0;
        return tb - ta;
      });
      return safe as DbPVSalesAnalysisReport[];
    };

    if (companyId) {
      const exact = await supabase
        .from('pv_sales_analysis_reports')
        .select('*')
        .eq('branch', branch)
        .eq('company_id', companyId);
      if (!exact.error) {
        const sorted = sortByRecency(exact.data || []);
        if (sorted.length > 0) return sorted;
      }
    }

    // Fallback legado: sem company_id.
    const legacy = await supabase
      .from('pv_sales_analysis_reports')
      .select('*')
      .eq('branch', branch);
    if (!legacy.error) return sortByRecency(legacy.data || []);
    return [];
  } catch (error) {
    console.error('Error fetching PV sales analysis reports:', error);
    return [];
  }
}

export async function upsertPVSalesAnalysisReport(report: DbPVSalesAnalysisReport): Promise<DbPVSalesAnalysisReport | null> {
  try {
    const payloadBase: any = {
      company_id: report.company_id,
      branch: report.branch,
      period_label: report.period_label,
      period_start: report.period_start ?? null,
      period_end: report.period_end ?? null,
      file_name: report.file_name ?? null,
      analysis_payload: report.analysis_payload,
      updated_at: new Date().toISOString()
    };
    const payload: any = { ...payloadBase };
    if (report.uploaded_at !== undefined) {
      payload.uploaded_at = report.uploaded_at ?? null;
    }

    let result = await supabase
      .from('pv_sales_analysis_reports')
      .upsert(payload, { onConflict: 'company_id,branch,period_label' })
      .select()
      .single();

    // Fallback 1: sem uploaded_at ou sem unique(company_id,branch,period_label)
    if (result.error) {
      const noUploaded = { ...payloadBase };
      result = await supabase
        .from('pv_sales_analysis_reports')
        .upsert(noUploaded, { onConflict: 'company_id,branch,period_label' })
        .select()
        .single();
    }

    // Fallback 2: schema legado com unique(branch,period_label)
    if (result.error) {
      const legacyPayload = { ...payloadBase };
      delete legacyPayload.company_id;
      result = await supabase
        .from('pv_sales_analysis_reports')
        .upsert(legacyPayload, { onConflict: 'branch,period_label' })
        .select()
        .single();
    }

    if (result.error) throw result.error;
    return result.data || null;
  } catch (error) {
    console.error('Error upserting PV sales analysis report:', error);
    return null;
  }
}

export async function deletePVSession(userEmail: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('pv_sessions')
      .delete()
      .eq('user_email', userEmail);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erro ao excluir sessão PV do Supabase:', error);
    return false;
  }
}

export async function fetchPVBranchRecordEvents(companyId: string, branch: string, sinceISO?: string): Promise<DbPVBranchRecordEvent[]> {
  try {
    if (!branch) return [];
    let query = supabase
      .from('pv_branch_record_events')
      .select('*')
      .eq('branch', branch)
      .order('created_at', { ascending: false });

    if (companyId) {
      query = query.eq('company_id', companyId);
    }
    if (sinceISO) {
      query = query.gte('created_at', sinceISO);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching PV branch record events:', error);
    return [];
  }
}

export async function insertPVBranchRecordEvent(event: DbPVBranchRecordEvent): Promise<DbPVBranchRecordEvent | null> {
  try {
    const payload = {
      company_id: event.company_id,
      branch: event.branch,
      record_id: event.record_id ?? null,
      reduced_code: event.reduced_code ?? null,
      event_type: event.event_type,
      previous_quantity: event.previous_quantity ?? null,
      new_quantity: event.new_quantity ?? null,
      user_email: event.user_email ?? null
    };
    const { data, error } = await supabase
      .from('pv_branch_record_events')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.error('Error inserting PV branch record event:', error);
    return null;
  }
}

export async function pruneAppEventLogs(companyId?: string | null, branch?: string | null, days = 30): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    let query = supabase
      .from('app_event_logs')
      .delete()
      .lt('created_at', cutoff);
    if (companyId) query = query.eq('company_id', companyId);
    if (branch) query = query.eq('branch', branch);
    const { data, error } = await query.select('id');
    if (error) throw error;
    return data?.length || 0;
  } catch (error) {
    console.error('Error pruning app event logs:', error);
    return 0;
  }
}

export async function insertAppEventLog(event: DbAppEventLog): Promise<DbAppEventLog | null> {
  try {
    const payload = {
      company_id: event.company_id ?? null,
      branch: event.branch ?? null,
      area: event.area ?? null,
      user_email: event.user_email ?? null,
      user_name: event.user_name ?? null,
      app: event.app,
      event_type: event.event_type,
      entity_type: event.entity_type ?? null,
      entity_id: event.entity_id ?? null,
      status: event.status ?? null,
      success: event.success ?? null,
      duration_ms: event.duration_ms ?? null,
      error_code: event.error_code ?? null,
      source: event.source ?? null,
      event_meta: event.event_meta ?? null
    };
    const { data, error } = await supabase
      .from('app_event_logs')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    pruneAppEventLogs(event.company_id, event.branch, 30).catch(() => { });
    return data || null;
  } catch (error) {
    console.error('Error inserting app event log:', error);
    return null;
  }
}

export async function fetchAppEventLogs(params: {
  companyId?: string | null;
  branch?: string | null;
  area?: string | null;
  app?: string | null;
  eventType?: string | null;
  userEmail?: string | null;
  sinceISO?: string | null;
  limit?: number;
}): Promise<DbAppEventLog[]> {
  try {
    let query = supabase
      .from('app_event_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (params.companyId) query = query.eq('company_id', params.companyId);
    if (params.branch) query = query.eq('branch', params.branch);
    if (params.area) query = query.eq('area', params.area);
    if (params.app) query = query.eq('app', params.app);
    if (params.eventType) query = query.eq('event_type', params.eventType);
    if (params.userEmail) query = query.eq('user_email', params.userEmail);
    if (params.sinceISO) query = query.gte('created_at', params.sinceISO);
    if (params.limit) query = query.limit(params.limit);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching app event logs:', error);
    return [];
  }
}

export async function fetchGlobalBaseFiles(companyId: string): Promise<DbGlobalBaseFile[]> {
  try {
    const { data, error } = await supabase
      .from('global_base_files')
      .select('*')
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching global base files:', error);
    return [];
  }
}

export async function fetchGlobalBaseFileMeta(companyId: string, moduleKey: string): Promise<Partial<DbGlobalBaseFile> | null> {
  try {
    const { data, error } = await supabase
      .from('global_base_files')
      .select('id, company_id, module_key, file_name, file_size, uploaded_by, uploaded_at, updated_at')
      .eq('company_id', companyId)
      .eq('module_key', moduleKey)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  } catch (error) {
    console.error('Error fetching global base file metadata:', error);
    return null;
  }
}

export async function fetchGlobalBaseFileFull(companyId: string, moduleKey: string): Promise<DbGlobalBaseFile | null> {
  try {
    const { data, error } = await supabase
      .from('global_base_files')
      .select('*')
      .eq('company_id', companyId)
      .eq('module_key', moduleKey)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  } catch (error) {
    console.error('Error fetching global base file full:', error);
    return null;
  }
}

export async function fetchGlobalBaseFilesForModules(
  companyId: string,
  moduleKeys: string[]
): Promise<DbGlobalBaseFile[]> {
  try {
    const sanitizedKeys = Array.from(new Set((moduleKeys || []).map(key => String(key || '').trim()).filter(Boolean)));
    if (!companyId || sanitizedKeys.length === 0) return [];

    const { data, error } = await supabase
      .from('global_base_files')
      .select('id,company_id,module_key,file_name,mime_type,file_size,file_data_base64,uploaded_by,uploaded_at,updated_at')
      .eq('company_id', companyId)
      .in('module_key', sanitizedKeys);
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching global base files for modules:', error);
    return [];
  }
}

export async function fetchGlobalBaseFilesMeta(companyId: string): Promise<DbGlobalBaseFile[]> {
  try {
    const { data, error } = await supabase
      .from('global_base_files')
      .select('id,company_id,module_key,file_name,mime_type,file_size,uploaded_by,uploaded_at,updated_at')
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching global base files metadata:', error);
    return [];
  }
}

export async function upsertGlobalBaseFile(file: DbGlobalBaseFile): Promise<DbGlobalBaseFile | null> {
  try {
    const payload = {
      company_id: file.company_id,
      module_key: file.module_key,
      file_name: file.file_name ?? null,
      mime_type: file.mime_type ?? null,
      file_size: file.file_size ?? null,
      file_data_base64: file.file_data_base64 ?? null,
      uploaded_by: file.uploaded_by ?? null,
      uploaded_at: file.uploaded_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('global_base_files')
      .upsert(payload, { onConflict: 'company_id,module_key' })
      .select()
      .single();
    if (error) throw error;
    return data || null;
  } catch (error) {
    console.error('Error upserting global base file:', error);
    return null;
  }
}

export async function fetchPVDashboardReports(companyId: string, branch: string, limit = 5): Promise<DbPVDashboardReport[]> {
  try {
    const { data, error } = await supabase
      .from('pv_dashboard_reports')
      .select('*')
      .eq('company_id', companyId)
      .eq('branch', branch)
      .limit(limit);

    if (!error) return data || [];
  } catch (error) {
    console.error('Error fetching PV dashboard reports:', error);
    try {
      const { data, error: retryError } = await supabase
        .from('pv_dashboard_reports')
        .select('*')
        .eq('company_id', companyId)
        .eq('branch', branch)
        .limit(limit);

      if (retryError) throw retryError;
      return data || [];
    } catch (retryError) {
      console.error('Error fetching PV dashboard reports (fallback):', retryError);
      return [];
    }
  }
}

export async function insertPVDashboardReport(report: DbPVDashboardReport): Promise<DbPVDashboardReport | null> {
  try {
    const payload = {
      company_id: report.company_id,
      branch: report.branch,
      report_type: report.report_type,
      period_label: report.period_label ?? null,
      user_email: report.user_email ?? null,
      file_name: report.file_name ?? null,
      pdf_base64: report.pdf_base64
    };
    const { data, error } = await supabase
      .from('pv_dashboard_reports')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.error('Error inserting PV dashboard report:', error);
    return null;
  }
}

export async function fetchPVInventoryReport(companyId: string, branch: string): Promise<DbPVInventoryReport | null> {
  try {
    let query = supabase
      .from('pv_inventory_reports')
      .select('*')
      .eq('branch', branch)
      .order('uploaded_at', { ascending: false })
      .limit(1);

    if (companyId) {
      query = query.or(`company_id.eq.${companyId},company_id.is.null`);
    }

    const { data, error } = await query;

    if (error) throw error;
    if (data && data.length > 0) return data[0];
    return null;
  } catch (error) {
    console.error('Error fetching PV inventory report:', error);
    return null;
  }
}

export async function upsertPVInventoryReport(report: DbPVInventoryReport): Promise<DbPVInventoryReport | null> {
  try {
    const payload = {
      company_id: report.company_id,
      branch: report.branch,
      file_name: report.file_name ?? null,
      uploaded_at: report.uploaded_at ?? null,
      records: report.records,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('pv_inventory_reports')
      .upsert(payload, { onConflict: 'company_id,branch' })
      .select()
      .single();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.error('Error upserting PV inventory report:', error);
    return null;
  }
}

export async function fetchPVReports(
  userEmail: string,
  options?: {
    reportType?: 'system' | 'dcb';
    companyId?: string | null;
    branch?: string | null;
  }
): Promise<DbPVReport[]> {
  try {
    const reportType = options?.reportType;
    const companyId = options?.companyId || null;
    const branch = options?.branch || null;
    const queryColumns = 'id,user_email,company_id,branch,report_type,products,created_at,updated_at';

    const compareByFreshness = (a: DbPVReport, b: DbPVReport) => {
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
      return bTime - aTime;
    };

    const pickLatestForType = (
      type: 'system' | 'dcb',
      primary: DbPVReport[],
      secondary: DbPVReport[]
    ): DbPVReport | undefined => {
      const primaryTyped = primary
        .filter(item => item.report_type === type)
        .sort(compareByFreshness);
      const secondaryTyped = secondary
        .filter(item => item.report_type === type)
        .sort(compareByFreshness);

      const primaryWithProducts = primaryTyped.find(item => Array.isArray(item.products) && item.products.length > 0);
      if (primaryWithProducts) return primaryWithProducts;

      const secondaryWithProducts = secondaryTyped.find(item => Array.isArray(item.products) && item.products.length > 0);
      if (secondaryWithProducts) return secondaryWithProducts;

      return primaryTyped[0] || secondaryTyped[0];
    };

    let branchData: DbPVReport[] = [];
    let userData: DbPVReport[] = [];

    if (companyId && branch) {
      let branchQuery = supabase
        .from('pv_reports')
        .select(queryColumns)
        .eq('company_id', companyId)
        .eq('branch', branch)
        .order('updated_at', { ascending: false, nullsFirst: false });

      if (reportType) {
        branchQuery = branchQuery.eq('report_type', reportType);
      }

      const { data, error } = await branchQuery;
      if (error) {
        console.error('Error fetching PV reports (branch scope):', error);
      } else {
        branchData = data || [];
      }
    }

    const needsUserFallback = !companyId || !branch || (
      reportType
        ? branchData.filter(item => item.report_type === reportType).length === 0
        : ['system', 'dcb'].some(type => !branchData.some(item => item.report_type === type))
    );

    if (needsUserFallback) {
      let userQuery = supabase
        .from('pv_reports')
        .select(queryColumns)
        .eq('user_email', userEmail)
        .order('updated_at', { ascending: false, nullsFirst: false });

      if (reportType) {
        userQuery = userQuery.eq('report_type', reportType);
      }

      const { data, error } = await userQuery;
      if (error) {
        console.error('Error fetching PV reports (user scope):', error);
      } else {
        userData = data || [];
      }
    }

    if (reportType) {
      const chosen = pickLatestForType(reportType, branchData, userData);
      return chosen ? [chosen] : [];
    }

    const system = pickLatestForType('system', branchData, userData);
    const dcb = pickLatestForType('dcb', branchData, userData);

    return [system, dcb].filter((item): item is DbPVReport => Boolean(item));
  } catch (error) {
    console.error('Error fetching PV reports:', error);
    return [];
  }
}

export async function upsertPVReport(report: DbPVReport): Promise<DbPVReport | null> {
  let payload: Record<string, any> = {
    user_email: report.user_email,
    company_id: report.company_id,
    branch: report.branch,
    report_type: report.report_type,
    products: report.products,
    updated_at: new Date().toISOString()
  };

  pvReportsExcludedColumns.forEach(column => {
    if (column in payload) delete payload[column];
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { data: existing, error: existingError } = await supabase
        .from('pv_reports')
        .select('id')
        .eq('user_email', report.user_email)
        .eq('report_type', report.report_type)
        .limit(1);

      if (existingError) throw existingError;

      if (existing && existing.length > 0) {
        const { error } = await supabase
          .from('pv_reports')
          .update(payload)
          .eq('user_email', report.user_email)
          .eq('report_type', report.report_type);

        if (error) throw error;
        return {
          ...report,
          id: existing[0].id,
          updated_at: payload.updated_at
        };
      }

      const { data, error } = await supabase
        .from('pv_reports')
        .insert([payload])
        .select('id, report_type, updated_at')
        .single();

      if (error) throw error;
      return {
        ...report,
        id: data?.id,
        updated_at: data?.updated_at || payload.updated_at
      };
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : '';
      const code = error?.code;
      const match = /'([^']+)' column/i.exec(message);
      if (code === 'PGRST204' && match?.[1]) {
        const missingColumn = match[1];
        if (pvReportsExcludedColumns.has(missingColumn)) break;
        pvReportsExcludedColumns.add(missingColumn);
        const { [missingColumn]: _omit, ...rest } = payload;
        payload = rest;
        continue;
      }
      console.error('Error upserting PV report:', error);
      return null;
    }
  }

  console.error('Error upserting PV report: coluna(s) ausente(s) e fallback falhou.');
  return null;
}

export async function deletePVReports(userEmail: string, reportType?: 'system' | 'dcb'): Promise<boolean> {
  try {
    let query = supabase
      .from('pv_reports')
      .delete()
      .eq('user_email', userEmail);

    if (reportType) {
      query = query.eq('report_type', reportType);
    }

    const { error } = await query;
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting PV reports:', error);
    return false;
  }
}

export async function deletePVBranchSalesHistory(companyId: string, branch: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('pv_sales_history')
      .delete()
      .eq('company_id', companyId)
      .eq('branch', branch);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting PV sales history for branch:', error);
    return false;
  }
}

// ==================== DRAFTS ====================

export async function fetchDraft(userEmail: string): Promise<DbDraft | null> {
  try {
    const { data, error } = await supabase
      .from('drafts')
      .select('*')
      .eq('user_email', userEmail)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  } catch (error) {
    console.error('Error fetching draft:', error);
    return null;
  }
}

/**
 * Lightweight check for draft changes
 */
export async function fetchDraftMetadata(userEmail: string): Promise<{ updated_at: string } | null> {
  try {
    const { data, error } = await supabase
      .from('drafts')
      .select('updated_at')
      .eq('user_email', userEmail)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  } catch (error) {
    console.error('Error fetching draft metadata:', error);
    return null;
  }
}

export async function saveDraft(draft: DbDraft): Promise<DbDraft | null> {
  try {
    // Use upsert to avoid race condition from fetch-before-save pattern
    const { data, error } = await supabase
      .from('drafts')
      .upsert({
        user_email: draft.user_email,
        form_data: draft.form_data,
        images: draft.images,
        signatures: draft.signatures,
        ignored_checklists: draft.ignored_checklists,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_email'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error saving draft:', error);
    return null;
  }
}

export async function deleteDraft(userEmail: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('drafts')
      .delete()
      .eq('user_email', userEmail);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting draft:', error);
    return false;
  }
}

// ==================== MIGRATION HELPERS ====================

export async function migrateLocalStorageToSupabase() {
  try {
    const results = {
      users: 0,
      config: false,
      reports: 0,
      drafts: 0
    };

    // Migrar usuários
    const localUsers = localStorage.getItem('APP_USERS');
    if (localUsers) {
      const users = JSON.parse(localUsers);
      for (const user of users) {
        // Try update if exists, else create
        try {
          const { data: existing } = await supabase
            .from('users')
            .select('email')
            .eq('email', user.email)
            .limit(1);
          if (existing && existing.length > 0) {
            await updateUser(user.email, user);
            results.users++;
          } else {
            const created = await createUser(user);
            if (created) results.users++;
          }
        } catch (e) {
          console.error('Error upserting user during migration:', e);
        }
      }
    }

    // Migrar configurações
    const localConfig = localStorage.getItem('APP_CONFIG');
    if (localConfig) {
      const config = JSON.parse(localConfig);
      results.config = await saveConfig(config);
    }

    // Migrar relatórios
    const localHistory = localStorage.getItem('APP_HISTORY');
    if (localHistory) {
      const reports = JSON.parse(localHistory);
      for (const report of reports) {
        const dbReport: DbReport = {
          user_email: report.userEmail,
          user_name: report.userName,
          pharmacy_name: report.pharmacyName,
          score: report.score,
          form_data: report.formData,
          images: report.images,
          signatures: report.signatures,
          ignored_checklists: report.ignoredChecklists
        };
        const exists = await reportExists(dbReport);
        if (!exists) {
          const created = await createReport(dbReport);
          if (created) results.reports++;
        }
      }
    }

    // Migrar rascunhos
    const localDrafts = localStorage.getItem('APP_DRAFTS');
    if (localDrafts) {
      const draftsObj = JSON.parse(localDrafts);
      for (const [email, draft] of Object.entries(draftsObj)) {
        const result = await saveDraft({
          user_email: email,
          ...(draft as any)
        });
        if (result) results.drafts++;
      }
    }

    return results;
  } catch (error) {
    console.error('Error migrating data:', error);
    return null;
  }
}

// ==================== TICKETS (SUPPORT/FEATURES) ====================

export interface DbTicket {
  id?: string;
  title: string;
  description: string;
  images?: string[]; // array of base64 strings
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'IGNORED';
  user_email: string;
  user_name: string;
  admin_response?: string;
  created_at?: string;
  updated_at?: string;
}

export async function fetchTickets(): Promise<DbTicket[]> {
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('*');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching tickets:', error);
    return [];
  }
}

export async function createTicket(ticket: DbTicket): Promise<DbTicket | null> {
  try {
    const { data, error } = await supabase
      .from('tickets')
      .insert([{
        title: ticket.title,
        description: ticket.description,
        images: ticket.images || [],
        status: 'OPEN',
        user_email: ticket.user_email,
        user_name: ticket.user_name
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating ticket:', error);
    return null;
  }
}

export async function updateTicketStatus(id: string, status: string, response?: string): Promise<boolean> {
  try {
    const updates: any = {
      status,
      updated_at: new Date().toISOString()
    };
    if (response !== undefined) {
      updates.admin_response = response;
    }

    const { error } = await supabase
      .from('tickets')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating ticket:', error);
    return false;
  }
}

export function exportLocalStorageBackup() {
  const backup = {
    timestamp: new Date().toISOString(),
    users: localStorage.getItem('APP_USERS'),
    config: localStorage.getItem('APP_CONFIG'),
    history: localStorage.getItem('APP_HISTORY'),
    drafts: localStorage.getItem('APP_DRAFTS')
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-checklist-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- ACTIVE SESSIONS & COMMANDS ---

export async function upsertActiveSession(session: Partial<DbActiveSession>): Promise<boolean> {
  try {
    const clientId = session.client_id;
    if (!clientId) return false;

    // Heartbeat não deve sobrescrever "command" para evitar perder FORCE_LOGOUT/RELOAD
    const heartbeatPayload: Partial<DbActiveSession> = { ...session };
    delete (heartbeatPayload as any).command;
    const upsertPayload: Partial<DbActiveSession> = {
      ...heartbeatPayload,
      client_id: clientId,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('active_sessions')
      .upsert(upsertPayload, { onConflict: 'client_id' });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error upserting active session:', error);
    return false;
  }
}

export async function fetchActiveSessions(): Promise<DbActiveSession[]> {
  try {
    // Buscar sessões que deram ping nos últimos 5 minutos
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('active_sessions')
      .select('*')
      .gt('last_ping', fiveMinutesAgo)
      .order('last_ping', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    return [];
  }
}

export async function sendSessionCommand(clientId: string, command: 'FORCE_LOGOUT' | 'RELOAD' | null): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('active_sessions')
      .update({ command, updated_at: new Date().toISOString() })
      .eq('client_id', clientId)
      .select('client_id');

    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    console.error('Error sending session command:', error);
    return false;
  }
}

export async function fetchActiveSessionByClientId(clientId: string): Promise<DbActiveSession | null> {
  try {
    const { data, error } = await supabase
      .from('active_sessions')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.error('Error fetching active session by client id:', error);
    return null;
  }
}

export async function deleteActiveSession(clientId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('active_sessions')
      .delete()
      .eq('client_id', clientId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting active session:', error);
    return false;
  }
}

export async function forceExpireActiveSession(clientId: string): Promise<boolean> {
  try {
    const stalePing = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('active_sessions')
      .update({
        command: 'FORCE_LOGOUT',
        last_ping: stalePing,
        updated_at: new Date().toISOString()
      })
      .eq('client_id', clientId)
      .select('client_id');

    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    console.error('Error force-expiring active session:', error);
    return false;
  }
}
