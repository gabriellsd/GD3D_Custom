import { getSearchQueryFromUrl, searchProducts } from '../layout/search.js';
import { PRODUCTS } from '../data/products.js';
import { addToCart } from '../cart/cart.js';
import { formatBRL } from '../utils/format.js';
import { buildStoreCardHtml } from './card.js';
import {
  bindShopFilters,
  filterProducts,
  getFilterKey,
  renderShopFilters,
} from './catalog-filters.js';
import { bindCardGalleries, mountModalGallery } from './gallery.js';
import {
  bindCardPreview3d,
  prefetchCardModels,
  productSupportsCard3d,
} from './card-preview-3d.js';
import { bindSizeOptions, buildSizeOptionsHtml, escapeHtml, getSelectedSize } from './sizes.js';

const ICON_COLOR = '#e8a317';

let currentFilter = 'all';

export function initShop() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  prefetchCardModels(PRODUCTS);

  renderShopFilters(PRODUCTS, currentFilter);
  bindShopFilters(document, PRODUCTS, applyFilter);

  document.querySelector('[data-modal-close]')?.addEventListener('click', closeProductModal);
  document.getElementById('product-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'product-modal') closeProductModal();
  });

  const urlQuery = getSearchQueryFromUrl();
  if (urlQuery) {
    applySearch(urlQuery);
    return;
  }

  const hash = window.location.hash.replace('#filter-', '');
  const validKeys = ['all', ...getValidFilterKeys()];
  applyFilter(validKeys.includes(hash) ? hash : 'all', { updateHash: false });
}

function getValidFilterKeys() {
  const keys = new Set();
  for (const product of PRODUCTS) {
    keys.add(product.category);
    if (product.subcategory) keys.add(getFilterKey(product.category, product.subcategory));
  }
  return [...keys];
}

function applyFilter(key, { updateHash = true } = {}) {
  currentFilter = key;
  renderShopFilters(PRODUCTS, key);

  if (updateHash && key !== 'search') {
    const hash = key === 'all' ? '' : `#filter-${key}`;
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }

  renderProducts(filterProducts(PRODUCTS, key));
}

function applySearch(query) {
  currentFilter = 'search';
  const submenu = document.getElementById('shop-filters-submenu');
  if (submenu) {
    submenu.innerHTML = '';
    submenu.classList.add('hidden');
    submenu.hidden = true;
  }
  renderShopFilters(PRODUCTS, 'all');
  document.querySelectorAll('[data-filter-key]').forEach((btn) => {
    btn.className =
      btn.dataset.filterKey === 'all'
        ? 'filter-btn shrink-0 px-4 py-2 rounded-full text-sm font-medium transition bg-[#2a2a2a] text-white'
        : 'filter-btn shrink-0 px-4 py-2 rounded-full text-sm font-medium transition text-slate-500 hover:text-slate-300';
  });

  const items = searchProducts(query);
  renderProducts(items);

  const grid = document.getElementById('product-grid');
  if (grid && !items.length) {
    grid.innerHTML = `<p class="col-span-full text-center text-slate-500 py-12 text-sm">Nenhum resultado para &quot;${escapeHtml(query)}&quot;.</p>`;
  }
}

const CARD_CLICK_IGNORE =
  '[data-add-cart], [data-size-option], [data-gallery-prev], [data-gallery-next], .store-card-cta, button, a';

function goToProduct3d(productId) {
  const product = PRODUCTS.find((p) => p.id === productId);
  if (!product) return;

  if (product.model3mfUrl || product.modelUrl) {
    window.location.href = `/visualizador.html?produto=${productId}`;
    return;
  }

  openProductModal(productId);
}

let disposeCard3d = null;

function bindCardEvents(container, items) {
  disposeCard3d?.();
  bindCardGalleries(container, buildPreviewUrlsMap(items));
  disposeCard3d = bindCardPreview3d(container, PRODUCTS) ?? null;

  bindSizeOptions(container);

  container.addEventListener('click', (e) => {
    if (e.target.closest(CARD_CLICK_IGNORE)) return;
    const card = e.target.closest('.store-card:not(.store-card--selectable)');
    if (!card) return;
    goToProduct3d(Number(card.dataset.productId));
  });

  container.querySelectorAll('[data-add-cart]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const product = PRODUCTS.find((p) => p.id === Number(btn.dataset.addCart));
      const card = btn.closest('[data-product-id]');
      addToCart({
        id: product.id,
        name: product.name,
        price: product.price,
        icon: product.icon,
        previewImage: product.previewImage,
        colors: product.colors,
        size: getSelectedSize(card),
      });
    });
  });
}

function buildPreviewUrlsMap(items) {
  return new Map(
    items
      .filter((p) => !productSupportsCard3d(p))
      .map((p) => [
        p.id,
        p.previewImages?.length ? p.previewImages : p.previewImage ? [p.previewImage] : [],
      ])
  );
}

function renderProducts(items) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  grid.innerHTML = items.map((p) => buildStoreCardHtml(p)).join('');
  bindCardEvents(grid, items);
}

function openProductModal(productId) {
  const product = PRODUCTS.find((p) => p.id === productId);
  const modal = document.getElementById('product-modal');
  if (!product || !modal) return;

  document.getElementById('modal-title').textContent = product.name;
  document.getElementById('modal-price').textContent = formatBRL(product.price);
  document.getElementById('modal-desc').textContent = product.desc;

  const sizesHost = document.getElementById('modal-sizes');
  if (sizesHost) {
    sizesHost.innerHTML = buildSizeOptionsHtml(product.sizes, { prefix: 'store-card-sizes--modal' });
    bindSizeOptions(sizesHost);
  }

  const imgContainer = document.getElementById('modal-image');
  if (product.previewImages?.length || product.previewImage) {
    mountModalGallery(imgContainer, product);
  } else {
    imgContainer.innerHTML = `<i class="${product.icon}"></i>`;
    imgContainer.style.color = ICON_COLOR;
  }

  document.getElementById('modal-add-btn').textContent = 'Encomendar agora';
  document.getElementById('modal-add-btn').className =
    'w-full py-3.5 bg-brand-500 hover:bg-brand-400 text-brand-900 font-bold rounded-xl transition flex items-center justify-center gap-2';
  document.getElementById('modal-add-btn').onclick = () => {
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      icon: product.icon,
      previewImage: product.previewImage,
      colors: product.colors,
      size: getSelectedSize(document.getElementById('product-modal')),
    });
    closeProductModal();
  };

  modal.classList.remove('hidden');
}

function closeProductModal() {
  document.getElementById('product-modal')?.classList.add('hidden');
}
