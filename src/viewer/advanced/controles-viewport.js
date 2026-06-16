import { svgVista } from "./icones-vista.js";

const VISTAS = [
  { id: "iso", title: "Isométrica" },
  { id: "frente", title: "Frente" },
  { id: "topo", title: "Topo" },
  { id: "direita", title: "Direita" },
  { id: "tras", title: "Trás" },
  { id: "fundo", title: "Fundo" },
];

export function montarControlesViewport(container) {
  if (!container || container.querySelector(".viewer-barra-inferior")) return;

  const barra = document.createElement("div");
  barra.className = "viewer-barra-inferior";
  barra.innerHTML = `
    <label class="pill-cama">
      <input type="checkbox" id="chk-mesa-overlay" />
      <span class="pill-cama-switch" aria-hidden="true"><span class="pill-cama-knob"></span></span>
      <span class="pill-cama-label">Mostre a cama</span>
    </label>
    <div class="barra-vistas" role="toolbar" aria-label="Vistas da câmera">
      <button type="button" class="barra-vistas-btn" id="btn-vista-centrar" title="Centrar (R)">
        <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
      </button>
      <span class="barra-vistas-sep" aria-hidden="true"></span>
      ${VISTAS.map(
        (v) =>
          `<button type="button" class="barra-vistas-btn btn-vista" data-vista="${v.id}" title="${v.title}">${svgVista(v.id)}</button>`
      ).join("")}
    </div>`;

  container.appendChild(barra);
}

export function sincronizarToggleMesa(ativo) {
  for (const id of ["chk-mesa", "chk-mesa-overlay"]) {
    const el = document.getElementById(id);
    if (el) el.checked = ativo;
  }
}
