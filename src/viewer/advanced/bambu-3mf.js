/**
 * Loader 3MF Bambu/Orca (paint_color + filament_colour).
 */
import * as THREE from "three";
import * as fflate from "three/addons/libs/fflate.module.js";
import { extrairMetadadosBambu } from "./bambu-metadados.js";
import {
  decodeBambuPaintSlot,
  extractInnerObjectXml,
  parseObjectModelPath,
  resolverMontagem,
} from "../bambu3mfParse.js";
import {
  buildColoredFilamentGroup as buildColoredGroup,
  matrixFrom3mfTransform,
} from "../bambu3mfMesh.js";

export { decodeBambuPaintSlot } from "../bambu3mfParse.js";

const SUPPORT_PART_RE =
  /support|suporte|generic|cube|brim|skirt|raft|pin|dummy|placeholder|prime/i;

function normalizarZip(zip) {
  const arquivos = {};
  for (const chave of Object.keys(zip)) {
    arquivos[chave.replace(/\\/g, "/")] = zip[chave];
  }
  return arquivos;
}

function chaveZip(arquivos, sufixo) {
  const normalizado = sufixo.replace(/^\//, "");
  return (
    Object.keys(arquivos).find((k) => k.replace(/\\/g, "/").endsWith(normalizado)) ??
    null
  );
}

function lerTextoZip(arquivos, sufixo) {
  const chave = chaveZip(arquivos, sufixo);
  if (!chave) return null;
  return new TextDecoder().decode(arquivos[chave]);
}

function parseJsonArrayCampo(projectSettings, campo) {
  if (!projectSettings) return [];
  const bloco = projectSettings.match(
    new RegExp(`"${campo}"\\s*:\\s*\\[([\\s\\S]*?)\\]`)
  );
  if (!bloco) return [];
  return [...bloco[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter(Boolean);
}

export function analisarFilamentosBambu(object, meta = null) {
  const tipos = meta?.filamentTypes ?? [];
  const slots = [];
  object.traverse((child) => {
    if (!child.isMesh || !child.name?.startsWith("filament-")) return;
    if (child.userData?.isSupport) return;
    const slot = parseInt(child.name.replace("filament-", ""), 10);
    const geo = child.geometry;
    const triangles = geo?.index
      ? geo.index.count / 3
      : geo?.attributes?.position
        ? geo.attributes.position.count / 3
        : 0;
    const hex = child.material?.color
      ? `#${child.material.color.getHexString()}`.toUpperCase()
      : "#CCCCCC";
    const nome = tipos[slot - 1] || null;
    slots.push({ slot, hex, triangles: Math.round(triangles), nome });
  });
  return slots.sort((a, b) => a.slot - b.slot);
}

export function parseFilamentColours(projectSettings) {
  return parseJsonArrayCampo(projectSettings, "filament_colour");
}

export function parseFilamentTypes(projectSettings) {
  return parseJsonArrayCampo(projectSettings, "filament_type");
}

export function modeloTemSuportesBambu(object) {
  if (!object) return false;
  let encontrou = false;
  object.traverse((child) => {
    if (child.userData?.isSupport) encontrou = true;
  });
  return encontrou;
}

export function aplicarVisibilidadeSuportes(object, visivel) {
  object?.traverse((child) => {
    if (child.userData?.isSupport) child.visible = visivel;
  });
}

function parseDefaultExtruder(modelSettings) {
  if (!modelSettings) return 1;
  const match = modelSettings.match(/key="extruder"\s+value="(\d+)"/);
  return match ? parseInt(match[1], 10) : 1;
}

function parsePartExtruders(modelSettings) {
  const mapa = new Map();
  if (!modelSettings) return mapa;

  const partRe = /<part id="(\d+)"[\s\S]*?<\/part>/gi;
  let match;

  while ((match = partRe.exec(modelSettings)) !== null) {
    const partId = parseInt(match[1], 10);
    const extruders = [...match[0].matchAll(/key="extruder"\s+value="(\d+)"/gi)];
    const ext = extruders.at(-1)?.[1];
    if (ext) mapa.set(partId, parseInt(ext, 10));
  }

  return mapa;
}

function parsePartMetadata(modelSettings) {
  const mapa = new Map();
  if (!modelSettings) return mapa;

  const partRe = /<part id="(\d+)"[\s\S]*?<\/part>/gi;
  let match;

  while ((match = partRe.exec(modelSettings)) !== null) {
    const partId = parseInt(match[1], 10);
    const bloco = match[0];
    const nome = bloco.match(/key="name"\s+value="([^"]*)"/i)?.[1] ?? "";
    const subtype = bloco.match(/subtype="([^"]*)"/i)?.[1] ?? "";
    const extruder = bloco.match(/key="extruder"\s+value="(\d+)"/i)?.[1];

    if (!mapa.has(partId)) {
      mapa.set(partId, {
        name: nome,
        subtype,
        extruder: extruder ? parseInt(extruder, 10) : null,
      });
    }
  }

  return mapa;
}

function objectXmlHasPaintColor(objectXml) {
  if (!objectXml) return false;
  return /<triangle[^>]*paint_color="(?!0")[^"]+"/i.test(objectXml);
}

function isSupportPartMeta(meta, innerObjectXml) {
  if (meta?.name && SUPPORT_PART_RE.test(meta.name)) return true;
  if (meta?.subtype && /support/i.test(meta.subtype)) return true;

  const triCount = (innerObjectXml?.match(/<triangle/g) || []).length;
  const hasPaint = objectXmlHasPaintColor(innerObjectXml);
  if (triCount > 0 && triCount < 100 && !hasPaint) return true;

  return false;
}

function marcarComoSuporte(grupo, objectId, meta) {
  grupo.name = `bambu-support-${objectId}`;
  grupo.userData.isSupport = true;
  grupo.userData.supportName = meta?.name || "Suporte";
  grupo.visible = false;
  grupo.traverse((child) => {
    if (child.isMesh) child.userData.isSupport = true;
  });
}

function buildAssemblyGroup(
  components,
  arquivos,
  filamentColours,
  partExtruders,
  partMetadata,
  defaultExtruder
) {
  const root = new THREE.Group();
  const cache = new Map();
  let suportes = 0;
  let indicePeca = 0;

  for (const component of components) {
    indicePeca += 1;
    let objectFileXml = cache.get(component.path);
    if (!objectFileXml) {
      objectFileXml = lerTextoZip(arquivos, component.path);
      if (!objectFileXml) continue;
      cache.set(component.path, objectFileXml);
    }

    const innerXml =
      component.innerXml || extractInnerObjectXml(objectFileXml, component.objectId);
    if (!innerXml) continue;

    const meta = partMetadata.get(component.objectId);
    const ehSuporte = isSupportPartMeta(meta, innerXml);

    const extruder =
      partExtruders.get(component.objectId) ?? meta?.extruder ?? defaultExtruder;
    const part = buildColoredGroup(innerXml, filamentColours, extruder);
    const nomePeca = meta?.name?.trim();
    part.name = nomePeca || `Peça ${indicePeca}`;
    part.userData.bambuObjectId = component.objectId;

    if (component.transform) {
      part.userData.bambuTransform = component.transform;
      part.applyMatrix4(matrixFrom3mfTransform(component.transform));
    }

    if (ehSuporte) {
      marcarComoSuporte(part, component.objectId, meta);
      suportes += 1;
    }

    root.add(part);
  }

  if (!root.children.length) {
    throw new Error("3MF Bambu: montagem multi-peça vazia");
  }

  root.userData.suportesBambu = suportes;
  return root;
}

export function detectarBambu3mf(arrayBuffer) {
  const zip = normalizarZip(
    fflate.unzipSync(
      arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer)
    )
  );

  const projectSettings = lerTextoZip(zip, "Metadata/project_settings.config");
  if (projectSettings?.includes("filament_colour")) return true;

  for (const chave of Object.keys(zip)) {
    if (!chave.endsWith(".model") && !chave.endsWith(".config")) continue;
    const texto = new TextDecoder().decode(zip[chave]);
    if (texto.includes("paint_color=")) return true;
  }

  return false;
}

export function parseBambu3mfBuffer(buffer, options = {}) {
  const arquivos = normalizarZip(
    fflate.unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer))
  );

  const mainModel = lerTextoZip(arquivos, "3D/3dmodel.model");
  if (!mainModel) throw new Error("3MF Bambu: 3dmodel.model em falta");

  const projectSettings = lerTextoZip(arquivos, "Metadata/project_settings.config");
  const modelSettings = lerTextoZip(arquivos, "Metadata/model_settings.config");
  const filamentColours = parseFilamentColours(projectSettings);
  const defaultExtruder = parseDefaultExtruder(modelSettings);

  const objectPath = parseObjectModelPath(mainModel);
  const objectXml = lerTextoZip(arquivos, objectPath);
  if (!objectXml) throw new Error(`3MF Bambu: ${objectPath} em falta`);

  const components = resolverMontagem(mainModel, objectPath, objectXml, arquivos, options);

  let object;
  if (components.length > 0) {
    const partExtruders = parsePartExtruders(modelSettings);
    const partMetadata = parsePartMetadata(modelSettings);
    try {
      object = buildAssemblyGroup(
        components,
        arquivos,
        filamentColours,
        partExtruders,
        partMetadata,
        defaultExtruder
      );
    } catch (err) {
      if (!/vazia/i.test(err?.message || "")) throw err;
      object = buildColoredGroup(objectXml, filamentColours, defaultExtruder);
    }
  } else {
    object = buildColoredGroup(objectXml, filamentColours, defaultExtruder);
  }

  return {
    object,
    meta: {
      filamentColours,
      filamentTypes: parseFilamentTypes(projectSettings),
      suportes: object.userData?.suportesBambu ?? 0,
      bambuImpressao: extrairMetadadosBambu(projectSettings),
    },
  };
}
