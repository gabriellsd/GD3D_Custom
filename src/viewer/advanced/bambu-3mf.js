/**
 * Loader 3MF Bambu/Orca (paint_color + filament_colour).
 * Baseado no GD3D Creative â€” suporta multicolor AMS.
 */
import * as THREE from "three";
import * as fflate from "three/addons/libs/fflate.module.js";
import { extrairMetadadosBambu } from "./bambu-metadados.js";

const SLOT_CODES = [
  "4", "8", "0C", "1C", "2C", "3C", "4C", "5C", "6C", "7C",
  "8C", "9C", "AC", "BC", "CC", "DC", "EC", "FC",
];

const TRIANGLE_RE =
  /<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"(?:\s+paint_color="([^"]*)")?\s*\/>/g;
const VERTEX_RE = /<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g;

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

export function decodeBambuPaintSlot(paintColor) {
  if (!paintColor || paintColor === "0") return null;

  let restante = paintColor;
  let slot = null;

  for (let i = SLOT_CODES.length - 1; i >= 0; i--) {
    const codigo = SLOT_CODES[i];
    if (restante.includes(codigo)) {
      restante = restante.split(codigo).join("");
      slot = i + 1;
    }
  }

  return slot;
}

function normalizarCorHex(hex) {
  if (!hex || typeof hex !== "string") return null;
  const limpo = hex.trim();
  if (!limpo) return null;
  const comHash = limpo.startsWith("#") ? limpo : `#${limpo}`;
  return comHash.toUpperCase();
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

function parseAssemblyComponents(mainModelXml) {
  const componentes = [];
  const re = /<component[^>]*\/>/gi;
  let match;

  while ((match = re.exec(mainModelXml)) !== null) {
    const tag = match[0];
    const pathAttr =
      tag.match(/p:path="([^"]*)"/i)?.[1] ?? tag.match(/\spath="([^"]*)"/i)?.[1];
    const objectId = parseInt(tag.match(/objectid="(\d+)"/i)?.[1] ?? "0", 10);
    const transform = tag.match(/transform="([^"]*)"/i)?.[1];

    if (!pathAttr || !objectId) continue;

    componentes.push({
      path: pathAttr.replace(/^\//, ""),
      objectId,
      transform: transform ? transform.trim().split(/\s+/).map(Number) : null,
    });
  }

  return componentes;
}

function extractInnerObjectXml(objectFileXml, objectId) {
  const re = new RegExp(`<object\\s+id="${objectId}"[\\s\\S]*?<\\/object>`, "i");
  return objectFileXml.match(re)?.[0] ?? null;
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

function parseObjectModelPath(mainModelXml) {
  const match = mainModelXml.match(/p:path="([^"]+\.model)"/i);
  if (!match) return "3D/Objects/object_1.model";
  return match[1].replace(/^\//, "");
}

function parseVertices(verticesXml) {
  const coords = [];
  let match;
  VERTEX_RE.lastIndex = 0;
  while ((match = VERTEX_RE.exec(verticesXml)) !== null) {
    coords.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
  }
  return coords;
}

function pushTriangle(positions, vertices, v1, v2, v3) {
  const i1 = v1 * 3;
  const i2 = v2 * 3;
  const i3 = v3 * 3;
  positions.push(
    vertices[i1], vertices[i1 + 1], vertices[i1 + 2],
    vertices[i2], vertices[i2 + 1], vertices[i2 + 2],
    vertices[i3], vertices[i3 + 1], vertices[i3 + 2]
  );
}

function matrixFrom3mfTransform(values) {
  const m = new THREE.Matrix4();
  if (!values || values.length < 12) return m.identity();
  m.set(
    values[0], values[3], values[6], values[9],
    values[1], values[4], values[7], values[10],
    values[2], values[5], values[8], values[11],
    0, 0, 0, 1
  );
  return m;
}

function buildColoredGroup(objectXml, filamentColours, defaultExtruder) {
  const verticesPart = objectXml.match(/<vertices>[\s\S]*?<\/vertices>/);
  const trianglesPart = objectXml.match(/<triangles>[\s\S]*?<\/triangles>/);

  if (!verticesPart || !trianglesPart) {
    throw new Error("3MF Bambu: mesh invÃ¡lido");
  }

  const vertices = parseVertices(verticesPart[0]);
  const buckets = new Map();
  let match;

  TRIANGLE_RE.lastIndex = 0;
  while ((match = TRIANGLE_RE.exec(trianglesPart[0])) !== null) {
    const v1 = parseInt(match[1], 10);
    const v2 = parseInt(match[2], 10);
    const v3 = parseInt(match[3], 10);
    const paintedSlot = decodeBambuPaintSlot(match[4]);
    const slot = paintedSlot ?? defaultExtruder;

    if (!buckets.has(slot)) buckets.set(slot, []);
    pushTriangle(buckets.get(slot), vertices, v1, v2, v3);
  }

  const group = new THREE.Group();

  for (const [slot, positions] of buckets) {
    if (!positions.length) continue;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(positions), 3)
    );
    geometry.computeVertexNormals();

    const colorHex = normalizarCorHex(filamentColours[slot - 1]) || "#CCCCCC";
    const material = new THREE.MeshPhongMaterial({
      color: new THREE.Color(colorHex),
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `filament-${slot}`;
    group.add(mesh);
  }

  return group;
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

  for (const component of components) {
    let objectFileXml = cache.get(component.path);
    if (!objectFileXml) {
      objectFileXml = lerTextoZip(arquivos, component.path);
      if (!objectFileXml) continue;
      cache.set(component.path, objectFileXml);
    }

    const innerXml = extractInnerObjectXml(objectFileXml, component.objectId);
    if (!innerXml) continue;

    const meta = partMetadata.get(component.objectId);
    const ehSuporte = isSupportPartMeta(meta, innerXml);

    const extruder =
      partExtruders.get(component.objectId) ?? meta?.extruder ?? defaultExtruder;
    const part = buildColoredGroup(innerXml, filamentColours, extruder);

    if (component.transform) {
      part.applyMatrix4(matrixFrom3mfTransform(component.transform));
    }

    if (ehSuporte) {
      marcarComoSuporte(part, component.objectId, meta);
      suportes += 1;
    }

    root.add(part);
  }

  if (!root.children.length) {
    throw new Error("3MF Bambu: montagem multi-peÃ§a vazia");
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

export function parseBambu3mfBuffer(buffer) {
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

  const components = parseAssemblyComponents(mainModel);

  let object;
  if (components.length <= 1 || objectXmlHasPaintColor(objectXml)) {
    object = buildColoredGroup(objectXml, filamentColours, defaultExtruder);
  } else {
    const partExtruders = parsePartExtruders(modelSettings);
    const partMetadata = parsePartMetadata(modelSettings);
    object = buildAssemblyGroup(
      components,
      arquivos,
      filamentColours,
      partExtruders,
      partMetadata,
      defaultExtruder
    );
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
