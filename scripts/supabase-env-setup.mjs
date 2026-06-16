import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function mask(value) {
  if (!value || value.length < 8) return '***';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

async function main() {
  if (fs.existsSync(ENV_PATH)) {
    console.log('\n⚠️  Já existe .env — este script não o sobrescreve.');
    console.log('   Edite manualmente ou apague .env e volte a correr.\n');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\nGD3D Creative — configurar Supabase (.env)\n');
  console.log('Painel Supabase → Project Settings → API');
  console.log('  • Project URL  → VITE_SUPABASE_URL');
  console.log('  • Publishable key → VITE_SUPABASE_ANON_KEY');
  console.log('  • JWT Secret (JWT Settings) → SUPABASE_JWT_SECRET\n');

  const url = (await ask(rl, 'VITE_SUPABASE_URL: ')).trim();
  const anonKey = (await ask(rl, 'VITE_SUPABASE_ANON_KEY (publishable): ')).trim();
  const jwtSecret = (await ask(rl, 'SUPABASE_JWT_SECRET: ')).trim();
  const authSecret =
    (await ask(rl, 'AUTH_SECRET (Enter = gerar automaticamente): ')).trim() ||
    crypto.randomBytes(32).toString('hex');

  rl.close();

  if (!url.startsWith('https://') || !url.includes('supabase')) {
    console.error('\n❌ URL inválida. Deve ser https://SEU_PROJETO.supabase.co\n');
    process.exit(1);
  }
  if (!anonKey || anonKey.length < 20) {
    console.error('\n❌ Chave anon/publishable inválida.\n');
    process.exit(1);
  }
  if (!jwtSecret || jwtSecret.length < 16) {
    console.error('\n❌ JWT Secret inválido (mín. 16 caracteres).\n');
    process.exit(1);
  }

  const content = `# Gerado por npm run supabase:setup
AUTH_SECRET=${authSecret}

VITE_SUPABASE_URL=${url}
VITE_SUPABASE_ANON_KEY=${anonKey}
SUPABASE_JWT_SECRET=${jwtSecret}
`;

  fs.writeFileSync(ENV_PATH, content, 'utf8');

  console.log('\n✅ .env criado com sucesso.');
  console.log(`   URL: ${url}`);
  console.log(`   Anon: ${mask(anonKey)}`);
  console.log(`   JWT: ${mask(jwtSecret)}`);
  console.log('\nPróximos passos:');
  console.log('  1. Corra supabase/setup.sql no SQL Editor do Supabase');
  console.log('  2. Authentication → Providers → Email → ative "Enable email signups"');
  console.log('  3. Authentication → URL Configuration → Site URL = http://localhost:5173');
  console.log('  4. npm run dev → teste login e criar conta em /login.html\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
