import { CATALOG_PRODUCTS } from './products.catalog.js';
import { fetchCloudProducts } from './products-cloud.js';
import { getSupabase, isSupabaseAuth } from '../auth/supabase.js';

const STATIC_PRODUCTS = [...CATALOG_PRODUCTS].sort((a, b) => a.id - b.id);

const STATIC_BY_ID = new Map(STATIC_PRODUCTS.map((p) => [p.id, p]));

/** Campos de pose/orientação do preview 3D — podem faltar no Supabase após seed antigo. */
const PRESENTATION_KEYS = [
  'modelColor',
  'modelRotation',
  'modelFacing',
  'model3mfRotation',
  'model3mfFacing',
  'card3mfRotation',
  'card3mfFacing',
];

function mergeStaticPresentation(cloudProduct) {
  const local = STATIC_BY_ID.get(cloudProduct.id);
  if (!local) return cloudProduct;

  const merged = { ...cloudProduct };
  for (const key of PRESENTATION_KEYS) {
    if (merged[key] == null && local[key] != null) {
      merged[key] = local[key];
    }
  }
  return merged;
}

/** Catálogo ativo (estático ou cloud). Atualizado por `initProductCatalog()`. */
export let PRODUCTS = [...STATIC_PRODUCTS];

let catalogPromise = null;

export async function initProductCatalog({ force = false } = {}) {
  if (!force && catalogPromise) return catalogPromise;

  catalogPromise = (async () => {
    if (!isSupabaseAuth()) return PRODUCTS;

    try {
      const supabase = getSupabase();
      if (!supabase) return PRODUCTS;

      const cloud = await fetchCloudProducts(supabase);
      if (cloud.length) {
        PRODUCTS = cloud.map(mergeStaticPresentation);
      }
    } catch (err) {
      console.warn('[catalog] Cloud indisponível, a usar catálogo estático.', err);
    }

    return PRODUCTS;
  })();

  return catalogPromise;
}

export function resetProductCatalogForTests() {
  PRODUCTS = [...STATIC_PRODUCTS];
  catalogPromise = null;
}
