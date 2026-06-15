import { jsonResponse, parseCookieHeader, verifySessionToken } from '../../lib/auth.mjs';

export default async function handler(request) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
  }

  const token = parseCookieHeader(request.headers.get('cookie'));
  const user = await verifySessionToken(token);

  if (!user) {
    return jsonResponse({ user: null }, 200);
  }

  return jsonResponse({ user });
}
