import { formatBRL } from '../utils/format.js';
import { buildCardPreviewFallbackHtml, buildCardPreviewImagesHtml } from './gallery.js';
import { buildCard3dPreviewHtml, productSupportsCard3d } from './card-preview-3d.js';
import { buildSizeOptionsHtml } from './sizes.js';

const ICON_COLOR = '#e8a317';

export function buildStoreCardHtml(product, options = {}) {
  const { showCta = true, selectMode = false, staticPreview = false } = options;
  const shortDesc = product.desc.length > 90 ? `${product.desc.slice(0, 90)}…` : product.desc;
  const previewAttrs = selectMode ? `data-select-product="${product.id}"` : '';
  const cardClass = selectMode
    ? 'store-card store-card--selectable'
    : 'store-card group cursor-pointer';
  const ctaHtml = showCta
    ? `<div class="store-card-actions">
        <button type="button" data-add-cart="${product.id}" class="store-card-cta">Encomendar agora</button>
      </div>`
    : '';

  const previewHtml = staticPreview
    ? buildCardPreviewFallbackHtml(product) || buildCardPreviewImagesHtml(product)
    : productSupportsCard3d(product)
      ? buildCard3dPreviewHtml(product)
      : buildCardPreviewImagesHtml(product);
  const previewInner =
    previewHtml ??
    `<div class="product-icon-container text-6xl sm:text-7xl transition duration-300 group-hover:scale-105" style="color:${ICON_COLOR}">
          <i class="${product.icon}"></i>
        </div>`;

  return `
    <article class="${cardClass}" data-product-id="${product.id}">
      <div class="store-card-preview" ${previewAttrs}>
        ${previewInner}
      </div>
      <div class="store-card-body">
        <div class="store-card-info">
          <h3 class="store-card-title">${product.name}</h3>
          <p class="store-card-desc">${shortDesc}</p>
          ${buildSizeOptionsHtml(product.sizes)}
        </div>
        <div class="store-card-footer">
          <p class="store-card-price">${formatBRL(product.price)}</p>
          ${ctaHtml}
        </div>
      </div>
    </article>`;
}
