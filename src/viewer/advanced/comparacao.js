/**
 * Modo comparação: segundo modelo sobreposto ou lado a lado.
 */
import * as THREE from "three";

export function criarComparacao(modelPivot, scene) {
  let grupo = null;
  let modo = "off";
  let opacidade = 0.45;
  const materiaisBackup = new Map();

  function limpar() {
    if (grupo) {
      scene.remove(grupo);
      grupo.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
      grupo = null;
    }
    materiaisBackup.clear();
  }

  function aplicarOpacidade(object, alpha) {
    object.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        if (!materiaisBackup.has(mat.uuid)) {
          materiaisBackup.set(mat.uuid, {
            transparent: mat.transparent,
            opacity: mat.opacity,
            depthWrite: mat.depthWrite,
          });
        }
        mat.transparent = true;
        mat.opacity = alpha;
        mat.depthWrite = false;
        mat.needsUpdate = true;
      });
    });
  }

  function restaurarOpacidade(object) {
    object.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        const b = materiaisBackup.get(mat.uuid);
        if (!b) return;
        mat.transparent = b.transparent;
        mat.opacity = b.opacity;
        mat.depthWrite = b.depthWrite;
        mat.needsUpdate = true;
      });
    });
  }

  function reposicionarGrupo(tipo) {
    if (!grupo) return;
    grupo.position.set(0, 0, 0);
    if (tipo === "ghost") {
      aplicarOpacidade(grupo, opacidade);
      return;
    }
    if (tipo === "lado") {
      restaurarOpacidade(grupo);
      const box = new THREE.Box3().setFromObject(modelPivot);
      const size = box.getSize(new THREE.Vector3());
      grupo.position.x = size.x * 1.15;
    }
  }

  function definirModelo(object, tipo = "ghost") {
    limpar();
    if (!object) return;
    modo = tipo;
    grupo = object.clone(true);
    scene.add(grupo);
    reposicionarGrupo(tipo);
  }

  return {
    definirModelo,
    limpar,
    setModo(m) {
      modo = m;
      if (!grupo) return;
      reposicionarGrupo(m);
    },
    setOpacidade(a) {
      opacidade = a;
      if (grupo && modo === "ghost") aplicarOpacidade(grupo, opacidade);
    },
    getGrupo: () => grupo,
    isAtivo: () => !!grupo,
  };
}
