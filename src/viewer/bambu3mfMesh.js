import * as THREE from 'three';
import {
  decodeBambuPaintSlot,
  normalizeColorHex,
  TRIANGLE_RE,
  VERTEX_RE,
} from './bambu3mfParse.js';

export function parseVerticesFromXml(verticesXml) {
  const coords = [];
  let match;
  VERTEX_RE.lastIndex = 0;
  while ((match = VERTEX_RE.exec(verticesXml)) !== null) {
    coords.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
  }
  return coords;
}

export function pushTrianglePositions(positions, vertices, v1, v2, v3) {
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

export function matrixFrom3mfTransform(values) {
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

/** Malha multicolor Bambu/Orca a partir do XML de um object. */
export function buildColoredFilamentGroup(objectXml, filamentColours, defaultExtruder) {
  const verticesPart = objectXml.match(/<vertices>[\s\S]*?<\/vertices>/);
  const trianglesPart = objectXml.match(/<triangles>[\s\S]*?<\/triangles>/);

  if (!verticesPart || !trianglesPart) {
    throw new Error('3MF Bambu: mesh inválido');
  }

  const vertices = parseVerticesFromXml(verticesPart[0]);
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
    pushTrianglePositions(buckets.get(slot), vertices, v1, v2, v3);
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
