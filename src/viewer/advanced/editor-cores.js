import { analisarFilamentosBambu } from "./bambu-3mf.js";
import { normalizarHexCor } from "./cores-modelo.js";

const coresCustomizadas = new Map();
const coresOriginais = new Map();

export function limparEditorCores() {
  coresCustomizadas.clear();
  coresOriginais.clear();
}

export function temCustomizacoesCores() {
  return coresCustomizadas.size > 0;
}

export function registarCoresOriginais(object) {
  if (!object) return;
  object.traverse((child) => {
    if (!child.isMesh || child.userData?.isSupport || !child.material?.color) return;
    if (coresOriginais.has(child.uuid)) return;
    coresOriginais.set(child.uuid, `#${child.material.color.getHexString()}`.toUpperCase());
  });
}

export function corEfetivaMesh(mesh) {
  if (!mesh?.isMesh) return null;
  if (coresCustomizadas.has(mesh.uuid)) return coresCustomizadas.get(mesh.uuid);
  if (coresOriginais.has(mesh.uuid)) return coresOriginais.get(mesh.uuid);
  if (mesh.material?.color) return `#${mesh.material.color.getHexString()}`.toUpperCase();
  return null;
}

function aplicarHexMaterial(material, hexNorm) {
  if (!material?.color) return;
  material.color.set(hexNorm);
}

export function aplicarCorMesh(mesh, hex, materiaisOriginais = null) {
  const hexNorm = normalizarHexCor(hex);
  if (!hexNorm || !mesh?.isMesh) return false;

  coresCustomizadas.set(mesh.uuid, hexNorm);

  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) aplicarHexMaterial(m, hexNorm);

  if (materiaisOriginais?.has(mesh.uuid)) {
    for (const m of materiaisOriginais.get(mesh.uuid)) aplicarHexMaterial(m, hexNorm);
  }

  return true;
}

export function restaurarCorMesh(mesh, materiaisOriginais = null) {
  const original = coresOriginais.get(mesh?.uuid);
  if (!original || !mesh?.isMesh) return false;

  coresCustomizadas.delete(mesh.uuid);

  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) aplicarHexMaterial(m, original);

  if (materiaisOriginais?.has(mesh.uuid)) {
    for (const m of materiaisOriginais.get(mesh.uuid)) aplicarHexMaterial(m, original);
  }

  return true;
}

export function restaurarTodasCores(root, materiaisOriginais = null) {
  if (!root) return 0;
  let n = 0;
  for (const uuid of [...coresCustomizadas.keys()]) {
    let mesh = null;
    root.traverse((c) => {
      if (c.uuid === uuid) mesh = c;
    });
    if (mesh && restaurarCorMesh(mesh, materiaisOriginais)) n++;
  }
  return n;
}

export function aplicarOverrideMaterial(mesh, material) {
  const hex = coresCustomizadas.get(mesh?.uuid);
  if (hex && material?.color) material.color.set(hex);
  return material;
}

export function listarFilamentosEditaveis(object, metaBambu = null) {
  if (!object) return [];

  const filamentos = analisarFilamentosBambu(object, metaBambu);
  const itens = [];

  if (filamentos.length) {
    object.traverse((child) => {
      if (!child.isMesh || !child.name?.startsWith("filament-") || child.userData?.isSupport) return;
      const slot = parseInt(child.name.replace("filament-", ""), 10);
      const info = filamentos.find((f) => f.slot === slot);
      const hexOriginal =
        coresOriginais.get(child.uuid) ?? info?.hex ?? corEfetivaMesh(child) ?? "#CCCCCC";
      itens.push({
        slot,
        meshUuid: child.uuid,
        hex: corEfetivaMesh(child) ?? hexOriginal,
        hexOriginal,
        nome: info?.nome || `Filamento ${slot}`,
        customizada: coresCustomizadas.has(child.uuid),
      });
    });
    return itens.sort((a, b) => a.slot - b.slot);
  }

  object.traverse((child) => {
    if (itens.length) return;
    if (!child.isMesh || child.userData?.isSupport || child.geometry?.attributes?.color) return;
    if (!child.material?.color) return;
    const hexOriginal =
      coresOriginais.get(child.uuid) ?? `#${child.material.color.getHexString()}`.toUpperCase();
    itens.push({
      slot: 0,
      meshUuid: child.uuid,
      hex: corEfetivaMesh(child) ?? hexOriginal,
      hexOriginal,
      nome: "Cor do modelo",
      customizada: coresCustomizadas.has(child.uuid),
    });
  });

  return itens;
}

/** Mapa slot AMS (1-based) → #RRGGBB efetivo na cena. */
export function coletarCoresFilamentoPorSlot(object, metaBambu = null) {
  const itens = listarFilamentosEditaveis(object, metaBambu);
  const mapa = {};

  for (const item of itens) {
    if (item.slot > 0 && item.hex) {
      mapa[item.slot] = item.hex;
    }
  }

  return mapa;
}
