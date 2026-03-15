import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

// When pointing Supabase JS directly to raw PostgREST on localhost (no /rest/v1 proxy),
// rewrite REST calls so `from('table')` still works locally.
const localPostgrestCompatFetch: typeof fetch = (input, init) => {
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  let rewrittenUrl = rawUrl;
  const isLocalPostgrest = rawUrl.startsWith('http://localhost:3000/');

  if (rawUrl.startsWith('http://localhost:3000/rest/v1/')) {
    rewrittenUrl = rawUrl.replace('http://localhost:3000/rest/v1/', 'http://localhost:3000/');
  } else if (rawUrl === 'http://localhost:3000/rest/v1') {
    rewrittenUrl = 'http://localhost:3000';
  }

  const headers = new Headers(init?.headers);
  if (isLocalPostgrest) {
    // Local PostgREST in this setup is used without JWT validation.
    headers.delete('authorization');
    headers.delete('apikey');
  }

  if (typeof input === 'string' || input instanceof URL) {
    return fetch(rewrittenUrl, {
      ...init,
      headers,
    });
  }

  return fetch(new Request(rewrittenUrl, input), {
    ...init,
    headers,
  });
};

// Create Supabase client (will use placeholder values if env vars not set)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: localPostgrestCompatFetch,
  },
});

// Helper to check if Supabase is properly configured
export const isSupabaseConfigured = () => {
  return import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;
};
