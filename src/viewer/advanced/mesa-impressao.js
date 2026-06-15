/**
 * PrÃ©via da mesa de impressÃ£o 3D.
 */
import * as THREE from "three";

const MESAS = {
  bambu_a1: { w: 256, d: 256, label: "Bambu A1 (256Ã—256)" },
  bambu_x1: { w: 256, d: 256, label: "Bambu X1 (256Ã—256)" },
  bambu_p1p: { w: 220, d: 220, label: "Bambu P1P (220Ã—220)" },
  ender3: { w: 220, d: 220, label: "Ender 3 (220Ã—220)" },
  prusa_mk4: { w: 250, d: 210, label: "Prusa MK4 (250Ã—210)" },
};

export function criarMesaImpressao() {
  let mesh = null;
  let grid = null;
  let ativo = false;
  let tipo = "bambu_a1";

  function remover(scene) {
    if (mesh) scene.remove(mesh);
    if (grid) scene.remove(grid);
    mesh = null;
    grid = null;
  }

  function atualizar(scene, modelPivot, escalaMm = 1) {
    remover(scene);
    if (!ativo) return null;

    const cfg = MESAS[tipo] || MESAS.bambu_a1;
    const w = cfg.w * escalaMm;
    const d = cfg.d * escalaMm;

    const geo = new THREE.PlaneGeometry(w, d);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x313244,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0;
    mesh.renderOrder = -1;
    scene.add(mesh);

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
    grid = new THREE.LineSegments(
      gGeo,
      new THREE.LineBasicMaterial({ color: 0x585b70, transparent: true, opacity: 0.6 })
    );
    scene.add(grid);

    const box = new THREE.Box3().setFromObject(modelPivot);
    const size = box.getSize(new THREE.Vector3());
    const overflow =
      size.x > w || size.z > d;
    const margemX = ((size.x / w) * 100).toFixed(1);
    const margemZ = ((size.z / d) * 100).toFixed(1);

    return {
      overflow,
      mensagem: overflow
        ? `Modelo excede a mesa (${margemX}% Ã— ${margemZ}%)`
        : `Cabe na mesa (${margemX}% Ã— ${margemZ}% da Ã¡rea)`,
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
