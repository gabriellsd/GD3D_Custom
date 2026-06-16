/**
 * Diagnóstico básico de malha (STL/OBJ/PLY etc.).
 */
import * as THREE from "three";

function arestaKey(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export function analisarMalha(object) {
  const stats = {
    triangulos: 0,
    degenerados: 0,
    bordasAbertas: 0,
    naoManifold: 0,
    normaisInvertidas: 0,
    avisos: [],
  };

  const arestas = new Map();

  object.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const geo = child.geometry;
    const pos = geo.attributes.position;
    if (!pos) return;

    const idx = geo.index;
    const processar = (i0, i1, i2) => {
      stats.triangulos += 1;
      const a = new THREE.Vector3().fromBufferAttribute(pos, i0);
      const b = new THREE.Vector3().fromBufferAttribute(pos, i1);
      const c = new THREE.Vector3().fromBufferAttribute(pos, i2);
      const ab = new THREE.Vector3().subVectors(b, a);
      const ac = new THREE.Vector3().subVectors(c, a);
      const cruz = new THREE.Vector3().crossVectors(ab, ac);
      if (cruz.lengthSq() < 1e-14) {
        stats.degenerados += 1;
        return;
      }

      for (const par of [[i0, i1], [i1, i2], [i2, i0]]) {
        const k = arestaKey(par[0], par[1]);
        arestas.set(k, (arestas.get(k) || 0) + 1);
      }

      if (geo.attributes.normal) {
        cruz.normalize();
        const n = new THREE.Vector3().fromBufferAttribute(geo.attributes.normal, i0);
        if (n.dot(cruz) < 0) stats.normaisInvertidas += 1;
      }
    };

    if (idx) {
      for (let i = 0; i < idx.count; i += 3) {
        processar(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        processar(i, i + 1, i + 2);
      }
    }
  });

  for (const count of arestas.values()) {
    if (count === 1) stats.bordasAbertas += 1;
    else if (count > 2) stats.naoManifold += 1;
  }

  if (stats.bordasAbertas > 0) {
    stats.avisos.push(`Malha aberta: ${stats.bordasAbertas} arestas de borda`);
  }
  if (stats.naoManifold > 0) {
    stats.avisos.push(`Não-manifold: ${stats.naoManifold} arestas`);
  }
  if (stats.degenerados > 0) {
    stats.avisos.push(`${stats.degenerados} triângulos degenerados`);
  }
  if (stats.normaisInvertidas > stats.triangulos * 0.1) {
    stats.avisos.push("Muitas normais possivelmente invertidas");
  }
  if (!stats.avisos.length) {
    stats.avisos.push("Nenhum problema grave detectado");
  }

  return stats;
}

export function secaoAnaliseMalha(stats) {
  return {
    titulo: "Diagnóstico da malha",
    itens: [
      ["Triângulos analisados", stats.triangulos.toLocaleString("pt-BR")],
      ["Arestas abertas", stats.bordasAbertas.toLocaleString("pt-BR")],
      ["Arestas não-manifold", stats.naoManifold.toLocaleString("pt-BR")],
      ["Triângulos degenerados", stats.degenerados.toLocaleString("pt-BR")],
      ["Status", stats.avisos.join(" · ")],
    ],
  };
}
