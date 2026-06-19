import { svgVista } from "./icones-vista.js";

const VISTAS = [
  { id: "iso", title: "Isométrica" },
  { id: "frente", title: "Frente" },
  { id: "topo", title: "Topo" },
  { id: "direita", title: "Direita" },
  { id: "tras", title: "Trás" },
  { id: "fundo", title: "Fundo" },
];

const EXIBICAO_TOGGLES = [
  { id: "chk-cores", icon: "fa-palette", title: "Cores originais", checked: true },
  { id: "chk-giro-auto", icon: "fa-rotate", title: "Giro automático" },
  { id: "chk-bbox", icon: "fa-box", title: "Caixa delimitadora" },
  { id: "chk-ortografico", icon: "fa-square", title: "Ortográfico" },
  { id: "chk-regua", icon: "fa-ruler-combined", title: "Régua (2 cliques)" },
  {
    id: "chk-suportes",
    icon: "fa-layer-group",
    title: "Mostrar suportes",
    linhaId: "linha-suportes",
    hidden: true,
  },
];

const MODELO_TOGGLES = [
  { id: "chk-cenario-mesa", icon: "fa-camera-retro", title: "Estúdio GD3D" },
  { id: "chk-grade", icon: "fa-table-cells", title: "Grade no chão" },
  { id: "chk-eixos", icon: "fa-arrows-up-down-left-right", title: "Eixos XYZ" },
];

const MODELO_ACOES = [
  { id: "btn-copiar-medidas", icon: "fa-copy", label: "Copiar dimensões" },
  { id: "btn-reset-pan", icon: "fa-arrows-up-down-left-right", label: "Resetar pan" },
];

function renderExibicaoToggle(opcao) {
  const checkedAttr = opcao.checked ? " checked" : "";
  const labelClass = opcao.hidden ? "barra-exibicao-toggle hidden" : "barra-exibicao-toggle";
  const labelId = opcao.linhaId ? ` id="${opcao.linhaId}"` : "";
  return `
    <label class="${labelClass}"${labelId} title="${opcao.title}">
      <input type="checkbox" id="${opcao.id}"${checkedAttr} />
      <span class="barra-vistas-btn"><i class="fa-solid ${opcao.icon}" aria-hidden="true"></i></span>
      <span class="barra-flyout-item-label">${opcao.title}</span>
    </label>`;
}

function renderVistasFlyout() {
  return `
    <button type="button" class="barra-vistas-btn barra-flyout-vista" id="btn-vista-centrar" title="Centrar (R)">
      <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
      <span class="barra-flyout-item-label">Centrar</span>
    </button>
    ${VISTAS.map(
      (v) =>
        `<button type="button" class="barra-vistas-btn btn-vista barra-flyout-vista" data-vista="${v.id}" title="${v.title}">${svgVista(v.id)}<span class="barra-flyout-item-label">${v.title}</span></button>`
    ).join("")}`;
}

function renderModeloLinhaToggle(opcao) {
  const checkedAttr = opcao.checked ? " checked" : "";
  return `
    <label class="barra-modelo-linha barra-modelo-linha--toggle" title="${opcao.title}">
      <input type="checkbox" id="${opcao.id}"${checkedAttr} />
      <span class="barra-modelo-icone" aria-hidden="true"><i class="fa-solid ${opcao.icon}"></i></span>
      <span class="barra-modelo-texto">${opcao.title}</span>
    </label>`;
}

function renderModeloLinhaAcao({ id, icon, label, hidden = false }) {
  return `
    <button type="button" class="barra-modelo-linha barra-modelo-linha--acao${hidden ? " hidden" : ""}" id="${id}" title="${label}">
      <span class="barra-modelo-icone" aria-hidden="true"><i class="fa-solid ${icon}"></i></span>
      <span class="barra-modelo-texto">${label}</span>
    </button>`;
}

function renderModeloFlyout() {
  const toggles = MODELO_TOGGLES.map(renderModeloLinhaToggle).join("");
  const acoes = MODELO_ACOES.map(renderModeloLinhaAcao).join("");
  return `
    <div class="barra-modelo-lista">
      <div class="barra-modelo-grupo">${toggles}</div>
      <div class="barra-modelo-grupo barra-modelo-grupo--acoes">${acoes}</div>
    </div>`;
}

function renderFerramentasFlyout() {
  const itens = [
    { id: "btn-screenshot", icon: "fa-camera", label: "Captura (S)" },
    { id: "btn-png-alpha", icon: "fa-image", label: "PNG transparente" },
    { id: "btn-gif-giro", icon: "fa-clapperboard", label: "Vídeo giro" },
    { id: "btn-fullscreen", icon: "fa-expand", label: "Tela cheia (F)" },
  ];
  return `
    <div class="barra-modelo-lista">
      <div class="barra-modelo-grupo">${itens.map(renderModeloLinhaAcao).join("")}</div>
    </div>`;
}

function renderAmbienteFlyout() {
  return `
    <label class="barra-flyout-slider">
      <span class="barra-flyout-slider-label"><i class="fa-solid fa-sun" aria-hidden="true"></i> Iluminação</span>
      <input type="range" id="slider-luz" min="0.2" max="2.5" step="0.05" value="1.1" />
    </label>
    <div class="barra-flyout-fundos">
      <span class="barra-flyout-fundos-label">Fundo</span>
      <div class="barra-flyout-fundos-swatches fundos" id="fundos">
        <button type="button" class="fundo-btn ativo" data-index="0" style="background:#080808" title="Escuro" aria-label="Fundo escuro"></button>
        <button type="button" class="fundo-btn" data-index="1" style="background:#141414" title="Painel" aria-label="Fundo painel"></button>
        <button type="button" class="fundo-btn" data-index="2" style="background:#ffffff;border-color:#475569" title="Branco" aria-label="Fundo branco"></button>
        <button type="button" class="fundo-btn" data-index="3" style="background:#2d2d2d" title="Cinza" aria-label="Fundo cinza"></button>
      </div>
    </div>`;
}

function renderGrupo({ id, icon, title, conteudo, layout = "col" }) {
  return `
    <div class="barra-grupo-tool" data-grupo="${id}">
      <button type="button" class="barra-grupo-trigger barra-vistas-btn" title="${title}" aria-label="${title}" aria-haspopup="true" aria-expanded="false">
        <i class="fa-solid ${icon}" aria-hidden="true"></i>
      </button>
      <div class="barra-grupo-flyout barra-grupo-flyout--${layout}" role="group" aria-label="${title}">
        <span class="barra-grupo-flyout-titulo">${title}</span>
        <div class="barra-grupo-flyout-corpo">
          ${conteudo}
        </div>
      </div>
    </div>`;
}

function initBarraGrupos(root) {
  const grupos = root.querySelectorAll(".barra-grupo-tool");
  let fecharTimer = null;

  function setAberto(grupo, aberto) {
    grupo.classList.toggle("barra-grupo-aberto", aberto);
    grupo.querySelector(".barra-grupo-trigger")?.setAttribute("aria-expanded", aberto ? "true" : "false");
  }

  function fecharTodos(exceto = null) {
    if (fecharTimer) {
      clearTimeout(fecharTimer);
      fecharTimer = null;
    }
    grupos.forEach((grupo) => {
      if (grupo === exceto) return;
      setAberto(grupo, false);
    });
  }

  function abrir(grupo) {
    if (fecharTimer) {
      clearTimeout(fecharTimer);
      fecharTimer = null;
    }
    fecharTodos(grupo);
    setAberto(grupo, true);
  }

  grupos.forEach((grupo) => {
    const trigger = grupo.querySelector(".barra-grupo-trigger");
    const flyout = grupo.querySelector(".barra-grupo-flyout");

    trigger?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (grupo.classList.contains("barra-grupo-aberto")) {
        setAberto(grupo, false);
      } else {
        abrir(grupo);
      }
    });

    grupo.addEventListener("mouseenter", () => abrir(grupo));

    grupo.addEventListener("mouseleave", () => {
      fecharTimer = setTimeout(() => setAberto(grupo, false), 280);
    });

    flyout?.addEventListener("mousedown", (e) => e.stopPropagation());
  });

  document.addEventListener("pointerdown", (e) => {
    if (root.contains(e.target)) return;
    fecharTodos();
  });
}

function montarBarraLateralExibicao(container) {
  const lateral = document.createElement("div");
  lateral.className = "viewer-barra-lateral";
  lateral.innerHTML = `
    <nav class="barra-lateral barra-exibicao-lateral" role="toolbar" aria-label="Controles do viewport">
      ${renderGrupo({
        id: "exibicao",
        icon: "fa-eye",
        title: "Exibição",
        layout: "grid",
        conteudo: EXIBICAO_TOGGLES.map(renderExibicaoToggle).join(""),
      })}
      ${renderGrupo({
        id: "ambiente",
        icon: "fa-sun",
        title: "Ambiente",
        layout: "stack",
        conteudo: renderAmbienteFlyout(),
      })}
      ${renderGrupo({
        id: "vistas",
        icon: "fa-cube",
        title: "Vistas",
        layout: "vistas",
        conteudo: renderVistasFlyout(),
      })}
      ${renderGrupo({
        id: "modelo",
        icon: "fa-ruler-combined",
        title: "Modelo",
        layout: "stack",
        conteudo: renderModeloFlyout(),
      })}
      ${renderGrupo({
        id: "ferramentas",
        icon: "fa-wand-magic-sparkles",
        title: "Ferramentas",
        layout: "stack",
        conteudo: renderFerramentasFlyout(),
      })}
    </nav>`;

  container.appendChild(lateral);
  initBarraGrupos(lateral.querySelector(".barra-exibicao-lateral"));
}

export function montarControlesViewport(container) {
  if (!container) return;

  if (!container.querySelector(".viewer-barra-lateral")) {
    montarBarraLateralExibicao(container);
  }
}
