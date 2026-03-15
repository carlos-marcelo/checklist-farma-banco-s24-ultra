const { createClient } = require('@supabase/supabase-js');

// === CONFIGURAÇÃO ===

const OLD_URL = 'https://efqkcehhtuxiccdmnzku.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcWtjZWhodHV4aWNjZG1uemt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3NTk0NTUsImV4cCI6MjA4MDMzNTQ1NX0.CA5pNsOTOIgqQfvtW1FIsAV53CZoj2V_E6-CZdejAl4';

const NEW_URL = 'https://yldfiqxtgxqtmlxjqhva.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZGZpcXh0Z3hxdG1seGpxaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDU4MzYsImV4cCI6MjA4NzIyMTgzNn0.Y2Gv1uUC_CXEJhoqU-m3Z5h5cwm9JdNQE2tVoBh9oSc';

const oldSupa = createClient(OLD_URL, OLD_KEY);
const newSupa = createClient(NEW_URL, NEW_KEY);

async function runMigration() {
    console.log('🚀 Iniciando Migração de Dados...');

    // 1. Tentar descobrir tabelas no banco antigo (usando uma tabela conhecida como teste)
    const knownTables = ['Empresas', 'companies', 'Usuários', 'users', 'Relatórios', 'reports'];
    let foundOldTables = [];

    console.log('🔍 Verificando tabelas existentes no banco de origem...');
    for (const t of knownTables) {
        try {
            const { error } = await oldSupa.from(t).select('count', { count: 'exact', head: true });
            if (!error) {
                console.log(`✅ Tabela encontrada: ${t}`);
                foundOldTables.push(t);
            }
        } catch (e) { }
    }

    // Mapeamento final com base no que encontramos ou no que sabemos
    const mapping = [
        { old: 'Empresas', new: 'companies' },
        { old: 'Usuários', new: 'users' },
        { old: 'Configurações', new: 'configs' },
        { old: 'Relatórios', new: 'reports' },
        { old: 'Ingressos', new: 'tickets' },
        { old: 'checklist_definitions', new: 'checklist_definitions' },
        { old: 'access_matrix', new: 'access_matrix' },
        { old: 'stock_conference_reports', new: 'stock_conference_reports' },
        { old: 'stock_conference_sessions', new: 'stock_conference_sessions' },
        { old: 'pv_sessions', new: 'pv_sessions' },
        { old: 'pv_active_sales_reports', new: 'pv_active_sales_reports' },
        { old: 'pv_branch_records', new: 'pv_branch_records' },
        { old: 'pv_sales_history', new: 'pv_sales_history' },
        { old: 'pv_sales_uploads', new: 'pv_sales_uploads' },
        { old: 'pv_sales_analysis_reports', new: 'pv_sales_analysis_reports' },
        { old: 'pv_dashboard_reports', new: 'pv_dashboard_reports' },
        { old: 'pv_inventory_reports', new: 'pv_inventory_reports' },
        { old: 'pv_branch_record_events', new: 'pv_branch_record_events' },
        { old: 'pv_reports', new: 'pv_reports' },
        { old: 'global_base_files', new: 'global_base_files' },
        { old: 'app_event_logs', new: 'app_event_logs' },
        { old: 'Drafts', new: 'drafts' },
        { old: 'audit_sessions', new: 'audit_sessions' }
    ];

    for (const m of mapping) {
        console.log(`\n📦 Migrando: ${m.old} -> ${m.new}...`);
        try {
            const { data, error: fError } = await oldSupa.from(m.old).select('*');
            if (fError) {
                // Tentar o nome 'new' no banco antigo caso o usuário já tenha migrado algo ou os nomes sejam iguais
                const { data: data2, error: fError2 } = await oldSupa.from(m.new).select('*');
                if (fError2) {
                    console.error(`❌ Pulo: Não encontrei ${m.old} nem ${m.new} no banco antigo.`);
                    continue;
                }
                await insertData(m.new, data2);
            } else {
                await insertData(m.new, data);
            }
        } catch (err) {
            console.error(`💥 Erro na tabela ${m.new}:`, err.message);
        }
    }
}

async function insertData(tableName, data) {
    if (!data || data.length === 0) {
        console.log(`ℹ️ Tabela vazia.`);
        return;
    }
    console.log(`   Inserindo ${data.length} registros...`);
    const { error } = await newSupa.from(tableName).upsert(data);
    if (error) {
        console.error(`❌ Erro no insert (${tableName}):`, error.message);
    } else {
        console.log(`✅ Sucesso.`);
    }
}

runMigration().catch(console.error);
