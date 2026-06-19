import { initShell } from '../layout/shell.js';
import { requireRole } from '../auth/client.js';
import { getSupabase } from '../auth/supabase.js';
import {
  fetchCloudProducts,
  nomeToSlug,
  productToRow,
  storageObjectPath,
} from '../data/products-cloud.js';
import { initProductCatalog } from '../data/products.js';
import { CATALOG_PRODUCTS } from '../data/products.catalog.js';
import {
  PRODUCT_FORM,
  atualizarDatalistsCategorias,
  descricaoPlaceholder,
  initAnexarImagens,
  mergeCatalogProducts,
  parseSizes,
  uploadImagensLoja,
} from '../shared/product-form.js';
import { formatBRL } from '../utils/format.js';

const listEl = document.getElementById('admin-product-list');
const form = document.getElementById('admin-product-form');
const emptyEl = document.getElementById('admin-empty');
const editorEl = document.getElementById('admin-editor');
const toastEl = document.getElementById('admin-toast');
const filesList = document.getElementById('admin-files-list');
const deleteBtn = document.getElementById('admin-delete-product');
const searchInput = document.getElementById('admin-search');
const saveBtn = document.getElementById('admin-save-btn');

let products = [];
let selectedId = null;
let searchQuery = '';
let toastTimer = null;
let catalogProducts = [...CATALOG_PRODUCTS];
let imagensAnexadas = null;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(message, isError = false) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.className = `admin-toast ${isError ? 'admin-toast--err' : 'admin-toast--ok'}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('is-hidden'), 4000);
}

function imagensOffsetBase(product) {
  return product?.previewImages?.length || (product?.previewImage ? 1 : 0);
}

imagensAnexadas = initAnexarImagens({
  listaEl: document.getElementById('admin-imagens-lista'),
  inputEl: document.getElementById('admin-imagens-input'),
  setStatus: (msg, isError) => showToast(msg, isError),
});

function setSaving(saving) {
  form?.classList.toggle('admin-saving', saving);
  if (saveBtn) {
    saveBtn.disabled = saving;
    saveBtn.querySelector('span').textContent = saving ? 'A guardar…' : 'Guardar na cloud';
  }
}

function updateStats() {
  const published = products.filter((p) => p.published !== false).length;
  const featured = products.filter((p) => p.featured).length;
  const totalEl = document.querySelector('[data-stat="total"]');
  const publishedEl = document.querySelector('[data-stat="published"]');
  const featuredEl = document.querySelector('[data-stat="featured"]');
  const draftEl = document.querySelector('[data-stat="draft"]');
  if (totalEl) totalEl.textContent = String(products.length);
  if (publishedEl) publishedEl.textContent = String(published);
  if (featuredEl) featuredEl.textContent = String(featured);
  if (draftEl) draftEl.textContent = String(products.length - published);
}

function updateDatalists() {
  catalogProducts = mergeCatalogProducts(products);
  atualizarDatalistsCategorias({
    catalogProducts,
    catList: document.getElementById('admin-categories'),
    subList: document.getElementById('admin-subcategories'),
    categoryValue: form?.category?.value,
  });
}

function filteredProducts() {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return products;
  return products.filter(
    (p) =>
      p.name?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.subcategory?.toLowerCase().includes(q) ||
      String(p.id).includes(q)
  );
}

async function loadProducts() {
  const supabase = getSupabase();
  products = await fetchCloudProducts(supabase, { admin: true });
  updateStats();
  updateDatalists();
  renderList();
}

function renderList() {
  if (!listEl) return;
  const items = filteredProducts();

  if (!items.length) {
    listEl.innerHTML = `<li class="text-slate-500 text-xs py-4 text-center">${products.length ? 'Nenhum resultado.' : 'Catálogo vazio — crie o primeiro produto.'}</li>`;
    return;
  }

  listEl.innerHTML = items
    .map((p) => {
      const thumb = p.previewImage
        ? `<img src="${escapeHtml(p.previewImage)}" alt="" class="admin-product-thumb" loading="lazy" />`
        : `<div class="admin-product-thumb admin-product-thumb--empty"><i class="fa-solid fa-cube"></i></div>`;
      const badges = [
        p.published === false ? '<span class="admin-badge admin-badge--draft">Rascunho</span>' : '<span class="admin-badge admin-badge--live">Online</span>',
        p.featured ? '<span class="admin-badge admin-badge--featured"><i class="fa-solid fa-star text-[8px]"></i></span>' : '',
      ].join('');
      return `
      <li>
        <button type="button" data-pick="${p.id}" class="admin-product-item ${selectedId === p.id ? 'is-active' : ''}">
          ${thumb}
          <span class="min-w-0 flex-1">
            <span class="block font-semibold text-sm text-white truncate">${escapeHtml(p.name)}</span>
            <span class="block text-xs text-brand-500 font-semibold mt-0.5">${formatBRL(p.price)}</span>
            <span class="flex flex-wrap gap-1 mt-1">${badges}</span>
          </span>
        </button>
      </li>`;
    })
    .join('');

  listEl.querySelectorAll('[data-pick]').forEach((btn) => {
    btn.addEventListener('click', () => selectProduct(Number(btn.dataset.pick)));
  });
}

function renderQuickLinks(product) {
  const wrap = document.getElementById('admin-quick-links');
  if (!wrap) return;
  const links = [
    { href: `/visualizador.html?produto=${product.id}`, icon: 'fa-cube', label: 'Ver 3D' },
    { href: `/produtos.html`, icon: 'fa-store', label: 'Loja' },
  ];
  wrap.innerHTML = links
    .map(
      (l) =>
        `<a href="${l.href}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:border-brand-500 hover:text-brand-400 transition"><i class="fa-solid ${l.icon}"></i>${l.label}</a>`
    )
    .join('');
}

function labelImagemUrl(url, index) {
  try {
    const nome = decodeURIComponent(url.split('/').pop() || '');
    if (/^view-\d+/i.test(nome)) return nome;
  } catch {
    /* ignore */
  }
  return index === 0 ? 'view-0.png (capa)' : `view-${index}.png`;
}

function renderFilesList(product) {
  if (!filesList) return;
  const files = [
    ...(product.previewImages?.length
      ? product.previewImages.map((u, i) => ({
          label: labelImagemUrl(u, i),
          url: u,
          icon: 'fa-image',
        }))
      : product.previewImage
        ? [{ label: 'view-0.png (capa)', url: product.previewImage, icon: 'fa-image' }]
        : []),
    { label: 'Modelo STL', url: product.modelUrl, icon: 'fa-cube' },
    { label: 'Modelo 3MF', url: product.model3mfUrl, icon: 'fa-layer-group' },
  ].filter((f) => f.url);

  if (!files.length) {
    filesList.innerHTML = '<p class="text-xs text-slate-500">Ainda sem ficheiros. Use as zonas acima para enviar.</p>';
    return;
  }

  filesList.innerHTML = files
    .map(
      (f) => `
    <div class="admin-file-card">
      <i class="fa-solid ${f.icon} text-brand-500 w-5 text-center"></i>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-white">${escapeHtml(f.label)}</p>
        <p class="text-[10px] text-slate-500 truncate">${escapeHtml(f.url)}</p>
      </div>
      <a href="${escapeHtml(f.url)}" target="_blank" rel="noopener" class="text-xs font-semibold text-brand-400 hover:text-brand-300 shrink-0">Abrir</a>
    </div>`
    )
    .join('');
}

function updateHero(product) {
  const img = document.getElementById('admin-hero-img');
  const ph = document.getElementById('admin-hero-placeholder');
  const title = document.getElementById('admin-editor-title');
  const meta = document.getElementById('admin-editor-meta');

  if (title) title.textContent = product.name;
  if (meta) {
    const parts = [`#${product.id}`, product.category];
    if (product.subcategory) parts.push(product.subcategory);
    meta.textContent = parts.join(' · ');
  }

  if (product.previewImage && img) {
    img.src = product.previewImage;
    img.classList.remove('hidden');
    ph?.classList.add('hidden');
  } else {
    img?.classList.add('hidden');
    ph?.classList.remove('hidden');
  }

  renderQuickLinks(product);
  renderFilesList(product);
}

function selectProduct(id) {
  selectedId = id;
  const product = products.find((p) => p.id === id);
  if (!product) return;

  emptyEl?.classList.add('hidden');
  editorEl?.classList.remove('hidden');
  deleteBtn?.classList.remove('hidden');

  form.id.value = product.id;
  form.name.value = product.name;
  form.price.value = product.price ?? '';
  form.sizes.value = (product.sizes || []).join(', ');
  form.category.value = product.category || '';
  form.subcategory.value = product.subcategory || '';
  form.slug.value = product.slug || nomeToSlug(product.name);
  form.slug.dataset.auto = '0';
  form.tag.value = product.tag || '';
  form.icon.value = product.icon || '';
  form.desc.value = product.desc || '';
  form.featured.checked = Boolean(product.featured);
  form.published.checked = product.published !== false;
  form.featuredOrder.value = product.featuredOrder ?? 0;

  document.querySelectorAll('.admin-drop').forEach((d) => d.classList.remove('has-file'));
  form.fileStl.value = '';
  form.file3mf.value = '';
  imagensAnexadas.limpar();
  imagensAnexadas.setOffsetBase(imagensOffsetBase(product));

  updateHero(product);
  renderList();
}

function newProduct() {
  const nextId = products.reduce((max, p) => Math.max(max, p.id), 0) + 1;
  selectedId = nextId;
  emptyEl?.classList.add('hidden');
  editorEl?.classList.remove('hidden');
  deleteBtn?.classList.add('hidden');

  form.reset();
  form.id.value = String(nextId);
  form.category.value = 'Miniaturas';
  form.published.checked = true;
  form.slug.value = '';
  form.slug.dataset.auto = '1';

  document.getElementById('admin-editor-title').textContent = 'Novo produto';
  document.getElementById('admin-editor-meta').textContent = `ID ${nextId}`;
  document.getElementById('admin-quick-links').innerHTML = '';
  document.getElementById('admin-hero-img')?.classList.add('hidden');
  document.getElementById('admin-hero-placeholder')?.classList.remove('hidden');
  if (filesList) filesList.innerHTML = '';
  imagensAnexadas.limpar();
  imagensAnexadas.setOffsetBase(0);

  renderList();
  switchTab('geral');
}

function switchTab(tabId) {
  document.querySelectorAll('.admin-tab').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.tab === tabId);
  });
  document.querySelectorAll('.admin-tab-panel').forEach((p) => {
    p.classList.toggle('is-active', p.dataset.panel === tabId);
  });
}

async function uploadAsset(file, productRow) {
  if (!file?.size) return null;

  const supabase = getSupabase();
  const storagePath = storageObjectPath(
    { category: productRow.category, subcategory: productRow.subcategory, slug: productRow.slug },
    file.name
  );

  const { error } = await supabase.storage.from('product-assets').upload(storagePath, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  const { data } = supabase.storage.from('product-assets').getPublicUrl(storagePath);
  return data.publicUrl;
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const supabase = getSupabase();
  setSaving(true);

  const draft = {
    id: Number(form.id.value),
    name: form.name.value.trim(),
    price: Number(form.price.value) || 0,
    sizes: parseSizes(form.sizes.value),
    category: form.category.value.trim(),
    subcategory: form.subcategory.value.trim() || undefined,
    slug: form.slug.value.trim() || nomeToSlug(form.name.value),
    tag: form.tag.value.trim() || undefined,
    icon: form.icon.value.trim() || undefined,
    desc: form.desc.value.trim(),
    featured: form.featured.checked,
    published: form.published.checked,
    featuredOrder: Number(form.featuredOrder.value) || 0,
  };

  const existing = products.find((p) => p.id === draft.id);
  const row = productToRow({ ...existing, ...draft });

  try {
    const novasImagens = imagensAnexadas.getFiles();
    const startIndex = imagensOffsetBase(existing);
    const previewUrls = novasImagens.length
      ? await uploadImagensLoja(supabase, row, novasImagens, startIndex)
      : [];

    const stlUrl = await uploadAsset(form.fileStl.files[0], row);
    const mf3Url = await uploadAsset(form.file3mf.files[0], row);

    if (previewUrls.length) {
      row.preview_image = existing?.previewImage || previewUrls[0];
      row.preview_images = [...new Set([...(existing?.previewImages || []), ...previewUrls])];
      if (!row.preview_image) row.preview_image = previewUrls[0];
    }
    if (stlUrl) row.model_url = stlUrl;
    if (mf3Url) row.model3mf_url = mf3Url;

    const { error } = await supabase.from('products').upsert(row, { onConflict: 'id' });
    if (error) throw error;

    showToast('Produto guardado na cloud.');
    await loadProducts();
    await initProductCatalog({ force: true });
    selectProduct(draft.id);
  } catch (err) {
    showToast(err.message || 'Erro ao guardar.', true);
  } finally {
    setSaving(false);
  }
});

deleteBtn?.addEventListener('click', async () => {
  if (!selectedId || !confirm('Apagar este produto da cloud?')) return;

  const supabase = getSupabase();
  const { error } = await supabase.from('products').delete().eq('id', selectedId);
  if (error) {
    showToast(error.message, true);
    return;
  }

  showToast('Produto apagado.');
  selectedId = null;
  editorEl?.classList.add('hidden');
  emptyEl?.classList.remove('hidden');
  deleteBtn?.classList.add('hidden');
  await loadProducts();
  await initProductCatalog({ force: true });
});

document.getElementById('admin-new-product')?.addEventListener('click', newProduct);
document.getElementById('admin-empty-new')?.addEventListener('click', newProduct);

searchInput?.addEventListener('input', () => {
  searchQuery = searchInput.value;
  renderList();
});

document.querySelectorAll('.admin-tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

form?.name?.addEventListener('input', () => {
  if (!form.slug.value || form.slug.dataset.auto === '1') {
    form.slug.value = nomeToSlug(form.name.value);
    form.slug.dataset.auto = '1';
  }
  const title = document.getElementById('admin-editor-title');
  if (title && selectedId) title.textContent = form.name.value || 'Novo produto';
});

form?.slug?.addEventListener('input', () => {
  form.slug.dataset.auto = '0';
});

form?.category?.addEventListener('input', updateDatalists);

document.querySelectorAll('.admin-drop input[type="file"]').forEach((input) => {
  input.addEventListener('change', () => {
    const drop = input.closest('.admin-drop');
    drop?.classList.toggle('has-file', input.files?.length > 0);
  });
});

document.querySelectorAll('.admin-drop').forEach((drop) => {
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('has-file');
  });
  drop.addEventListener('dragleave', () => {
    const input = drop.querySelector('input[type="file"]');
    if (!input?.files?.length) drop.classList.remove('has-file');
  });
});

initShell({ page: 'admin', title: 'Admin — GD3D Creative' }).then(async () => {
  const user = await requireRole('admin');
  if (!user) return;

  const imagensHint = document.getElementById('admin-imagens-hint');
  if (imagensHint) {
    imagensHint.innerHTML = PRODUCT_FORM.imagesHint
      .replace('view-0.png', '<strong>view-0.png</strong>')
      .replace('view-1.png', '<strong>view-1.png</strong>')
      .replace('view-2.png', '<strong>view-2.png</strong>');
  }
  if (form?.desc) form.desc.placeholder = descricaoPlaceholder();

  try {
    await loadProducts();
    if (products.length === 1) selectProduct(products[0].id);
  } catch (err) {
    showToast(
      err.message?.includes('relation') || err.message?.includes('products')
        ? 'Tabela products não encontrada. Corra supabase/catalog.sql.'
        : err.message || 'Erro ao carregar.',
      true
    );
  }
});
