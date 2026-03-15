// Check if Supabase environment variables are set
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

console.log('\n🔍 Verificando variáveis de ambiente Supabase...\n');

if (!url || url.includes('placeholder')) {
    console.error('❌ VITE_SUPABASE_URL não está configurada ou está usando placeholder!');
    console.log('   Valor atual:', url || '(vazio)');
    process.exit(1);
}

if (!key || key.includes('placeholder')) {
    console.error('❌ VITE_SUPABASE_ANON_KEY não está configurada ou está usando placeholder!');
    console.log('   Valor atual:', key ? key.substring(0, 20) + '...' : '(vazio)');
    process.exit(1);
}

console.log('✅ VITE_SUPABASE_URL:', url);
console.log('✅ VITE_SUPABASE_ANON_KEY:', key.substring(0, 30) + '...');
console.log('\n✅ Variáveis de ambiente OK!\n');
