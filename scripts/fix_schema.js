import { createClient } from '@supabase/supabase-js';

const NEW_URL = 'https://yldfiqxtgxqtmlxjqhva.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZGZpcXh0Z3hxdG1seGpxaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDU4MzYsImV4cCI6MjA4NzIyMTgzNn0.Y2Gv1uUC_CXEJhoqU-m3Z5h5cwm9JdNQE2tVoBh9oSc';

const supabase = createClient(NEW_URL, NEW_KEY);

async function fixSchema() {
    console.log('🛠️ Ajustando schema no novo projeto...');

    // Como não temos acesso direto ao SQL Editor via API sem a chave de serviço (service_role),
    // e estamos usando a chave anon, não podemos rodar DDL (CREATE/ALTER).
    // O usuário precisará rodar isso no dashboard.

    console.log('Por favor, rode o seguinte SQL no Dashboard do Supabase (SQL Editor):');
    console.log('------------------------------------------------------------');
    console.log('ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS "date" text;');
    console.log('------------------------------------------------------------');
}

fixSchema().catch(console.error);
