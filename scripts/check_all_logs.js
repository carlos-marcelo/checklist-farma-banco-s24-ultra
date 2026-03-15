import { createClient } from '@supabase/supabase-js';

const NEW_URL = 'https://yldfiqxtgxqtmlxjqhva.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZGZpcXh0Z3hxdG1seGpxaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDU4MzYsImV4cCI6MjA4NzIyMTgzNn0.Y2Gv1uUC_CXEJhoqU-m3Z5h5cwm9JdNQE2tVoBh9oSc';

const supabase = createClient(NEW_URL, NEW_KEY);

async function checkAllLogs() {
    console.log('🕵️ Analisando todos os logs recentes...');
    const { data: logs, error } = await supabase
        .from('app_event_logs')
        .select('user_email, event_type, created_at')
        .order('created_at', { ascending: false })
        .limit(30);

    if (error) {
        console.error('❌ Erro:', error);
        return;
    }

    console.log(`📊 Total de logs encontrados: ${logs.length}`);
    logs.forEach(l => {
        console.log(`- [${l.created_at}] ${l.user_email}: ${l.event_type}`);
    });
}

checkAllLogs().catch(console.error);
