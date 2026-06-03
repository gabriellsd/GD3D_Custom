import fs from 'fs';
import path from 'path';
import { PRODUCTS_ROOT, CATEGORY_DEFAULTS, humanizeSlug } from './products-lib.mjs';

const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Uso: npm run products:new -- <categoria> <nome-pasta>');
  console.log('     npm run products:new -- <categoria> <subcategoria> <nome-pasta>');
  console.log('Ex.: npm run products:new -- Miniaturas pikachu');
  console.log('Ex.: npm run products:new -- Miniaturas pokemon pikachu');
  console.log('Categorias: Miniaturas | geek | decor | util');
  process.exit(1);
}

const [category, second, third] = args;
const subcategory = third ? second : null;
const slug = third ?? second;

if (!CATEGORY_DEFAULTS[category]) {
  console.error(`Categoria inválida: ${category}`);
  process.exit(1);
}

const dir = path.join(PRODUCTS_ROOT, category, ...(subcategory ? [subcategory] : []), slug);
fs.mkdirSync(dir, { recursive: true });

const defaults = CATEGORY_DEFAULTS[category];
const subLabel = subcategory ? humanizeSlug(subcategory) : null;

const infoPath = path.join(dir, 'info.txt');
if (!fs.existsSync(infoPath)) {
  fs.writeFileSync(
    infoPath,
    `preco=0\nnome=${humanizeSlug(slug)}\ntamanhos=10 cm\ndescricao=Descrição do produto.\n`,
    'utf8'
  );
}

const metaPath = path.join(dir, 'product.json');
if (!fs.existsSync(metaPath)) {
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        icon: defaults.icon,
        tag: subLabel ?? defaults.tag,
        modelFacing: 3.141592653589793,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
}

const rel = ['products', category, subcategory, slug].filter(Boolean).join('/');
console.log(`Pasta criada: public/${rel}/`);
console.log('Coloque aqui: imagens .png, modelo .stl, multicolor .3mf, info.txt (preço e descrição)');
console.log('Depois execute: npm run products:sync');
