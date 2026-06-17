import { PRODUCTS } from '../data/products.js';
import { escapeHtml } from '../shop/sizes.js';
import { formatBRL } from '../utils/format.js';

const MAX_RESULTS = 6;

function normalizeQuery(query) {
  return query.trim().toLowerCase();
}

export function searchProducts(query) {
  const q = normalizeQuery(query);
  if (!q) return [];

  return PRODUCTS.filter((p) => {
    const haystack = [p.name, p.desc, p.category, p.subcategory, p.tag, ...(p.sizes || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

function productHref(product) {
  if (product.modelGlbUrl || product.model3mfUrl || product.modelUrl) {
    return `/visualizador.html?produto=${product.id}`;
  }
  return `/produtos.html?q=${encodeURIComponent(product.name)}`;
}

function resultThumb(product) {
  if (product.previewImage) {
    return `<img src="${escapeHtml(product.previewImage)}" alt="" class="site-search-result-thumb" loading="lazy" />`;
  }
  return `<span class="site-search-result-icon"><i class="${product.icon || 'fa-solid fa-cube'}"></i></span>`;
}

function renderResults(list, query) {
  if (!query.trim()) {
    return '<p class="site-search-hint">Escreva para pesquisar produtos</p>';
  }
  if (!list.length) {
    return '<p class="site-search-empty">Nenhum produto encontrado</p>';
  }

  return `<ul class="site-search-list">
    ${list
      .slice(0, MAX_RESULTS)
      .map(
        (p) => `
      <li>
        <a href="${productHref(p)}" class="site-search-result" data-search-result>
          ${resultThumb(p)}
          <span class="site-search-result-text">
            <span class="site-search-result-name">${escapeHtml(p.name)}</span>
            <span class="site-search-result-meta">${escapeHtml(p.tag || p.category)} · ${formatBRL(p.price)}</span>
          </span>
        </a>
      </li>`
      )
      .join('')}
  </ul>
  ${
    list.length > MAX_RESULTS
      ? `<a href="/produtos.html?q=${encodeURIComponent(query.trim())}" class="site-search-more" data-search-result>Ver todos (${list.length})</a>`
      : ''
  }`;
}

function setPopoverOpen(root, open) {
  const popover = root.querySelector('[data-search-popover]');
  const input = root.querySelector('[data-search-input]');
  if (!popover || !input) return;

  if (open) {
    popover.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
  } else {
    popover.classList.add('hidden');
    input.setAttribute('aria-expanded', 'false');
  }
}

function updateResults(root, query) {
  const host = root.querySelector('[data-search-results]');
  if (!host) return;
  host.innerHTML = renderResults(searchProducts(query), query);
}

function submitSearch(root) {
  const input = root.querySelector('[data-search-input]');
  if (!input) return;

  const q = input.value.trim();
  const results = searchProducts(q);

  if (results.length === 1) {
    window.location.href = productHref(results[0]);
    return;
  }

  window.location.href = q ? `/produtos.html?q=${encodeURIComponent(q)}` : '/produtos.html';
}

export function bindSiteSearch() {
  const root = document.querySelector('[data-site-search]');
  if (!root) return;

  const input = root.querySelector('[data-search-input]');
  const submit = root.querySelector('[data-search-submit]');

  input?.addEventListener('focus', () => {
    setPopoverOpen(root, true);
    updateResults(root, input.value);
  });

  input?.addEventListener('input', () => {
    setPopoverOpen(root, true);
    updateResults(root, input.value);
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setPopoverOpen(root, false);
      input.blur();
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submitSearch(root);
  });

  submit?.addEventListener('click', (e) => {
    e.preventDefault();
    submitSearch(root);
  });

  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) setPopoverOpen(root, false);
  });

  updateResults(root, '');
}

export function getSearchQueryFromUrl() {
  return new URLSearchParams(window.location.search).get('q')?.trim() || '';
}
