import { getSupabase, isSupabaseAuth, mapSupabaseUser, roleFromSupabaseUser } from './supabase.js';

let cachedSession = null;
let sessionPromise = null;
let authListenerBound = false;

function bindSupabaseAuthListener() {
  if (authListenerBound || !isSupabaseAuth()) return;
  const supabase = getSupabase();
  if (!supabase) return;
  authListenerBound = true;
  supabase.auth.onAuthStateChange(() => {
    clearSessionCache();
  });
}

async function syncSupabaseCookie(accessToken) {
  if (!accessToken) return;
  const res = await fetch('/api/auth/supabase-sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: 'include',
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Não foi possível sincronizar a sessão com o servidor.');
  }
}

async function fetchSessionLocal() {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  const data = res.ok ? await res.json() : { user: null };
  return data.user ?? null;
}

async function fetchSessionSupabase() {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) return null;

  const user = mapSupabaseUser(data.session.user);
  if (user) {
    try {
      await syncSupabaseCookie(data.session.access_token);
    } catch {
      // Sessão Supabase válida no browser; cookie será tentado de novo no próximo pedido.
    }
  }
  return user;
}

export async function fetchSession({ force = false } = {}) {
  if (!force && cachedSession !== null) return cachedSession;
  if (!force && sessionPromise) return sessionPromise;

  bindSupabaseAuthListener();

  sessionPromise = (isSupabaseAuth() ? fetchSessionSupabase() : fetchSessionLocal())
    .then((user) => {
      cachedSession = user;
      return user;
    })
    .catch(() => {
      cachedSession = null;
      return null;
    })
    .finally(() => {
      sessionPromise = null;
    });

  return sessionPromise;
}

export function clearSessionCache() {
  cachedSession = null;
}

export function isSupabaseEnabled() {
  return isSupabaseAuth();
}

async function loginLocal(email, password, { requiredRole } = {}) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password, requiredRole }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Não foi possível iniciar sessão.');
  }

  return data.user;
}

async function loginSupabase(email, password, { requiredRole } = {}) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      error.message === 'Invalid login credentials'
        ? 'Email ou palavra-passe incorretos.'
        : error.message
    );
  }

  const role = roleFromSupabaseUser(data.user);
  if (requiredRole && role !== requiredRole) {
    await supabase.auth.signOut();
    throw new Error(
      requiredRole === 'admin' ? 'Esta área é só para administradores.' : 'Acesso negado.'
    );
  }

  await syncSupabaseCookie(data.session.access_token);
  return mapSupabaseUser(data.user);
}

export async function login(email, password, options = {}) {
  const user = isSupabaseAuth()
    ? await loginSupabase(email, password, options)
    : await loginLocal(email, password, options);

  clearSessionCache();
  cachedSession = user;
  return user;
}

export async function signUp(email, password, { name } = {}) {
  if (!isSupabaseAuth()) {
    throw new Error('Criar conta está disponível apenas quando o Supabase está configurado.');
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: name?.trim() || undefined },
      emailRedirectTo: `${window.location.origin}/login.html`,
    },
  });

  if (error) throw new Error(error.message);

  if (data.session?.access_token) {
    await syncSupabaseCookie(data.session.access_token);
    clearSessionCache();
    cachedSession = mapSupabaseUser(data.session.user);
    return { user: cachedSession, needsEmailConfirmation: false };
  }

  return { user: null, needsEmailConfirmation: true };
}

export async function logout() {
  if (isSupabaseAuth()) {
    await getSupabase()?.auth.signOut();
  }
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  clearSessionCache();
}

export async function requireRole(role, { redirect = true } = {}) {
  const user = await fetchSession();
  if (user?.role === role) return user;

  if (redirect) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/login.html?next=${next}&role=${role}`);
  }

  return null;
}

function roleLabel(role) {
  if (role === 'admin') return 'Administrador';
  if (role === 'client') return 'Cliente';
  return role;
}

export function bindAuthUI() {
  const loginLink = document.querySelector('[data-auth-login]');
  const userWrap = document.querySelector('[data-auth-user]');
  const userName = document.querySelector('[data-auth-name]');
  const userRole = document.querySelector('[data-auth-role]');
  const logoutBtn = document.querySelector('[data-auth-logout]');
  const adminLink = document.querySelector('[data-auth-admin]');

  if (!loginLink && !userWrap) return;

  const setLoginVisible = (visible) => {
    if (!loginLink) return;
    loginLink.classList.toggle('hidden', !visible);
    loginLink.classList.toggle('inline-flex', visible);
  };

  const renderUser = (user) => {
    if (user) {
      setLoginVisible(false);
      userWrap?.classList.remove('hidden');
      userWrap?.classList.add('flex');
      if (userName) userName.textContent = user.name || user.email;
      if (userRole) userRole.textContent = roleLabel(user.role);
      adminLink?.classList.toggle('hidden', user.role !== 'admin');
    } else {
      setLoginVisible(true);
      userWrap?.classList.add('hidden');
      userWrap?.classList.remove('flex');
      adminLink?.classList.add('hidden');
    }
  };

  fetchSession().then(renderUser);

  if (isSupabaseAuth()) {
    getSupabase()?.auth.onAuthStateChange(async (_event, session) => {
      cachedSession = session?.user ? mapSupabaseUser(session.user) : null;
      if (session?.access_token) {
        await syncSupabaseCookie(session.access_token).catch(() => {});
      }
      renderUser(cachedSession);
    });
  }

  logoutBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    await logout();
    window.location.href = '/';
  });
}
