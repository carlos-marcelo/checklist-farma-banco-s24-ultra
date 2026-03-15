import { createClient } from '@supabase/supabase-js';

const NEW_URL = 'https://yldfiqxtgxqtmlxjqhva.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZGZpcXh0Z3hxdG1seGpxaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDU4MzYsImV4cCI6MjA4NzIyMTgzNn0.Y2Gv1uUC_CXEJhoqU-m3Z5h5cwm9JdNQE2tVoBh9oSc';

const supabase = createClient(NEW_URL, NEW_KEY);

async function listUsers() {
    const { data: users, error } = await supabase.from('users').select('email, name, role, filial');

    if (error) {
        console.error('❌ Erro:', error);
        return;
    }

    console.log(`📊 Total de usuários: ${users.length}`);
    users.forEach(u => {
        console.log(`- ${u.email} (${u.name}): role=${u.role}, filial="${u.filial}"`);
    });
}

listUsers().catch(console.error);
