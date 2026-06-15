import { createSessionToken, jsonResponse, sessionCookie } from '../../lib/auth-token.mjs';
import { verifySupabaseAccessToken, isSupabaseServerConfigured } from '../../lib/supabase-jwt.mjs';

export default async function handler(request) {
  if (!isSupabaseServerConfigured()) {
    return jsonResponse({ error: 'Supabase não configurado no servidor.' }, 503);
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
  }

  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let accessToken = bearer;
  if (!accessToken) {
    try {
      const body = await request.json();
      accessToken = body.access_token;
    } catch {
      accessToken = null;
    }
  }

  const user = await verifySupabaseAccessToken(accessToken);
  if (!user) {
    return jsonResponse({ error: 'Sessão Supabase inválida.' }, 401);
  }

  const token = await createSessionToken(user);
  return jsonResponse({ user }, 200, { 'Set-Cookie': sessionCookie(token) });
}
