import { createClient } from '@supabase/supabase-js';

const NEW_URL = 'https://yldfiqxtgxqtmlxjqhva.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZGZpcXh0Z3hxdG1seGpxaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDU4MzYsImV4cCI6MjA4NzIyMTgzNn0.Y2Gv1uUC_CXEJhoqU-m3Z5h5cwm9JdNQE2tVoBh9oSc';

const supabase = createClient(NEW_URL, NEW_KEY);

async function discover() {
    console.log('🔍 Listando TODAS as tabelas no novo projeto...');

    // Como não podemos listar tabelas via RPC/REST facilmente sem privilégios extras,
    // vamos tentar os nomes mais comuns e os mapeados.
    const tables = [
        'reports', 'Relatórios', 'Relatorios',
        'users', 'Usuários', 'Usuarios',
        'companies', 'Empresas',
        'audit_sessions', 'config', 'configs', 'Configurações'
    ];

    for (const t of tables) {
        const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
        if (!error) {
            console.log(`✅ ${t}: ${count} registros.`);
        } else if (error.code !== '42P01') { // 42P01 is "relation does not exist"
            console.log(`❌ ${t}: Erro ${error.code} - ${error.message}`);
        }
    }
}

discover().catch(console.error);
