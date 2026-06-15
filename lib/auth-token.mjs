import { SignJWT, jwtVerify } from 'jose';

export const COOKIE_NAME = 'gd3d_session';
export const SESSION_DAYS = 7;

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET deve ter pelo menos 16 caracteres em produção.');
    }
    return 'gd3d-dev-secret-change-me';
  }
  return secret;
}

function secretKey() {
  return new TextEncoder().encode(authSecret());
}

export async function createSessionToken(user) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60;
  return new SignJWT({
    email: user.email,
    role: user.role,
    name: user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.email)
    .setExpirationTime(exp)
    .sign(secretKey());
}

export async function verifySessionToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.role !== 'admin' && payload.role !== 'client') return null;
    return {
      email: payload.email,
      role: payload.role,
      name: payload.name || payload.email,
    };
  } catch {
    return null;
  }
}

export function sessionCookie(token, { secure = process.env.NODE_ENV === 'production' } = {}) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie({ secure = process.env.NODE_ENV === 'production' } = {}) {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function parseCookieHeader(header, name = COOKIE_NAME) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=') || null;
  }
  return null;
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
