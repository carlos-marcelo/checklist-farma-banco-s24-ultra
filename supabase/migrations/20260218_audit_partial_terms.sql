-- Audit Partial Terms (custom completions history)
CREATE TABLE IF NOT EXISTS public.audit_partial_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch text NOT NULL,
  audit_number integer NOT NULL,
  batch_id text NOT NULL,
  group_id text NOT NULL,
  dept_id text,
  cat_id text,
  started_at timestamptz,
  completed_at timestamptz NOT NULL,
  user_email text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS audit_partial_terms_unique
  ON public.audit_partial_terms (branch, audit_number, batch_id, group_id, dept_id, cat_id);

CREATE INDEX IF NOT EXISTS audit_partial_terms_branch_audit
  ON public.audit_partial_terms (branch, audit_number, completed_at DESC);

ALTER TABLE public.audit_partial_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all (audit_partial_terms)" ON public.audit_partial_terms
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Enable insert for all (audit_partial_terms)" ON public.audit_partial_terms
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Enable update for all (audit_partial_terms)" ON public.audit_partial_terms
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable delete for all (audit_partial_terms)" ON public.audit_partial_terms
  FOR DELETE TO anon, authenticated
  USING (true);
