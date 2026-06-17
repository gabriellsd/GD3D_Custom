import fs from 'fs';
import * as THREE from 'three';
import { parseBambu3mfBuffer } from '../src/viewer/advanced/bambu-3mf.js';
import {
  juntarMeshesModelo,
  contarPecasVisiveis,
} from '../src/viewer/advanced/juntar-pecas.js';
import {
  resolverMontagem,
  parseObjectModelPath,
  readBambu3mfZip,
} from '../src/viewer/bambu3mfParse.js';

function wrap(object) {
  const orientacao = new THREE.Group();
  orientacao.add(object);
  const model = new THREE.Group();
  model.add(orientacao);
  return model;
}

function sim(fp, label) {
  if (!fs.existsSync(fp)) {
    console.log('MISSING', label);
    return;
  }
  const buf = fs.readFileSync(fp);
  const pecasAntes = contarPecasVisiveis(
    wrap(parseBambu3mfBuffer(buf, { layout: 'mesa' }).object)
  );
  const montado = parseBambu3mfBuffer(buf, { layout: 'montado' }).object;
  const model = wrap(montado);

  const zip = readBambu3mfZip(buf);
  const main = new TextDecoder().decode(zip['3D/3dmodel.model']);
  const op = parseObjectModelPath(main);
  const ox = new TextDecoder().decode(zip[op.replace(/^\//, '')]);
  const comps = resolverMontagem(main, op, ox, zip, { layout: 'montado' });

  console.log('\n===', label, '===');
  console.log('pecasAntes', pecasAntes);
  console.log(
    'montado groups',
    montado.children.map((c) => `${c.name} vis=${c.visible}`)
  );
  console.log(
    'leaves',
    comps.length,
    comps.map(
      (c) =>
        `id${c.objectId} t=[${(c.transform ?? [])
          .slice(9, 12)
          .map((n) => n.toFixed(1))
          .join(',')}]`
    )
  );

  const r = juntarMeshesModelo(model, {
    encaixarBbox: false,
    montagem3mf: true,
  });
  r.mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(r.mesh);
  let tris = 0;
  r.mesh.traverse((c) => {
    if (c.isMesh && c.geometry) {
      tris += c.geometry.index
        ? c.geometry.index.count / 3
        : c.geometry.attributes.position.count / 3;
    }
  });
  console.log(
    'merged tris',
    Math.round(tris),
    'size',
    box.getSize(new THREE.Vector3()).toArray().map((n) => +n.toFixed(2))
  );
}

sim(
  'c:/Users/Gabriel/Downloads/Charizard Pokémon Figura Esqueleto Fóssil de Dragão.3mf',
  'plate'
);
sim('c:/Users/Gabriel/Downloads/Charizard_Skeleton_OnePiece.3mf', 'onepiece');
sim(
  'public/products/Charizard Pokémon Figura Esqueleto Fóssil de Dragão.3mf',
  'public'
);
