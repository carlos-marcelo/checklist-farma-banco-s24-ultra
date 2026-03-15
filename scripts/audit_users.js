import { createClient } from '@supabase/supabase-js';

const NEW_URL = 'https://yldfiqxtgxqtmlxjqhva.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZGZpcXh0Z3hxdG1seGpxaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDU4MzYsImV4cCI6MjA4NzIyMTgzNn0.Y2Gv1uUC_CXEJhoqU-m3Z5h5cwm9JdNQE2tVoBh9oSc';

const supabase = createClient(NEW_URL, NEW_KEY);

async function checkUsers() {
    console.log('🕵️ Auditando usuários no novo projeto...');
    const { data: users, error } = await supabase.from('users').select('id, email, name, role, filial, area, company_id');

    if (error) {
        console.error('❌ Erro:', error);
        return;
    }

    console.log(`📊 Total de usuários: ${users.length}`);
    const usersProblematic = users.filter(u => {
        const branch = String(u.filial ?? '').trim().toLowerCase();
        const missingTokens = ['', '-', 'sem filial', 'sem_filial', 'filial não informada', 'null', 'undefined', 'n/a', 'na'];
        const isMissingBranch = missingTokens.includes(branch);
        return u.role !== 'MASTER' && (isMissingBranch || !u.company_id);
    });

    console.log(`⚠️ Usuários (não MASTER) com problemas (sem filial ou sem empresa): ${usersProblematic.length}`);
    usersProblematic.forEach(u => {
        console.log(`- ${u.email}: role=${u.role}, filial="${u.filial}", company_id="${u.company_id}"`);
    });
}

checkUsers().catch(console.error);
