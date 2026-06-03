import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  PRODUCTS_ROOT,
  listDirs,
  productFolderPath,
  scanProductCatalog,
  toProductsModule,
} from './products-lib.mjs';

const OUT_FILE = path.join(process.cwd(), 'src', 'data', 'products.catalog.js');

function getNextAutoId(catalog) {
  const ids = catalog.map((p) => p.id).filter((id) => id != null);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function migrateLegacyFlatFolders() {
  if (!fs.existsSync(PRODUCTS_ROOT)) {
    fs.mkdirSync(PRODUCTS_ROOT, { recursive: true });
    return;
  }

  for (const name of listDirs(PRODUCTS_ROOT)) {
    const full = path.join(PRODUCTS_ROOT, name);
    const files = fs.readdirSync(full);
    const hasAssets = files.some((f) => /\.(png|stl|3mf|mf3)$/i.test(f));

    if (!hasAssets) continue;

    const category = 'Miniaturas';
    const destDir = path.join(PRODUCTS_ROOT, category, name);
    fs.mkdirSync(path.join(PRODUCTS_ROOT, category), { recursive: true });

    if (!fs.existsSync(destDir)) {
      fs.renameSync(full, destDir);
      console.log(`Movido: products/${name} → products/${category}/${name}`);
    }
  }
}

function multicolorShortName(slug) {
  const base = slug
    .split(/[-_]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
  return `${base}_Multicolor.3mf`;
}

function ensureMulticolorAlias(productPath, slug) {
  const files = fs.readdirSync(productPath);
  const shortName = multicolorShortName(slug);
  const hasShort = files.some((f) => f.toLowerCase() === shortName.toLowerCase());
  const long = files.find(
    (f) =>
      f.toLowerCase().includes(slug.toLowerCase()) &&
      /multicolor/i.test(f) &&
      /\.3mf$/i.test(f) &&
      f.toLowerCase() !== shortName.toLowerCase()
  );

  if (!hasShort && long) {
    const dest = path.join(productPath, shortName);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(productPath, long), dest);
      console.log(`Cópia 3MF: ${long} → ${shortName}`);
    }
  }
}

export function runProductsSync({ quiet = false } = {}) {
  migrateLegacyFlatFolders();

  let catalog = scanProductCatalog();

  for (const item of catalog) {
    const productPath = productFolderPath(item);
    ensureMulticolorAlias(productPath, item.slug);
  }

  const refreshed = scanProductCatalog();
  const startId = getNextAutoId(refreshed);
  const moduleSource = toProductsModule(refreshed, startId);
  const previous = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';

  if (previous !== moduleSource) {
    fs.writeFileSync(OUT_FILE, moduleSource, 'utf8');
  }

  if (!quiet) {
    console.log(`Catálogo: ${refreshed.length} produto(s) em public/products/`);
    const ids = refreshed.map((p) => p.id).filter((id) => id != null);
    const autoIds = refreshed.filter((p) => p.id == null).length;
    console.log(
      `→ ${path.relative(process.cwd(), OUT_FILE)}` +
        (ids.length ? ` (id fixo: ${ids.join(', ')})` : '') +
        (autoIds ? ` | próximos IDs automáticos a partir de ${startId}` : '')
    );

    if (!refreshed.length) {
      console.log('\nEstrutura esperada:');
      console.log('  public/products/{categoria}/{nome-do-produto}/');
      console.log('  public/products/{categoria}/{subcategoria}/{nome-do-produto}/');
      console.log('    *.png  *.stl  *.3mf  info.txt  product.json (3D, opcional)');
    }
  }

  return { products: refreshed, changed: previous !== moduleSource };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runProductsSync().products;
}
