import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const vars = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return vars;
}

const fileEnv = loadEnvFile();
const get = (key) => process.env[key] || fileEnv[key] || '';

const checks = [
  {
    key: 'VITE_SUPABASE_URL',
    ok: (v) => v.startsWith('https://') && v.includes('supabase'),
    hint: 'Project URL do painel Supabase',
  },
  {
    key: 'VITE_SUPABASE_ANON_KEY',
    ok: (v) => v.length >= 20,
    hint: 'Publishable key (não use service_role/secret)',
  },
  {
    key: 'SUPABASE_JWT_SECRET',
    ok: (v) => v.length >= 16,
    hint: 'JWT Secret em API → JWT Settings',
  },
  {
    key: 'AUTH_SECRET',
    ok: (v) => v.length >= 16,
    hint: 'Segredo do cookie de sessão do site',
  },
];

let failed = 0;

console.log('\nGD3D Creative — verificar Supabase\n');

if (!fs.existsSync(ENV_PATH)) {
  console.log('❌ Ficheiro .env não encontrado. Corra: npm run supabase:setup\n');
  process.exit(1);
}

for (const { key, ok, hint } of checks) {
  const value = get(key);
  if (ok(value)) {
    console.log(`✅ ${key}`);
  } else {
    failed += 1;
    console.log(`❌ ${key} — ${hint}`);
  }
}

const url = get('VITE_SUPABASE_URL');
const anon = get('VITE_SUPABASE_ANON_KEY');

if (url && anon) {
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anon },
    });
    if (res.ok) {
      console.log('✅ Ligação ao projeto Supabase (auth health)');
    } else {
      failed += 1;
      console.log(`❌ Supabase respondeu ${res.status} — confira URL e chave`);
    }

    const jwks = await fetch(`${url.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`);
    if (jwks.ok) {
      const data = await jwks.json();
      const alg = data.keys?.[0]?.alg || 'desconhecido';
      console.log(`✅ JWKS do Auth (${alg}) — verificação de sessão no servidor`);
    } else {
      failed += 1;
      console.log('❌ Não foi possível obter JWKS do Auth');
    }
  } catch {
    failed += 1;
    console.log('❌ Não foi possível contactar o Supabase (rede ou URL errada)');
  }
}

console.log(failed ? `\n${failed} problema(s). Corrija o .env e volte a correr.\n` : '\nTudo pronto. Reinicie npm run dev se já estiver a correr.\n');
process.exit(failed ? 1 : 0);
