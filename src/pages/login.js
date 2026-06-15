import { initShell } from '../layout/shell.js';
import { fetchSession, login } from '../auth/client.js';

function safeNextPath(next) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

function defaultRedirect(user) {
  if (user.role === 'admin') return '/visualizador-avancado.html';
  return '/produtos.html';
}

initShell({ page: 'login', title: 'Entrar — GD3D Creative' });

const params = new URLSearchParams(window.location.search);
const nextPath = safeNextPath(params.get('next'));
const requiredRole = params.get('role');

const subtitle = document.getElementById('login-subtitle');
if (requiredRole === 'admin') {
  subtitle.textContent = 'Área restrita — inicie sessão com uma conta de administrador.';
}

fetchSession().then((user) => {
  if (!user) return;
  if (requiredRole && user.role !== requiredRole) return;
  window.location.replace(nextPath !== '/' ? nextPath : defaultRedirect(user));
});

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const errorEl = document.getElementById('login-error');
  const submitBtn = form.querySelector('[type="submit"]');

  errorEl.classList.add('hidden');
  submitBtn.disabled = true;

  try {
    const email = form.email.value;
    const password = form.password.value;
    const user = await login(email, password, { requiredRole: requiredRole || undefined });
    window.location.replace(nextPath !== '/' ? nextPath : defaultRedirect(user));
  } catch (err) {
    errorEl.textContent = err.message || 'Erro ao entrar.';
    errorEl.classList.remove('hidden');
    submitBtn.disabled = false;
  }
});
