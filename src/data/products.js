import { CATALOG_PRODUCTS } from './products.catalog.js';
import { fetchCloudProducts } from './products-cloud.js';
import { getSupabase, isSupabaseAuth } from '../auth/supabase.js';

const STATIC_PRODUCTS = [...CATALOG_PRODUCTS].sort((a, b) => a.id - b.id);

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
        PRODUCTS = cloud;
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
