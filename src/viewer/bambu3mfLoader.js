import * as THREE from 'three';
import { resolveProductAssetUrl } from '../utils/asset-url.js';
import {
  decodeBambuPaintSlot,
  extractInnerObjectXml,
  getBambu3mfMeshXml,
  isSupportPartMeta,
  normalizeColorHex,
  objectXmlHasPaintColor,
  parseAssemblyComponents,
  parseDefaultExtruder,
  parseFilamentColours,
  parsePartExtruders,
  parsePartMetadata,
  readBambu3mfZip,
  readZipEntryText,
} from './bambu3mfParse.js';

export { decodeBambuPaintSlot, extractFilamentColorsFrom3mfBuffer } from './bambu3mfParse.js';

const TRIANGLE_RE =
  /<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"(?:\s+paint_color="([^"]*)")?\s*\/>/g;
const VERTEX_RE = /<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g;

function parseVertices(verticesXml) {
  const coords = [];
  let match;

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
    vertices[i1],
    vertices[i1 + 1],
    vertices[i1 + 2],
    vertices[i2],
    vertices[i2 + 1],
    vertices[i2 + 2],
    vertices[i3],
    vertices[i3 + 1],
    vertices[i3 + 2]
  );
}

function matrixFrom3mfTransform(values) {
  const m = new THREE.Matrix4();
  if (!values || values.length < 12) return m.identity();
  m.set(
    values[0],
    values[3],
    values[6],
    values[9],
    values[1],
    values[4],
    values[7],
    values[10],
    values[2],
    values[5],
    values[8],
    values[11],
    0,
    0,
    0,
    1
  );
  return m;
}

function buildAssemblyGroup(
  components,
  files,
  filamentColours,
  partExtruders,
  partMetadata,
  defaultExtruder
) {
  const root = new THREE.Group();
  const objectCache = new Map();

  for (const component of components) {
    let objectFileXml = objectCache.get(component.path);
    if (!objectFileXml) {
      objectFileXml = readZipEntryText(files, component.path);
      if (!objectFileXml) continue;
      objectCache.set(component.path, objectFileXml);
    }

    const innerXml = extractInnerObjectXml(objectFileXml, component.objectId);
    if (!innerXml) continue;

    const meta = partMetadata.get(component.objectId);
    if (isSupportPartMeta(meta, innerXml)) continue;

    const extruder = partExtruders.get(component.objectId) ?? meta?.extruder ?? defaultExtruder;
    const part = buildColoredGroup(innerXml, filamentColours, extruder);

    if (component.transform) {
      part.applyMatrix4(matrixFrom3mfTransform(component.transform));
    }

    root.add(part);
  }

  if (!root.children.length) {
    throw new Error('3MF Bambu: montagem multi-peça vazia');
  }

  return root;
}

function buildColoredGroup(objectXml, filamentColours, defaultExtruder) {
  const verticesPart = objectXml.match(/<vertices>[\s\S]*?<\/vertices>/);
  const trianglesPart = objectXml.match(/<triangles>[\s\S]*?<\/triangles>/);

  if (!verticesPart || !trianglesPart) {
    throw new Error('3MF Bambu: mesh inválido');
  }

  const vertices = parseVertices(verticesPart[0]);
  const buckets = new Map();
  let match;

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
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(positions), 3)
    );
    geometry.computeVertexNormals();

    const colorHex = normalizeColorHex(filamentColours[slot - 1]) || '#CCCCCC';
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

/**
 * Carrega 3MF Bambu com paint_color (multicolor AMS).
 */
export function parseBambu3mfBuffer(buffer) {
  const files = readBambu3mfZip(buffer);
  const mainModel = readZipEntryText(files, '3D/3dmodel.model');
  if (!mainModel) throw new Error('3MF Bambu: 3dmodel.model em falta');

  const projectSettings = readZipEntryText(files, 'Metadata/project_settings.config');
  const modelSettings = readZipEntryText(files, 'Metadata/model_settings.config');
  const filamentColours = parseFilamentColours(projectSettings);
  const defaultExtruder = parseDefaultExtruder(modelSettings);

  const { objectXml } = getBambu3mfMeshXml(files);
  const components = parseAssemblyComponents(mainModel);

  // AMS multicolor (paint_color): mesh único — ignora suportes em componentes extra.
  if (components.length <= 1 || objectXmlHasPaintColor(objectXml)) {
    return buildColoredGroup(objectXml, filamentColours, defaultExtruder);
  }

  const partExtruders = parsePartExtruders(modelSettings);
  const partMetadata = parsePartMetadata(modelSettings);
  return buildAssemblyGroup(
    components,
    files,
    filamentColours,
    partExtruders,
    partMetadata,
    defaultExtruder
  );
}

export function loadBambuPaint3mf(url, onLoad, onProgress, onError) {
  fetch(resolveProductAssetUrl(url))
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((buffer) => {
      onProgress?.({ loaded: buffer.byteLength, total: buffer.byteLength });
      onLoad(parseBambu3mfBuffer(buffer));
    })
    .catch((err) => {
      console.warn('Bambu 3MF loader:', err);
      onError?.(err);
    });
}
