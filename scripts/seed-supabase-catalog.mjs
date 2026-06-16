import { loadEnvFile } from './load-env.mjs';
import { getSupabaseAdmin, isSupabaseAdminConfigured, supabaseUrl } from '../lib/supabase-admin.mjs';
import { scanProductCatalog, listFiles, productFolderPath, pickModelFiles } from './products-lib.mjs';
import { productToRow, storageObjectPath } from '../src/data/products-cloud.js';
import fs from 'fs';
import path from 'path';

loadEnvFile();

const BUCKET = 'product-assets';
/** Limite típico Supabase free (50 MB). Aumente em Storage → Settings no painel. */
const MAX_UPLOAD_BYTES = Number(process.env.SUPABASE_MAX_UPLOAD_MB || 50) * 1024 * 1024;

function publicUrl(storagePath) {
  const base = supabaseUrl().replace(/\/$/, '');
  return `${base}/storage/v1/object/public/${BUCKET}/${storagePath.split('/').map(encodeURIComponent).join('/')}`;
}

function guessKind(fileName) {
  const lower = fileName.toLowerCase();
  if (/\.png$/i.test(lower)) return 'preview';
  if (/\.3mf$|\.mf3$/i.test(lower)) return 'model3mf';
  if (/\.stl$/i.test(lower)) return 'model';
  return 'file';
}

async function uploadFile(supabase, localPath, storagePath) {
  const stat = fs.statSync(localPath);
  if (stat.size > MAX_UPLOAD_BYTES) {
    const mb = (stat.size / (1024 * 1024)).toFixed(1);
    const maxMb = (MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0);
    console.warn(`  ⚠ ignorado (>${maxMb} MB): ${path.basename(localPath)} (${mb} MB)`);
    return null;
  }

  const body = fs.readFileSync(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const contentType =
    ext === '.png'
      ? 'image/png'
      : ext === '.stl'
        ? 'model/stl'
        : ext === '.3mf' || ext === '.mf3'
          ? 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'
          : 'application/octet-stream';

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, body, {
    upsert: true,
    contentType,
  });
  if (error) throw error;
  return publicUrl(storagePath);
}

async function main() {
  if (!isSupabaseAdminConfigured()) {
    console.error('\n❌ Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
    console.error('   (service_role só para este script local — nunca no frontend)\n');
    process.exit(1);
  }

  const supabase = getSupabaseAdmin();
  const catalog = scanProductCatalog();

  console.log(`\nA enviar ${catalog.length} produto(s) para Supabase...\n`);

  for (const item of catalog) {
    const productPath = productFolderPath({
      category: item.category,
      subcategory: item.subcategory,
      slug: item.slug,
    });

    const files = listFiles(productPath);
    const images = files.filter((f) => /\.png$/i.test(f)).sort();
    const { stl, model3mf } = pickModelFiles(files, item.slug);

    const toUpload = [...images];
    if (model3mf) toUpload.push(model3mf);
    if (stl && (!model3mf || fs.statSync(path.join(productPath, stl)).size <= MAX_UPLOAD_BYTES)) {
      if (!toUpload.includes(stl)) toUpload.push(stl);
    }

    const uploaded = { previewImages: [], previewImage: null, modelUrl: null, model3mfUrl: null };

    for (const fileName of toUpload) {
      const storagePath = storageObjectPath(
        { category: item.category, subcategory: item.subcategory, slug: item.slug },
        fileName
      );
      const url = await uploadFile(supabase, path.join(productPath, fileName), storagePath);
      if (!url) continue;

      const kind = guessKind(fileName);

      if (kind === 'preview') {
        uploaded.previewImages.push(url);
        if (!uploaded.previewImage) uploaded.previewImage = url;
      } else if (kind === 'model3mf') {
        uploaded.model3mfUrl = url;
      } else if (kind === 'model') {
        uploaded.modelUrl = url;
      }

      console.log(`  ↑ ${item.slug}/${fileName}`);
    }

    uploaded.previewImages.sort();

    const row = productToRow({
      ...item,
      desc: item.desc,
      previewImage: uploaded.previewImage || item.previewImage,
      previewImages: uploaded.previewImages.length ? uploaded.previewImages : item.previewImages,
      modelUrl: uploaded.modelUrl || item.modelUrl,
      model3mfUrl: uploaded.model3mfUrl || item.model3mfUrl,
    });

    const { error } = await supabase.from('products').upsert(row, { onConflict: 'id' });
    if (error) {
      console.error(`❌ ${item.name}:`, error.message);
      process.exit(1);
    }

    console.log(`✅ ${item.name} (id ${row.id})`);
  }

  console.log('\nConcluído. A loja usará o catálogo cloud se houver linhas em `products`.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
