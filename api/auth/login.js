import { readJsonBody } from '../../lib/api-util.mjs';
import {
  authenticate,
  createSessionToken,
  sessionCookie,
} from '../../lib/auth-users.mjs';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' });
    }

    const body = await readJsonBody(req);
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
    const msg = err?.message?.includes('AUTH_SECRET')
      ? 'Servidor sem AUTH_SECRET configurado.'
      : 'Erro interno do servidor.';
    return res.status(500).json({ error: msg });
  }
}
