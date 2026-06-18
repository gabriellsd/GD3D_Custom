import { initShell } from '../layout/shell.js';
import { fetchSession, login, signUp, isSupabaseEnabled } from '../auth/client.js';
import { ensureSupabaseConfig } from '../auth/supabase.js';

function safeNextPath(next) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

function defaultRedirect() {
  return '/';
}

initShell({ page: 'login', title: 'Entrar — GD3D Creative' });

const params = new URLSearchParams(window.location.search);
const nextPath = safeNextPath(params.get('next'));
const requiredRole = params.get('role');
const isAdminGate = requiredRole === 'admin';

const subtitle = document.getElementById('login-subtitle');
const title = document.getElementById('login-title');
const form = document.getElementById('login-form');
const nameWrap = document.getElementById('signup-name-wrap');
const submitBtn = document.getElementById('login-submit');
const altBtn = document.getElementById('login-alt-action');
const errorEl = document.getElementById('login-error');
const successEl = document.getElementById('login-success');

let mode = 'login';

if (isAdminGate) {
  if (subtitle) subtitle.textContent = 'Área restrita — acesse com uma conta de administrador.';
  if (title) title.textContent = 'Entrar';
  altBtn?.classList.add('hidden');
}

function setMode(next) {
  mode = next;
  const isSignup = mode === 'signup';

  nameWrap?.classList.toggle('hidden', !isSignup);

  if (title) title.textContent = isSignup ? 'Criar conta' : 'Entrar';
  if (submitBtn) submitBtn.textContent = isSignup ? 'Criar conta' : 'Acessar conta';

  if (altBtn && !isAdminGate) {
    altBtn.textContent = isSignup ? 'Já tenho conta — Entrar' : 'Criar conta';
    altBtn.classList.remove('hidden');
  }

  if (subtitle && !isAdminGate) {
    subtitle.textContent = isSignup
      ? 'Registe-se para encomendar na loja com a sua conta.'
      : 'Acesse com o email e palavra-passe da sua conta.';
  }

  const passwordInput = form?.querySelector('#login-password');
  if (passwordInput) {
    passwordInput.autocomplete = isSignup ? 'new-password' : 'current-password';
  }

  errorEl?.classList.add('hidden');
  successEl?.classList.add('hidden');
}

altBtn?.addEventListener('click', () => {
  setMode(mode === 'login' ? 'signup' : 'login');
});

setMode('login');

ensureSupabaseConfig().then((supabaseReady) => {
  const hint = document.getElementById('login-dev-hint');
  if (!hint || supabaseReady || isSupabaseEnabled()) return;

  hint.textContent =
    'Modo local (sem Supabase): use admin@gd3d.local / admin123 ou cliente@example.com / cliente123. Para contas reais, corra npm run supabase:setup.';
  hint.classList.remove('hidden');
});

fetchSession().then((user) => {
  if (!user) return;
  if (requiredRole && user.role !== requiredRole) return;
  window.location.replace(nextPath !== '/' ? nextPath : defaultRedirect(user));
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  errorEl?.classList.add('hidden');
  successEl?.classList.add('hidden');
  submitBtn.disabled = true;
  if (altBtn) altBtn.disabled = true;

  const email = form.email.value;
  const password = form.password.value;

  try {
    if (mode === 'signup') {
      const { user, needsEmailConfirmation } = await signUp(email, password, {
        name: form.name?.value,
      });

      if (needsEmailConfirmation) {
        successEl.textContent = 'Conta criada. Verifique o seu email para confirmar e depois entre.';
        successEl.classList.remove('hidden');
        setMode('login');
        submitBtn.disabled = false;
        if (altBtn) altBtn.disabled = false;
        return;
      }

      window.location.replace(nextPath !== '/' ? nextPath : defaultRedirect(user));
      return;
    }

    const user = await login(email, password, { requiredRole: requiredRole || undefined });
    window.location.replace(nextPath !== '/' ? nextPath : defaultRedirect(user));
  } catch (err) {
    errorEl.textContent = err.message || 'Erro ao processar.';
    errorEl.classList.remove('hidden');
    submitBtn.disabled = false;
    if (altBtn) altBtn.disabled = false;
  }
});
