-- PV: Histórico de Vendas (campos extras)
ALTER TABLE public.pv_sales_history
  ADD COLUMN IF NOT EXISTS unit_price numeric,
  ADD COLUMN IF NOT EXISTS value_sold_pv numeric,
  ADD COLUMN IF NOT EXISTS value_ignored numeric;

-- PV: Eventos de edição/exclusão no cadastro
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
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_pv_branch_record_events_branch_created
  ON public.pv_branch_record_events (company_id, branch, created_at DESC);

-- PV: Relatórios PDF do ranking mensal
CREATE TABLE IF NOT EXISTS public.pv_dashboard_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  branch text NOT NULL,
  report_type text NOT NULL,
  period_label text,
  user_email text,
  file_name text,
  pdf_base64 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_pv_dashboard_reports_company_branch_created
  ON public.pv_dashboard_reports (company_id, branch, created_at DESC);

-- PV: Ajustes de timestamps no cadastro de relatórios (pv_reports)
ALTER TABLE public.pv_reports
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT timezone('utc', now());

ALTER TABLE public.pv_reports
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc', now());

ALTER TABLE public.pv_reports
  ADD COLUMN IF NOT EXISTS company_id text,
  ADD COLUMN IF NOT EXISTS branch text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pv_reports_user_type
  ON public.pv_reports (user_email, report_type);
