import { createClient } from '@supabase/supabase-js';

const NEW_URL = 'https://yldfiqxtgxqtmlxjqhva.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZGZpcXh0Z3hxdG1seGpxaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDU4MzYsImV4cCI6MjA4NzIyMTgzNn0.Y2Gv1uUC_CXEJhoqU-m3Z5h5cwm9JdNQE2tVoBh9oSc';

const supabase = createClient(NEW_URL, NEW_KEY);

async function checkUserLogs() {
    const usersToWatch = [
        'trindadedauraluciana@gmail.com',
        'diogoz.drogaria@gmail.com'
    ]; // Add more if needed from previous audit

    console.log(`🕵️ Analisando logs para usuários: ${usersToWatch.join(', ')}`);

    for (const email of usersToWatch) {
        console.log(`\n📧 Histórico para: ${email}`);
        const { data: logs, error } = await supabase
            .from('app_event_logs')
            .select('event_type, created_at, event_meta')
            .eq('user_email', email)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error(`❌ Erro logs: ${error.message}`);
            continue;
        }

        if (logs.length === 0) {
            console.log('   Sem logs encontrados.');
        } else {
            logs.forEach(l => {
                console.log(`   [${l.created_at}] ${l.event_type} ${l.event_meta ? JSON.stringify(l.event_meta) : ''}`);
            });
        }
    }
}

checkUserLogs().catch(console.error);
