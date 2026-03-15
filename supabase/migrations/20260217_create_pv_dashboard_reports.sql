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
