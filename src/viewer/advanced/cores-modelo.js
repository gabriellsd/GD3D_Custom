import * as THREE from "three";
import * as fflate from "three/addons/libs/fflate.module.js";
import { analisarFilamentosBambu, detectarBambu3mf } from "./bambu-3mf.js";
import {
  extractFilamentColorsFrom3mfBuffer,
  parseFilamentColours,
} from "../bambu3mfParse.js";

/** Cores sintéticas do viewer — não representam dados do ficheiro. */
function corEhPadraoRenderizador(hex) {
  return hex === "#FFFFFF" || hex === "#89B4FA" || hex === "#E8A317";
}

export function normalizarHexCor(hex) {
  if (!hex || typeof hex !== "string") return null;
  const limpo = hex.trim();
  if (!limpo) return null;
  const comHash = limpo.startsWith("#") ? limpo : `#${limpo}`;
  const upper = comHash.toUpperCase();
  return /^#[0-9A-F]{6}$/.test(upper) ? upper : null;
}

function normalizarZip(zip) {
  const arquivos = {};
  for (const chave of Object.keys(zip)) {
    arquivos[chave.replace(/\\/g, "/")] = zip[chave];
  }
  return arquivos;
}

function extrairCoresXml3mf(arquivos) {
  const visto = new Set();
  const cores = [];

  function adicionar(hex) {
    const normalizado = normalizarHexCor(hex);
    if (!normalizado || visto.has(normalizado)) return;
    visto.add(normalizado);
    cores.push(normalizado);
  }

  for (const key of Object.keys(arquivos)) {
    if (!/\.(model|config)$/i.test(key)) continue;
    const xml = new TextDecoder().decode(arquivos[key]);
    for (const match of xml.matchAll(/displaycolor="([^"]+)"/gi)) {
      adicionar(match[1]);
    }
    for (const match of xml.matchAll(/<color\s+color="([^"]+)"/gi)) {
      adicionar(match[1]);
    }
  }

  const projectSettings =
    arquivos["Metadata/project_settings.config"] ??
    arquivos["metadata/project_settings.config"];
  if (projectSettings) {
    for (const cor of parseFilamentColours(new TextDecoder().decode(projectSettings))) {
      adicionar(cor);
    }
  }

  return cores;
}

/** Cores declaradas no buffer 3MF (Bambu paint/filament ou recursos 3MF padrão). */
export function extrairCoresDo3mfBuffer(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (detectarBambu3mf(buf)) {
    const bambu = extractFilamentColorsFrom3mfBuffer(buf);
    const cores = bambu.map((hex) => normalizarHexCor(hex)).filter(Boolean);
    if (cores.length) return cores;
  }

  const arquivos = normalizarZip(fflate.unzipSync(buf));
  return extrairCoresXml3mf(arquivos);
}

/** Extrai cores visíveis de um object3d (um ficheiro/peça). */
export function extrairCoresDoObject(object, metaBambu = null) {
  if (!object) return [];

  const coresArquivo = object.userData?.coresArquivo;
  if (Array.isArray(coresArquivo)) return coresArquivo;

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
  return [];
}

export function metaBambuDoObject(object3d) {
  let node = object3d;
  while (node) {
    if (node.userData?.bambuExtras) return node.userData.bambuExtras;
    node = node.parent;
  }
  return null;
}

/** Material Bambu por slot de filamento (paint_color / AMS). */
export function aplicarPolygonOffsetFilamento(material, meshName) {
  if (!material || !meshName?.startsWith("filament-")) return material;
  const slot = parseInt(meshName.replace("filament-", ""), 10) || 1;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -slot;
  material.polygonOffsetUnits = -slot;
  return material;
}

export function materialFilamentoBambu(mesh, metaBambu) {
  if (!mesh?.isMesh || !mesh.name?.startsWith("filament-") || !metaBambu?.filamentColours) {
    return null;
  }
  const slot = parseInt(mesh.name.replace("filament-", ""), 10);
  const hex = normalizarHexCor(metaBambu.filamentColours[slot - 1]);
  if (!hex) return null;

  return aplicarPolygonOffsetFilamento(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      roughness: 0.58,
      metalness: 0.04,
      flatShading: false,
    }),
    mesh.name
  );
}
