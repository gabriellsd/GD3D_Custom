/**
 * Prévia da mesa de impressão 3D.
 * A mesa é filha do modelPivot para acompanhar rotação e movimento do modelo.
 */
import * as THREE from "three";

const MESAS = {
  bambu_a1: { w: 256, d: 256, label: "Bambu A1 (256×256)" },
  bambu_x1: { w: 256, d: 256, label: "Bambu X1 (256×256)" },
  bambu_p1p: { w: 220, d: 220, label: "Bambu P1P (220×220)" },
  ender3: { w: 220, d: 220, label: "Ender 3 (220×220)" },
  prusa_mk4: { w: 250, d: 210, label: "Prusa MK4 (250×210)" },
};

function medirConteudoModelo(modelPivot) {
  const box = new THREE.Box3();
  let vazio = true;
  for (const child of modelPivot.children) {
    if (child.name === "mesa-impressao") continue;
    const parcial = new THREE.Box3().setFromObject(child);
    if (parcial.isEmpty()) continue;
    if (vazio) {
      box.copy(parcial);
      vazio = false;
    } else {
      box.union(parcial);
    }
  }
  return box;
}

export function criarMesaImpressao() {
  let grupo = null;
  let ativo = false;
  let tipo = "bambu_a1";

  function remover(modelPivot) {
    if (grupo && modelPivot) {
      modelPivot.remove(grupo);
      grupo.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      });
    }
    grupo = null;
  }

  function atualizar(modelPivot, escalaMm = 1) {
    remover(modelPivot);
    if (!ativo || !modelPivot) return null;

    const cfg = MESAS[tipo] || MESAS.bambu_a1;
    const w = cfg.w * escalaMm;
    const d = cfg.d * escalaMm;

    grupo = new THREE.Group();
    grupo.name = "mesa-impressao";

    const geo = new THREE.PlaneGeometry(w, d);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9a9a9a,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0;
    mesh.receiveShadow = true;
    grupo.add(mesh);

    const borda = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 2, d)),
      new THREE.LineBasicMaterial({ color: 0x5c5c5c })
    );
    borda.position.y = 1;
    grupo.add(borda);

    const pts = [];
    const passo = Math.max(10, Math.round(Math.min(w, d) / 10));
    for (let x = -w / 2; x <= w / 2; x += passo) {
      pts.push(x, 0.01, -d / 2, x, 0.01, d / 2);
    }
    for (let z = -d / 2; z <= d / 2; z += passo) {
      pts.push(-w / 2, 0.01, z, w / 2, 0.01, z);
    }
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    grupo.add(
      new THREE.LineSegments(
        gGeo,
        new THREE.LineBasicMaterial({ color: 0x585b70, transparent: true, opacity: 0.6 })
      )
    );

    modelPivot.add(grupo);

    const box = medirConteudoModelo(modelPivot);
    const size = box.getSize(new THREE.Vector3());
    const overflow = size.x > w || size.z > d;
    const margemX = ((size.x / w) * 100).toFixed(1);
    const margemZ = ((size.z / d) * 100).toFixed(1);

    return {
      overflow,
      mensagem: overflow
        ? `Modelo excede a mesa (${margemX}% × ${margemZ}%)`
        : `Cabe na mesa (${margemX}% × ${margemZ}% da área)`,
      cfg,
    };
  }

  return {
    get tipos() {
      return MESAS;
    },
    setAtivo(v) {
      ativo = v;
    },
    setTipo(v) {
      tipo = v;
    },
    isAtivo: () => ativo,
    atualizar,
    remover,
  };
}
