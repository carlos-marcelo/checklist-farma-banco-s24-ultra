import { createClient } from '@supabase/supabase-js';

const OLD_URL = 'https://efqkcehhtuxiccdmnzku.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcWtjZWhodHV4aWNjZG1uemt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3NTk0NTUsImV4cCI6MjA4MDMzNTQ1NX0.CA5pNsOTOIgqQfvtW1FIsAV53CZoj2V_E6-CZdejAl4';

const NEW_URL = 'https://yldfiqxtgxqtmlxjqhva.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZGZpcXh0Z3hxdG1seGpxaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDU4MzYsImV4cCI6MjA4NzIyMTgzNn0.Y2Gv1uUC_CXEJhoqU-m3Z5h5cwm9JdNQE2tVoBh9oSc';

const oldSupa = createClient(OLD_URL, OLD_KEY);
const newSupa = createClient(NEW_URL, NEW_KEY);

async function debugReports() {
    console.log('🕵️ Debugging [reports] migration...');

    // 1. Fetch from old
    const { data, error: fError } = await oldSupa.from('reports').select('*');
    if (fError) {
        console.error('❌ Error fetching from old project:', fError);
        return;
    }

    console.log(`✅ Fetched ${data.length} records from old project.`);
    if (data.length > 0) {
        console.log('Sample data keys:', Object.keys(data[0]));

        // 2. Try to insert into new
        console.log('🚀 Attempting to upsert into new project...');
        const { error: iError } = await newSupa.from('reports').upsert(data);

        if (iError) {
            console.error('❌ Error inserting into new project:', JSON.stringify(iError, null, 2));
        } else {
            console.log('✨ Success! Upsert returned no error.');

            // 3. Verify immediately
            const { count } = await newSupa.from('reports').select('*', { count: 'exact', head: true });
            console.log(`📊 Current count in new project: ${count}`);
        }
    }
}

debugReports().catch(console.error);
