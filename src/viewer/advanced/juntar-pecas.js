/**
 * Unir meshes num único mesh (padrão Three.js).
 * @see https://discourse.threejs.org/t/trying-to-merge-buffergeometries-while-preserving-transformations/39095
 */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const COR_PADRAO = 0xe8a317;

function disposeObject3D(obj) {
  obj.traverse((child) => {
    child.geometry?.dispose();
    const mats = child.material;
    if (!mats) return;
    if (Array.isArray(mats)) mats.forEach((m) => m.dispose());
    else mats.dispose();
  });
}

function contarMeshes(root, { apenasVisiveis = true } = {}) {
  let n = 0;
  root.traverse((child) => {
    if (!child.isMesh) return;
    if (apenasVisiveis && !child.visible) return;
    if (child.userData?.isSupport) return;
    n += 1;
  });
  return n;
}

function obterOrientacao(root) {
  return root.children?.find((c) => c.isGroup) ?? root.children?.[0] ?? null;
}

function grupoTemMeshVisivel(grupo) {
  let tem = false;
  grupo.traverse((child) => {
    if (!child.isMesh || child.userData?.isSupport) return;
    if (child.visible) tem = true;
  });
  return tem;
}

/** Grupos de peça no topo (ex.: Peça 1 + Peça 2 no 3MF Bambu). */
function obterGruposPecaRaiz(orientacao) {
  const raiz = orientacao.children[0];
  if (!raiz) return [];

  function gruposDirectos(node) {
    return node.children.filter((child) => {
      if (child.userData?.isSupport) return false;
      return grupoTemMeshVisivel(child);
    });
  }

  let node = raiz;
  let grupos = gruposDirectos(node);

  while (grupos.length === 1 && node.isGroup) {
    const sub = gruposDirectos(grupos[0]);
    if (sub.length < 2) break;
    node = grupos[0];
    grupos = sub;
  }

  if (grupos.length >= 2) return grupos;

  const meshesDirectos = raiz.children.filter(
    (child) => child.isMesh && child.visible !== false && !child.userData?.isSupport
  );
  return meshesDirectos.length >= 2 ? meshesDirectos : [];
}

function garantirCoresGeometria(geo, mesh) {
  if (geo.attributes.color) return geo;

  const count = geo.attributes.position?.count ?? 0;
  if (!count) return geo;

  const colors = new Float32Array(count * 3);
  let r = 1;
  let g = 1;
  let b = 1;

  if (mesh.material?.color) {
    r = mesh.material.color.r;
    g = mesh.material.color.g;
    b = mesh.material.color.b;
  } else {
    const c = new THREE.Color(COR_PADRAO);
    r = c.r;
    g = c.g;
    b = c.b;
  }

  for (let i = 0; i < count; i++) {
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

function inverterOrdemFaces(geo) {
  const pos = geo.getAttribute('position');
  if (!pos) return;

  const arr = pos.array;
  for (let i = 0; i < pos.count; i += 3) {
    const base = i * 3;
    for (let j = 0; j < 3; j++) {
      const tmp = arr[base + 3 + j];
      arr[base + 3 + j] = arr[base + 6 + j];
      arr[base + 6 + j] = tmp;
    }
  }

  pos.needsUpdate = true;
}

function aplicarMatrizGeometria(geo, matrix) {
  geo.applyMatrix4(matrix);
  if (matrix.determinant() < 0) {
    inverterOrdemFaces(geo);
  }
}

function prepararGeometria(mesh) {
  let geo = mesh.geometry.clone();
  if (geo.index) geo = geo.toNonIndexed();
  return geo;
}

function volumeAproximado(geo) {
  geo.computeBoundingBox();
  const s = geo.boundingBox.getSize(new THREE.Vector3());
  return s.x * s.y * s.z;
}

/** Ignora fragmentos minúsculos (suporte, componente fantasma, escala errada). */
function filtrarGeometriasRelevantes(geometrias) {
  if (geometrias.length < 2) return geometrias;

  const volumes = geometrias.map(volumeAproximado);
  const triangulos = geometrias.map(contarTriangulosGeometria);
  const maxVol = Math.max(...volumes, 1e-12);
  const maxTri = Math.max(...triangulos, 1);

  return geometrias.filter((_, i) => {
    const volOk = volumes[i] >= maxVol * 0.03;
    const triOk = triangulos[i] >= maxTri * 0.03;
    // Rotação forte na montagem pode encolher o AABB sem reduzir a malha.
    return volOk || triOk;
  });
}

/**
 * Funde meshes de um grupo numa geometria no espaço mundo.
 */
function fundirGrupoNoMundo(grupo) {
  grupo.updateMatrixWorld(true);
  const geos = [];

  grupo.traverse((child) => {
    if (!child.isMesh || !child.visible || child.userData?.isSupport) return;
    const geo = prepararGeometria(child);
    aplicarMatrizGeometria(geo, child.matrixWorld);
    garantirCoresGeometria(geo, child);
    geos.push(geo);
  });

  if (geos.length === 0) return null;
  if (geos.length === 1) return geos[0];

  const unida = BufferGeometryUtils.mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return unida;
}

function amostrarVerticesGeometria(geo, maxPts = 280) {
  const pos = geo.attributes.position;
  if (!pos) return [];
  const step = Math.max(1, Math.floor(pos.count / maxPts));
  const pts = [];
  for (let i = 0; i < pos.count; i += step) {
    pts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  }
  return pts;
}

function geometriasJaMontadas(geometrias, tolerancia = 1.5) {
  if (geometrias.length < 2) return false;
  return distanciaMinimaVertices(geometrias, 200) <= tolerancia;
}

function diagonalGeometria(geo) {
  geo.computeBoundingBox();
  return geo.boundingBox.getSize(new THREE.Vector3()).length();
}

function centroGeometria(geo) {
  geo.computeBoundingBox();
  return geo.boundingBox.getCenter(new THREE.Vector3());
}

function distanciaMaxCentros(geometrias) {
  if (geometrias.length < 2) return 0;
  const base = centroGeometria(geometrias[0]);
  let max = 0;
  for (let i = 1; i < geometrias.length; i++) {
    max = Math.max(max, base.distanceTo(centroGeometria(geometrias[i])));
  }
  return max;
}

function distanciaMinimaVertices(geometrias, amostra = 200) {
  let min = Infinity;
  for (let i = 0; i < geometrias.length; i++) {
    for (let j = i + 1; j < geometrias.length; j++) {
      const ptsA = amostrarVerticesGeometria(geometrias[i], amostra);
      const ptsB = amostrarVerticesGeometria(geometrias[j], amostra);
      for (const a of ptsA) {
        for (const b of ptsB) {
          min = Math.min(min, a.distanceTo(b));
        }
      }
    }
  }
  return Number.isFinite(min) ? min : Infinity;
}

/** Escala peças minúsculas (ex.: cópia em miniatura na placa). */
function normalizarEscalasGeometrias(geometrias) {
  const diags = geometrias.map(diagonalGeometria);
  const max = Math.max(...diags, 1e-6);

  for (let i = 0; i < geometrias.length; i++) {
    if (diags[i] >= max * 0.22) continue;
    const f = max / diags[i];
    const c = centroGeometria(geometrias[i]);
    const paraOrigem = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
    const escala = new THREE.Matrix4().makeScale(f, f, f);
    const volta = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z);
    geometrias[i].applyMatrix4(paraOrigem);
    geometrias[i].applyMatrix4(escala);
    geometrias[i].applyMatrix4(volta);
  }
}

function alinharCentrosNaBase(geometrias) {
  const base = centroGeometria(geometrias[0]);
  for (let i = 1; i < geometrias.length; i++) {
    const c = centroGeometria(geometrias[i]);
    geometrias[i].translate(base.x - c.x, base.y - c.y, base.z - c.z);
  }
}

/** Montagem multi-STL: aproximar centros, escala e encaixar faces. */
function montarGeometriasParaUniao(geometrias) {
  if (geometrias.length < 2) return { aviso: null };

  if (geometriasJaMontadas(geometrias)) {
    return { aviso: null };
  }

  normalizarEscalasGeometrias(geometrias);

  const maxDiag = Math.max(...geometrias.map(diagonalGeometria), 1e-6);
  if (distanciaMaxCentros(geometrias) > maxDiag * 0.45) {
    alinharCentrosNaBase(geometrias);
  }

  for (let pass = 0; pass < 12; pass++) {
    encaixarPorProximidade(geometrias, 0.05);
  }
  encaixarGeometrias(geometrias);

  const distFinal = distanciaMinimaVertices(geometrias, 220);
  if (distFinal <= 2) return { aviso: null };

  return {
    aviso:
      'Peças ainda afastadas: exporte cada STL na pose montada (Object/Part), não na posição da placa.',
  };
}

/** Aproxima pela face/corte mais próxima (melhor que só bbox para STL separados). */
function encaixarPorProximidade(geometrias, tolerancia = 0.08) {
  if (geometrias.length < 2) return;

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  for (let i = 1; i < geometrias.length; i++) {
    const ptsB = amostrarVerticesGeometria(geometrias[i], 240);
    let ptsA = [];
    for (let j = 0; j < i; j++) {
      ptsA = ptsA.concat(amostrarVerticesGeometria(geometrias[j], 240));
    }
    if (!ptsA.length || !ptsB.length) continue;

    let minD2 = Infinity;
    for (const a of ptsA) {
      for (const b of ptsB) {
        const d2 = a.distanceToSquared(b);
        if (d2 < minD2) {
          minD2 = d2;
          tmpA.copy(a);
          tmpB.copy(b);
        }
      }
    }

    const dist = Math.sqrt(minD2);
    if (!Number.isFinite(dist) || dist <= tolerancia) continue;

    const delta = tmpA.sub(tmpB);
    geometrias[i].translate(delta.x, delta.y, delta.z);
  }
}

/** Deita na horizontal → tenta endireitar para pré-visualização montada. */
export function endireitarGeometriaUnida(geo) {
  geo.computeBoundingBox();
  const s = geo.boundingBox.getSize(new THREE.Vector3());
  if (!s.x || !s.y || !s.z) return;

  if (s.z < s.x * 0.55 && s.z < s.y * 0.55) {
    geo.rotateX(-Math.PI / 2);
  } else if (s.y < s.x * 0.55 && s.y < s.z * 0.55) {
    geo.rotateX(Math.PI / 2);
  }
  geo.computeBoundingBox();
}

/**
 * Aproxima peças até encostarem (várias passagens nos 3 eixos).
 */
function encaixarGeometrias(geometrias) {
  if (geometrias.length < 2) return;

  for (let i = 1; i < geometrias.length; i++) {
    for (let pass = 0; pass < 8; pass++) {
      let moveu = false;
      geometrias[i].computeBoundingBox();
      const box = geometrias[i].boundingBox.clone();

      const uniao = new THREE.Box3();
      for (let j = 0; j < i; j++) {
        geometrias[j].computeBoundingBox();
        uniao.union(geometrias[j].boundingBox);
      }

      const cU = uniao.getCenter(new THREE.Vector3());
      const cB = box.getCenter(new THREE.Vector3());
      const d = cB.clone().sub(cU);
      const sU = uniao.getSize(new THREE.Vector3());
      const sB = box.getSize(new THREE.Vector3());

      for (const ax of [0, 1, 2]) {
        const sep = Math.abs(d.getComponent(ax));
        const half = (sU.getComponent(ax) + sB.getComponent(ax)) / 2;
        const gap = sep - half;
        if (gap <= 0.001) continue;

        const t = new THREE.Vector3();
        t.setComponent(ax, -Math.sign(d.getComponent(ax) || 1) * gap);
        geometrias[i].translate(t.x, t.y, t.z);
        moveu = true;
      }

      if (!moveu) break;
    }
  }
}

function contarTriangulosGeometria(geo) {
  if (!geo) return 0;
  return geo.index
    ? geo.index.count / 3
    : (geo.attributes.position?.count ?? 0) / 3;
}

function contarTriangulosObjeto(obj) {
  let n = 0;
  obj.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    n += contarTriangulosGeometria(child.geometry);
  });
  return Math.round(n);
}

/** Várias peças na placa que referenciam o mesmo mesh Bambu (split to objects). */
export function detectarCopiasMeshIguais(root) {
  const orientacao = obterOrientacao(root);
  if (!orientacao) return { duplicado: false };

  const grupos = obterGruposPecaRaiz(orientacao);
  if (grupos.length < 2) return { duplicado: false };

  const nomes = grupos.map((g) => g.name?.trim() || "");
  if (new Set(nomes).size === grupos.length && nomes.every(Boolean)) {
    return { duplicado: false, grupos };
  }

  const triangulos = grupos.map(contarTriangulosObjeto);
  const objectIds = grupos.map((g) => g.userData?.bambuObjectId);
  const idsValidos = objectIds.every((id) => typeof id === "number" && id > 0);
  const mesmoObjectId =
    idsValidos && objectIds.every((id) => id === objectIds[0]);
  const mesmaGeometria = triangulos.every((n) => n > 0 && n === triangulos[0]);

  return {
    duplicado: mesmoObjectId && mesmaGeometria,
    grupos,
    triangulos,
  };
}

/** Mantém a primeira peça montada e descarta cópias idênticas na placa. */
export function extrairMeshUnicoDeGrupo(root, indiceGrupo = 0, { endireitar = false } = {}) {
  const orientacao = obterOrientacao(root);
  if (!orientacao) throw new Error('Modelo sem estrutura para juntar.');

  const grupos = obterGruposPecaRaiz(orientacao);
  let grupo;
  if (grupos.length) {
    grupo = grupos[indiceGrupo] ?? grupos[0];
  } else {
    const raiz = orientacao.children[0];
    if (!raiz) throw new Error('Nenhuma peça para extrair.');
    grupo = raiz;
  }
  root.updateMatrixWorld(true);
  orientacao.updateMatrixWorld(true);

  const meshes = [];
  grupo.traverse((child) => {
    if (!child.isMesh || !child.visible || child.userData?.isSupport) return;
    meshes.push(child);
  });
  if (!meshes.length) throw new Error('Nenhuma peça visível para extrair.');

  const geometria = fundirGrupoNoMundo(grupo);
  if (!geometria) throw new Error('Não foi possível extrair a peça.');

  const paraLocal = orientacao.matrixWorld.clone().invert();
  aplicarMatrizGeometria(geometria, paraLocal);
  if (endireitar) endireitarGeometriaUnida(geometria);
  geometria.computeVertexNormals();

  const mesh = new THREE.Mesh(geometria, materialUnido(meshes[0]));
  mesh.name = 'pecas-unidas';
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);
  mesh.updateMatrix();

  return {
    mesh,
    jaUnico: false,
    pecasAntes: Math.max(grupos.length, 1),
    copiaUnica: grupos.length <= 1,
  };
}

export function montagemColapsadaNoModelo(root) {
  const orientacao = obterOrientacao(root);
  if (!orientacao) return true;

  root.updateMatrixWorld(true);
  const grupos = obterGruposPecaRaiz(orientacao);
  if (grupos.length < 2) return true;

  const b0 = new THREE.Box3().setFromObject(grupos[0]);
  const b1 = new THREE.Box3().setFromObject(grupos[1]);
  if (!b0.intersectsBox(b1)) return false;

  const inter = b0.clone().intersect(b1);
  if (inter.isEmpty()) return false;

  const volInter =
    inter.getSize().x * inter.getSize().y * inter.getSize().z;
  const vol0 = b0.getSize().x * b0.getSize().y * b0.getSize().z;
  const vol1 = b1.getSize().x * b1.getSize().y * b1.getSize().z;
  const minVol = Math.min(vol0, vol1, 1e-12);
  return volInter > minVol * 0.4;
}

function materialUnido(meshReferencia, { vertexColors = false } = {}) {
  if (vertexColors) {
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.1,
      roughness: 0.6,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      side: THREE.FrontSide,
    });
  }

  const cor = meshReferencia?.material?.color;
  const hex = cor ? `#${cor.getHexString()}` : COR_PADRAO;

  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    vertexColors: false,
    metalness: 0.1,
    roughness: 0.6,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.FrontSide,
  });
}

/**
 * Junta peças visíveis num único mesh.
 * Fluxo: 1 grupo → 1 geometria (mundo) → encaixar → merge → espaço local.
 */
export function juntarMeshesModelo(
  root,
  {
    apenasVisiveis = true,
    encaixarBbox = true,
    encaixarProximidade = false,
    montagem3mf = false,
  } = {}
) {
  const orientacao = obterOrientacao(root);
  if (!orientacao) throw new Error('Modelo sem estrutura para juntar.');

  root.updateMatrixWorld(true);
  orientacao.updateMatrixWorld(true);

  const meshes = [];
  orientacao.traverse((child) => {
    if (!child.isMesh) return;
    if (apenasVisiveis && !child.visible) return;
    if (child.userData?.isSupport) return;
    meshes.push(child);
  });

  if (meshes.length === 0) throw new Error('Nenhuma peça visível para juntar.');
  if (meshes.length === 1) {
    return { mesh: meshes[0], jaUnico: true };
  }

  let grupos = obterGruposPecaRaiz(orientacao);
  if (grupos.length < 2) {
    grupos = meshes;
  }

  let geometrias = grupos
    .map((g) => fundirGrupoNoMundo(g))
    .filter(Boolean);

  if (!montagem3mf) {
    geometrias = filtrarGeometriasRelevantes(geometrias);
  }

  if (geometrias.length < 2) {
    throw new Error('Não foi possível identificar duas peças válidas para juntar.');
  }

  let avisoMontagem = null;
  if (encaixarProximidade) {
    ({ aviso: avisoMontagem } = montarGeometriasParaUniao(geometrias));
  } else if (encaixarBbox && !geometriasJaMontadas(geometrias)) {
    encaixarGeometrias(geometrias);
  }

  const paraLocal = orientacao.matrixWorld.clone().invert();
  for (const geo of geometrias) {
    aplicarMatrizGeometria(geo, paraLocal);
  }

  const temCores = geometrias.every((g) => g.attributes.color);
  const unida = BufferGeometryUtils.mergeGeometries(geometrias, false);
  geometrias.forEach((g) => g.dispose());

  if (!unida) throw new Error('Não foi possível juntar as peças.');

  if (!temCores) unida.deleteAttribute('color');
  unida.computeVertexNormals();

  const mesh = new THREE.Mesh(unida, materialUnido(meshes[0], { vertexColors: temCores }));
  mesh.name = 'pecas-unidas';
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);
  mesh.updateMatrix();

  return { mesh, jaUnico: false, pecasAntes: meshes.length, avisoMontagem };
}

/** Substitui o conteúdo da orientação por um novo objeto (ex.: remontar 3MF). */
export function substituirConteudoOrientacao(root, object) {
  const orientacao = obterOrientacao(root);
  if (!orientacao) throw new Error('Estrutura do modelo inválida.');

  while (orientacao.children.length > 0) {
    const filho = orientacao.children[0];
    disposeObject3D(filho);
    orientacao.remove(filho);
  }

  orientacao.add(object);
}

/** Substitui o conteúdo do modelo pela versão unida. */
export function substituirModeloJuntado(containerModelo, mesh) {
  substituirConteudoOrientacao(containerModelo, mesh);
}

export function contarPecasVisiveis(root) {
  return contarMeshes(root, { apenasVisiveis: true });
}
