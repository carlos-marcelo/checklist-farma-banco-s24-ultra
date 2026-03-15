-- Global base files shared across modules/branches (master-managed)
create table if not exists public.global_base_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  module_key text not null,
  file_name text,
  mime_type text,
  file_size bigint,
  file_data_base64 text,
  uploaded_by text,
  uploaded_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_global_base_files_company_module
  on public.global_base_files (company_id, module_key);

create index if not exists idx_global_base_files_company_updated
  on public.global_base_files (company_id, updated_at desc);
