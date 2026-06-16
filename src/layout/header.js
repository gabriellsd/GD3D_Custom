import { NAV, navLinkClass } from './nav.js';

export function renderSearchBar() {
  return `
    <div class="site-search-wrap" data-site-search>
      <div class="site-search-pill" role="search">
        <label class="site-search-pill-field" for="site-search-input">
          <input
            id="site-search-input"
            type="search"
            data-search-input
            class="site-search-pill-input"
            placeholder="O que está a procurar?"
            autocomplete="off"
            aria-label="Pesquisar produtos"
            aria-expanded="false"
            aria-controls="site-search-popover"
          />
          <button type="button" data-search-submit class="site-search-pill-icon site-search-pill-icon--right" aria-label="Pesquisar">
            <i class="fa-solid fa-magnifying-glass"></i>
          </button>
        </label>
        <div id="site-search-popover" data-search-popover class="site-search-popover hidden" role="listbox" aria-label="Resultados da pesquisa">
          <div data-search-results class="site-search-results"></div>
        </div>
      </div>
    </div>`;
}

export function renderHeaderActions() {
  return `
    <button type="button" data-cart-toggle class="relative p-2.5 text-slate-300 hover:text-brand-500 transition bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50">
      <i class="fa-solid fa-cart-shopping text-lg"></i>
      <span id="cart-count" class="absolute -top-1.5 -right-1.5 bg-brand-500 text-brand-900 text-xs font-bold w-5.5 h-5.5 flex items-center justify-center rounded-full border-2 border-[#080808]">0</span>
    </button>
    <a href="/login.html" data-auth-login class="items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-300 hover:text-white transition hidden">
      <i class="fa-solid fa-user"></i> Entrar
    </a>
    <div data-auth-user class="hidden items-center gap-2">
      <a href="/admin.html" data-auth-admin class="hidden p-2 text-brand-400 hover:text-brand-300 transition" title="Painel admin">
        <i class="fa-solid fa-screwdriver-wrench"></i>
      </a>
      <div class="hidden sm:block text-right leading-tight">
        <p data-auth-name class="text-xs font-semibold text-white max-w-[120px] truncate"></p>
        <p data-auth-role class="text-[10px] text-slate-500"></p>
      </div>
      <button type="button" data-auth-logout class="p-2 text-slate-400 hover:text-white transition" title="Sair">
        <i class="fa-solid fa-right-from-bracket"></i>
      </button>
    </div>`;
}

/** Barra do visualizador técnico: pesquisa + carrinho + sessão (fora do header global). */
export function renderViewerToolbar() {
  return `
    <div class="viewer-toolbar-search">${renderSearchBar()}</div>
    <div class="viewer-toolbar-actions flex items-center gap-2 sm:gap-3 shrink-0">${renderHeaderActions()}</div>`;
}

export function renderViewerInlineHeader() {
  return `
    <div class="flex items-center gap-2 sm:gap-3 shrink-0">
      <a href="/admin.html" class="viewer-toolbar-btn" title="Painel admin">
        <i class="fa-solid fa-arrow-left"></i>
        <span class="hidden sm:inline">Painel</span>
      </a>
      <a href="/" class="viewer-toolbar-btn viewer-toolbar-btn--primary" title="Ir ao site">
        <i class="fa-solid fa-store"></i>
        <span class="hidden sm:inline">Loja</span>
      </a>
    </div>`;
}

export function renderHeader(activePage, { hideChromeActions = false } = {}) {
  const showViewerInline = activePage === 'viewer-advanced';
  const links = NAV.map(({ id, href, label }) => {
    const active = id === activePage;
    return `<a href="${href}" class="${navLinkClass(active)}">${label}</a>`;
  }).join('');

  return `
    <header id="site-header" class="fixed inset-x-0 top-0 z-[60] backdrop-blur-md bg-[#080808]/95 border-b border-brand-900/80">
        <div class="w-full px-4 sm:px-6 lg:px-8">
            <div class="flex items-center justify-between gap-2 sm:gap-3 h-[5rem] sm:h-[5.5rem]">
                <a href="/" class="site-header-logo flex items-center h-full shrink-0 min-w-0 max-w-[48%] sm:max-w-[44%] md:max-w-none" aria-label="GD3D — Início">
                    <img src="/logo/gd3d-header.png" alt="GD3D" class="h-12 sm:h-14 md:h-16 lg:h-[4.75rem] w-auto max-w-[min(100%,300px)] lg:max-w-[360px] object-contain object-left" width="360" height="135" />
                </a>
                <nav class="hidden lg:flex items-center gap-6 shrink-0">${links}</nav>
                ${showViewerInline ? renderViewerInlineHeader() : (hideChromeActions ? '' : renderSearchBar())}
                ${showViewerInline ? '' : (hideChromeActions ? '' : `<div class="flex items-center gap-2 sm:gap-3 shrink-0">${renderHeaderActions()}</div>`)}
            </div>
            <nav class="flex lg:hidden gap-4 overflow-x-auto pb-3 -mt-1 text-sm">${links}</nav>
        </div>
    </header>`;
}
