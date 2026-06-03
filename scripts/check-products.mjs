import fs from 'fs';
import path from 'path';
import { scanProductCatalog, productFolderPath } from './products-lib.mjs';

const catalog = scanProductCatalog();
let ok = true;

if (!catalog.length) {
  console.log('Nenhum produto encontrado em public/products/');
  console.log('Estrutura: public/products/{categoria}/{subcategoria?}/{nome}/ + info.txt + png/stl/3mf');
  process.exit(1);
}

for (const item of catalog) {
  const dir = productFolderPath(item);
  const issues = [];

  if (!fs.existsSync(dir)) {
    issues.push(`pasta em falta: ${dir}`);
  } else {
    const files = fs.readdirSync(dir);
    if (!files.some((f) => /\.png$/i.test(f))) issues.push('sem imagem .png');
    if (!files.some((f) => /\.stl$/i.test(f))) issues.push('sem ficheiro .stl');
    if (!files.some((f) => /\.3mf$/i.test(f))) issues.push('sem ficheiro .3mf');
  }

  if (item.model3mfUrl) {
    const mfPath = path.join('public', ...item.model3mfUrl.split('/').filter(Boolean).map(decodeURIComponent));
    if (!fs.existsSync(mfPath)) issues.push(`3MF do catálogo não encontrado: ${mfPath}`);
  }

  if (issues.length) {
    ok = false;
    console.log(`\n✗ ${item.name}`);
    issues.forEach((msg) => console.log(`  - ${msg}`));
  } else {
    console.log(`✓ ${item.name}`);
    console.log(`  ${path.relative(process.cwd(), dir)}`);
  }
}

if (!ok) {
  console.log('\nCorrija os ficheiros/pastas e execute: npm run products:sync');
  process.exit(1);
}

console.log('\nTudo certo. Se o 3D ainda falhar no browser: reinicie npm run dev e use Ctrl+F5.');
