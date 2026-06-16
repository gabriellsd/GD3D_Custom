/** Ícones de cubo para barra de vistas (estilo slicer). */

const FACE = (d) =>
  `<path d="${d}" fill="currentColor" fill-opacity="0.38" stroke="none"/>`;

const LINHA = (d) =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>`;

// Cubo isométrico — vértices partilhados por todos os ícones
const TOPO = "M12 5 L18 9 L12 13 L6 9 Z";
const ESQ = "M6 9 L12 13 L12 21 L6 17 Z";
const DIR = "M18 9 L12 13 L12 21 L18 17 Z";
const FUNDO = "M6 17 L12 21 L18 17 L12 17 Z";

const AR = {
  iso: "M12 5 L6 9 L6 17 L12 21 L18 17 L18 9 L12 5 M6 9 L12 13 L18 9 M12 13 L12 21",
  frente: "M12 5 L6 9 L6 17 L12 21 L12 13 L18 9 L12 5 M12 13 L6 9",
  topo: "M12 5 L6 9 L12 13 L18 9 L12 5 M6 9 L6 17 L12 21 L18 17 L18 9",
  direita: "M12 5 L18 9 L18 17 L12 21 L12 13 L6 9 L12 5 M12 13 L18 9",
  fundo: "M6 17 L12 21 L18 17 L12 13 L6 9 L6 17 M18 9 L18 17",
};

export const ICONES_VISTA = {
  iso: `${FACE(TOPO)}${LINHA(AR.iso)}`,
  frente: `${FACE(ESQ)}${LINHA(AR.frente)}`,
  topo: `${FACE(TOPO)}${LINHA(AR.topo)}`,
  direita: `${FACE(DIR)}${LINHA(AR.direita)}`,
  tras: `${FACE(DIR)}${LINHA("M12 5 L18 9 L18 17 L12 21 L12 13 L6 9 L12 5 M6 9 L6 17 L12 21")}`,
  fundo: `${FACE(FUNDO)}${LINHA(AR.fundo)}`,
};

export function svgVista(tipo) {
  const path = ICONES_VISTA[tipo] || ICONES_VISTA.iso;
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${path}</svg>`;
}
