/**
 * Orientação automática para exibir modelos em Y-up (Three.js).
 * STL/3MF de impressão vêm em Z-up da placa; GLB/glTF já vêm em Y-up.
 */
import * as THREE from 'three';

const ZERO = { x: 0, y: 0, z: 0 };

const PRINT_CANDIDATES = [
  { x: 0, y: 0, z: 0 },
  { x: -Math.PI / 2, y: 0, z: 0 },
  { x: Math.PI / 2, y: 0, z: 0 },
  { x: Math.PI, y: 0, z: 0 },
  { x: 0, y: 0, z: Math.PI / 2 },
  { x: 0, y: 0, z: -Math.PI / 2 },
];

export function hasExplicitRotation(rot) {
  if (!rot) return false;
  const eps = 1e-6;
  return (
    Math.abs(rot.x ?? 0) > eps ||
    Math.abs(rot.y ?? 0) > eps ||
    Math.abs(rot.z ?? 0) > eps
  );
}

function measureBox(object, rotation = ZERO) {
  const clone = object.clone(true);
  clone.position.set(0, 0, 0);
  clone.rotation.set(rotation.x, rotation.y, rotation.z);
  clone.scale.set(1, 1, 1);
  clone.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(clone).getSize(new THREE.Vector3());
}

/** Maior altura Y com base compacta = modelo em pé na cena. */
function standUpScore(object, rotation) {
  const size = measureBox(object, rotation);
  const footprint = Math.max(size.x * size.z, 1e-6);
  const heightScore = (size.y * size.y) / footprint;
  // Desempate: convenção Z-up de impressão → -90° em X
  const bias = Math.abs(rotation.x + Math.PI / 2) < 1e-6 ? 1e-4 : 0;
  return heightScore + bias;
}

function bestStandUpRotation(object) {
  let best = PRINT_CANDIDATES[0];
  let bestScore = -Infinity;

  for (const candidate of PRINT_CANDIDATES) {
    const score = standUpScore(object, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return { ...best };
}

/**
 * @param {THREE.Object3D} object
 * @param {{ source?: 'print' | 'gltf' }} [options]
 */
export function computeStandUpRotation(object, { source = 'print' } = {}) {
  if (!object) return { ...ZERO };

  if (source === 'gltf') {
    const size = measureBox(object);
    if (size.y >= Math.max(size.x, size.z) * 1.08) return { ...ZERO };
  }

  return bestStandUpRotation(object);
}

export function resolveDisplayRotation(object, explicitRotation, options) {
  if (hasExplicitRotation(explicitRotation)) return explicitRotation;
  return computeStandUpRotation(object, options);
}
