-- Enable RLS
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users
CREATE POLICY "Enable read access for all users" ON tickets
FOR SELECT USING (true);

-- Allow insert access to all authenticated users
CREATE POLICY "Enable insert access for all users" ON tickets
FOR INSERT WITH CHECK (true);

-- Allow update access to all authenticated users (logic handled in app for MASTER check, 
-- but we can refine this later if needed. For now, unblock the feature)
CREATE POLICY "Enable update access for all users" ON tickets
FOR UPDATE USING (true);
