import { readJsonBody } from '../../lib/api-util.mjs';
import { checkRateLimit, clientIp } from '../../lib/rate-limit.mjs';
import {
  authenticate,
  createSessionToken,
  loadUsers,
  sessionCookie,
} from '../../lib/auth-users.mjs';
import { isSupabaseServerConfigured } from '../../lib/supabase-jwt.mjs';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' });
    }

    if (!checkRateLimit(`login:${clientIp(req)}`, { limit: 20, windowMs: 60_000 })) {
      return res.status(429).json({ error: 'Demasiadas tentativas. Aguarde um minuto.' });
    }

    if (isSupabaseServerConfigured()) {
      return res.status(410).json({ error: 'Use autenticação Supabase neste site.' });
    }

    const body = await readJsonBody(req);

    if (!isSupabaseServerConfigured() && loadUsers().length === 0) {
      return res.status(503).json({
        error:
          'Autenticação não configurada no servidor. Defina VITE_SUPABASE_* e SUPABASE_JWT_SECRET na Vercel.',
      });
    }

    const user = authenticate(body.email, body.password);
    if (!user) {
      return res.status(401).json({ error: 'Email ou palavra-passe incorretos' });
    }

    const requiredRole = body.requiredRole;
    if (requiredRole && user.role !== requiredRole) {
      return res.status(403).json({
        error:
          requiredRole === 'admin'
            ? 'Esta área é só para administradores.'
            : 'Acesso negado.',
      });
    }

    const token = await createSessionToken(user);
    res.setHeader('Set-Cookie', sessionCookie(token));
    return res.status(200).json({
      user: { email: user.email, role: user.role, name: user.name },
    });
  } catch (err) {
    console.error('[api/auth/login]', err);
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
