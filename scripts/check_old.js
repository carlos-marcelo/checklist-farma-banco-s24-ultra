import { createClient } from '@supabase/supabase-js';

const OLD_URL = 'https://efqkcehhtuxiccdmnzku.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcWtjZWhodHV4aWNjZG1uemt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3NTk0NTUsImV4cCI6MjA4MDMzNTQ1NX0.CA5pNsOTOIgqQfvtW1FIsAV53CZoj2V_E6-CZdejAl4';

const supabase = createClient(OLD_URL, OLD_KEY);

async function checkOld() {
    console.log('🔍 Checando banco antigo...');
    const tables = ['Relatórios', 'Relatorios', 'reports', 'Empresas', 'Usuários'];

    for (const table of tables) {
        const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
        if (error) {
            console.log(`❌ ${table}: Não encontrada ou erro (${error.message})`);
        } else {
            console.log(`✅ ${table}: ${count} registros encontrados.`);
        }
    }
}

checkOld().catch(console.error);
