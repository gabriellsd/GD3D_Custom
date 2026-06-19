/**
 * Publicar modelo carregado como novo produto na loja (Supabase).
 */
import { getSupabase } from '../../auth/supabase.js';
import {
  fetchCloudProducts,
  getNextProductId,
  nomeToSlug,
  previewImageFileName,
  productToRow,
  uploadProductAsset,
} from '../../data/products-cloud.js';
import { initProductCatalog } from '../../data/products.js';
import { CATALOG_PRODUCTS } from '../../data/products.catalog.js';
import {
  PRODUCT_FORM,
  atualizarDatalistsCategorias,
  descricaoPlaceholder,
  initAnexarImagens,
  initProdutoEditorTabs,
  mergeCatalogProducts,
  parseSizes,
  uploadImagensLoja,
} from '../../shared/product-form.js';
import { capturarPngBlob } from './export-media.js';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function nomeBaseArquivo(nome) {
  return String(nome || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function extrairTamanhoDoNome(nome) {
  const texto = String(nome || '');
  const comEspaco = texto.match(/(\d+)\s*cm\b/i);
  if (comEspaco) return `${comEspaco[1]} cm`;
  const junto = texto.match(/(\d+)cm/i);
  if (junto) return `${junto[1]} cm`;
  return '';
}

function extensaoModelo(file) {
  return file?.name?.split('.').pop()?.toLowerCase() || '';
}

function aplicarRotulosFormulario(form) {
  const map = {
    name: PRODUCT_FORM.labels.name,
    price: PRODUCT_FORM.labels.price,
    sizes: PRODUCT_FORM.labels.sizes,
    category: PRODUCT_FORM.labels.category,
    subcategory: PRODUCT_FORM.labels.subcategory,
    slug: PRODUCT_FORM.labels.slug,
    desc: PRODUCT_FORM.labels.desc,
  };
  for (const [name, text] of Object.entries(map)) {
    const field = form.elements[name];
    const label = field?.closest('.produto-form-field')?.querySelector('label');
    if (label) label.textContent = text;
  }
  if (form.elements.name) form.elements.name.placeholder = PRODUCT_FORM.placeholders.name;
  if (form.elements.category) form.elements.category.placeholder = PRODUCT_FORM.placeholders.category;
  if (form.elements.subcategory) form.elements.subcategory.placeholder = PRODUCT_FORM.placeholders.subcategory;
  if (form.elements.sizes) form.elements.sizes.placeholder = PRODUCT_FORM.placeholders.sizes;
  if (form.elements.price) form.elements.price.placeholder = PRODUCT_FORM.placeholders.price;
}

export function initPublicarProduto({
  renderer,
  scene,
  getCamera,
  prepararCaptura,
  isCenarioAtivo,
  getModelFile,
  hasModel,
  setStatus,
}) {
  const form = document.getElementById('form-publicar-produto');
  const secao = document.getElementById('secao-publicar');
  const modal = document.getElementById('modal-publicar');
  const btnAbrir = document.getElementById('btn-abrir-publicar');
  const statusEl = document.getElementById('publicar-status');
  const submitBtn = document.getElementById('btn-publicar-produto');
  const nameInput = document.getElementById('pub-name');
  const slugInput = document.getElementById('pub-slug');
  const catList = document.getElementById('pub-categories');
  const subList = document.getElementById('pub-subcategories');
  const categoryInput = form?.elements.category;
  const descInput = form?.elements.desc;
  const sizesInput = form?.elements.sizes;
  const imagensInput = document.getElementById('pub-imagens-input');
  const imagensLista = document.getElementById('pub-imagens-lista');
  const incluirCapturaInput = document.getElementById('pub-incluir-captura');
  const imagensHint = document.getElementById('pub-imagens-hint');
  const editorTitle = document.getElementById('pub-editor-title');
  const editorMeta = document.getElementById('pub-editor-meta');
  const modeloNomeEl = document.getElementById('pub-modelo-nome');
  const submitLabel = submitBtn?.querySelector('span');
  const editorPanel = modal?.querySelector('.pub-editor-panel');

  if (!form) return null;

  aplicarRotulosFormulario(form);
  initProdutoEditorTabs(editorPanel || modal);
  if (imagensHint) imagensHint.innerHTML = PRODUCT_FORM.imagesHint.replace(
    'view-0.png',
    '<strong>view-0.png</strong>'
  ).replace('view-1.png', '<strong>view-1.png</strong>').replace('view-2.png', '<strong>view-2.png</strong>');

  let slugAuto = true;
  let publishing = false;
  let catalogProducts = [...CATALOG_PRODUCTS];

  const imagensAnexadas = initAnexarImagens({
    listaEl: imagensLista,
    inputEl: imagensInput,
    incluirCapturaInput,
    setStatus,
  });

  async function montarFicheirosPreview(supabase, row) {
    const ficheiros = [];
    let index = 0;

    if (incluirCapturaInput?.checked) {
      prepararCaptura?.();
      const previewBlob = await capturarPngBlob(renderer, scene, getCamera(), {
        cenarioAtivo: isCenarioAtivo?.() ?? false,
      });
      ficheiros.push(
        new File([previewBlob], previewImageFileName(index), { type: 'image/png' })
      );
      index += 1;
    }

    const anexos = imagensAnexadas.getFiles();
    for (const file of anexos) {
      ficheiros.push(
        new File([file], previewImageFileName(index), {
          type: file.type || 'image/png',
        })
      );
      index += 1;
    }

    if (!ficheiros.length) {
      prepararCaptura?.();
      const previewBlob = await capturarPngBlob(renderer, scene, getCamera(), {
        cenarioAtivo: isCenarioAtivo?.() ?? false,
      });
      ficheiros.push(
        new File([previewBlob], previewImageFileName(0), { type: 'image/png' })
      );
    }

    return uploadImagensLoja(supabase, row, ficheiros, 0);
  }

  function renderSubcategoriaSugestoes() {
    atualizarDatalistsCategorias({
      catalogProducts,
      catList,
      subList,
      categoryValue: categoryInput?.value,
    });
  }

  async function carregarDatalists() {
    let cloud = [];
    try {
      const supabase = getSupabase();
      if (supabase) cloud = await fetchCloudProducts(supabase, { admin: true });
    } catch {
      /* cloud opcional */
    }

    try {
      await initProductCatalog();
    } catch {
      /* catálogo local */
    }

    catalogProducts = mergeCatalogProducts(cloud);
    renderSubcategoriaSugestoes();
  }

  function atualizarCabecalho({ titulo, meta, ficheiro } = {}) {
    if (titulo && editorTitle) editorTitle.textContent = titulo;
    if (meta && editorMeta) editorMeta.textContent = meta;
    if (ficheiro && modeloNomeEl) modeloNomeEl.textContent = ficheiro;
  }

  async function atualizarMetaId() {
    try {
      const supabase = getSupabase();
      if (!supabase) return;
      const id = await getNextProductId(supabase);
      atualizarCabecalho({ meta: `ID ${id}` });
    } catch {
      atualizarCabecalho({ meta: 'Novo produto' });
    }
  }

  function abrirModal() {
    if (!hasModel()) {
      setStatus('Carregue um modelo antes de publicar.', true);
      return;
    }
    modal?.classList.remove('hidden');
    document.body.classList.add('modal-publicar-aberto');
    carregarDatalists();
    atualizarMetaId();
    const file = getModelFile();
    atualizarCabecalho({
      titulo: nameInput?.value.trim() || 'Novo produto',
      ficheiro: file?.name || '—',
    });
    nameInput?.focus();
  }

  function fecharModal() {
    modal?.classList.add('hidden');
    document.body.classList.remove('modal-publicar-aberto');
  }

  btnAbrir?.addEventListener('click', abrirModal);
  modal?.querySelector('.modal-publicar-fechar')?.addEventListener('click', fecharModal);
  modal?.querySelector('[data-fechar-modal]')?.addEventListener('click', fecharModal);
  modal?.querySelector('.modal-publicar-painel')?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      fecharModal();
    }
  });

  function setReady(ready) {
    submitBtn.disabled = publishing || !ready;
    secao?.classList.toggle('publicar-pronto', ready);
  }

  function setPublishing(active) {
    publishing = active;
    submitBtn.disabled = active || !hasModel();
    if (submitLabel) submitLabel.textContent = active ? 'A publicar…' : 'Publicar na loja';
    form.classList.toggle('publicar-saving', active);
  }

  function preencherSugestoes(meta, file, { tamanhoSugerido } = {}) {
    if (!file) {
      setReady(false);
      return;
    }

    const nomeArquivo = meta?.nome || file.name || '';
    const sugestaoNome =
      nomeBaseArquivo(nomeArquivo) ||
      meta?.titulo?.trim() ||
      'Novo produto';

    if (nameInput) nameInput.value = sugestaoNome;
    if (slugInput) {
      slugInput.value = nomeToSlug(sugestaoNome);
      slugAuto = true;
    }

    const tamanho =
      extrairTamanhoDoNome(nomeArquivo) ||
      tamanhoSugerido ||
      '';
    if (sizesInput) sizesInput.value = tamanho;

    if (meta?.descricao && descInput && !descInput.value.trim()) {
      descInput.value = meta.descricao;
    }

    atualizarCabecalho({
      titulo: sugestaoNome,
      ficheiro: file.name || nomeArquivo,
    });

    setReady(true);
  }

  nameInput?.addEventListener('input', () => {
    if (editorTitle) {
      editorTitle.textContent = nameInput.value.trim() || 'Novo produto';
    }
    if (!slugInput) return;
    if (slugAuto || !slugInput.value.trim()) {
      slugInput.value = nomeToSlug(nameInput.value);
      slugAuto = true;
    }
  });

  slugInput?.addEventListener('input', () => {
    slugAuto = false;
  });

  categoryInput?.addEventListener('input', renderSubcategoriaSugestoes);

  if (descInput) descInput.placeholder = descricaoPlaceholder();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = getModelFile();
    if (!file || !hasModel()) {
      setStatus('Carregue um modelo antes de publicar.', true);
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus(
        `Ficheiro muito grande (${(file.size / (1024 * 1024)).toFixed(1)} MB). Limite ~50 MB no plano free.`,
        true
      );
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setStatus('Supabase não configurado.', true);
      return;
    }

    setPublishing(true);
    setStatus('A publicar produto na cloud…');

    try {
      const id = await getNextProductId(supabase);
      const draft = {
        id,
        name: form.name.value.trim(),
        price: Number(form.price.value) || 0,
        sizes: parseSizes(form.sizes.value),
        category: form.category.value.trim() || 'Miniaturas',
        subcategory: form.subcategory.value.trim() || undefined,
        slug: form.slug.value.trim() || nomeToSlug(form.name.value),
        desc: form.desc.value.trim(),
        tag: form.tag.value.trim() || form.category.value.trim() || 'Miniaturas',
        icon: form.icon.value.trim() || undefined,
        published: form.published.checked,
        featured: form.featured.checked,
        featuredOrder: Number(form.featuredOrder?.value) || 0,
      };

      if (!draft.name) throw new Error('Indique o nome do produto.');

      const row = productToRow(draft);
      const ext = extensaoModelo(file);

      const previewUrls = await montarFicheirosPreview(supabase, row);

      const modelUrl = await uploadProductAsset(supabase, file, row);
      if (ext === '3mf' || ext === 'mf3') row.model3mf_url = modelUrl;
      else row.model_url = modelUrl;

      if (previewUrls.length) {
        row.preview_image = previewUrls[0];
        row.preview_images = previewUrls;
      }

      const { error } = await supabase.from('products').insert(row);
      if (error) throw error;

      await initProductCatalog({ force: true });
      await carregarDatalists();

      if (statusEl) {
        statusEl.innerHTML = `
          <p class="aviso-ok">Produto #${id} publicado.</p>
          <p class="publicar-links">
            <a href="/admin.html" target="_blank" rel="noopener">Editar no admin</a>
            ·
            <a href="/produtos.html" target="_blank" rel="noopener">Ver loja</a>
            ·
            <a href="/visualizador.html?produto=${id}" target="_blank" rel="noopener">Preview 3D</a>
          </p>`;
      }

      setStatus(`Produto #${id} publicado na loja.`);
    } catch (err) {
      if (statusEl) statusEl.innerHTML = '';
      setStatus(err.message || 'Erro ao publicar.', true);
    } finally {
      setPublishing(false);
      setReady(hasModel());
    }
  });

  carregarDatalists();
  setReady(hasModel());

  return {
    preencherSugestoes,
    abrirModal,
    fecharModal,
    onModelCleared() {
      if (statusEl) statusEl.innerHTML = '';
      setReady(false);
      fecharModal();
      secao?.classList.remove('publicar-pronto');
      if (form.elements.published) form.elements.published.checked = false;
      if (form.elements.featured) form.elements.featured.checked = false;
      if (form.elements.featuredOrder) form.elements.featuredOrder.value = '0';
      if (incluirCapturaInput) incluirCapturaInput.checked = true;
      imagensAnexadas.limpar();
    },
  };
}
