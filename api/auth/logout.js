import { clearSessionCookie, jsonResponse } from '../../lib/auth-token.mjs';
import { withApiHandler } from '../../lib/api-util.mjs';

export const config = { runtime: 'nodejs20.x' };

async function handler(request) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
  }

  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}

export default withApiHandler(handler);
