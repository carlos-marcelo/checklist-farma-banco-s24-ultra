CREATE TABLE IF NOT EXISTS public.pv_sales_analysis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  branch text NOT NULL,
  period_label text NOT NULL,
  period_start timestamptz,
  period_end timestamptz,
  file_name text,
  uploaded_at timestamptz,
  analysis_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pv_sales_analysis_reports_unique
  ON public.pv_sales_analysis_reports (company_id, branch, period_label);
