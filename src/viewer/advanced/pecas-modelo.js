/**
 * Deteta sub-peças num modelo carregado (montagem Bambu ou filamentos AMS).
 * Permite listar no painel Items como ficheiros separados (ex.: Pikachu por cor).
 */

import { normalizarHexCor, extrairCoresDoObject } from "./cores-modelo.js";

function ehSuporte(node) {
  return Boolean(node.userData?.isSupport || /^bambu-support-/i.test(node.name || ""));
}

function filhosMontagem(modelObject) {
  return (modelObject.children || []).filter(
    (child) =>
      !ehSuporte(child) &&
      child.name &&
      !/^filament-\d+$/i.test(child.name)
  );
}

function meshesFilamento(modelObject) {
  const meshes = [];
  modelObject.traverse((child) => {
    if (!child.isMesh || ehSuporte(child)) return;
    if (!child.name?.startsWith("filament-")) return;
    meshes.push(child);
  });
  return meshes.sort((a, b) => {
    const sa = parseInt(a.name.replace("filament-", ""), 10) || 0;
    const sb = parseInt(b.name.replace("filament-", ""), 10) || 0;
    return sa - sb;
  });
}

function corFilamentoMeta(metaBambu, slot) {
  return normalizarHexCor(metaBambu?.filamentColours?.[slot - 1]);
}

function rotuloFilamento(mesh, metaBambu) {
  const slot = parseInt(mesh.name.replace("filament-", ""), 10);
  const hex = corFilamentoMeta(metaBambu, slot) || (
    mesh.material?.color
      ? `#${mesh.material.color.getHexString()}`.toUpperCase()
      : null
  );
  const tipo = metaBambu?.filamentTypes?.[slot - 1];
  if (tipo && !/^PLA$/i.test(tipo)) return `${tipo} (${hex || `slot ${slot}`})`;
  if (hex) return `Filamento ${slot} (${hex})`;
  return mesh.name || `Filamento ${slot}`;
}

function coresDaPeca(parte, metaBambu) {
  const slot = parte.name?.startsWith("filament-")
    ? parseInt(parte.name.replace("filament-", ""), 10)
    : null;
  if (slot) {
    const hex = corFilamentoMeta(metaBambu, slot);
    if (hex) return [hex];
  }
  return extrairCoresDoObject(parte, metaBambu);
}

/**
 * @param {import("three").Object3D} modelObject — raiz do modelo (antes do container de orientação)
 * @param {object|null} metaBambu
 * @returns {Array<{ nome: string, object3d: import("three").Object3D, cores: string[] }>|null}
 */
export function detectarPecasSeparaveis(modelObject, metaBambu = null) {
  if (!modelObject) return null;

  const montagem = filhosMontagem(modelObject);
  if (montagem.length >= 2) {
    return montagem.map((parte) => ({
      nome: parte.name.trim() || "Peça",
      object3d: parte,
      cores: coresDaPeca(parte, metaBambu),
    }));
  }

  const filamentos = meshesFilamento(modelObject);
  if (filamentos.length >= 2) {
    return filamentos.map((mesh) => ({
      nome: rotuloFilamento(mesh, metaBambu),
      object3d: mesh,
      cores: coresDaPeca(mesh, metaBambu),
    }));
  }

  return null;
}

/**
 * Filamentos AMS dentro de uma peça (sub-linhas no painel Items).
 * Só devolve lista quando há 2+ meshes filament-* na peça.
 * @returns {Array<{ nome: string, object3d: import("three").Object3D, hex: string, meshUuid: string, slot: number }>}
 */
export function filamentosSubPeca(modelObject, metaBambu = null) {
  const meshes = meshesFilamento(modelObject);
  if (meshes.length < 2) return [];

  return meshes.map((mesh) => {
    const slot = parseInt(mesh.name.replace("filament-", ""), 10);
    const hex =
      corFilamentoMeta(metaBambu, slot) ||
      (mesh.material?.color
        ? `#${mesh.material.color.getHexString()}`.toUpperCase()
        : "#CCCCCC");
    return {
      nome: rotuloFilamento(mesh, metaBambu),
      object3d: mesh,
      hex: normalizarHexCor(hex) || hex,
      meshUuid: mesh.uuid,
      slot,
    };
  });
}

/** Sub-linhas no painel Items: peças de montagem ou filamentos AMS. */
export function subItensPainelPeca(modelObject, metaBambu = null) {
  const montagem = filhosMontagem(modelObject);
  if (montagem.length >= 2) {
    return montagem.map((parte) => ({
      nome: parte.name.trim() || "Peça",
      object3d: parte,
      hex: extrairCoresDoObject(parte, metaBambu)[0] ?? "#CCCCCC",
      meshUuid: parte.uuid,
      slot: 0,
    }));
  }
  return filamentosSubPeca(modelObject, metaBambu);
}
