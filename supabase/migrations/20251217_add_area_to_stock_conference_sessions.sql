ALTER TABLE public.stock_conference_sessions
  ADD COLUMN IF NOT EXISTS area text;

ALTER TABLE public.stock_conference_sessions
  ADD COLUMN IF NOT EXISTS company_id text;
