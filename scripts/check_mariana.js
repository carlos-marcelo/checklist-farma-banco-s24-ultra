import { createClient } from '@supabase/supabase-js';

const NEW_URL = 'https://yldfiqxtgxqtmlxjqhva.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZGZpcXh0Z3hxdG1seGpxaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDU4MzYsImV4cCI6MjA4NzIyMTgzNn0.Y2Gv1uUC_CXEJhoqU-m3Z5h5cwm9JdNQE2tVoBh9oSc';

const supabase = createClient(NEW_URL, NEW_KEY);

async function checkMariana() {
    const email = 'marianasasantosferreira05@gmail.com';
    const { data: user, error } = await supabase.from('users').select('*').eq('email', email).single();

    if (error) {
        console.error('❌ Erro:', error);
        return;
    }

    console.log(`👤 Usuário: ${email}`);
    console.log(`- Role: ${user.role}`);
    console.log(`- Filial: "${user.filial}"`);
    console.log(`- Company ID: ${user.company_id}`);
}

checkMariana().catch(console.error);
