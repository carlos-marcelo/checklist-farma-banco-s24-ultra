-- PV Integration Recovery (Backfill company_id / branch where possible)
-- 1) Ensure pv_reports has required columns/index (idempotent)
ALTER TABLE public.pv_reports
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT timezone('utc', now());

ALTER TABLE public.pv_reports
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc', now());

ALTER TABLE public.pv_reports
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS branch text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pv_reports_user_type
  ON public.pv_reports (user_email, report_type);

-- 2) Backfill tables that contain user_email (safe join with users)
-- pv_reports (company_id uuid)
UPDATE public.pv_reports r
SET company_id = COALESCE(r.company_id, u.company_id),
    branch = COALESCE(r.branch, u.filial),
    updated_at = COALESCE(r.updated_at, timezone('utc', now()))
FROM public.users u
WHERE r.user_email = u.email
  AND (r.company_id IS NULL OR r.branch IS NULL OR r.updated_at IS NULL);

-- pv_sales_uploads (company_id uuid)
UPDATE public.pv_sales_uploads s
SET company_id = COALESCE(s.company_id, u.company_id),
    branch = COALESCE(s.branch, u.filial)
FROM public.users u
WHERE s.user_email = u.email
  AND (s.company_id IS NULL OR s.branch IS NULL);

-- pv_sales_history (company_id text)
UPDATE public.pv_sales_history h
SET company_id = COALESCE(h.company_id, u.company_id::text),
    branch = COALESCE(h.branch, u.filial)
FROM public.users u
WHERE h.user_email = u.email
  AND (h.company_id IS NULL OR h.branch IS NULL);

-- pv_dashboard_reports (company_id text)
UPDATE public.pv_dashboard_reports d
SET company_id = COALESCE(d.company_id, u.company_id::text),
    branch = COALESCE(d.branch, u.filial)
FROM public.users u
WHERE d.user_email = u.email
  AND (d.company_id IS NULL OR d.branch IS NULL);

-- pv_branch_record_events (company_id text)
UPDATE public.pv_branch_record_events e
SET company_id = COALESCE(e.company_id, u.company_id::text),
    branch = COALESCE(e.branch, u.filial)
FROM public.users u
WHERE e.user_email = u.email
  AND (e.company_id IS NULL OR e.branch IS NULL);

-- pv_sessions (company_id uuid)
UPDATE public.pv_sessions s
SET company_id = COALESCE(s.company_id, u.company_id),
    branch = COALESCE(s.branch, u.filial)
FROM public.users u
WHERE s.user_email = u.email
  AND (s.company_id IS NULL OR s.branch IS NULL);

-- pv_active_sales_reports (company_id uuid)
UPDATE public.pv_active_sales_reports a
SET company_id = COALESCE(a.company_id, u.company_id),
    branch = COALESCE(a.branch, u.filial)
FROM public.users u
WHERE a.user_email = u.email
  AND (a.company_id IS NULL OR a.branch IS NULL);

-- 3) Manual backfill for tables without user_email (edit placeholders below)
-- Replace the values between {{ }} before running:
-- {{COMPANY_ID}} Example: 'c6db399b-9aea-4c56-a5fa-da41916306dd'
-- {{BRANCH}}     Example: 'Filial 14'

-- Uncomment to apply:
-- UPDATE public.pv_inventory_reports
-- SET company_id = {{COMPANY_ID}}
-- WHERE company_id IS NULL AND branch = {{BRANCH}};

-- UPDATE public.pv_sales_analysis_reports
-- SET company_id = {{COMPANY_ID}}
-- WHERE company_id IS NULL AND branch = {{BRANCH}};
