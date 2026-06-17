import { CATALOG_PRODUCTS } from './products.catalog.js';
import { fetchCloudProducts } from './products-cloud.js';
import { getSupabase, isSupabaseAuth } from '../auth/supabase.js';

const STATIC_PRODUCTS = [...CATALOG_PRODUCTS].sort((a, b) => a.id - b.id);

/** Catálogo ativo (estático ou cloud). Atualizado por `initProductCatalog()`. */
export let PRODUCTS = [...STATIC_PRODUCTS];

let catalogPromise = null;
let catalogGeneration = 0;

export async function initProductCatalog({ force = false } = {}) {
  if (!force && catalogPromise) return catalogPromise;

  const generation = ++catalogGeneration;

  catalogPromise = (async () => {
    if (!isSupabaseAuth()) return PRODUCTS;

    try {
      const supabase = getSupabase();
      if (!supabase) return PRODUCTS;

      const cloud = await fetchCloudProducts(supabase);
      if (generation !== catalogGeneration) return PRODUCTS;

      if (cloud.length) {
        PRODUCTS = mergeCloudWithStaticCatalog(cloud, STATIC_PRODUCTS);
      } else {
        console.warn(
          '[catalog] Supabase sem produtos publicados — a manter catálogo estático.'
        );
      }
    } catch (err) {
      console.warn('[catalog] Cloud indisponível, a usar catálogo estático.', err);
    }

    return PRODUCTS;
  })();

  return catalogPromise;
}

const CARD_META_KEYS = ['card3mfRotation'];

/** Mantém rotação explícita do card no catálogo estático quando o cloud não a define. */
function mergeCloudWithStaticCatalog(cloudProducts, staticProducts) {
  const staticById = new Map(staticProducts.map((p) => [p.id, p]));
  return cloudProducts.map((cloud) => {
    const local = staticById.get(cloud.id);
    if (!local) return cloud;

    const merged = { ...cloud };
    for (const key of CARD_META_KEYS) {
      if (local[key] != null && merged[key] == null) {
        merged[key] = local[key];
      }
    }
    return merged;
  });
}

export function resetProductCatalogForTests() {
  PRODUCTS = [...STATIC_PRODUCTS];
  catalogPromise = null;
  catalogGeneration = 0;
}
