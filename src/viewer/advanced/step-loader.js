import * as THREE from 'three';

let occtPromise = null;

function getOcct() {
  if (!occtPromise) {
    occtPromise = import('occt-import-js').then((mod) => mod.default());
  }
  return occtPromise;
}

function meshDataToThree(meshData) {
  const positions = meshData?.attributes?.position?.array;
  if (!positions?.length) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const indices = meshData?.index?.array;
  if (indices?.length) {
    geometry.setIndex(Array.from(indices));
  }

  geometry.computeVertexNormals();

  const rgb = meshData?.color;
  const color =
    Array.isArray(rgb) && rgb.length >= 3
      ? new THREE.Color(rgb[0], rgb[1], rgb[2])
      : new THREE.Color(0xcccccc);

  const material = new THREE.MeshPhongMaterial({ color, flatShading: true });
  return new THREE.Mesh(geometry, material);
}

function meshesToGroup(meshes) {
  const group = new THREE.Group();
  for (const meshData of meshes || []) {
    const mesh = meshDataToThree(meshData);
    if (mesh) group.add(mesh);
  }
  if (!group.children.length) {
    throw new Error('STEP sem geometria legível');
  }
  return group;
}

/** Converte buffer STEP/STP em `THREE.Group` (OpenCascade via WASM). */
export async function carregarStep(buffer) {
  const occt = await getOcct();
  const fileBuffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const result = occt.ReadStepFile(fileBuffer, null);

  if (result?.meshes?.length) {
    return meshesToGroup(result.meshes);
  }

  throw new Error(result?.error || 'Não foi possível importar o ficheiro STEP');
}
