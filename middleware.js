import { verifySessionToken, parseCookieHeader, COOKIE_NAME } from './lib/auth-token.mjs';

export const config = {
  matcher: ['/visualizador-avancado', '/visualizador-avancado.html', '/admin', '/admin.html'],
};

export default async function middleware(request) {
  const url = new URL(request.url);
  const token = parseCookieHeader(request.headers.get('cookie'), COOKIE_NAME);
  const user = await verifySessionToken(token);

  if (user?.role === 'admin') {
    return;
  }

  const login = new URL('/login.html', url.origin);
  login.searchParams.set('next', url.pathname + url.search);
  login.searchParams.set('role', 'admin');
  return Response.redirect(login, 302);
}
