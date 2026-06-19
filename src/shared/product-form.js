import { CATALOG_PRODUCTS } from '../data/products.catalog.js';
import { previewImageFileName, uploadProductAsset } from '../data/products-cloud.js';

export const PRODUCT_FORM = {
  labels: {
    name: 'Nome do produto',
    category: 'Categoria',
    subcategory: 'Subcategoria',
    slug: 'Slug (pasta no storage)',
    slugHint: 'Gerado automaticamente a partir do nome.',
    price: 'Preço (R$)',
    sizes: 'Tamanhos (separados por vírgula)',
    desc: 'Descrição',
    images: 'Imagens da loja',
    published: 'Publicado na loja',
    featured: 'Destaque na home',
  },
  placeholders: {
    name: 'Ex.: Coruja decorativa 6 cm',
    category: 'Miniaturas',
    subcategory: 'Animais',
    sizes: '6 cm, 15 cm',
    price: '49.90',
  },
  imagesHint:
    'Padrão: view-0.png (capa), view-1.png, view-2.png… Ao anexar, os ficheiros são renomeados automaticamente nessa ordem.',
  maxImages: 12,
};

export function escapeHtml(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function parseSizes(raw) {
  return String(raw || '')
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function descricaoPlaceholder() {
  return (
    CATALOG_PRODUCTS.find((p) => p.desc)?.desc ||
    'Adicione um toque especial à sua decoração com esta peça produzida em impressão 3D de alta qualidade.'
  );
}

export function mergeCatalogProducts(cloud, staticProducts = CATALOG_PRODUCTS) {
  const porId = new Map(staticProducts.map((p) => [p.id, p]));
  for (const p of cloud) porId.set(p.id, p);
  return porId.size ? [...porId.values()] : [...staticProducts];
}

export function subcategoriasDaCategoria(categoria, catalogProducts) {
  const cat = String(categoria || '').trim();
  const fonte = cat
    ? catalogProducts.filter((p) => p.category === cat)
    : catalogProducts;
  return [...new Set(fonte.map((p) => p.subcategory).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt')
  );
}

export function atualizarDatalistsCategorias({
  catalogProducts,
  catList,
  subList,
  categoryValue = '',
}) {
  const cats = [...new Set(catalogProducts.map((p) => p.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt')
  );
  if (catList) {
    catList.innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">`).join('');
  }
  if (subList) {
    const subs = subcategoriasDaCategoria(categoryValue, catalogProducts);
    subList.innerHTML = subs.map((s) => `<option value="${escapeHtml(s)}">`).join('');
  }
}

/**
 * UI partilhada: anexar imagens com pré-visualização e nome de destino view-N.png.
 */
export function initAnexarImagens({
  listaEl,
  inputEl,
  incluirCapturaInput = null,
  offsetBase = 0,
  setStatus,
  max = PRODUCT_FORM.maxImages,
}) {
  /** @type {{ id: string, file: File, previewUrl: string }[]} */
  let items = [];

  function limpar() {
    for (const item of items) URL.revokeObjectURL(item.previewUrl);
    items = [];
    if (listaEl) listaEl.innerHTML = '';
    if (inputEl) inputEl.value = '';
  }

  function render() {
    if (!listaEl) return;
    if (!items.length) {
      listaEl.innerHTML = '';
      return;
    }

    const offsetCaptura = incluirCapturaInput?.checked ? 1 : 0;
    const base = offsetBase + offsetCaptura;

    listaEl.innerHTML = items
      .map((item, i) => {
        const nomeDestino = previewImageFileName(base + i);
        return `
          <li class="produto-imagens-item" data-id="${item.id}">
            <img src="${item.previewUrl}" alt="" class="produto-imagens-thumb" />
            <div class="produto-imagens-meta">
              <span class="produto-imagens-nome" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</span>
              <span class="produto-imagens-destino">→ ${escapeHtml(nomeDestino)}</span>
            </div>
            <button type="button" class="produto-imagens-remover" title="Remover" aria-label="Remover imagem">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </li>`;
      })
      .join('');

    listaEl.querySelectorAll('.produto-imagens-remover').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.produto-imagens-item')?.dataset.id;
        const idx = items.findIndex((item) => item.id === id);
        if (idx >= 0) {
          URL.revokeObjectURL(items[idx].previewUrl);
          items.splice(idx, 1);
          render();
        }
      });
    });
  }

  function adicionar(ficheiros) {
    const restantes = max - items.length;
    if (restantes <= 0) {
      setStatus?.(`Máximo de ${max} imagens anexadas.`, true);
      return;
    }

    for (const file of ficheiros.slice(0, restantes)) {
      if (!file.type.startsWith('image/')) continue;
      items.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    render();
  }

  inputEl?.addEventListener('change', (event) => {
    const ficheiros = Array.from(event.target.files || []);
    event.target.value = '';
    if (ficheiros.length) adicionar(ficheiros);
  });

  incluirCapturaInput?.addEventListener('change', render);

  return {
    limpar,
    render,
    adicionar,
    getFiles: () => items.map((item) => item.file),
    setOffsetBase(value) {
      offsetBase = value;
      render();
    },
  };
}

export async function uploadImagensLoja(supabase, row, files, startIndex = 0) {
  const urls = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ficheiro = new File([file], previewImageFileName(startIndex + i), {
      type: file.type || 'image/png',
    });
    const url = await uploadProductAsset(supabase, ficheiro, row);
    if (url) urls.push(url);
  }
  return urls;
}

/** Tabs Geral / Loja / Ficheiros (admin + modal publicar). */
export function initProdutoEditorTabs(root) {
  if (!root) return;

  function switchTab(tabId) {
    root.querySelectorAll('.admin-tab').forEach((t) => {
      t.classList.toggle('is-active', t.dataset.tab === tabId);
    });
    root.querySelectorAll('.admin-tab-panel').forEach((p) => {
      p.classList.toggle('is-active', p.dataset.panel === tabId);
    });
  }

  root.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  return { switchTab };
}
