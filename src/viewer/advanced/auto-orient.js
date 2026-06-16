/**
 * Auto-orientação para impressão (maximiza contato com a mesa).
 */
import * as THREE from "three";

const CANDIDATOS = [];

for (let ix = 0; ix < 4; ix++) {
  for (let iz = 0; iz < 4; iz++) {
    const q = new THREE.Quaternion();
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (ix * Math.PI) / 2);
    const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (iz * Math.PI) / 2);
    q.multiply(qx).multiply(qz);
    CANDIDATOS.push(q);
  }
}

function scoreOrientacao(object, quaternion) {
  const clone = object.clone(true);
  clone.quaternion.copy(quaternion);
  clone.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  const altura = size.y || 1;
  const areaBase = size.x * size.z;

  let overhangs = 0;
  let contato = 0;
  const normalWorld = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  clone.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const geo = child.geometry;
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    if (!pos || !norm) return;

    const m3 = new THREE.Matrix3().getNormalMatrix(child.matrixWorld);
    const amostra = Math.max(1, Math.floor(norm.count / 200));

    for (let i = 0; i < norm.count; i += amostra) {
      normalWorld.fromBufferAttribute(norm, i).applyMatrix3(m3).normalize();
      const dotUp = normalWorld.dot(up);
      if (dotUp < -0.3) overhangs += 1;
      if (dotUp < -0.85) contato += 1;
    }
  });

  clone.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
      else c.material.dispose();
    }
  });

  return contato * 2 + areaBase / altura - overhangs * 0.5;
}

export function calcularAutoOrientacao(object) {
  let melhor = CANDIDATOS[0];
  let melhorScore = -Infinity;

  for (const q of CANDIDATOS) {
    const s = scoreOrientacao(object, q);
    if (s > melhorScore) {
      melhorScore = s;
      melhor = q;
    }
  }

  return melhor.clone();
}

export function aplicarAutoOrientacao(modelPivot, quaternion) {
  const orientacao = modelPivot.children[0]?.children[0];
  if (orientacao) {
    orientacao.quaternion.copy(quaternion);
    orientacao.updateMatrixWorld(true);
    return orientacao;
  }
  modelPivot.quaternion.copy(quaternion);
  return modelPivot;
}
