import { createClient } from '@supabase/supabase-js';

let client = null;
let runtimeUrl = import.meta.env.VITE_SUPABASE_URL || '';
let runtimeKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
let configPromise = null;

export function isSupabaseAuth() {
  return Boolean(runtimeUrl && runtimeKey);
}

/** Carrega Supabase do build ou de /api/config (runtime na Vercel). */
export async function ensureSupabaseConfig() {
  if (isSupabaseAuth()) return true;
  if (!configPromise) {
    configPromise = (async () => {
      try {
        const res = await fetch('/api/config', { credentials: 'same-origin' });
        if (!res.ok) return false;
        const data = await res.json();
        if (data.supabaseUrl && data.supabaseAnonKey) {
          runtimeUrl = data.supabaseUrl;
          runtimeKey = data.supabaseAnonKey;
          client = null;
          return true;
        }
      } catch {
        // ignora — fallback para auth local
      }
      return false;
    })();
  }
  return configPromise;
}

export function getSupabase() {
  if (!isSupabaseAuth()) return null;
  if (!client) {
    client = createClient(runtimeUrl, runtimeKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/** Papel: app_metadata.role (preferido) ou user_metadata.role. */
export function roleFromSupabaseUser(user) {
  if (!user) return null;
  const role = user.app_metadata?.role ?? user.user_metadata?.role;
  if (role === 'admin' || role === 'client') return role;
  return 'client';
}

export function mapSupabaseUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: roleFromSupabaseUser(user),
    name: user.user_metadata?.name || user.user_metadata?.full_name || user.email,
  };
}
