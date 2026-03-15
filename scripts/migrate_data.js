import { createClient } from '@supabase/supabase-js';

const OLD_URL = 'https://efqkcehhtuxiccdmnzku.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcWtjZWhodHV4aWNjZG1uemt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3NTk0NTUsImV4cCI6MjA4MDMzNTQ1NX0.CA5pNsOTOIgqQfvtW1FIsAV53CZoj2V_E6-CZdejAl4';

const NEW_URL = 'https://yldfiqxtgxqtmlxjqhva.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZGZpcXh0Z3hxdG1seGpxaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDU4MzYsImV4cCI6MjA4NzIyMTgzNn0.Y2Gv1uUC_CXEJhoqU-m3Z5h5cwm9JdNQE2tVoBh9oSc';

const oldSupa = createClient(OLD_URL, OLD_KEY);
const newSupa = createClient(NEW_URL, NEW_KEY);

async function runMigration() {
    console.log('🚀 FINAL MIGRATION RUN...');

    const tablesToTry = [
        { old: ['reports', 'Relatórios', 'Relatorios'], new: 'reports' },
        { old: ['users', 'Usuários', 'Usuarios'], new: 'users' },
        { old: ['companies', 'Empresas'], new: 'companies' },
        { old: ['configs', 'Configurações'], new: 'configs' },
        { old: ['tickets', 'Ingressos'], new: 'tickets' },
        { old: ['checklist_definitions'], new: 'checklist_definitions' },
        { old: ['access_matrix'], new: 'access_matrix' },
        { old: ['stock_conference_reports'], new: 'stock_conference_reports' },
        { old: ['stock_conference_sessions'], new: 'stock_conference_sessions' },
        { old: ['pv_sessions'], new: 'pv_sessions' },
        { old: ['pv_active_sales_reports'], new: 'pv_active_sales_reports' },
        { old: ['pv_branch_records'], new: 'pv_branch_records' },
        { old: ['pv_sales_history'], new: 'pv_sales_history' },
        { old: ['pv_sales_uploads'], new: 'pv_sales_uploads' },
        { old: ['pv_sales_analysis_reports'], new: 'pv_sales_analysis_reports' },
        { old: ['pv_dashboard_reports'], new: 'pv_dashboard_reports' },
        { old: ['pv_inventory_reports'], new: 'pv_inventory_reports' },
        { old: ['pv_branch_record_events'], new: 'pv_branch_record_events' },
        { old: ['pv_reports'], new: 'pv_reports' },
        { old: ['global_base_files'], new: 'global_base_files' },
        { old: ['app_event_logs'], new: 'app_event_logs' },
        { old: ['drafts', 'Drafts'], new: 'drafts' },
        { old: ['audit_sessions'], new: 'audit_sessions' }
    ];

    for (const m of tablesToTry) {
        console.log(`\n🔍 Verificando destino: ${m.new}`);
        let dataToMigrate = null;
        let sourceUsed = null;

        for (const oldName of m.old) {
            process.stdout.write(`   Trying ${oldName}... `);
            const { data, error } = await oldSupa.from(oldName).select('*');
            if (!error && data && data.length > 0) {
                console.log(`✅ FOUND ${data.length} records!`);
                dataToMigrate = data;
                sourceUsed = oldName;
                break;
            } else {
                console.log(`❌ (Empty or Not Found)`);
            }
        }

        if (dataToMigrate) {
            console.log(`   🚀 Migrating ${dataToMigrate.length} records from ${sourceUsed} -> ${m.new}...`);
            const { error: iError } = await newSupa.from(m.new).upsert(dataToMigrate);
            if (iError) {
                console.error(`   ❌ FAIL: ${iError.message}`);
            } else {
                console.log(`   ✨ SUCCESS!`);
            }
        } else {
            console.log(`   ⏭️ Skipping ${m.new} (no source data found)`);
        }
    }

    console.log('\n🏁 Final Migration completed.');
}

runMigration().catch(console.error);
