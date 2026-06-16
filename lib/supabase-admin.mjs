import { createClient } from '@supabase/supabase-js';

export function supabaseUrl() {
  return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || null;
}

export function isSupabaseAdminConfigured() {
  return Boolean(supabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin() {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY e VITE_SUPABASE_URL são obrigatórios para seed/admin servidor.');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
