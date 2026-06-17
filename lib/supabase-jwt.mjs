import { createRemoteJWKSet, jwtVerify } from 'jose';

let remoteJwks = null;

export function supabaseProjectUrl() {
  return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || null;
}

export function supabaseJwtSecret() {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

function getRemoteJwks() {
  const url = supabaseProjectUrl();
  if (!url) return null;
  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(
      new URL(`${url.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`)
    );
  }
  return remoteJwks;
}

export function isSupabaseServerConfigured() {
  return Boolean(getRemoteJwks() || supabaseJwtSecret());
}

function roleFromJwtPayload(payload) {
  const role = payload.app_metadata?.role;
  if (role === 'admin' || role === 'client') return role;
  return 'client';
}

function userFromPayload(payload) {
  if (!payload.sub) return null;

  const email =
    (typeof payload.email === 'string' && payload.email) ||
    payload.user_metadata?.email ||
    null;

  if (!email) return null;

  return {
    id: payload.sub,
    email,
    role: roleFromJwtPayload(payload),
    name: payload.user_metadata?.name || payload.user_metadata?.full_name || email,
  };
}

export async function verifySupabaseAccessToken(accessToken) {
  if (!accessToken) return null;

  const projectUrl = supabaseProjectUrl()?.replace(/\/$/, '');
  const issuer = projectUrl ? `${projectUrl}/auth/v1` : undefined;

  const jwks = getRemoteJwks();
  if (jwks) {
    try {
      const { payload } = await jwtVerify(accessToken, jwks, issuer ? { issuer } : undefined);
      const user = userFromPayload(payload);
      if (user) return user;
    } catch {
      // tenta HS256 legado abaixo
    }
  }

  const key = supabaseJwtSecret();
  if (!key) return null;

  try {
    const { payload } = await jwtVerify(accessToken, key, issuer ? { issuer } : undefined);
    return userFromPayload(payload);
  } catch {
    return null;
  }
}
