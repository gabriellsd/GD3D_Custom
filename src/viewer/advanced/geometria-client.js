import * as THREE from 'three';
import { analisarMeshesData } from './geometria-analise.js';

let worker = null;
let workerJobId = 0;
const SMALL_MESH_VERTEX_LIMIT = 12_000;

function serializeMeshes(object) {
  const meshes = [];
  let extraGroups = 0;

  object.traverse((filho) => {
    if (filho.isMesh && filho.geometry) {
      const geo = filho.geometry;
      const pos = geo.attributes.position;
      if (!pos) return;

      const positions = pos.array.slice(0, pos.count * 3);
      const indices = geo.index ? geo.index.array.slice(0, geo.index.count) : null;

      let materialCount = 0;
      let textureCount = 0;
      if (filho.material) {
        const lista = Array.isArray(filho.material) ? filho.material : [filho.material];
        materialCount = lista.length;
        for (const mat of lista) {
          if (mat.map || mat.normalMap || mat.roughnessMap || mat.metalnessMap) {
            textureCount += 1;
          }
        }
      }

      meshes.push({
        positions,
        indices,
        hasNormal: Boolean(geo.attributes.normal),
        hasUv: Boolean(geo.attributes.uv),
        hasColor: Boolean(geo.attributes.color),
        materialCount,
        textureCount,
        groupCount: filho.groups?.length || 0,
      });
    } else if (filho !== object && filho.children?.length > 0 && !filho.isMesh) {
      extraGroups += 1;
    }
  });

  if (extraGroups && meshes[0]) {
    meshes[0].groupCount += extraGroups;
  }

  return meshes;
}

function toThreeVectors(result) {
  return {
    ...result,
    tamanho: new THREE.Vector3(result.tamanho.x, result.tamanho.y, result.tamanho.z),
    centro: new THREE.Vector3(result.centro.x, result.centro.y, result.centro.z),
  };
}

function ensureWorker() {
  if (!worker) {
    worker = new Worker(new URL('./geometria-worker.js', import.meta.url), { type: 'module' });
  }
  return worker;
}

function analisarNoWorker(meshes) {
  const jobId = ++workerJobId;
  const w = ensureWorker();

  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (event.data?.jobId !== jobId) return;
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(toThreeVectors(event.data.result));
    };

    const onError = (err) => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      reject(err);
    };

    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ jobId, meshes });
  });
}

export async function analisarGeometriaAsync(object) {
  const meshes = serializeMeshes(object);
  const vertexCount = meshes.reduce((sum, mesh) => sum + mesh.positions.length / 3, 0);

  if (!meshes.length) {
    return toThreeVectors(analisarMeshesData([]));
  }

  if (vertexCount <= SMALL_MESH_VERTEX_LIMIT) {
    return toThreeVectors(analisarMeshesData(meshes));
  }

  try {
    return await analisarNoWorker(meshes);
  } catch {
    return toThreeVectors(analisarMeshesData(meshes));
  }
}
