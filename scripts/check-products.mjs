import fs from 'fs';
import path from 'path';
import { scanProductCatalog, productFolderPath } from './products-lib.mjs';

const catalog = scanProductCatalog();
let ok = true;
const WARN_STL_BYTES = 5 * 1024 * 1024;

if (!catalog.length) {
  console.log('Nenhum produto encontrado em public/products/');
  console.log('Estrutura: public/products/{categoria}/{subcategoria?}/{nome}/ + info.txt + png + glb/stl/3mf');
  process.exit(1);
}

for (const item of catalog) {
  const dir = productFolderPath(item);
  const issues = [];
  const tips = [];

  if (!fs.existsSync(dir)) {
    issues.push(`pasta em falta: ${dir}`);
  } else {
    const files = fs.readdirSync(dir);
    if (!files.some((f) => /\.png$/i.test(f))) issues.push('sem imagem .png');

    const hasGlb = files.some((f) => /\.glb$/i.test(f));
    const has3d = files.some(
      (f) => /\.stl$/i.test(f) || /\.3mf$/i.test(f) || /\.mf3$/i.test(f) || /\.glb$/i.test(f)
    );
    if (!has3d) issues.push('sem ficheiro .glb, .3mf ou .stl');

    for (const file of files) {
      const full = path.join(dir, file);
      const size = fs.statSync(full).size;
      if (/\.stl$/i.test(file) && size > WARN_STL_BYTES && !hasGlb) {
        tips.push(
          `STL grande (${(size / (1024 * 1024)).toFixed(1)} MB) — adicione um .glb leve para a loja carregar mais rápido`
        );
      }
    }
  }

  if (item.model3mfUrl) {
    const mfPath = path.join('public', ...item.model3mfUrl.split('/').filter(Boolean).map(decodeURIComponent));
    if (!fs.existsSync(mfPath)) issues.push(`3MF do catálogo não encontrado: ${mfPath}`);
  }

  if (item.modelGlbUrl) {
    const glbPath = path.join('public', ...item.modelGlbUrl.split('/').filter(Boolean).map(decodeURIComponent));
    if (!fs.existsSync(glbPath)) issues.push(`GLB do catálogo não encontrado: ${glbPath}`);
  }

  if (issues.length) {
    ok = false;
    console.log(`\n✗ ${item.name}`);
    issues.forEach((msg) => console.log(`  - ${msg}`));
  } else {
    console.log(`✓ ${item.name}`);
    console.log(`  ${path.relative(process.cwd(), dir)}`);
    tips.forEach((msg) => console.log(`  ⚠ ${msg}`));
  }
}

if (!ok) {
  console.log('\nCorrija os ficheiros/pastas e execute: npm run products:sync');
  process.exit(1);
}

console.log('\nTudo certo. Dica: use .glb (2–5 MB) na pasta para preview web rápido; mantenha .3mf para impressão.');
console.log('Se o 3D falhar no browser: reinicie npm run dev e use Ctrl+F5.');
