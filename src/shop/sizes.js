export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildSizeOptionsHtml(sizes, { prefix = '' } = {}) {
  if (!sizes?.length) return '';

  const buttons = sizes
    .map(
      (size, index) =>
        `<button type="button" class="store-card-size-btn${index === 0 ? ' is-active' : ''}" data-size-option="${escapeHtml(size)}">${escapeHtml(size)}</button>`
    )
    .join('');

  return `
    <div class="store-card-sizes${prefix ? ` ${prefix}` : ''}">
      <span class="store-card-sizes-label">Tamanho</span>
      <div class="store-card-size-options" role="group" aria-label="Tamanho">${buttons}</div>
    </div>`;
}

export function getSelectedSize(container) {
  if (!container) return null;
  return container.querySelector('[data-size-option].is-active')?.dataset.sizeOption ?? null;
}

export function bindSizeOptions(container) {
  container.querySelectorAll('[data-size-option]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const scope = btn.closest('[data-product-id]') || btn.closest('#product-modal');
      scope?.querySelectorAll('[data-size-option]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
  });
}
