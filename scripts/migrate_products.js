import { createClient } from '@supabase/supabase-js';

const OLD_URL = 'https://efqkcehhtuxiccdmnzku.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcWtjZWhodHV4aWNjZG1uemt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3NTk0NTUsImV4cCI6MjA4MDMzNTQ1NX0.CA5pNsOTOIgqQfvtW1FIsAV53CZoj2V_E6-CZdejAl4';

const NEW_URL = 'https://yldfiqxtgxqtmlxjqhva.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZGZpcXh0Z3hxdG1seGpxaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDU4MzYsImV4cCI6MjA4NzIyMTgzNn0.Y2Gv1uUC_CXEJhoqU-m3Z5h5cwm9JdNQE2tVoBh9oSc';

const oldSupa = createClient(OLD_URL, OLD_KEY);
const newSupa = createClient(NEW_URL, NEW_KEY);

const MAPPING = {
    'pre_vencidos_products': 'pre_vencidos_products',
    'product_registrations': 'product_registrations'
};

async function migrateProducts() {
    console.log('🚀 Iniciando recuperação de dados de produtos...');

    for (const [oldTable, newTable] of Object.entries(MAPPING)) {
        console.log(`\n📦 Migrando ${oldTable} -> ${newTable}...`);

        const { data: records, error: fetchError } = await oldSupa
            .from(oldTable)
            .select('*');

        if (fetchError) {
            console.error(`❌ Erro ao buscar dados de ${oldTable}: ${fetchError.message}`);
            continue;
        }

        if (!records || records.length === 0) {
            console.log(`⚠️ Nenhum registro encontrado em ${oldTable}.`);
            continue;
        }

        console.log(`✅ ${records.length} registros encontrados. Inserindo no novo projeto...`);

        const { error: insertError } = await newSupa
            .from(newTable)
            .upsert(records, { onConflict: 'id' });

        if (insertError) {
            console.error(`❌ Erro ao inserir em ${newTable}: ${insertError.message}`);
        } else {
            console.log(`🎉 Sucesso! ${records.length} registros migrados para ${newTable}.`);
        }
    }

    console.log('\n✅ Recuperação concluída!');
}

migrateProducts().catch(console.error);
