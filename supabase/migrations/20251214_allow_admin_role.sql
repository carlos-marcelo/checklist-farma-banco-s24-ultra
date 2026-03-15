-- Allow the new ADMINISTRATIVO role to be inserted into users.role
ALTER TABLE public.users
  ALTER COLUMN role TYPE text USING role::text;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (
    role = ANY (ARRAY['MASTER'::text, 'ADMINISTRATIVO'::text, 'USER'::text])
  );

CREATE TABLE public.access_matrix (
  level text PRIMARY KEY,
  modules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.trg_access_matrix_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER access_matrix_updated_at
  BEFORE UPDATE ON public.access_matrix
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_access_matrix_updated_at();
