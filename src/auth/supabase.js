import { createClient } from '@supabase/supabase-js';

let client = null;

export function isSupabaseAuth() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function getSupabase() {
  if (!isSupabaseAuth()) return null;
  if (!client) {
    client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
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
