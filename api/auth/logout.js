import { clearSessionCookie, jsonResponse } from '../../lib/auth.mjs';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
  }

  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}
