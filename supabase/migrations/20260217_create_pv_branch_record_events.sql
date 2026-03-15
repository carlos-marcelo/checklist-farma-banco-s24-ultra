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
