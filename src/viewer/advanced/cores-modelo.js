import { analisarFilamentosBambu } from "./bambu-3mf.js";

function corEhPadraoRenderizador(hex) {
  return hex === "#FFFFFF" || hex === "#89B4FA";
}

export function normalizarHexCor(hex) {
  if (!hex || typeof hex !== "string") return null;
  const limpo = hex.trim();
  if (!limpo) return null;
  const comHash = limpo.startsWith("#") ? limpo : `#${limpo}`;
  const upper = comHash.toUpperCase();
  return /^#[0-9A-F]{6}$/.test(upper) ? upper : null;
}

/** Extrai cores visíveis de um object3d (um ficheiro/peça). */
export function extrairCoresDoObject(object, metaBambu = null) {
  if (!object) return [];

  const visto = new Set();
  const cores = [];
  let temCorVertice = false;

  function adicionarCor(hex) {
    const normalizado = normalizarHexCor(hex);
    if (!normalizado || visto.has(normalizado)) return;
    visto.add(normalizado);
    cores.push(normalizado);
  }

  const filamentos = analisarFilamentosBambu(object, metaBambu);
  if (filamentos.length) {
    for (const f of filamentos.sort((a, b) => a.slot - b.slot)) {
      adicionarCor(f.hex);
    }
    if (cores.length) return cores;
  }

  object.traverse((child) => {
    if (!child.isMesh || child.userData?.isSupport) return;

    const meshTemCorVertice = Boolean(child.geometry?.attributes?.color);
    if (meshTemCorVertice) temCorVertice = true;

    const materiais = child.material
      ? Array.isArray(child.material)
        ? child.material
        : [child.material]
      : [];

    if (!meshTemCorVertice) {
      for (const mat of materiais) {
        if (!mat?.color) continue;
        adicionarCor(`#${mat.color.getHexString()}`);
      }
    }

    if (meshTemCorVertice) {
      const attr = child.geometry.attributes.color;
      const passo = Math.max(1, Math.floor(attr.count / 3000));
      for (let i = 0; i < attr.count && cores.length < 24; i += passo) {
        const r = Math.round(attr.getX(i) * 255);
        const g = Math.round(attr.getY(i) * 255);
        const b = Math.round(attr.getZ(i) * 255);
        adicionarCor(
          `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
        );
      }
    }
  });

  if (temCorVertice) return cores;

  const coresReais = cores.filter((hex) => !corEhPadraoRenderizador(hex));
  if (coresReais.length) return coresReais;
  if (cores.length) return cores;
  return [];
}

export function metaBambuDoObject(object3d) {
  return object3d?.userData?.bambuExtras ?? null;
}
