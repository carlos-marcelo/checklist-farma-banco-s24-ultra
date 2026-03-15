-- App Event Logs (30-day rolling storage)
create table if not exists public.app_event_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  branch text,
  area text,
  user_email text,
  user_name text,
  app text not null,
  event_type text not null,
  entity_type text,
  entity_id text,
  status text,
  success boolean,
  duration_ms integer,
  error_code text,
  source text,
  event_meta jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.app_event_logs
  add column if not exists area text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists status text,
  add column if not exists success boolean,
  add column if not exists duration_ms integer,
  add column if not exists error_code text,
  add column if not exists source text;

create index if not exists idx_app_event_logs_company_branch_created
  on public.app_event_logs (company_id, branch, created_at desc);

create index if not exists idx_app_event_logs_company_area_created
  on public.app_event_logs (company_id, area, created_at desc);

create index if not exists idx_app_event_logs_user_created
  on public.app_event_logs (user_email, created_at desc);

create index if not exists idx_app_event_logs_app_created
  on public.app_event_logs (app, created_at desc);

create index if not exists idx_app_event_logs_app_type_created
  on public.app_event_logs (app, event_type, created_at desc);
