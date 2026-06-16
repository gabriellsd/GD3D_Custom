/**
 * Árvore de peças / meshes do modelo.
 */

function obterGrupoPeca(mesh) {
  const pai = mesh.parent;
  if (pai?.isGroup && !pai.isMesh && pai !== mesh) return pai;
  return mesh;
}

function nomeGrupoPeca(grupo, indice) {
  const n = grupo.name?.trim();
  if (n && !/^filament-\d+$/i.test(n) && n !== "pecas-unidas") return n;
  if (grupo.userData?.supportName) return grupo.userData.supportName;
  return `Peça ${indice + 1}`;
}

export function coletarPecas(object) {
  const mapa = new Map();

  object.traverse((child) => {
    if (!child.isMesh || child.userData?.isSupport) return;

    const grupo = obterGrupoPeca(child);
    if (!mapa.has(grupo.uuid)) {
      mapa.set(grupo.uuid, { grupo, meshes: [] });
    }
    mapa.get(grupo.uuid).meshes.push(child);
  });

  return [...mapa.values()].map((entrada, indice) => {
    const { grupo, meshes } = entrada;
    const visivel = meshes.every((m) => m.visible);
    return {
      id: grupo.uuid,
      nome: nomeGrupoPeca(grupo, indice),
      mesh: meshes[0],
      meshes,
      visivel,
    };
  });
}

export function renderizarArvorePecas(container, pecas, onToggle) {
  if (!container) return;
  if (!pecas.length) {
    container.innerHTML = '<p class="info-vazio">Nenhuma peça</p>';
    return;
  }

  container.innerHTML = pecas
    .map(
      (p) => `
    <label class="toggle-linha peca-linha">
      <span title="${escapeAttr(p.nome)}">${escapeHtml(p.nome)}</span>
      <input type="checkbox" data-id="${p.id}" ${p.visivel ? "checked" : ""} />
      <span class="toggle-ui"></span>
    </label>`
    )
    .join("");

  container.querySelectorAll("input[data-id]").forEach((input) => {
    input.addEventListener("change", () => {
      const peca = pecas.find((p) => p.id === input.dataset.id);
      if (!peca) return;
      peca.visivel = input.checked;
      const alvos = peca.meshes ?? [peca.mesh];
      for (const mesh of alvos) mesh.visible = input.checked;
      onToggle?.(peca);
    });
  });
}

function escapeHtml(t) {
  return String(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(t) {
  return escapeHtml(t).replace(/"/g, "&quot;");
}
