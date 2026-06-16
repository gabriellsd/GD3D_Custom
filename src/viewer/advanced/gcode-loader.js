/**
 * Visualizador G-code simplificado (extrusões G1 com E).
 */
import * as THREE from "three";

function parseGcode(texto) {
  const linhas = texto.split(/\r?\n/);
  let x = 0;
  let y = 0;
  let z = 0;
  let e = 0;
  const segmentos = [];
  const camadas = new Map();

  for (const linha of linhas) {
    const l = linha.trim();
    if (!l || l.startsWith(";")) continue;
    const cmd = l.split(/\s+/)[0].toUpperCase();
    if (cmd !== "G0" && cmd !== "G1") continue;

    const nx = l.match(/X([-\d.]+)/i);
    const ny = l.match(/Y([-\d.]+)/i);
    const nz = l.match(/Z([-\d.]+)/i);
    const ne = l.match(/E([-\d.]+)/i);

    const ox = x;
    const oy = y;
    const oz = z;

    if (nx) x = parseFloat(nx[1]);
    if (ny) y = parseFloat(ny[1]);
    if (nz) z = parseFloat(nz[1]);

    const extrude = ne && parseFloat(ne[1]) > e;
    if (ne) e = parseFloat(ne[1]);

    if (!extrude) continue;

    const layerKey = oz.toFixed(3);
    if (!camadas.has(layerKey)) camadas.set(layerKey, []);
    camadas.get(layerKey).push(ox, oy, oz, x, y, z);
  }

  const zOrdenado = [...camadas.keys()].sort((a, b) => parseFloat(a) - parseFloat(b));
  return { camadas, zOrdenado };
}

export function carregarGcode(buffer) {
  const texto = new TextDecoder().decode(
    buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer
  );
  const { camadas, zOrdenado } = parseGcode(texto);

  if (!zOrdenado.length) throw new Error("G-code sem extrusões detectadas");

  const grupo = new THREE.Group();
  grupo.name = "gcode-view";
  grupo.userData.gcode = { camadas, zOrdenado, camadaAtual: zOrdenado.length - 1 };

  const material = new THREE.LineBasicMaterial({ vertexColors: true });
  const maxZ = parseFloat(zOrdenado[zOrdenado.length - 1]) || 1;

  for (const zKey of zOrdenado) {
    const pts = camadas.get(zKey);
    if (!pts?.length) continue;

    const geometry = new THREE.BufferGeometry();
    const pos = new Float32Array(pts);
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));

    const z = parseFloat(zKey);
    const t = maxZ > 0 ? z / maxZ : 0;
    const cor = new THREE.Color().setHSL(0.66 - t * 0.66, 0.85, 0.55);
    const cores = new Float32Array((pts.length / 3) * 3);
    for (let i = 0; i < pts.length / 3; i++) {
      cores[i * 3] = cor.r;
      cores[i * 3 + 1] = cor.g;
      cores[i * 3 + 2] = cor.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(cores, 3));

    const linhas = new THREE.LineSegments(geometry, material.clone());
    linhas.name = `layer-${zKey}`;
    linhas.userData.layerZ = z;
    linhas.visible = true;
    grupo.add(linhas);
  }

  aplicarCamadaGcode(grupo, zOrdenado.length - 1);
  return grupo;
}

export function aplicarCamadaGcode(grupo, indice) {
  const { zOrdenado } = grupo.userData.gcode;
  const max = Math.max(0, Math.min(indice, zOrdenado.length - 1));
  grupo.userData.gcode.camadaAtual = max;
  const zLimite = parseFloat(zOrdenado[max]);

  grupo.children.forEach((child) => {
    child.visible = child.userData.layerZ <= zLimite + 0.001;
  });
}

export function infoGcode(grupo) {
  const { zOrdenado } = grupo.userData.gcode;
  return {
    camadas: zOrdenado.length,
    alturaMax: parseFloat(zOrdenado[zOrdenado.length - 1]) || 0,
  };
}
