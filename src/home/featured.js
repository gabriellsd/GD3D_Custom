import { PRODUCTS } from '../data/products.js';
import { formatBRL } from '../utils/format.js';
import { escapeHtml } from '../shop/sizes.js';

function featuredPreview(product) {
  if (product.previewImage) {
    return `<img src="${escapeHtml(product.previewImage)}" alt="" class="home-featured-img" loading="lazy" />`;
  }
  return `<i class="${escapeHtml(product.icon || 'fa-solid fa-cube')} home-featured-icon"></i>`;
}

function buildFeaturedCard(product) {
  const tag = product.tag || product.category || 'Loja';
  return `
    <a href="/visualizador.html?produto=${product.id}" class="home-featured-card lab-card group">
      <div class="home-featured-visual">
        ${featuredPreview(product)}
        <span class="home-featured-3d"><i class="fa-solid fa-cube"></i> 3D</span>
      </div>
      <div class="p-4">
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">${escapeHtml(tag)}</span>
        <h3 class="font-bold text-white text-sm mt-1 line-clamp-2 group-hover:text-brand-400 transition">${escapeHtml(product.name)}</h3>
        <p class="text-brand-500 font-semibold text-sm mt-2">${formatBRL(product.price)}</p>
      </div>
    </a>`;
}

export function renderHomeFeatured() {
  const grid = document.getElementById('home-featured-grid');
  if (!grid) return;

  if (!PRODUCTS.length) {
    grid.innerHTML = `
      <p class="col-span-full text-center text-slate-500 text-sm py-12 rounded-2xl border border-dashed border-slate-800">
        Novos modelos em breve. <a href="/contato.html" class="text-brand-500 hover:underline">Fala connosco</a> para um projeto à medida.
      </p>`;
    return;
  }

  const flagged = PRODUCTS.filter((p) => p.featured);
  const items = (
    flagged.length
      ? [...flagged].sort(
          (a, b) => (a.featuredOrder ?? 999) - (b.featuredOrder ?? 999) || a.id - b.id
        )
      : PRODUCTS
  ).slice(0, 8);

  grid.innerHTML = items.map((p) => buildFeaturedCard(p)).join('');
}
