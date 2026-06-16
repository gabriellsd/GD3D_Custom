import { jsonResponse, parseCookieHeader, verifySessionToken } from '../../lib/auth-token.mjs';
import { withApiHandler } from '../../lib/api-util.mjs';

export const config = { runtime: 'nodejs20.x' };

async function handler(request) {
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

export default withApiHandler(handler);
