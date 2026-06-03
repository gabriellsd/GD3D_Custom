import fs from 'fs';
import path from 'path';
import {
  PRODUCTS_ROOT,
  isProductFolder,
  listDirs,
  nomeToFolderSlug,
  readProductMeta,
} from './products-lib.mjs';

function collectProductFolders() {
  const items = [];

  for (const category of listDirs(PRODUCTS_ROOT)) {
    const categoryPath = path.join(PRODUCTS_ROOT, category);

    for (const name of listDirs(categoryPath)) {
      const entryPath = path.join(categoryPath, name);

      if (isProductFolder(entryPath)) {
        items.push({ category, subcategory: null, slug: name, productPath: entryPath });
        continue;
      }

      for (const slug of listDirs(entryPath)) {
        const productPath = path.join(entryPath, slug);
        if (!isProductFolder(productPath)) continue;
        items.push({ category, subcategory: name, slug, productPath });
      }
    }
  }

  return items;
}

function renameFolder(productPath, nextSlug) {
  const parent = path.dirname(productPath);
  const dest = path.join(parent, nextSlug);

  if (path.resolve(dest) === path.resolve(productPath)) return false;
  if (fs.existsSync(dest)) {
    console.error(`Destino já existe: ${dest}`);
    process.exit(1);
  }

  try {
    fs.renameSync(productPath, dest);
  } catch (err) {
    if (err?.code !== 'EPERM' && err?.code !== 'EBUSY' && err?.code !== 'EXDEV') throw err;
    fs.cpSync(productPath, dest, { recursive: true });
    fs.rmSync(productPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
  return true;
}

let renamed = 0;

for (const item of collectProductFolders()) {
  const meta = readProductMeta(item.productPath, item.slug, item.category);
  const nome = meta.nome?.trim();
  if (!nome) {
    console.warn(`Sem nome em info.txt: ${item.productPath}`);
    continue;
  }

  const nextSlug = nomeToFolderSlug(nome);
  if (!nextSlug) {
    console.warn(`Nome inválido para pasta: ${nome}`);
    continue;
  }

  if (nextSlug === item.slug) {
    console.log(`OK (já correto): ${item.slug}`);
    continue;
  }

  const rel = [item.category, item.subcategory, item.slug].filter(Boolean).join('/');
  const relNext = [item.category, item.subcategory, nextSlug].filter(Boolean).join('/');
  renameFolder(item.productPath, nextSlug);
  console.log(`Renomeado: ${rel} → ${relNext}`);
  renamed += 1;
}

if (renamed) {
  console.log(`\n${renamed} pasta(s) renomeada(s). Execute: npm run products:sync`);
} else {
  console.log('Nenhuma pasta para renomear.');
}
