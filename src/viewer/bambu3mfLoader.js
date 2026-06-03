import * as THREE from 'three';
import { resolveProductAssetUrl } from '../utils/asset-url.js';
import {
  decodeBambuPaintSlot,
  getBambu3mfMeshXml,
  normalizeColorHex,
  parseFilamentColours,
  readBambu3mfZip,
} from './bambu3mfParse.js';

export { decodeBambuPaintSlot, extractFilamentColorsFrom3mfBuffer } from './bambu3mfParse.js';

const TRIANGLE_RE =
  /<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"(?:\s+paint_color="([^"]*)")?\s*\/>/g;
const VERTEX_RE = /<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g;

function parseDefaultExtruder(modelSettings) {
  if (!modelSettings) return 1;
  const match = modelSettings.match(/key="extruder"\s+value="(\d+)"/);
  return match ? parseInt(match[1], 10) : 1;
}

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
  const { objectXml, projectSettings, modelSettings } = getBambu3mfMeshXml(files);
  const filamentColours = parseFilamentColours(projectSettings);
  const defaultExtruder = parseDefaultExtruder(modelSettings);

  return buildColoredGroup(objectXml, filamentColours, defaultExtruder);
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
