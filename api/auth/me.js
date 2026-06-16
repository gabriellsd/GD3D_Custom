import { jsonResponse, parseCookieHeader, verifySessionToken } from '../../lib/auth-token.mjs';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Método não permitido' });
    }

    const token = parseCookieHeader(req.headers.cookie);
    const user = await verifySessionToken(token);
    return res.status(200).json({ user: user ?? null });
  } catch (err) {
    console.error('[api/auth/me]', err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
}
