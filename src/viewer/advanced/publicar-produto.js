/**
 * Publicar modelo carregado como novo produto na loja (Supabase).
 */
import { getSupabase } from '../../auth/supabase.js';
import {
  fetchCloudProducts,
  getNextProductId,
  nomeToSlug,
  productToRow,
  uploadProductAsset,
} from '../../data/products-cloud.js';
import { initProductCatalog } from '../../data/products.js';
import { capturarPngBlob } from './export-media.js';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function parseSizes(raw) {
  return String(raw || '')
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function nomeBaseArquivo(nome) {
  return String(nome || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function extensaoModelo(file) {
  return file?.name?.split('.').pop()?.toLowerCase() || '';
}

export function initPublicarProduto({
  renderer,
  scene,
  getCamera,
  getModelFile,
  hasModel,
  setStatus,
}) {
  const form = document.getElementById('form-publicar-produto');
  const secao = document.getElementById('secao-publicar');
  const statusEl = document.getElementById('publicar-status');
  const submitBtn = document.getElementById('btn-publicar-produto');
  const nameInput = document.getElementById('pub-name');
  const slugInput = document.getElementById('pub-slug');
  const catList = document.getElementById('pub-categories');
  const subList = document.getElementById('pub-subcategories');

  if (!form) return null;

  let slugAuto = true;
  let publishing = false;

  function setReady(ready) {
    submitBtn.disabled = publishing || !ready;
    secao?.classList.toggle('publicar-pronto', ready);
  }

  function setPublishing(active) {
    publishing = active;
    submitBtn.disabled = active || !hasModel();
    submitBtn.textContent = active ? 'A publicar…' : 'Publicar na loja';
    form.classList.toggle('publicar-saving', active);
  }

  async function carregarDatalists() {
    try {
      const supabase = getSupabase();
      const products = await fetchCloudProducts(supabase, { admin: true });
      const cats = [...new Set(products.map((p) => p.category).filter(Boolean))];
      const subs = [...new Set(products.map((p) => p.subcategory).filter(Boolean))];
      if (catList) {
        catList.innerHTML = cats.map((c) => `<option value="${c}">`).join('');
      }
      if (subList) {
        subList.innerHTML = subs.map((s) => `<option value="${s}">`).join('');
      }
    } catch {
      /* datalists opcionais */
    }
  }

  function preencherSugestoes(meta, file) {
    if (!file) {
      setReady(false);
      return;
    }

    const sugestaoNome =
      meta?.titulo?.trim() ||
      nomeBaseArquivo(meta?.nome || file.name) ||
      'Novo produto';

    if (nameInput && !nameInput.value.trim()) {
      nameInput.value = sugestaoNome;
    }
    if (slugInput && (slugAuto || !slugInput.value.trim())) {
      slugInput.value = nomeToSlug(nameInput?.value || sugestaoNome);
      slugAuto = true;
    }
    if (meta?.descricao && form.elements.desc && !form.elements.desc.value.trim()) {
      form.elements.desc.value = meta.descricao;
    }

    setReady(true);
  }

  nameInput?.addEventListener('input', () => {
    if (!slugInput) return;
    if (slugAuto || !slugInput.value.trim()) {
      slugInput.value = nomeToSlug(nameInput.value);
      slugAuto = true;
    }
  });

  slugInput?.addEventListener('input', () => {
    slugAuto = false;
  });

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
        tag: form.category.value.trim() || 'Miniaturas',
        published: form.published.checked,
        featured: form.featured.checked,
      };

      if (!draft.name) throw new Error('Indique o nome do produto.');

      const row = productToRow(draft);
      const ext = extensaoModelo(file);

      const previewBlob = await capturarPngBlob(renderer, scene, getCamera());
      const previewFile = new File([previewBlob], 'preview.png', { type: 'image/png' });
      const previewUrl = await uploadProductAsset(supabase, previewFile, row);

      const modelUrl = await uploadProductAsset(supabase, file, row);
      if (ext === '3mf' || ext === 'mf3') row.model3mf_url = modelUrl;
      else row.model_url = modelUrl;

      if (previewUrl) {
        row.preview_image = previewUrl;
        row.preview_images = [previewUrl];
      }

      const { error } = await supabase.from('products').insert(row);
      if (error) throw error;

      await initProductCatalog({ force: true });

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
    onModelCleared() {
      if (statusEl) statusEl.innerHTML = '';
      setReady(false);
      if (secao) {
        secao.classList.remove('expanded', 'publicar-pronto');
        secao.querySelector('.info-section-header')?.setAttribute('aria-expanded', 'false');
      }
      if (form.elements.published) form.elements.published.checked = false;
      if (form.elements.featured) form.elements.featured.checked = false;
    },
  };
}
