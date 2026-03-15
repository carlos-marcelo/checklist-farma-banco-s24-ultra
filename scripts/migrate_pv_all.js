import { createClient } from '@supabase/supabase-js';

const OLD_URL = 'https://efqkcehhtuxiccdmnzku.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcWtjZWhodHV4aWNjZG1uemt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3NTk0NTUsImV4cCI6MjA4MDMzNTQ1NX0.CA5pNsOTOIgqQfvtW1FIsAV53CZoj2V_E6-CZdejAl4';

const NEW_URL = 'https://yldfiqxtgxqtmlxjqhva.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZGZpcXh0Z3hxdG1seGpxaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDU4MzYsImV4cCI6MjA4NzIyMTgzNn0.Y2Gv1uUC_CXEJhoqU-m3Z5h5cwm9JdNQE2tVoBh9oSc';

const oldSupa = createClient(OLD_URL, OLD_KEY);
const newSupa = createClient(NEW_URL, NEW_KEY);

const PV_TABLES = [
    'pv_reports',
    'pv_branch_records',
    'pv_sessions',
    'pv_active_sales_reports',
    'pv_sales_history',
    'pv_sales_uploads'
];

async function migratePVData() {
    console.log('🚀 Iniciando migração de dados Pré-Vencidos...');

    for (const table of PV_TABLES) {
        console.log(`\n📦 Migrando ${table}...`);

        // Fetch from old
        const { data: records, error: fetchError } = await oldSupa
            .from(table)
            .select('*');

        if (fetchError) {
            console.error(`❌ Erro ao buscar dados de ${table}: ${fetchError.message}`);
            continue;
        }

        if (!records || records.length === 0) {
            console.log(`⚠️ Nenhum registro encontrado em ${table} no projeto antigo.`);
            continue;
        }

        console.log(`✅ ${records.length} registros encontrados. Inserindo...`);

        // Insert into new
        const { error: insertError } = await newSupa
            .from(table)
            .upsert(records, { onConflict: 'id' });

        if (insertError) {
            console.error(`❌ Erro ao inserir em ${table}: ${insertError.message}`);
        } else {
            console.log(`🎉 Sucesso! ${records.length} registros migrados para ${table}.`);
        }
    }

    console.log('\n✅ Migração Pré-Vencidos concluída!');
}

migratePVData().catch(console.error);
