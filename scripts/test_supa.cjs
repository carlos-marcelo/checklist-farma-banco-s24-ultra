const { createClient } = require('@supabase/supabase-js');
console.log('Supabase JS loaded successfully');

try {
    const s = createClient('https://example.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4YW1wbGUiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY3NDc1OTQ1NSwiZXhwIjoyMDgwMzM1NDU1fQ.dummy');
    console.log('Client initialized');
} catch (e) {
    console.error('Initialization failed:', e);
}
