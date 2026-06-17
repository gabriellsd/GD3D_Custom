import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from 'vite';
import {
  authenticate,
  clearSessionCookie,
  createSessionToken,
  parseCookieHeader,
  sessionCookie,
  verifySessionToken,
} from '../lib/auth.mjs';
import { verifySupabaseAccessToken, isSupabaseServerConfigured } from '../lib/supabase-jwt.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadProjectEnv(mode = 'development') {
  Object.assign(process.env, loadEnv(mode, ROOT, ''));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

const ADMIN_PATHS = new Set(['/visualizador-avancado.html', '/visualizador-avancado', '/admin.html', '/admin']);

/** Em dev (Vite), serve /api/auth/* e protege rotas admin. */
export function authDevPlugin() {
  return {
    name: 'gd3d-auth-dev',
    config(_, { mode }) {
      loadProjectEnv(mode);
    },
    configureServer(server) {
      loadProjectEnv(server.config.mode);
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? '';
        const url = rawUrl.split('?')[0] ?? '';

        if (ADMIN_PATHS.has(url)) {
          const token = parseCookieHeader(req.headers.cookie);
          const user = await verifySessionToken(token);
          if (user?.role !== 'admin') {
            const nextParam = encodeURIComponent(rawUrl);
            res.statusCode = 302;
            res.setHeader('Location', `/login.html?next=${nextParam}&role=admin`);
            res.end();
            return;
          }
        }

        if (!url.startsWith('/api/auth/')) return next();

        try {
          if (url === '/api/auth/login' && req.method === 'POST') {
            const body = JSON.parse((await readBody(req)) || '{}');
            const user = authenticate(body.email, body.password);
            if (!user) {
              sendJson(res, 401, { error: 'Email ou palavra-passe incorretos' });
              return;
            }
            if (body.requiredRole && user.role !== body.requiredRole) {
              sendJson(res, 403, {
                error:
                  body.requiredRole === 'admin'
                    ? 'Esta área é só para administradores.'
                    : 'Acesso negado.',
              });
              return;
            }
            const token = await createSessionToken(user);
            sendJson(
              res,
              200,
              { user: { email: user.email, role: user.role, name: user.name } },
              { 'Set-Cookie': sessionCookie(token, { secure: false }) }
            );
            return;
          }

          if (url === '/api/auth/logout' && req.method === 'POST') {
            sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie({ secure: false }) });
            return;
          }

          if (url === '/api/auth/me' && req.method === 'GET') {
            const token = parseCookieHeader(req.headers.cookie);
            const user = await verifySessionToken(token);
            sendJson(res, 200, { user: user ?? null });
            return;
          }

          if (url === '/api/auth/supabase-sync' && req.method === 'POST') {
            if (!isSupabaseServerConfigured()) {
              sendJson(res, 503, { error: 'Supabase não configurado no servidor.' });
              return;
            }
            const authHeader = req.headers.authorization || '';
            const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
            const body = bearer ? {} : JSON.parse((await readBody(req)) || '{}');
            const accessToken = bearer || body.access_token;
            const user = await verifySupabaseAccessToken(accessToken);
            if (!user) {
              sendJson(res, 401, { error: 'Sessão Supabase inválida.' });
              return;
            }
            const token = await createSessionToken(user);
            sendJson(
              res,
              200,
              { user },
              { 'Set-Cookie': sessionCookie(token, { secure: false }) }
            );
            return;
          }

          sendJson(res, 405, { error: 'Método não permitido' });
        } catch (err) {
          console.error('[auth-dev]', err);
          sendJson(res, 500, { error: 'Erro interno de autenticação' });
        }
      });
    },
  };
}
