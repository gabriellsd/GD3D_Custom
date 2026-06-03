import { escapeHtml } from './sizes.js';

function galleryDots(urls, activeIndex) {
  return urls.map((_, i) => (i === activeIndex ? '●' : '○')).join(' ');
}

/** Uma só imagem — fallback quando o preview 3D falha. */
export function buildCardPreviewFallbackHtml(product) {
  const src = product.previewImage || product.previewImages?.[0];
  if (!src) return null;
  return `<img src="${src}" alt="${escapeHtml(product.name)}" class="store-card-photo" loading="lazy" draggable="false" />`;
}

export function buildCardPreviewImagesHtml(product) {
  const urls = product.previewImages?.length
    ? product.previewImages
    : product.previewImage
      ? [product.previewImage]
      : [];

  if (!urls.length) return null;

  const alt = escapeHtml(product.name);

  if (urls.length === 1) {
    return `<img src="${urls[0]}" alt="${alt}" class="store-card-photo" loading="lazy" />`;
  }

  return `
    <div class="store-card-gallery" data-card-gallery>
      <button type="button" class="store-card-gallery-nav store-card-gallery-nav--prev" data-gallery-prev aria-label="Foto anterior">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      <img src="${urls[0]}" alt="${alt}" class="store-card-photo" data-gallery-img loading="lazy" draggable="false" />
      <button type="button" class="store-card-gallery-nav store-card-gallery-nav--next" data-gallery-next aria-label="Próxima foto">
        <i class="fa-solid fa-chevron-right"></i>
      </button>
      <p class="store-card-gallery-dots" data-gallery-dots>${galleryDots(urls, 0)}</p>
    </div>`;
}

export function bindCardGalleries(container, urlsByProductId) {
  container.querySelectorAll('[data-card-gallery]').forEach((gallery) => {
    const card = gallery.closest('[data-product-id]');
    const productId = Number(card?.dataset.productId);
    const urls = urlsByProductId?.get(productId);
    if (!urls || urls.length < 2) return;

    const img = gallery.querySelector('[data-gallery-img]');
    const dots = gallery.querySelector('[data-gallery-dots]');
    let index = 0;
    let dragged = false;

    const setIndex = (next) => {
      index = (next + urls.length) % urls.length;
      img.src = urls[index];
      if (dots) dots.textContent = galleryDots(urls, index);
    };

    gallery.querySelector('[data-gallery-prev]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setIndex(index - 1);
    });

    gallery.querySelector('[data-gallery-next]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setIndex(index + 1);
    });

    let dragging = false;
    let startX = 0;
    let startIndex = 0;

    gallery.addEventListener('pointerdown', (e) => {
      if (e.target.closest('[data-gallery-prev], [data-gallery-next]')) return;
      dragging = true;
      dragged = false;
      startX = e.clientX;
      startIndex = index;
      gallery.setPointerCapture(e.pointerId);
    });

    gallery.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      if (Math.abs(e.clientX - startX) > 8) dragged = true;
      const step = Math.round((e.clientX - startX) / 48);
      const next = (startIndex - step + urls.length * 20) % urls.length;
      if (next !== index) setIndex(next);
    });

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      gallery.releasePointerCapture(e.pointerId);
    };

    gallery.addEventListener('pointerup', endDrag);
    gallery.addEventListener('pointercancel', endDrag);

    const preview = gallery.closest('.store-card-preview, [data-select-product]');
    preview?.addEventListener(
      'click',
      (e) => {
        if (dragged) {
          e.preventDefault();
          e.stopPropagation();
          dragged = false;
        }
      },
      true
    );
  });
}

export function mountModalGallery(container, product) {
  if (!container || !product) return;

  const urls = product.previewImages?.length
    ? product.previewImages
    : product.previewImage
      ? [product.previewImage]
      : [];

  if (!urls.length) {
    container.innerHTML = `<i class="${product.icon}"></i>`;
    container.style.color = '';
    return;
  }

  container.style.color = '';
  const alt = escapeHtml(product.name);

  if (urls.length === 1) {
    container.innerHTML = `<img src="${urls[0]}" alt="${alt}" class="max-h-full max-w-full object-contain" />`;
    return;
  }

  container.innerHTML = `
    <div class="store-card-gallery store-card-gallery--modal" data-card-gallery>
      <button type="button" class="store-card-gallery-nav store-card-gallery-nav--prev" data-gallery-prev aria-label="Foto anterior">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      <img src="${urls[0]}" alt="${alt}" class="max-h-full max-w-full object-contain" data-gallery-img draggable="false" />
      <button type="button" class="store-card-gallery-nav store-card-gallery-nav--next" data-gallery-next aria-label="Próxima foto">
        <i class="fa-solid fa-chevron-right"></i>
      </button>
      <p class="store-card-gallery-dots" data-gallery-dots>${galleryDots(urls, 0)}</p>
    </div>`;

  const map = new Map([[product.id, urls]]);
  bindCardGalleries(container, map);
}
