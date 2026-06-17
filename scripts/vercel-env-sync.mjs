import { spawnSync } from 'child_process';
import { loadEnvFile } from './load-env.mjs';

const KEYS = [
  'AUTH_SECRET',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_JWT_SECRET',
];

const ENVIRONMENTS = ['production'];

loadEnvFile();

function upsertEnv(name, value, environment) {
  spawnSync('vercel', ['env', 'rm', name, environment, '--yes'], {
    stdio: 'ignore',
    shell: true,
  });

  const result = spawnSync('vercel', ['env', 'add', name, environment], {
    input: value,
    encoding: 'utf8',
    shell: true,
  });

  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(`Falha ao definir ${name} (${environment}): ${err}`);
  }
}

const missing = KEYS.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(`\n❌ Em falta no .env: ${missing.join(', ')}`);
  console.error('   Corra npm run supabase:setup ou edite .env antes de sincronizar.\n');
  process.exit(1);
}

console.log('\nGD3D Creative — a sincronizar variáveis com a Vercel (gd3dcustom)…\n');

for (const environment of ENVIRONMENTS) {
  for (const key of KEYS) {
    process.stdout.write(`  ${key} → ${environment}… `);
    try {
      upsertEnv(key, process.env[key].trim(), environment);
      console.log('ok');
    } catch (err) {
      console.log('erro');
      console.error(err.message);
      process.exit(1);
    }
  }
}

console.log('\n✅ Variáveis enviadas. A fazer redeploy de produção…\n');

const deploy = spawnSync('vercel', ['deploy', '--prod', '--yes'], {
  encoding: 'utf8',
  shell: true,
  stdio: 'inherit',
});

if (deploy.status !== 0) {
  console.error('\n⚠️  Variáveis criadas, mas o redeploy falhou. Corra: vercel deploy --prod\n');
  process.exit(deploy.status ?? 1);
}

console.log('\n✅ Deploy concluído. Teste /api/config e o login.\n');
