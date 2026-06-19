/** Ícones de cubo para barra de vistas (estilo slicer). */

const FACE = (d, opacity = 0.42) =>
  `<path d="${d}" fill="currentColor" fill-opacity="${opacity}" stroke="none"/>`;

const LINHA = (d, width = 1.35) =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

const TOPO = "M12 4.5 L18.5 8.5 L12 12.5 L5.5 8.5 Z";
const ESQ = "M5.5 8.5 L12 12.5 L12 20.5 L5.5 16.5 Z";
const DIR = "M18.5 8.5 L12 12.5 L12 20.5 L18.5 16.5 Z";
const FUNDO = "M5.5 16.5 L12 20.5 L18.5 16.5 L12 16.5 Z";

const AR = {
  iso: "M12 4.5 L5.5 8.5 L5.5 16.5 L12 20.5 L18.5 16.5 L18.5 8.5 L12 4.5 M5.5 8.5 L12 12.5 L18.5 8.5 M12 12.5 L12 20.5",
  frente: "M12 4.5 L5.5 8.5 L5.5 16.5 L12 20.5 L12 12.5 L18.5 8.5 L12 4.5 M12 12.5 L5.5 8.5",
  topo: "M12 4.5 L5.5 8.5 L12 12.5 L18.5 8.5 L12 4.5 M5.5 8.5 L5.5 16.5 L12 20.5 L18.5 16.5 L18.5 8.5",
  direita: "M12 4.5 L18.5 8.5 L18.5 16.5 L12 20.5 L12 12.5 L5.5 8.5 L12 4.5 M12 12.5 L18.5 8.5",
  fundo: "M5.5 16.5 L12 20.5 L18.5 16.5 L12 12.5 L5.5 8.5 L5.5 16.5 M18.5 8.5 L18.5 16.5",
};

export const ICONES_VISTA = {
  iso: `${FACE(TOPO)}${FACE(ESQ, 0.22)}${LINHA(AR.iso)}`,
  frente: `${FACE(ESQ)}${LINHA(AR.frente)}`,
  topo: `${FACE(TOPO)}${LINHA(AR.topo)}`,
  direita: `${FACE(DIR)}${LINHA(AR.direita)}`,
  tras: `${FACE(DIR, 0.28)}${LINHA("M12 4.5 L18.5 8.5 L18.5 16.5 L12 20.5 L12 12.5 L5.5 8.5 L12 4.5 M5.5 8.5 L5.5 16.5 L12 20.5")}`,
  fundo: `${FACE(FUNDO)}${LINHA(AR.fundo)}`,
};

export function svgVista(tipo) {
  const path = ICONES_VISTA[tipo] || ICONES_VISTA.iso;
  return `<svg class="icone-vista" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${path}</svg>`;
}
