const FILTER_ACTIVE =
  'filter-btn shrink-0 px-4 py-2 rounded-full text-sm font-medium transition bg-[#2a2a2a] text-white';
const FILTER_IDLE =
  'filter-btn shrink-0 px-4 py-2 rounded-full text-sm font-medium transition text-slate-500 hover:text-slate-300';

const CATEGORY_LABELS = {
  Miniaturas: 'Miniaturas',
  geek: 'Geek & Pop',
  decor: 'Decoração',
  util: 'Utilitários',
};

function categoryLabel(category) {
  return CATEGORY_LABELS[category] ?? category;
}

function subcategoryLabel(subcategory) {
  const text = subcategory.replace(/[-_]+/g, ' ').trim();
  if (!text) return subcategory;
  return text.charAt(0).toLocaleUpperCase('pt-PT') + text.slice(1);
}

export function getFilterKey(category, subcategory = null) {
  if (!category || category === 'all') return 'all';
  if (subcategory) return `${category}/${subcategory}`;
  return category;
}

export function parseFilterKey(key) {
  if (!key || key === 'all') return { category: null, subcategory: null };
  const slash = key.indexOf('/');
  if (slash === -1) return { category: key, subcategory: null };
  return {
    category: key.slice(0, slash),
    subcategory: key.slice(slash + 1) || null,
  };
}

export function buildCatalogFilters(products) {
  const categories = [];
  const subcategoriesByCategory = new Map();

  for (const product of products) {
    if (!categories.includes(product.category)) categories.push(product.category);
    if (!product.subcategory) continue;
    if (!subcategoriesByCategory.has(product.category)) {
      subcategoriesByCategory.set(product.category, new Set());
    }
    subcategoriesByCategory.get(product.category).add(product.subcategory);
  }

  categories.sort((a, b) => a.localeCompare(b));
  for (const subs of subcategoriesByCategory.values()) {
    [...subs].sort((a, b) => a.localeCompare(b, 'pt'));
  }

  return { categories, subcategoriesByCategory, categoryLabels: CATEGORY_LABELS };
}

export function countProductsForFilter(products, key) {
  if (key === 'all') return products.length;
  const { category, subcategory } = parseFilterKey(key);
  return products.filter(
    (p) => p.category === category && (subcategory ? p.subcategory === subcategory : true)
  ).length;
}

export function filterProducts(products, key) {
  if (key === 'all') return products;
  const { category, subcategory } = parseFilterKey(key);
  return products.filter(
    (p) => p.category === category && (subcategory ? p.subcategory === subcategory : true)
  );
}

function makeFilterButton({ key, label, active }) {
  return `<button type="button" class="${active ? FILTER_ACTIVE : FILTER_IDLE}" data-filter-key="${key}">${label}</button>`;
}

function makeMenuLink({ key, label, active }) {
  return `<li>
    <button type="button" class="shop-filter-menu-link${active ? ' is-active' : ''}" data-filter-key="${key}">${label}</button>
  </li>`;
}

function renderSubmenuPanel(category, subs, activeKey) {
  const sorted = [...subs].sort((a, b) => a.localeCompare(b, 'pt'));
  const items = [
    makeMenuLink({
      key: category,
      label: 'Tudo na categoria',
      active: activeKey === category,
    }),
    ...sorted.map((subcategory) =>
      makeMenuLink({
        key: getFilterKey(category, subcategory),
        label: subcategoryLabel(subcategory),
        active: activeKey === getFilterKey(category, subcategory),
      })
    ),
  ].join('');

  return `<ul class="shop-filter-menu-list" role="menu" aria-label="Subcategorias de ${categoryLabel(category)}">${items}</ul>`;
}

function renderSubmenuRow(products, activeKey, subcategoriesByCategory) {
  const submenu = document.getElementById('shop-filters-submenu');
  if (!submenu) return;

  const { category: activeCategory } = parseFilterKey(activeKey);
  const subs = activeCategory ? subcategoriesByCategory.get(activeCategory) : null;

  if (!activeCategory || !subs?.size) {
    submenu.innerHTML = '';
    submenu.classList.add('hidden');
    submenu.hidden = true;
    return;
  }

  submenu.innerHTML = renderSubmenuPanel(activeCategory, subs, activeKey);
  submenu.classList.remove('hidden');
  submenu.hidden = false;
}

export function renderShopFilters(products, activeKey = 'all') {
  const main = document.getElementById('shop-filters-main');
  if (!main) return;

  const { categories, subcategoriesByCategory } = buildCatalogFilters(products);
  const { category: activeCategory, subcategory: activeSub } = parseFilterKey(activeKey);

  const parts = [
    makeFilterButton({ key: 'all', label: 'Todos', active: activeKey === 'all' }),
  ];

  for (const cat of categories.filter((c) => countProductsForFilter(products, c) > 0)) {
    const subs = subcategoriesByCategory.get(cat);
    const hasSubs = subs?.size > 0;
    const catActive = activeCategory === cat;
    const categoryBtnActive = activeKey === cat || (catActive && !activeSub);

    if (!hasSubs) {
      parts.push(makeFilterButton({ key: cat, label: categoryLabel(cat), active: categoryBtnActive }));
      continue;
    }

    parts.push(`
      <div class="shop-filter-group shop-filter-group--has-menu${catActive ? ' shop-filter-group--open' : ''}">
        ${makeFilterButton({ key: cat, label: categoryLabel(cat), active: categoryBtnActive })}
      </div>`);
  }

  main.innerHTML = parts.join('');
  renderSubmenuRow(products, activeKey, subcategoriesByCategory);
}

export function bindShopFilters(container, products, onFilter) {
  const handler = (e) => {
    const btn = e.target.closest('[data-filter-key]');
    if (!btn) return;
    onFilter(btn.dataset.filterKey);
  };

  const wrap = container.querySelector('#shop-filters-wrap');
  wrap?.addEventListener('click', handler);
}
