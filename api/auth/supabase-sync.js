import { readJsonBody } from '../../lib/api-util.mjs';
import { checkRateLimit, clientIp } from '../../lib/rate-limit.mjs';
import { createSessionToken, sessionCookie } from '../../lib/auth-token.mjs';
import { verifySupabaseAccessToken, isSupabaseServerConfigured } from '../../lib/supabase-jwt.mjs';

export default async function handler(req, res) {
  try {
    if (!isSupabaseServerConfigured()) {
      return res.status(503).json({ error: 'Supabase não configurado no servidor.' });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' });
    }

    if (!checkRateLimit(`supabase-sync:${clientIp(req)}`, { limit: 40, windowMs: 60_000 })) {
      return res.status(429).json({ error: 'Demasiadas tentativas. Aguarde um minuto.' });
    }

    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    let accessToken = bearer;
    if (!accessToken) {
      const body = await readJsonBody(req);
      accessToken = body.access_token;
    }

    const user = await verifySupabaseAccessToken(accessToken);
    if (!user) {
      return res.status(401).json({ error: 'Sessão Supabase inválida.' });
    }

    const token = await createSessionToken(user);
    res.setHeader('Set-Cookie', sessionCookie(token));
    return res.status(200).json({ user });
  } catch (err) {
    console.error('[api/auth/supabase-sync]', err);
    if (err?.statusCode === 413) {
      return res.status(413).json({ error: 'Pedido demasiado grande.' });
    }
    if (err?.statusCode === 400) {
      return res.status(400).json({ error: 'JSON inválido.' });
    }
    const msg = err?.message?.includes('AUTH_SECRET')
      ? 'Servidor sem AUTH_SECRET configurado.'
      : 'Erro interno do servidor.';
    return res.status(500).json({ error: msg });
  }
}
