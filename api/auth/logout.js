import { clearSessionCookie, jsonResponse } from '../../lib/auth-token.mjs';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  try {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Método não permitido' }, 405);
    }
    return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
  } catch (err) {
    console.error('[api/auth/logout]', err);
    return jsonResponse({ error: 'Erro interno do servidor.' }, 500);
  }
}
