const TEXTURE_KEYS = [
  'map',
  'normalMap',
  'emissiveMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'specularMap',
];

export function disposeMaterialDeep(material) {
  if (!material) return;
  const list = Array.isArray(material) ? material : [material];
  for (const mat of list) {
    if (!mat) continue;
    for (const key of TEXTURE_KEYS) {
      mat[key]?.dispose?.();
    }
    mat.dispose?.();
  }
}

export function disposeObject3D(object) {
  if (!object) return;
  object.traverse((child) => {
    child.geometry?.dispose?.();
    disposeMaterialDeep(child.material);
  });
}
