import { PRODUCTS } from '../data/products.js';
import { buildStoreCardHtml } from '../shop/card.js';
import { prefetchCardModels } from '../shop/card-preview-3d.js';
import { bindCardGalleries } from '../shop/gallery.js';
import { onProductColorsLoaded, selectProduct } from '../customizer/scene.js';
import { addToCart } from '../cart/cart.js';

let activeProduct = null;

export function initViewerCatalog() {
  const list = document.getElementById('viewer-product-list');
  const panelTitle = document.getElementById('viewer-panel-title');
  if (!list) return;

  const params = new URLSearchParams(window.location.search);
  const productId = Number(params.get('produto'));
  const product = PRODUCTS.find((p) => p.id === productId);

  if (!product) {
    window.location.replace('/produtos.html');
    return;
  }

  activeProduct = product;
  list.innerHTML = buildStoreCardHtml(product, {
    showCta: false,
    selectMode: true,
    staticPreview: true,
  });

  const previewUrls = new Map([
    [
      product.id,
      product.previewImages?.length
        ? product.previewImages
        : product.previewImage
          ? [product.previewImage]
          : [],
    ],
  ]);

  bindCardGalleries(list, previewUrls);
  list.querySelector('[data-product-id]')?.classList.add('store-card--active');

  if (panelTitle) panelTitle.textContent = 'Produto da loja';

  const panel = document.querySelector('.viewer-catalog-panel');
  panel?.classList.add('viewer-catalog-panel--single');

  prefetchCardModels([product]);
  selectProduct(product);

  onProductColorsLoaded((colors) => {
    if (activeProduct) activeProduct = { ...activeProduct, colors };
  });
}

export function bindViewerOrderButton() {
  document.querySelector('[data-viewer-order]')?.addEventListener('click', () => {
    if (!activeProduct) return;
    addToCart({
      id: activeProduct.id,
      name: activeProduct.name,
      price: activeProduct.price,
      icon: activeProduct.icon,
      previewImage: activeProduct.previewImage,
      colors: activeProduct.colors,
      size: activeProduct.sizes?.[0],
    });
  });
}
