CREATE TABLE public.checklist_definitions (
  id text PRIMARY KEY,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.trg_checklist_definitions_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER checklist_definitions_updated_at
  BEFORE UPDATE ON public.checklist_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_checklist_definitions_updated_at();
