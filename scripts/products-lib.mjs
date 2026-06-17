import fs from 'fs';
import path from 'path';
import { readFilamentColorsFrom3mfFile } from './bambu-colors.mjs';

export const PRODUCTS_ROOT = path.join(process.cwd(), 'public', 'products');

export const CATEGORY_DEFAULTS = {
  Miniaturas: { icon: 'fa-solid fa-chess-knight', tag: 'Miniaturas' },
  geek: { icon: 'fa-solid fa-gamepad', tag: 'Geek' },
  decor: { icon: 'fa-solid fa-wine-glass', tag: 'Decoração' },
  util: { icon: 'fa-solid fa-box', tag: 'Utilitários' },
};

export function humanizeSlug(slug) {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Slug de pasta a partir do campo `nome` do info.txt */
export function nomeToFolderSlug(nome) {
  return String(nome)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

export function productPublicUrl(category, slug, fileName = '', subcategory = null) {
  const segments = [category, subcategory, slug].filter(Boolean).map((s) => encodeURIComponent(s));
  const base = `/products/${segments.join('/')}`;
  if (!fileName) return base;
  return `${base}/${encodeURIComponent(fileName)}`;
}

export function productFolderPath({ category, subcategory, slug }) {
  return path.join(PRODUCTS_ROOT, category, ...(subcategory ? [subcategory] : []), slug);
}

export function isProductFolder(dir) {
  if (!fs.existsSync(dir)) return false;
  const files = listFiles(dir);
  if (files.some((f) => INFO_TXT_NAMES.includes(f) || f === 'product.json')) return true;
  return files.some((f) => /\.(png|stl|3mf|mf3)$/i.test(f));
}

export function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);
}

export function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => !f.startsWith('.'));
}

const INFO_TXT_NAMES = ['info.txt', 'produto.txt'];

function splitSizes(raw) {
  return String(raw)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isSizeOnlyLine(line) {
  return /^tamanho(s)?\s*[:=]\s*.+$/i.test(line);
}

function parsePrice(raw) {
  if (raw == null || raw === '') return null;
  const normalized = String(raw)
    .replace(/[^\d,.-]/g, '')
    .replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

function readProductTxt(dir) {
  const txtName = INFO_TXT_NAMES.find((name) => fs.existsSync(path.join(dir, name)));
  if (!txtName) return {};

  const content = fs.readFileSync(path.join(dir, txtName), 'utf8').trim();
  if (!content) return {};

  const lines = content.split(/\r?\n/);
  const parsed = {};
  const sizeLines = [];
  let descLines = [];
  let collectingDesc = false;
  let collectingSizes = false;

  const isKeyLine = (line) =>
    /^(preco|preço|price|nome|titulo|título|name|descricao|descrição|desc|tamanho|tamanhos|destaque|featured|destaque_ordem|featured_order|ordem_destaque)\s*[:=]/i.test(
      line
    ) || /^tamanhos\s*:$/i.test(line);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const priceMatch = line.match(/^(preco|preço|price)\s*[:=]\s*(.+)$/i);
    if (priceMatch) {
      collectingDesc = false;
      collectingSizes = false;
      const price = parsePrice(priceMatch[2]);
      if (price != null) parsed.price = price;
      continue;
    }

    const titleMatch = line.match(/^(nome|titulo|título|name)\s*[:=]\s*(.+)$/i);
    if (titleMatch) {
      collectingDesc = false;
      collectingSizes = false;
      parsed.nome = titleMatch[2].trim();
      continue;
    }

    if (/^tamanhos\s*:$/i.test(line)) {
      collectingSizes = true;
      collectingDesc = false;
      continue;
    }

    const sizesMatch = line.match(/^tamanhos\s*[:=]\s*(.+)$/i);
    if (sizesMatch) {
      collectingSizes = false;
      collectingDesc = false;
      parsed.sizes = splitSizes(sizesMatch[1]);
      continue;
    }

    const oneSizeMatch = line.match(/^tamanho\s*[:=]\s*(.+)$/i);
    if (oneSizeMatch) {
      collectingSizes = false;
      collectingDesc = false;
      if (!parsed.sizes) parsed.sizes = [];
      parsed.sizes.push(oneSizeMatch[1].trim());
      continue;
    }

    const featuredMatch = line.match(/^(destaque|featured)\s*[:=]\s*(.+)$/i);
    if (featuredMatch) {
      collectingDesc = false;
      collectingSizes = false;
      const val = featuredMatch[2].trim().toLowerCase();
      parsed.featured = ['sim', 's', 'yes', 'y', 'true', '1', 'on'].includes(val);
      continue;
    }

    const featuredOrderMatch = line.match(
      /^(destaque_ordem|featured_order|ordem_destaque)\s*[:=]\s*(\d+)$/i
    );
    if (featuredOrderMatch) {
      collectingDesc = false;
      collectingSizes = false;
      parsed.featuredOrder = parseInt(featuredOrderMatch[2], 10);
      continue;
    }

    if (collectingSizes && !isKeyLine(line)) {
      sizeLines.push(line);
      continue;
    }

    const descMatch = line.match(/^(descricao|descrição|desc)\s*[:=]\s*(.*)$/i);
    if (descMatch) {
      collectingDesc = true;
      collectingSizes = false;
      descLines = descMatch[2].trim() ? [descMatch[2].trim()] : [];
      continue;
    }

    if (collectingDesc && !isKeyLine(line) && !isSizeOnlyLine(line)) {
      descLines.push(line);
      continue;
    }

    collectingDesc = false;
  }

  if (sizeLines.length) {
    parsed.sizes = sizeLines;
  }

  if (descLines.length) {
    parsed.desc = descLines
      .filter((line) => !/^tamanho\s*:/i.test(line))
      .join('\n\n')
      .trim();
  }

  if (parsed.sizes?.length) {
    parsed.sizes = [...new Set(parsed.sizes)];
  }

  if (
    parsed.price != null ||
    parsed.desc ||
    parsed.nome ||
    parsed.sizes?.length ||
    parsed.featured != null ||
    parsed.featuredOrder != null
  ) {
    return parsed;
  }

  const simpleLines = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const price = parsePrice(simpleLines[0]);
  const nome = simpleLines[1] && !simpleLines[1].includes('=') ? simpleLines[1] : null;
  const desc = simpleLines.slice(nome ? 2 : 1).join('\n\n').trim();

  if (price != null) parsed.price = price;
  if (nome) parsed.nome = nome;
  if (desc) parsed.desc = desc;

  return parsed;
}

export function readProductMeta(dir, slug, category) {
  const defaults = CATEGORY_DEFAULTS[category] ?? { icon: 'fa-solid fa-cube', tag: 'Produto' };
  const base = {
    icon: defaults.icon,
    tag: defaults.tag,
  };

  const fromTxt = readProductTxt(dir);

  const metaPath = path.join(dir, 'product.json');
  const fromJson = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    : {};

  return {
    ...base,
    ...fromTxt,
    ...fromJson,
    nome:
      fromJson.nome ??
      fromTxt.nome ??
      fromJson.titulo ??
      fromTxt.titulo ??
      fromJson.name ??
      null,
    sizes: fromTxt.sizes,
    price: fromJson.price ?? fromTxt.price ?? 0,
    desc:
      fromJson.desc ??
      fromTxt.desc ??
      `Produto ${humanizeSlug(slug)}. Edite info.txt nesta pasta.`,
  };
}

export function pickModelFiles(files, slug = '') {
  const stl = files.find((f) => /\.stl$/i.test(f));
  const all3mf = files.filter((f) => /\.3mf$/i.test(f) || /\.mf3$/i.test(f));
  const slugKey = slug.toLowerCase();

  let model3mf = all3mf.find(
    (f) =>
      slugKey &&
      f.toLowerCase().includes(slugKey) &&
      /multicolor/i.test(f) &&
      !f.includes('+')
  );
  if (!model3mf) model3mf = all3mf.find((f) => /multicolor/i.test(f) && !f.includes('+'));
  if (!model3mf) model3mf = all3mf.find((f) => !f.includes('+'));
  if (!model3mf) model3mf = all3mf.sort((a, b) => a.length - b.length)[0];

  return { stl, model3mf };
}

function buildCatalogEntry({ category, subcategory, slug, productPath }) {
  const files = listFiles(productPath);
  const meta = readProductMeta(productPath, slug, category);
  const images = files.filter((f) => /\.png$/i.test(f)).sort();
  const { stl, model3mf } = pickModelFiles(files, slug);

  if (!images.length && !stl && !model3mf) return null;

  const defaults = CATEGORY_DEFAULTS[category] ?? { icon: 'fa-solid fa-cube', tag: 'Produto' };
  const subLabel = subcategory ? humanizeSlug(subcategory) : null;

  const entry = {
    slug,
    category,
    name: meta.nome || 'Sem nome no info.txt',
    price: Number(meta.price) || 0,
    icon: meta.icon,
    desc: meta.desc,
    tag: meta.tag ?? subLabel ?? defaults.tag,
  };

  if (subcategory) entry.subcategory = subcategory;
  if (meta.id != null) entry.id = Number(meta.id);

  if (images.length) {
    const urls = images.map((f) => productPublicUrl(category, slug, f, subcategory));
    entry.previewImage = urls[0];
    entry.previewImages = urls;
  }

  if (stl) entry.modelUrl = productPublicUrl(category, slug, stl, subcategory);
  if (model3mf) entry.model3mfUrl = productPublicUrl(category, slug, model3mf, subcategory);

  if (model3mf) {
    const colorsFromFile = readFilamentColorsFrom3mfFile(path.join(productPath, model3mf));
    if (colorsFromFile.length) entry.colors = colorsFromFile;
  }

  const optionalKeys = [
    'sizes',
    'featured',
    'featuredOrder',
    'modelColor',
    'modelRotation',
    'modelFacing',
    'model3mfRotation',
    'model3mfFacing',
    'card3mfRotation',
    'card3mfFacing',
    'shape3d',
    'colors',
  ];

  for (const key of optionalKeys) {
    if (key === 'colors' && entry.colors?.length) continue;
    if (meta[key] !== undefined) entry[key] = meta[key];
  }

  return entry;
}

export function scanProductCatalog() {
  const items = [];

  for (const category of listDirs(PRODUCTS_ROOT)) {
    const categoryPath = path.join(PRODUCTS_ROOT, category);

    for (const name of listDirs(categoryPath)) {
      const entryPath = path.join(categoryPath, name);

      if (isProductFolder(entryPath)) {
        const entry = buildCatalogEntry({
          category,
          subcategory: null,
          slug: name,
          productPath: entryPath,
        });
        if (entry) items.push(entry);
        continue;
      }

      for (const slug of listDirs(entryPath)) {
        const productPath = path.join(entryPath, slug);
        if (!isProductFolder(productPath)) continue;

        const entry = buildCatalogEntry({
          category,
          subcategory: name,
          slug,
          productPath,
        });
        if (entry) items.push(entry);
      }
    }
  }

  items.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    const subA = a.subcategory ?? '';
    const subB = b.subcategory ?? '';
    if (subA !== subB) return subA.localeCompare(subB, 'pt');
    return a.name.localeCompare(b.name, 'pt');
  });

  return items;
}

export function toProductsModule(catalog, startId) {
  let nextId = startId;
  const usedIds = new Set();

  const products = catalog.map((item) => {
    const { slug, ...rest } = item;
    let id = rest.id;

    if (id == null || usedIds.has(id)) {
      while (usedIds.has(nextId)) nextId += 1;
      id = nextId++;
    } else {
      usedIds.add(id);
      nextId = Math.max(nextId, id + 1);
    }

    usedIds.add(id);
    const { id: _drop, ...fields } = { id, ...rest };
    return { id, ...fields };
  });

  const lines = products.map((p) => {
    const parts = Object.entries(p).map(([k, v]) => `  ${k}: ${formatValue(v)}`);
    return `  {\n${parts.join(',\n')}\n  }`;
  });

  return `// Gerado automaticamente por npm run products:sync — não editar à mão.\nexport const CATALOG_PRODUCTS = [\n${lines.join(',\n')}\n];\n`;
}

function formatValue(v, indent = 2) {
  const pad = ' '.repeat(indent);
  if (v === null || v === undefined) return 'undefined';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (typeof v[0] === 'string') return `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
    return `[\n${v.map((x) => `${pad}  ${formatValue(x, indent + 2)}`).join(',\n')}\n${pad}]`;
  }
  if (typeof v === 'object') {
    const inner = Object.entries(v)
      .map(([k, val]) => `${pad}  ${k}: ${formatValue(val, indent + 2)}`)
      .join(',\n');
    return `{\n${inner}\n${pad}}`;
  }
  return JSON.stringify(v);
}
