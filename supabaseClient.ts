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

let postgrestCircuitOpenUntil = 0;
let postgrestFailureStreak = 0;
let postgrestNeedsRecoveryProbe = false;
let postgrestRecoveryProbeInFlight = false;

const TRANSIENT_POSTGREST_STATUS = new Set([429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);

const getRetryAfterMs = (response: Response): number => {
  const raw = String(response.headers.get('retry-after') || '').trim();
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
    const retryDate = Date.parse(raw);
    if (Number.isFinite(retryDate)) return Math.max(0, retryDate - Date.now());
  }
  return Math.min(2 * 60_000, 15_000 * (2 ** Math.max(0, postgrestFailureStreak - 1)));
};

const openPostgrestCircuit = (response?: Response) => {
  postgrestFailureStreak = Math.min(postgrestFailureStreak + 1, 5);
  const retryMs = response ? getRetryAfterMs(response) : getRetryAfterMs(new Response());
  postgrestCircuitOpenUntil = Math.max(postgrestCircuitOpenUntil, Date.now() + Math.max(5_000, retryMs));
  postgrestNeedsRecoveryProbe = true;
};

const resetPostgrestCircuit = () => {
  postgrestCircuitOpenUntil = 0;
  postgrestFailureStreak = 0;
  postgrestNeedsRecoveryProbe = false;
};

const createCircuitOpenResponse = () => {
  const retrySeconds = Math.max(1, Math.ceil((postgrestCircuitOpenUntil - Date.now()) / 1000));
  return new Response(JSON.stringify({
    code: 'PGRST002',
    details: null,
    hint: null,
    message: 'PostgREST temporariamente indisponível. Aguardando a próxima tentativa automática.'
  }), {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'retry-after': String(retrySeconds),
      'x-auditflow-circuit': 'open'
    }
  });
};

// When pointing Supabase JS directly to raw PostgREST (no /rest/v1 proxy),
// rewrite REST calls so `from('table')` still works.
const localPostgrestCompatFetch: typeof fetch = async (input, init) => {
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

  const performFetch = () => {
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

  if (postgrestNeedsRecoveryProbe) {
    if (Date.now() < postgrestCircuitOpenUntil || postgrestRecoveryProbeInFlight) {
      return createCircuitOpenResponse();
    }
    postgrestRecoveryProbeInFlight = true;
  }

  const isRecoveryProbe = postgrestRecoveryProbeInFlight && postgrestNeedsRecoveryProbe;
  try {
    const response = await performFetch();
    if (TRANSIENT_POSTGREST_STATUS.has(response.status)) {
      openPostgrestCircuit(response);
    } else if (isRecoveryProbe) {
      resetPostgrestCircuit();
    }
    return response;
  } catch (error) {
    openPostgrestCircuit();
    // A failed CORS preflight or an unreachable tunnel rejects fetch before a
    // Response exists. Convert that first failure into the same controlled 503
    // used while the circuit is open so callers do not immediately retry it.
    return createCircuitOpenResponse();
  } finally {
    if (isRecoveryProbe) postgrestRecoveryProbeInFlight = false;
  }
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
