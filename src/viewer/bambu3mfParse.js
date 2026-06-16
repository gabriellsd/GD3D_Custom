import * as fflate from 'three/addons/libs/fflate.module.js';
import * as THREE from 'three';

/** Códigos Bambu/Orca por slot de filamento (1-based após decode). */
const SLOT_CODES = [
  '4',
  '8',
  '0C',
  '1C',
  '2C',
  '3C',
  '4C',
  '5C',
  '6C',
  '7C',
  '8C',
  '9C',
  'AC',
  'BC',
  'CC',
  'DC',
  'EC',
  'FC',
];

const TRIANGLE_RE =
  /<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"(?:\s+paint_color="([^"]*)")?\s*\/>/g;
const VERTEX_RE = /<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g;

export function decodeBambuPaintSlot(paintColor) {
  if (!paintColor || paintColor === '0') return null;

  let remaining = paintColor;
  let slot = null;

  for (let i = SLOT_CODES.length - 1; i >= 0; i--) {
    const code = SLOT_CODES[i];
    if (remaining.includes(code)) {
      remaining = remaining.split(code).join('');
      slot = i + 1;
    }
  }

  return slot;
}

export function normalizeColorHex(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const trimmed = hex.trim();
  if (!trimmed) return null;
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(withHash)) return withHash.toUpperCase();
  return withHash.toUpperCase();
}

function zipKey(files, suffix) {
  const normalized = suffix.replace(/^\//, '');
  return (
    Object.keys(files).find((k) => k.replace(/\\/g, '/').endsWith(normalized)) ?? null
  );
}

function readZipText(files, suffix) {
  const key = zipKey(files, suffix);
  if (!key) return null;
  return new TextDecoder().decode(files[key]);
}

export function parseFilamentColours(projectSettings) {
  if (!projectSettings) return [];

  const block = projectSettings.match(/"filament_colour"\s*:\s*\[([\s\S]*?)\]/);
  if (!block) return [];

  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter(Boolean);
}

function parseDefaultExtruder(modelSettings) {
  if (!modelSettings) return 1;
  const match = modelSettings.match(/key="extruder"\s+value="(\d+)"/);
  return match ? parseInt(match[1], 10) : 1;
}

export { parseDefaultExtruder };

/** Componentes multi-peça (ex.: corpo + rosto + olhos montados por transform). */
export function parseAssemblyComponents(mainModelXml, defaultPath = null) {
  const components = [];
  const seen = new Set();

  function addComponent(tag) {
    const pathAttr =
      tag.match(/p:path="([^"]*)"/i)?.[1] ??
      tag.match(/\spath="([^"]*)"/i)?.[1] ??
      defaultPath;
    const objectId = parseInt(tag.match(/objectid="(\d+)"/i)?.[1] ?? '0', 10);
    const transform = tag.match(/transform="([^"]*)"/i)?.[1];

    if (!pathAttr || !objectId) return;

    const key = `${pathAttr}:${objectId}:${transform ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);

    components.push({
      path: pathAttr.replace(/^\//, ''),
      objectId,
      transform: transform ? transform.trim().split(/\s+/).map(Number) : null,
    });
  }

  if (!mainModelXml) return components;

  const selfClosing = /<component\b[^>]*\/>/gi;
  let match;
  while ((match = selfClosing.exec(mainModelXml)) !== null) {
    addComponent(match[0]);
  }

  const paired = /<component\b([^>]*)>[\s\S]*?<\/component>/gi;
  while ((match = paired.exec(mainModelXml)) !== null) {
    addComponent(`<component ${match[1]}>`);
  }

  return components;
}

export function buildObjectIdPathMap(files) {
  const map = new Map();

  for (const key of Object.keys(files)) {
    const path = key.replace(/\\/g, '/');
    if (!path.endsWith('.model')) continue;

    const xml = readZipText(files, path);
    if (!xml) continue;

    for (const match of xml.matchAll(/<object\s+id="(\d+)"/gi)) {
      const id = parseInt(match[1], 10);
      if (!map.has(id)) map.set(id, path);
    }
  }

  return map;
}

export function enrichComponentPaths(components, objectIdPathMap, defaultPath) {
  return components.map((component) => ({
    ...component,
    path:
      component.path ||
      objectIdPathMap.get(component.objectId) ||
      defaultPath ||
      '3D/3dmodel.model',
  }));
}

export function objectXmlHasMesh(objectXml) {
  if (!objectXml) return false;
  return /<mesh[\s>]/i.test(objectXml) || /<vertices>/i.test(objectXml);
}

function dedupeComponents(components) {
  const seen = new Set();
  const out = [];

  for (const component of components) {
    const key = `${component.path}:${component.objectId}:${component.transform ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(component);
  }

  return out;
}

function compose3mfTransforms(parent, child) {
  if (!parent) return child;
  if (!child) return parent;

  const a = parent;
  const b = child;

  return [
    a[0] * b[0] + a[3] * b[1] + a[6] * b[2],
    a[1] * b[0] + a[4] * b[1] + a[7] * b[2],
    a[2] * b[0] + a[5] * b[1] + a[8] * b[2],
    a[0] * b[3] + a[3] * b[4] + a[6] * b[5],
    a[1] * b[3] + a[4] * b[4] + a[7] * b[5],
    a[2] * b[3] + a[5] * b[4] + a[8] * b[5],
    a[0] * b[6] + a[3] * b[7] + a[6] * b[8],
    a[1] * b[6] + a[4] * b[7] + a[7] * b[8],
    a[2] * b[6] + a[5] * b[7] + a[8] * b[8],
    a[0] * b[9] + a[3] * b[10] + a[6] * b[11] + a[9],
    a[1] * b[9] + a[4] * b[10] + a[7] * b[11] + a[10],
    a[2] * b[9] + a[5] * b[10] + a[8] * b[11] + a[11],
  ];
}

export function flattenAssemblyComponents(components, files, options = {}) {
  const objectIdPathMap = options.objectIdPathMap || buildObjectIdPathMap(files);
  const defaultPath = options.defaultPath || '3D/Objects/object_1.model';
  const mainPath = '3D/3dmodel.model';
  const cache = new Map();
  const leaves = [];

  function readModel(path) {
    const normalized = path.replace(/^\//, '');
    if (cache.has(normalized)) return cache.get(normalized);
    const xml = readZipText(files, normalized);
    cache.set(normalized, xml);
    return xml;
  }

  function resolveInnerXml(path, objectId) {
    const fileXml = readModel(path);
    if (fileXml) {
      const inner = extractInnerObjectXml(fileXml, objectId);
      if (inner) return { innerXml: inner, path };
    }

    const mainXml = readModel(mainPath);
    if (mainXml) {
      const inner = extractInnerObjectXml(mainXml, objectId);
      if (inner) return { innerXml: inner, path: mainPath };
    }

    return null;
  }

  function walk(component, parentTransform = null) {
    const path = (
      component.path ||
      objectIdPathMap.get(component.objectId) ||
      defaultPath
    ).replace(/^\//, '');

    const resolved = resolveInnerXml(path, component.objectId);
    if (!resolved) return;

    const transform = compose3mfTransforms(
      parentTransform,
      options.stripTranslation && component.transform
        ? stripTranslationTransform(component.transform)
        : component.transform
    );
    const { innerXml } = resolved;

    if (objectXmlHasMesh(innerXml)) {
      leaves.push({
        path: resolved.path,
        objectId: component.objectId,
        transform,
        innerXml,
      });
      return;
    }

    const subs = parseAssemblyComponents(innerXml, resolved.path);
    if (subs.length) {
      for (const sub of subs) {
        walk(
          {
            ...sub,
            path: sub.path || resolved.path,
          },
          transform
        );
      }
    }
  }

  for (const component of enrichComponentPaths(components, objectIdPathMap, defaultPath)) {
    walk(component);
  }

  return leaves;
}

export function parseObjectModelPath(mainModelXml) {
  const match = mainModelXml.match(/p:path="([^"]+\.model)"/i);
  if (!match) return '3D/Objects/object_1.model';
  return match[1].replace(/^\//, '');
}

export function parseBuildItems(mainModelXml, objectPath, objectIdPathMap = null) {
  const items = [];
  const seen = new Set();
  const re = /<item\b([^>]*?)(?:\/>|>)/gi;
  let match;

  while ((match = re.exec(mainModelXml)) !== null) {
    const attrs = match[1];
    const objectId = parseInt(attrs.match(/objectid="(\d+)"/i)?.[1] ?? '0', 10);
    const transform = attrs.match(/transform="([^"]*)"/i)?.[1];
    if (!objectId) continue;

    const path = objectIdPathMap?.get(objectId) || objectPath;
    const key = `${path}:${objectId}:${transform ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      path,
      objectId,
      transform: transform ? transform.trim().split(/\s+/).map(Number) : null,
    });
  }

  return items;
}

export function stripTranslationTransform(transform) {
  if (!transform || transform.length < 12) return transform;
  return [
    transform[0], transform[1], transform[2],
    transform[3], transform[4], transform[5],
    transform[6], transform[7], transform[8],
    0, 0, 0,
  ];
}

function matrix4From3mf(values) {
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

function matrix4To3mf(m) {
  const e = m.elements;
  return [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10], e[12], e[13], e[14]];
}

/** Pose de B relativa a A na placa (inv(A)·B). */
export function relative3mfTransform(base, other) {
  const mb = matrix4From3mf(base);
  mb.invert();
  mb.multiply(matrix4From3mf(other));
  return matrix4To3mf(mb);
}

function resolverMontagemMontado(
  objectPath,
  objectFileXml,
  files,
  { objectIdPathMap, buildItems, componentesObjeto, uniqueBuildIds }
) {
  const mapLeaves = (leaves) =>
    leaves.map(({ path, objectId, transform, innerXml }) => ({
      path,
      objectId,
      transform,
      innerXml,
    }));

  const flattenOpts = {
    objectIdPathMap,
    defaultPath: objectPath,
    stripTranslation: false,
  };

  // Montagem interna do ficheiro do objeto (corpo + cauda desenhados)
  if (files && componentesObjeto.length >= 2) {
    const candidates = enrichComponentPaths(
      componentesObjeto,
      objectIdPathMap,
      objectPath
    );
    const leaves = flattenAssemblyComponents(candidates, files, flattenOpts);
    if (leaves.length >= 2) return mapLeaves(leaves);
  }

  // Um objecto na placa → expandir sub-peças (sem offset da mesa)
  if (files && buildItems.length >= 1 && uniqueBuildIds.size === 1) {
    const root = buildItems[0];
    const transform = root.transform
      ? stripTranslationTransform(root.transform)
      : root.transform;
    const candidates = enrichComponentPaths(
      [{ path: objectPath, objectId: root.objectId, transform }],
      objectIdPathMap,
      objectPath
    );
    const leaves = flattenAssemblyComponents(candidates, files, flattenOpts);
    if (leaves.length > 0) return mapLeaves(leaves);
  }

  // Várias peças na placa (split para impressão) → pose relativa à primeira
  if (files && buildItems.length >= 2) {
    const leaves = [];
    const baseT = buildItems[0].transform;

    for (let i = 0; i < buildItems.length; i++) {
      const item = buildItems[i];
      let transform = null;

      if (i === 0) {
        transform = item.transform
          ? stripTranslationTransform(item.transform)
          : null;
      } else if (baseT && item.transform) {
        transform = relative3mfTransform(baseT, item.transform);
      }

      const candidates = enrichComponentPaths(
        [{ path: item.path || objectPath, objectId: item.objectId, transform }],
        objectIdPathMap,
        objectPath
      );
      leaves.push(...flattenAssemblyComponents(candidates, files, flattenOpts));
    }

    if (leaves.length > 0) return mapLeaves(leaves);
  }

  if (files && componentesObjeto.length > 0) {
    const candidates = enrichComponentPaths(
      componentesObjeto,
      objectIdPathMap,
      objectPath
    );
    const leaves = flattenAssemblyComponents(candidates, files, flattenOpts);
    if (leaves.length > 0) return mapLeaves(leaves);
  }

  return [];
}

/** Montagem interna do modelo (sem posição na mesa de impressão). */
function resolverMontagemAssembly(
  objectPath,
  files,
  { objectIdPathMap, buildItems, componentesObjeto, uniqueBuildIds }
) {
  const mapLeaves = (leaves) =>
    leaves.map(({ path, objectId, transform, innerXml }) => ({
      path,
      objectId,
      transform,
      innerXml,
    }));

  const flattenOpts = {
    objectIdPathMap,
    defaultPath: objectPath,
    stripTranslation: false,
  };

  if (files && componentesObjeto.length >= 2) {
    const candidates = enrichComponentPaths(
      componentesObjeto,
      objectIdPathMap,
      objectPath
    );
    const leaves = flattenAssemblyComponents(candidates, files, flattenOpts);
    if (leaves.length >= 2) return mapLeaves(leaves);
  }

  if (files && buildItems.length >= 1 && uniqueBuildIds.size === 1) {
    const root = buildItems[0];
    const candidates = enrichComponentPaths(
      [{ path: objectPath, objectId: root.objectId, transform: null }],
      objectIdPathMap,
      objectPath
    );
    const leaves = flattenAssemblyComponents(candidates, files, flattenOpts);
    if (leaves.length >= 2) return mapLeaves(leaves);
  }

  if (files && buildItems.length >= 1) {
    const leaves = [];
    for (const item of buildItems) {
      const candidates = enrichComponentPaths(
        [{ path: item.path || objectPath, objectId: item.objectId, transform: null }],
        objectIdPathMap,
        objectPath
      );
      leaves.push(...flattenAssemblyComponents(candidates, files, flattenOpts));
    }
    if (leaves.length >= 2) return mapLeaves(leaves);
  }

  return [];
}

export function resolverMontagem(mainModelXml, objectPath, objectFileXml, files, options = {}) {
  const layout = options.layout === 'montado'
    ? 'montado'
    : options.layout === 'assembly'
      ? 'assembly'
      : 'mesa';
  const objectIdPathMap = files ? buildObjectIdPathMap(files) : new Map();

  const componentesObjeto = parseAssemblyComponents(objectFileXml || '', objectPath);
  const componentesMain = parseAssemblyComponents(mainModelXml, objectPath);
  const components = dedupeComponents([...componentesObjeto, ...componentesMain]);
  const buildItems = parseBuildItems(mainModelXml, objectPath, objectIdPathMap);

  const mapLeaves = (leaves) =>
    leaves.map(({ path, objectId, transform, innerXml }) => ({
      path,
      objectId,
      transform,
      innerXml,
    }));

  const uniqueBuildIds = new Set(buildItems.map((b) => b.objectId));

  if (layout === 'assembly') {
    const assembly = resolverMontagemAssembly(objectPath, files, {
      objectIdPathMap,
      buildItems,
      componentesObjeto,
      uniqueBuildIds,
    });
    if (assembly.length > 0) return assembly;
    return [];
  }

  if (layout === 'montado') {
    const montado = resolverMontagemMontado(objectPath, objectFileXml, files, {
      objectIdPathMap,
      buildItems,
      componentesObjeto,
      uniqueBuildIds,
    });
    if (montado.length > 0) return montado;
    return [];
  }

  const flattenOpts = {
    objectIdPathMap,
    defaultPath: objectPath,
    stripTranslation: false,
  };

  // Um objeto na placa (1 ou N instâncias) → expandir sub-peças, nunca duplicar o modelo inteiro
  if (files && buildItems.length >= 1 && uniqueBuildIds.size === 1) {
    const root = buildItems[0];
    const candidates = enrichComponentPaths(
      [{ path: objectPath, objectId: root.objectId, transform: root.transform }],
      objectIdPathMap,
      objectPath
    );
    const leaves = flattenAssemblyComponents(candidates, files, flattenOpts);
    if (leaves.length > 0) return mapLeaves(leaves);
  }

  if (files && buildItems.length > 1 && uniqueBuildIds.size > 1) {
    const candidates = enrichComponentPaths(buildItems, objectIdPathMap, objectPath);
    const leaves = flattenAssemblyComponents(candidates, files, flattenOpts);
    if (leaves.length > 0) return mapLeaves(leaves);
    return candidates;
  }

  if (files && componentesObjeto.length > 0) {
    const candidates = enrichComponentPaths(componentesObjeto, objectIdPathMap, objectPath);
    const leaves = flattenAssemblyComponents(candidates, files, flattenOpts);
    if (leaves.length > 0) return mapLeaves(leaves);
  }

  let candidates;

  if (components.length > 1) {
    candidates = components;
  } else if (buildItems.length > 1) {
    candidates = buildItems;
  } else if (components.length === 1) {
    candidates = components;
  } else if (buildItems.length === 1) {
    candidates = buildItems;
  } else {
    return [];
  }

  candidates = enrichComponentPaths(candidates, objectIdPathMap, objectPath);

  if (!files) return candidates;

  const leaves = flattenAssemblyComponents(candidates, files, {
    objectIdPathMap,
    defaultPath: objectPath,
    stripTranslation: false,
  });

  if (leaves.length > 0) {
    return leaves.map(({ path, objectId, transform, innerXml }) => ({
      path,
      objectId,
      transform,
      innerXml,
    }));
  }

  return candidates;
}

export function extractInnerObjectXml(objectFileXml, objectId) {
  const re = new RegExp(`<object\\s+id="${objectId}"[\\s\\S]*?<\\/object>`, 'i');
  return objectFileXml.match(re)?.[0] ?? null;
}

/** Extruder por part id (1-based) em model_settings.config. */
export function parsePartExtruders(modelSettings) {
  const map = new Map();
  if (!modelSettings) return map;

  const partRe = /<part id="(\d+)"[\s\S]*?<\/part>/gi;
  let match;

  while ((match = partRe.exec(modelSettings)) !== null) {
    const partId = parseInt(match[1], 10);
    const extruders = [...match[0].matchAll(/key="extruder"\s+value="(\d+)"/gi)];
    const ext = extruders.at(-1)?.[1];
    if (ext) map.set(partId, parseInt(ext, 10));
  }

  return map;
}

export function readZipEntryText(files, suffix) {
  return readZipText(files, suffix);
}

/** Multicolor AMS: triângulos com paint_color no mesh (ex.: Pikachu, Mewtwo). */
export function objectXmlHasPaintColor(objectXml) {
  if (!objectXml) return false;
  return /<triangle[^>]*paint_color="(?!0")[^"]+"/i.test(objectXml);
}

const SUPPORT_PART_RE =
  /support|suporte|generic|générique|generique|cube|brim|skirt|raft|pin|dummy|placeholder|prime/i;

/** Metadados por part id em model_settings.config. */
export function parsePartMetadata(modelSettings) {
  const map = new Map();
  if (!modelSettings) return map;

  const partRe = /<part id="(\d+)"[\s\S]*?<\/part>/gi;
  let match;

  while ((match = partRe.exec(modelSettings)) !== null) {
    const partId = parseInt(match[1], 10);
    const block = match[0];
    const name = block.match(/key="name"\s+value="([^"]*)"/i)?.[1] ?? '';
    const subtype = block.match(/subtype="([^"]*)"/i)?.[1] ?? '';
    const extruder = block.match(/key="extruder"\s+value="(\d+)"/i)?.[1];

    if (!map.has(partId)) {
      map.set(partId, {
        name,
        subtype,
        extruder: extruder ? parseInt(extruder, 10) : null,
      });
    }
  }

  return map;
}

export function isSupportPartMeta(meta, innerObjectXml) {
  if (meta?.name && SUPPORT_PART_RE.test(meta.name)) return true;
  if (meta?.subtype && /support/i.test(meta.subtype)) return true;

  const triCount = (innerObjectXml?.match(/<triangle/g) || []).length;
  const hasPaint = objectXmlHasPaintColor(innerObjectXml);
  if (triCount > 0 && triCount < 100 && !hasPaint) return true;

  return false;
}

function collectUsedSlots(objectXml, defaultExtruder) {
  const trianglesPart = objectXml.match(/<triangles>[\s\S]*?<\/triangles>/);
  if (!trianglesPart) return new Set();

  const used = new Set();
  let match;

  while ((match = TRIANGLE_RE.exec(trianglesPart[0])) !== null) {
    const paintedSlot = decodeBambuPaintSlot(match[4]);
    used.add(paintedSlot ?? defaultExtruder);
  }

  return used;
}

/**
 * Cores de filamento realmente usadas no mesh (ordem estável por slot).
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string[]}
 */
export function extractFilamentColorsFrom3mfBuffer(buffer) {
  const files = fflate.unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));

  const mainModel = readZipText(files, '3D/3dmodel.model');
  if (!mainModel) return [];

  const projectSettings = readZipText(files, 'Metadata/project_settings.config');
  const modelSettings = readZipText(files, 'Metadata/model_settings.config');
  const filamentColours = parseFilamentColours(projectSettings);
  const defaultExtruder = parseDefaultExtruder(modelSettings);
  const objectPath = parseObjectModelPath(mainModel);
  const objectFileXml = readZipText(files, objectPath);
  const components = resolverMontagem(mainModel, objectPath, objectFileXml, files);

  if (components.length > 1) {
    const partExtruders = parsePartExtruders(modelSettings);
    const slots = new Set([defaultExtruder, ...partExtruders.values()]);
    const seen = new Set();
    const colors = [];

    for (const slot of [...slots].sort((a, b) => a - b)) {
      const hex = normalizeColorHex(filamentColours[slot - 1]);
      if (!hex || seen.has(hex)) continue;
      seen.add(hex);
      colors.push(hex);
    }

    return colors;
  }

  const objectXml = readZipText(files, objectPath);
  if (!objectXml) return [];

  const usedSlots = [...collectUsedSlots(objectXml, defaultExtruder)].sort((a, b) => a - b);
  const seen = new Set();
  const colors = [];

  for (const slot of usedSlots) {
    const hex = normalizeColorHex(filamentColours[slot - 1]);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    colors.push(hex);
  }

  return colors;
}

export function readBambu3mfZip(buffer) {
  return fflate.unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
}

export function getBambu3mfMeshXml(files) {
  const mainModel = readZipText(files, '3D/3dmodel.model');
  if (!mainModel) throw new Error('3MF Bambu: 3dmodel.model em falta');

  const objectPath = parseObjectModelPath(mainModel);
  const objectXml = readZipText(files, objectPath);
  if (!objectXml) throw new Error(`3MF Bambu: ${objectPath} em falta`);

  return {
    objectXml,
    projectSettings: readZipText(files, 'Metadata/project_settings.config'),
    modelSettings: readZipText(files, 'Metadata/model_settings.config'),
  };
}

export { VERTEX_RE, TRIANGLE_RE };
