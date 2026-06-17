import fs from 'fs';
import * as THREE from 'three';
import { parseBambu3mfBuffer } from '../src/viewer/advanced/bambu-3mf.js';
import {
  detectarCopiasMeshIguais,
  extrairMeshUnicoDeGrupo,
  juntarMeshesModelo,
} from '../src/viewer/advanced/juntar-pecas.js';

function statsObject(object, label) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  let tris = 0;
  object.traverse((c) => {
    if (!c.isMesh) return;
    tris += c.geometry.index ? c.geometry.index.count / 3 : c.geometry.attributes.position.count / 3;
  });
  console.log(label, 'children', object.children.length, 'tris', Math.round(tris), 'size', size.toArray().map((n) => +n.toFixed(2)));
  object.children.forEach((c, i) => {
    const b = new THREE.Box3().setFromObject(c);
    const s = b.getSize(new THREE.Vector3());
    let t = 0;
    c.traverse((m) => {
      if (m.isMesh && m.geometry) t += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3;
    });
    console.log('  child', i, c.name || '(sem nome)', 'tris', Math.round(t), 'size', s.toArray().map((n) => +n.toFixed(2)));
  });
}

function wrapLikeViewer(object) {
  const orientacao = new THREE.Group();
  orientacao.add(object);
  const root = new THREE.Group();
  root.add(orientacao);
  return root;
}

const platePath = 'public/products/Charizard Pokémon Figura Esqueleto Fóssil de Dragão.3mf';
const onePath = 'c:/Users/Gabriel/Downloads/Charizard_Skeleton_OnePiece.3mf';

for (const [label, fp, layout] of [
  ['plate-mesa', platePath, 'mesa'],
  ['plate-montado', platePath, 'montado'],
  ['onepiece-montado', onePath, 'montado'],
]) {
  const { object } = parseBambu3mfBuffer(fs.readFileSync(fp), { layout });
  statsObject(object, label);
}

console.log('\n--- Simular Montar peças (plate) ---');
const { object: montadoObj } = parseBambu3mfBuffer(fs.readFileSync(platePath), { layout: 'montado' });
const model = wrapLikeViewer(montadoObj);
const dup = detectarCopiasMeshIguais(model);
console.log('detectarCopiasMeshIguais', dup);

if (dup.duplicado) {
  const r = extrairMeshUnicoDeGrupo(model);
  statsObject(r.mesh.parent ? model : r.mesh, 'extrairMeshUnico');
  console.log('extrairMeshUnico pecasAntes', r.pecasAntes, 'copiaUnica', r.copiaUnica);
} else {
  const r = juntarMeshesModelo(model, { encaixarBbox: false, encaixarProximidade: false });
  statsObject(r.mesh, 'juntarMeshesModelo');
}

console.log('\n--- Simular Montar peças (onepiece) ---');
const { object: opObj } = parseBambu3mfBuffer(fs.readFileSync(onePath), { layout: 'montado' });
const opModel = wrapLikeViewer(opObj);
const r2 = juntarMeshesModelo(opModel, { encaixarBbox: false, encaixarProximidade: false });
statsObject(r2.mesh, 'onepiece-juntado');
