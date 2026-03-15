-- Create table for Audit Sessions
CREATE TABLE IF NOT EXISTS public.audit_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch TEXT NOT NULL,
    audit_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
    data JSONB,
    progress NUMERIC DEFAULT 0,
    user_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(branch, audit_number)
);

-- Enable Row Level Security
ALTER TABLE public.audit_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies (Adjust as needed for your auth setup)
CREATE POLICY "Enable read access for all" ON public.audit_sessions
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Enable insert for all" ON public.audit_sessions
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "Enable update for all" ON public.audit_sessions
    FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Create a generic function to update 'updated_at' column
CREATE OR REPLACE FUNCTION public.handle_audit_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for audit_sessions
DROP TRIGGER IF EXISTS handle_audit_updated_at ON public.audit_sessions;
CREATE TRIGGER handle_audit_updated_at
    BEFORE UPDATE ON public.audit_sessions
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_audit_updated_at();
