import { renderHeader } from './header.js';
import { renderFooter } from './footer.js';
import { renderOverlays } from './overlays.js';
import { bindSiteSearch } from './search.js';
import { bindCartUI } from '../cart/cart.js';
import { bindAuthUI } from '../auth/client.js';
import { initProductCatalog } from '../data/products.js';

/** Inicializa chrome do site (header, footer, carrinho, modal). */
export async function initShell({ page, title }) {
  document.title = title;
  document.body.classList.add('site-bg');

  const hideHeader = page === 'viewer-advanced';
  const hideChromeActions = hideHeader;
  const chrome = document.getElementById('site-chrome');
  if (chrome) {
    chrome.innerHTML = (hideHeader ? '' : renderHeader(page, { hideChromeActions })) + renderOverlays();
  }

  const footerSlot = document.getElementById('site-footer');
  if (footerSlot) {
    footerSlot.innerHTML = renderFooter();
  }

  await initProductCatalog();
  bindCartUI();
  bindAuthUI();
  bindSiteSearch();
  bindNavPrefetch();
  syncHeaderOffset();
  requestAnimationFrame(syncHeaderOffset);
  window.addEventListener('resize', syncHeaderOffset);
  window.addEventListener('load', syncHeaderOffset);
}

function syncHeaderOffset() {
  const header = document.getElementById('site-header');
  const height = header?.offsetHeight ?? 0;
  document.documentElement.style.setProperty('--header-offset', `${height}px`);
}

/** Pré-carrega a próxima página ao passar o rato no menu (menos flash ao clicar). */
function bindNavPrefetch() {
  document.querySelectorAll('header a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('#')) return;

    anchor.addEventListener('mouseenter', () => {
      if (document.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      document.head.appendChild(link);
    }, { once: true });
  });
}
