/** Mapeamento entre linhas Supabase e o formato da loja. */
import { nomeToSlug } from '../../lib/slug.mjs';

export { nomeToSlug };

function asciiStorageSegment(value) {
  return String(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function storageObjectPath({ category, subcategory, slug }, fileName) {
  const parts = [category, subcategory, slug].filter(Boolean).map(asciiStorageSegment);
  return `${parts.join('/')}/${asciiStorageSegment(fileName)}`;
}

export function rowToProduct(row) {
  if (!row) return null;
  const product = {
    id: Number(row.id),
    category: row.category,
    slug: row.slug,
    name: row.name,
    price: Number(row.price) || 0,
    desc: row.description || '',
    icon: row.icon || 'fa-solid fa-cube',
    tag: row.tag || row.category,
  };

  if (row.subcategory) product.subcategory = row.subcategory;
  if (row.preview_image) product.previewImage = row.preview_image;
  if (row.preview_images?.length) product.previewImages = row.preview_images;
  if (row.model_url) product.modelUrl = row.model_url;
  if (row.model3mf_url) product.model3mfUrl = row.model3mf_url;
  if (row.colors?.length) product.colors = row.colors;
  if (row.sizes?.length) product.sizes = row.sizes;
  if (row.featured) product.featured = true;
  if (row.featured_order != null) product.featuredOrder = row.featured_order;
  if (row.published === false) product.published = false;
  if (row.model_color) product.modelColor = row.model_color;
  if (row.model_rotation) product.modelRotation = row.model_rotation;
  if (row.model_facing != null) product.modelFacing = row.model_facing;
  if (row.model3mf_rotation) product.model3mfRotation = row.model3mf_rotation;
  if (row.model3mf_facing != null) product.model3mfFacing = row.model3mf_facing;
  if (row.card3mf_rotation) product.card3mfRotation = row.card3mf_rotation;
  if (row.card3mf_facing != null) product.card3mfFacing = row.card3mf_facing;

  return product;
}

export function productToRow(product) {
  return {
    id: product.id,
    category: product.category,
    subcategory: product.subcategory || null,
    slug: product.slug || nomeToSlug(product.name),
    name: product.name,
    price: product.price ?? 0,
    description: product.desc || product.description || '',
    icon: product.icon || null,
    tag: product.tag || null,
    sizes: product.sizes || [],
    featured: Boolean(product.featured),
    featured_order: product.featuredOrder ?? 0,
    published: product.published !== false,
    preview_image: product.previewImage || null,
    preview_images: product.previewImages || [],
    model_url: product.modelUrl || null,
    model3mf_url: product.model3mfUrl || null,
    colors: product.colors || [],
    model_color: product.modelColor || null,
    model_rotation: product.modelRotation || null,
    model_facing: product.modelFacing ?? null,
    model3mf_rotation: product.model3mfRotation || null,
    model3mf_facing: product.model3mfFacing ?? null,
    card3mf_rotation: product.card3mfRotation || null,
    card3mf_facing: product.card3mfFacing ?? null,
  };
}

export async function fetchCloudProducts(supabase, { admin = false } = {}) {
  let query = supabase.from('products').select('*').order('id', { ascending: true });
  if (!admin) query = query.eq('published', true);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToProduct);
}

export async function getNextProductId(supabase) {
  const { data, error } = await supabase
    .from('products')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.id ?? 0) + 1;
}

export async function uploadProductAsset(supabase, file, productRow) {
  if (!file?.size) return null;

  const storagePath = storageObjectPath(
    { category: productRow.category, subcategory: productRow.subcategory, slug: productRow.slug },
    file.name
  );

  const { error } = await supabase.storage.from('product-assets').upload(storagePath, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  const { data } = supabase.storage.from('product-assets').getPublicUrl(storagePath);
  return data.publicUrl;
}
