import { clearSessionCookie } from '../../lib/auth-token.mjs';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' });
    }
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/auth/logout]', err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
}
