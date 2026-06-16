/**
 * Loader AMF básico (mesh triangular).
 */
import * as THREE from "three";

function lerVertices(objetoXml) {
  const verts = [];
  const re = /<vertex>[\s\S]*?<x>([^<]*)<\/x>[\s\S]*?<y>([^<]*)<\/y>[\s\S]*?<z>([^<]*)<\/z>/gi;
  let m;
  while ((m = re.exec(objetoXml)) !== null) {
    verts.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }
  return verts;
}

function lerTriangulos(volumeXml, offset) {
  const idx = [];
  const re = /<triangle>[\s\S]*?<v1>(\d+)<\/v1>[\s\S]*?<v2>(\d+)<\/v2>[\s\S]*?<v3>(\d+)<\/v3>/gi;
  let m;
  while ((m = re.exec(volumeXml)) !== null) {
    idx.push(
      parseInt(m[1], 10) + offset,
      parseInt(m[2], 10) + offset,
      parseInt(m[3], 10) + offset
    );
  }
  return idx;
}

export function carregarAmf(buffer) {
  const texto = new TextDecoder().decode(
    buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer
  );

  const posicoes = [];
  const indices = [];
  let offset = 0;

  const objetos = [...texto.matchAll(/<object[\s\S]*?<\/object>/gi)];
  const alvo = objetos.length ? objetos : [texto];

  for (const bloco of alvo) {
    const xml = bloco[0] || bloco;
    const verts = lerVertices(xml);
    if (!verts.length) continue;

    const volumes = [...xml.matchAll(/<volume[\s\S]*?<\/volume>/gi)];
    const volAlvo = volumes.length ? volumes.map((v) => v[0]) : [xml];

    for (const vol of volAlvo) {
      const tri = lerTriangulos(vol, offset);
      if (!tri.length) continue;
      posicoes.push(...verts);
      indices.push(...tri);
      offset += verts.length / 3;
    }
  }

  if (!posicoes.length) throw new Error("AMF sem geometria válida");

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(posicoes, 3));
  if (indices.length) geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ color: 0x89b4fa, roughness: 0.6 });
  return new THREE.Mesh(geometry, material);
}
