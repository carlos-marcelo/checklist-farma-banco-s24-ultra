-- ==========================================
-- FULL DATABASE SETUP FOR CHECKLIST-FARMA
-- Run this in the Supabase SQL Editor
-- ==========================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CORE TABLES

-- Users
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  name text NOT NULL,
  phone text,
  role text CHECK (role IN ('MASTER', 'ADMINISTRATIVO', 'USER')),
  approved boolean DEFAULT false,
  rejected boolean DEFAULT false,
  photo text,
  preferred_theme text DEFAULT 'blue',
  company_id uuid,
  area text,
  filial text,
  created_at timestamptz DEFAULT now()
);

-- Companies
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cnpj text,
  phone text,
  logo text,
  areas jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Configs
CREATE TABLE IF NOT EXISTS public.configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_name text NOT NULL,
  logo text,
  updated_at timestamptz DEFAULT now()
);

-- Reports (Checklist Reports)
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text,
  user_name text,
  pharmacy_name text,
  score text,
  form_data jsonb,
  images jsonb,
  signatures jsonb,
  ignored_checklists jsonb,
  date text,
  created_at timestamptz DEFAULT now()
);

-- Tickets (Support/Tickets)
CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  images text[] DEFAULT '{}'::text[],
  status text DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'DONE', 'IGNORED')),
  user_email text,
  user_name text,
  admin_response text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Checklist Definitions
CREATE TABLE IF NOT EXISTS public.checklist_definitions (
  id text PRIMARY KEY,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Access Matrix
CREATE TABLE IF NOT EXISTS public.access_matrix (
  level text PRIMARY KEY,
  modules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- 3. STOCK CONFERENCE TABLES

-- Stock Conference Reports
CREATE TABLE IF NOT EXISTS public.stock_conference_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text,
  user_name text,
  branch text,
  area text,
  pharmacist text,
  manager text,
  summary jsonb,
  items jsonb,
  created_at timestamptz DEFAULT now()
);

-- Stock Conference Sessions
CREATE TABLE IF NOT EXISTS public.stock_conference_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text UNIQUE NOT NULL,
  branch text,
  area text,
  company_id text,
  pharmacist text,
  manager text,
  step text,
  products jsonb DEFAULT '[]'::jsonb,
  inventory jsonb DEFAULT '[]'::jsonb,
  recount_targets jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- 4. PRE-VENCIDOS (PV) TABLES

-- PV: Sessions
CREATE TABLE IF NOT EXISTS public.pv_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text UNIQUE NOT NULL,
  company_id text,
  branch text,
  area text,
  pharmacist text,
  manager text,
  session_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- PV: Active Sales Reports
CREATE TABLE IF NOT EXISTS public.pv_active_sales_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text,
  branch text,
  sales_records jsonb,
  sales_period text,
  confirmed_sales jsonb,
  user_email text,
  file_name text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, branch)
);

-- PV: Branch Records (Cadastro)
CREATE TABLE IF NOT EXISTS public.pv_branch_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text,
  branch text,
  reduced_code text,
  product_name text,
  dcb text,
  quantity numeric,
  origin_branch text,
  sector_responsible text,
  expiry_date text,
  entry_date text,
  user_email text,
  created_at timestamptz DEFAULT now()
);

-- PV: Sales History
CREATE TABLE IF NOT EXISTS public.pv_sales_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text,
  branch text,
  user_email text,
  sale_period text,
  seller_name text,
  reduced_code text,
  product_name text,
  qty_sold_pv numeric,
  qty_ignored numeric,
  qty_neutral numeric,
  unit_price numeric,
  value_sold_pv numeric,
  value_ignored numeric,
  finalized_at timestamptz DEFAULT now()
);

-- PV: Sales Uploads
CREATE TABLE IF NOT EXISTS public.pv_sales_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text,
  company_id text,
  branch text,
  period_label text,
  period_start text,
  period_end text,
  file_name text,
  uploaded_at timestamptz DEFAULT now()
);

-- PV: Sales Analysis Reports
CREATE TABLE IF NOT EXISTS public.pv_sales_analysis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text,
  branch text,
  period_label text,
  period_start text,
  period_end text,
  file_name text,
  uploaded_at text,
  analysis_payload jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, branch, period_label)
);

-- PV: Dashboard Reports (PDFs)
CREATE TABLE IF NOT EXISTS public.pv_dashboard_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  branch text NOT NULL,
  report_type text NOT NULL,
  period_label text,
  user_email text,
  file_name text,
  pdf_base64 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- PV: Inventory Reports
CREATE TABLE IF NOT EXISTS public.pv_inventory_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text,
  branch text,
  file_name text,
  uploaded_at text,
  records jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, branch)
);

-- PV: Branch Record Events
CREATE TABLE IF NOT EXISTS public.pv_branch_record_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  branch text NOT NULL,
  record_id text,
  reduced_code text,
  event_type text NOT NULL,
  previous_quantity numeric,
  new_quantity numeric,
  user_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- PV: Reports (system/dcb)
CREATE TABLE IF NOT EXISTS public.pv_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text,
  company_id text,
  branch text,
  report_type text,
  products jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_email, report_type)
);

-- PV: Products (Main product list)
CREATE TABLE IF NOT EXISTS public.pre_vencidos_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reduced_code text,
  product_name text,
  dcb text,
  presentation text,
  category text,
  company_id text,
  branch text,
  user_email text,
  created_at timestamptz DEFAULT now()
);

-- PV: Product Registrations (System records)
CREATE TABLE IF NOT EXISTS public.product_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reduced_code text,
  product_name text,
  category text,
  presentation text,
  user_email text,
  company_id text,
  created_at timestamptz DEFAULT now()
);

-- 5. SYSTEM TABLES

-- Global Base Files (base64 storage)
CREATE TABLE IF NOT EXISTS public.global_base_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  module_key text NOT NULL,
  file_name text,
  mime_type text,
  file_size numeric,
  file_data_base64 text,
  uploaded_by text,
  uploaded_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, module_key)
);

-- App Event Logs
CREATE TABLE IF NOT EXISTS public.app_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text,
  branch text,
  area text,
  user_email text,
  user_name text,
  app text NOT NULL,
  event_type text NOT NULL,
  entity_type text,
  entity_id text,
  status text,
  success boolean,
  duration_ms numeric,
  error_code text,
  source text,
  event_meta jsonb,
  created_at timestamptz DEFAULT now()
);

-- Drafts
CREATE TABLE IF NOT EXISTS public.drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text UNIQUE NOT NULL,
  form_data jsonb,
  images jsonb,
  signatures jsonb,
  ignored_checklists jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Audit Sessions (from audit_schema.sql)
CREATE TABLE IF NOT EXISTS public.audit_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch text NOT NULL,
  audit_number integer NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  data jsonb,
  progress numeric DEFAULT 0,
  user_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(branch, audit_number)
);

-- 6. FUNCTIONS & TRIGGERS

-- Function to handle updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER trg_checklist_definitions_updated_at BEFORE UPDATE ON public.checklist_definitions FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER trg_access_matrix_updated_at BEFORE UPDATE ON public.access_matrix FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER trg_pv_sessions_updated_at BEFORE UPDATE ON public.pv_sessions FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER trg_pv_sales_analysis_reports_updated_at BEFORE UPDATE ON public.pv_sales_analysis_reports FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER trg_pv_inventory_reports_updated_at BEFORE UPDATE ON public.pv_inventory_reports FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER trg_pv_reports_updated_at BEFORE UPDATE ON public.pv_reports FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER trg_global_base_files_updated_at BEFORE UPDATE ON public.global_base_files FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER trg_audit_sessions_updated_at BEFORE UPDATE ON public.audit_sessions FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER trg_drafts_updated_at BEFORE UPDATE ON public.drafts FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- 7. RLS (Basic - Open for now as per current project state)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all read" ON public.users FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON public.users FOR UPDATE USING (true);

CREATE POLICY "Allow all read" ON public.companies FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON public.companies FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON public.companies FOR UPDATE USING (true);

CREATE POLICY "Allow all read" ON public.reports FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON public.reports FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all read" ON public.tickets FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON public.tickets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON public.tickets FOR UPDATE USING (true);

-- Repeat RLS policies for other tables if necessary. For now, we follow the "open access for authenticated" pattern.
-- (Note: In a production app, these should be restricted by user_email or role).
