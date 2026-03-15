import { createClient } from '@supabase/supabase-js';

const NEW_URL = 'https://yldfiqxtgxqtmlxjqhva.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZGZpcXh0Z3hxdG1seGpxaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDU4MzYsImV4cCI6MjA4NzIyMTgzNn0.Y2Gv1uUC_CXEJhoqU-m3Z5h5cwm9JdNQE2tVoBh9oSc';

const supabase = createClient(NEW_URL, NEW_KEY);

async function inspectTables() {
    console.log('🕵️ Inspecionando tabelas e dados...');

    // List all tables
    const { data: tables, error: tableError } = await supabase
        .rpc('get_tables_info'); // If rpc not available, we'll try manual list

    if (tableError) {
        console.log('❌ Erro ao listar tabelas via RPC. Tentando consulta direta de nomes prováveis.');
    } else {
        console.log('📊 Tabelas encontradas:', tables.map(t => t.table_name).join(', '));
    }

    const targets = ['pre_vencidos_products', 'product_registrations', 'Pre_vencidos_products', 'Product_registrations'];

    for (const t of targets) {
        const { data, count, error } = await supabase
            .from(t)
            .select('*', { count: 'exact' })
            .limit(1);

        if (error) {
            console.log(`- ${t}: Erro (${error.message})`);
        } else {
            console.log(`- ${t}: ${count} registros. Exemplo:`, data);
        }
    }
}

inspectTables().catch(console.error);
