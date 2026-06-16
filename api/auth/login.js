import {
  authenticate,
  createSessionToken,
  jsonResponse,
  sessionCookie,
} from '../../lib/auth-users.mjs';
import { withApiHandler } from '../../lib/api-util.mjs';

export const config = { runtime: 'nodejs20.x' };

async function handler(request) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400);
  }

  const user = authenticate(body.email, body.password);
  if (!user) {
    return jsonResponse({ error: 'Email ou palavra-passe incorretos' }, 401);
  }

  const requiredRole = body.requiredRole;
  if (requiredRole && user.role !== requiredRole) {
    return jsonResponse(
      {
        error:
          requiredRole === 'admin'
            ? 'Esta área é só para administradores.'
            : 'Acesso negado.',
      },
      403
    );
  }

  const token = await createSessionToken(user);
  return jsonResponse(
    { user: { email: user.email, role: user.role, name: user.name } },
    200,
    { 'Set-Cookie': sessionCookie(token) }
  );
}

export default withApiHandler(handler);
