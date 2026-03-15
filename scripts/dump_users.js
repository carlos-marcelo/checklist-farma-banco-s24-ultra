import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const NEW_URL = 'https://yldfiqxtgxqtmlxjqhva.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZGZpcXh0Z3hxdG1seGpxaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDU4MzYsImV4cCI6MjA4NzIyMTgzNn0.Y2Gv1uUC_CXEJhoqU-m3Z5h5cwm9JdNQE2tVoBh9oSc';

const supabase = createClient(NEW_URL, NEW_KEY);

async function dumpUsers() {
    const { data: users, error } = await supabase.from('users').select('*');

    if (error) {
        console.error('❌ Erro:', error);
        return;
    }

    fs.writeFileSync('users_dump.json', JSON.stringify(users, null, 2));
    console.log(`✅ Dump concluído: users_dump.json (${users.length} usuários)`);
}

dumpUsers().catch(console.error);
