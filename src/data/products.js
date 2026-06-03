import { CATALOG_PRODUCTS } from './products.catalog.js';

/** Só produtos com pasta em public/products/{categoria}/{nome}/ (gerado por npm run products:sync). */
export const PRODUCTS = [...CATALOG_PRODUCTS].sort((a, b) => a.id - b.id);
