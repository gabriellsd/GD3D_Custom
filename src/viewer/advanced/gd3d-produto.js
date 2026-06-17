/**
 * Carrega produto do catálogo GD3D (?produto=ID).
 */
import { PRODUCTS } from "../../data/products.js";
import { resolveProductAssetUrl } from "../../utils/asset-url.js";

export function obterProduto(id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return null;
  return PRODUCTS.find((p) => p.id === n) ?? null;
}

export function urlModelo(product) {
  if (!product) return null;
  return product.modelGlbUrl || product.model3mfUrl || product.modelUrl || null;
}

function aplicarRotacao(modelPivot, product) {
  const rot = product.model3mfRotation || product.modelRotation;
  const facing = product.model3mfFacing ?? product.modelFacing;
  const inner = modelPivot.children[0]?.children[0];
  if (!inner) return;

  if (rot) {
    inner.rotation.set(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0);
  }
  if (typeof facing === "number") {
    inner.rotation.y += facing;
  }
}

export function initGd3dProduto({ loadFile, setStatus, getCurrentModel, modelPivot }) {
  const params = new URLSearchParams(location.search);
  const produtoId = params.get("produto");
  if (!produtoId) return null;

  const product = obterProduto(produtoId);
  if (!product) {
    setStatus(`Produto #${produtoId} não encontrado`, true);
    return null;
  }

  const modeloUrl = urlModelo(product);
  if (!modeloUrl) {
    setStatus("Produto sem modelo 3D", true);
    return null;
  }

  const titulo = document.getElementById("gd3d-produto-titulo");
  const linkLoja = document.getElementById("gd3d-link-loja");
  const painel = document.getElementById("gd3d-produto-painel");
  if (titulo) titulo.textContent = product.name;
  if (linkLoja) {
    linkLoja.href = `/visualizador.html?produto=${product.id}`;
    linkLoja.textContent = "Visualização simples";
  }
  painel?.classList.remove("hidden");

  const fetchUrl = resolveProductAssetUrl(modeloUrl);
  setStatus(`Carregando ${product.name}...`);

  fetch(fetchUrl)
    .then((r) => {
      if (!r.ok) throw new Error("Modelo não encontrado");
      return r.blob();
    })
    .then((blob) => {
      const nome = modeloUrl.split("/").pop() || "modelo.3mf";
      return loadFile(new File([blob], decodeURIComponent(nome)));
    })
    .then(() => {
      if (getCurrentModel?.()) aplicarRotacao(modelPivot, product);
      setStatus(`Produto: ${product.name}`);
    })
    .catch((err) => setStatus(`Erro: ${err.message}`, true));

  return product;
}
