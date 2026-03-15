CREATE TABLE IF NOT EXISTS public.pv_inventory_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  branch text NOT NULL,
  file_name text,
  uploaded_at timestamptz,
  records jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pv_inventory_reports_unique
  ON public.pv_inventory_reports (company_id, branch);
