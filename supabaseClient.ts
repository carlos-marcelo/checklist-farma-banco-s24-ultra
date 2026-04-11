import { createClient } from '@supabase/supabase-js';

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || '/api';
const supabaseUrl = rawSupabaseUrl.startsWith('/') 
  ? `${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}${rawSupabaseUrl}`
  : rawSupabaseUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';
const supabaseHost = (() => {
  try {
    if (supabaseUrl.startsWith('/')) return 'localhost'; // Assume local if relative
    return new URL(supabaseUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
})();

const isLikelyLocalPostgrest =
  supabaseHost === 'localhost' ||
  supabaseHost === '127.0.0.1' ||
  supabaseUrl.startsWith('/') ||
  supabaseAnonKey === 'local-key-to-bypass-auth';

const useDirectPostgrest =
  import.meta.env.VITE_SUPABASE_DIRECT_POSTGREST === 'true' || isLikelyLocalPostgrest;

const stripAuthHeaders =
  import.meta.env.VITE_SUPABASE_STRIP_AUTH_HEADERS === 'true' || isLikelyLocalPostgrest;

// When pointing Supabase JS directly to raw PostgREST (no /rest/v1 proxy),
// rewrite REST calls so `from('table')` still works.
const localPostgrestCompatFetch: typeof fetch = (input, init) => {
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  let rewrittenUrl = rawUrl;

  if (useDirectPostgrest) {
    try {
      const parsed = new URL(rawUrl);
      const restPrefix = '/rest/v1';

      if (parsed.pathname === restPrefix) {
        parsed.pathname = '/';
      } else if (parsed.pathname.startsWith(`${restPrefix}/`)) {
        parsed.pathname = parsed.pathname.replace(`${restPrefix}/`, '/');
      }

      rewrittenUrl = parsed.toString();
    } catch {
      rewrittenUrl = rawUrl;
    }
  }

  const headers = new Headers(init?.headers);
  if (stripAuthHeaders) {
    // Local/raw PostgREST setups can run without JWT validation.
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
