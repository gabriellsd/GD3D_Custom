import { jsonResponse, parseCookieHeader, verifySessionToken } from '../../lib/auth-token.mjs';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  try {
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Método não permitido' }, 405);
    }

    const token = parseCookieHeader(request.headers.get('cookie'));
    const user = await verifySessionToken(token);
    return jsonResponse({ user: user ?? null }, 200);
  } catch (err) {
    console.error('[api/auth/me]', err);
    return jsonResponse({ error: 'Erro interno do servidor.' }, 500);
  }
}
