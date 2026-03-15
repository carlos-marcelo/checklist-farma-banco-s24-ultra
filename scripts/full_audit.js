import { createClient } from '@supabase/supabase-js';

const NEW_URL = 'https://yldfiqxtgxqtmlxjqhva.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZGZpcXh0Z3hxdG1seGpxaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDU4MzYsImV4cCI6MjA4NzIyMTgzNn0.Y2Gv1uUC_CXEJhoqU-m3Z5h5cwm9JdNQE2tVoBh9oSc';

const supabase = createClient(NEW_URL, NEW_KEY);

async function listAllTables() {
    console.log('🕵️ Listando todas as tabelas e contagens...');

    const probableTables = [
        'users', 'companies', 'reports', 'tickets', 'audit_sessions',
        'pv_reports', 'pv_branch_records', 'pv_sales_history', 'pv_active_sales_reports',
        'pv_sessions', 'pv_sales_uploads', 'pv_sales_analysis_reports', 'pv_dashboard_reports',
        'pv_inventory_reports', 'pv_branch_record_events', 'global_base_files',
        'pre_vencidos_products', 'product_registrations'
    ];

    for (const table of probableTables) {
        const { count, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

        if (error) {
            if (error.code === 'PGRST116' || error.message.includes('not found')) {
                // Skip missing
            } else {
                console.log(`❌ ${table}: ${error.message}`);
            }
        } else {
            console.log(`✅ ${table}: ${count} registros.`);
        }
    }
}

listAllTables().catch(console.error);
