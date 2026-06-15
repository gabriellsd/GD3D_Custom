import { jwtVerify } from 'jose';

export function supabaseJwtSecret() {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export function isSupabaseServerConfigured() {
  return Boolean(supabaseJwtSecret());
}

export async function verifySupabaseAccessToken(accessToken) {
  const key = supabaseJwtSecret();
  if (!key || !accessToken) return null;

  try {
    const { payload } = await jwtVerify(accessToken, key);
    const role = payload.app_metadata?.role ?? payload.user_metadata?.role;
    if (role !== 'admin' && role !== 'client') return null;

    return {
      id: payload.sub,
      email: payload.email,
      role,
      name: payload.user_metadata?.name || payload.user_metadata?.full_name || payload.email,
    };
  } catch {
    return null;
  }
}
