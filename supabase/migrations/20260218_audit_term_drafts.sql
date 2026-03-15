-- Audit Term Drafts (shared across users)
CREATE TABLE IF NOT EXISTS public.audit_term_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch text NOT NULL,
  audit_number integer NOT NULL,
  term_key text NOT NULL,
  payload jsonb NOT NULL,
  user_email text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS audit_term_drafts_unique
  ON public.audit_term_drafts (branch, audit_number, term_key);

CREATE INDEX IF NOT EXISTS audit_term_drafts_branch_audit
  ON public.audit_term_drafts (branch, audit_number, updated_at DESC);

ALTER TABLE public.audit_term_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all (audit_term_drafts)" ON public.audit_term_drafts
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Enable insert for all (audit_term_drafts)" ON public.audit_term_drafts
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Enable update for all (audit_term_drafts)" ON public.audit_term_drafts
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable delete for all (audit_term_drafts)" ON public.audit_term_drafts
  FOR DELETE TO anon, authenticated
  USING (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_audit_term_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS handle_audit_term_drafts_updated_at ON public.audit_term_drafts;
CREATE TRIGGER handle_audit_term_drafts_updated_at
  BEFORE UPDATE ON public.audit_term_drafts
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_audit_term_drafts_updated_at();
