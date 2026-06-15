/**
 * Ãrvore de peÃ§as / meshes do modelo.
 */
export function coletarPecas(object) {
  const pecas = [];
  object.traverse((child) => {
    if (!child.isMesh) return;
    const nome =
      child.name ||
      child.parent?.name ||
      `Mesh ${pecas.length + 1}`;
    pecas.push({ id: child.uuid, nome, mesh: child, visivel: child.visible });
  });
  return pecas;
}

export function renderizarArvorePecas(container, pecas, onToggle) {
  if (!container) return;
  if (!pecas.length) {
    container.innerHTML = '<p class="info-vazio">Nenhuma peÃ§a</p>';
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
      peca.mesh.visible = input.checked;
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
