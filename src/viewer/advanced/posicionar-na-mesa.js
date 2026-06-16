/**
 * Alinhamento na mesa de impressão e deteção de faces de apoio.
 */
import * as THREE from "three";

const NORMAL_MUNDO = new THREE.Vector3();
const MAT3 = new THREE.Matrix3();

/**
 * Alinha o ponto mais baixo do modelo à mesa (y = 0).
 */
export function alinharBaseNaMesa(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(box.min.y)) return 0;
  const delta = -box.min.y;
  if (Math.abs(delta) > 1e-6) object.position.y += delta;
  return delta;
}

/** Guarda posição de referência após centrar (para deslocamento manual). */
export function marcarPosicaoBaseMesa(object) {
  object.userData.mesaBasePos = object.position.clone();
  object.userData.mesaOffsetMm = { x: 0, z: 0 };
}

/** Centra o modelo na mesa (X/Z) e assenta a base em y = 0. */
export function centralizarNaMesa(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  alinharBaseNaMesa(object);
  marcarPosicaoBaseMesa(object);
}

/** Desloca o modelo no plano da mesa (mm). */
export function aplicarDeslocamentoMesa(object, xmm, zmm, mmParaCena) {
  if (!object.userData.mesaBasePos) marcarPosicaoBaseMesa(object);
  const base = object.userData.mesaBasePos;
  const fator = mmParaCena(1);
  object.userData.mesaOffsetMm = { x: xmm, z: zmm };
  object.position.x = base.x + xmm * fator;
  object.position.z = base.z + zmm * fator;
  alinharBaseNaMesa(object);
}

export function lerDeslocamentoMesa(object) {
  return object.userData.mesaOffsetMm || { x: 0, z: 0 };
}

/**
 * Analisa faces que apoiam na mesa (normal ≈ -Y, perto do mínimo Y).
 */
export function analisarFacesApoio(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const limiarY = box.min.y + Math.max(0.15, (box.max.y - box.min.y) * 0.02);
  const up = new THREE.Vector3(0, 1, 0);
  const pecas = [];

  object.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    if (child.userData?.isSupport) return;

    const geo = child.geometry;
    const norm = geo.attributes.normal;
    if (!norm) return;

    child.updateMatrixWorld(true);
    MAT3.getNormalMatrix(child.matrixWorld);

    let triangulosApoio = 0;
    let triangulos = 0;
    const passo = Math.max(1, Math.floor(norm.count / 4000));

    for (let i = 0; i < norm.count; i += passo) {
      NORMAL_MUNDO.fromBufferAttribute(norm, i).applyMatrix3(MAT3).normalize();
      triangulos += 1;
      if (NORMAL_MUNDO.dot(up) < -0.72) triangulosApoio += 1;
    }

    const boxPeca = new THREE.Box3().setFromObject(child);
    const apoia = boxPeca.min.y <= limiarY && triangulosApoio > 0;
    const nome =
      child.name ||
      child.parent?.name ||
      `Peça ${pecas.length + 1}`;

    pecas.push({
      nome,
      apoia,
      minY: boxPeca.min.y,
      pctApoio: triangulos
        ? Math.round((triangulosApoio / triangulos) * 100)
        : 0,
    });
  });

  return {
    minY: box.min.y,
    pecas: pecas.filter((p) => p.apoia || p.pctApoio > 5),
  };
}

export function secaoApoioMesa(analise) {
  if (!analise?.pecas?.length) return null;

  const itens = analise.pecas.map((p) => [
    p.nome,
    p.apoia
      ? `Apoio na mesa (~${p.pctApoio}% faces inferiores)`
      : `Sem apoio claro (${p.pctApoio}% faces inferiores)`,
  ]);

  return { titulo: "Apoio na mesa", itens };
}
