import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolveProductAssetUrl } from '../utils/asset-url.js';

const gltfLoader = new GLTFLoader();
const glbCache = new Map();
const glbInflight = new Map();

export function loadGlbObject(url) {
  const resolved = resolveProductAssetUrl(url);
  if (glbCache.has(resolved)) {
    return Promise.resolve(glbCache.get(resolved).clone(true));
  }
  if (glbInflight.has(resolved)) return glbInflight.get(resolved);

  const promise = gltfLoader
    .loadAsync(resolved)
    .then((gltf) => {
      glbCache.set(resolved, gltf.scene);
      return gltf.scene.clone(true);
    })
    .finally(() => glbInflight.delete(resolved));

  glbInflight.set(resolved, promise);
  return promise;
}
