function areaTriangulo(positions, i0, i1, i2) {
  const ax = positions[i0 * 3];
  const ay = positions[i0 * 3 + 1];
  const az = positions[i0 * 3 + 2];
  const bx = positions[i1 * 3];
  const by = positions[i1 * 3 + 1];
  const bz = positions[i1 * 3 + 2];
  const cx = positions[i2 * 3];
  const cy = positions[i2 * 3 + 1];
  const cz = positions[i2 * 3 + 2];

  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;

  const cxp = aby * acz - abz * acy;
  const cyp = abz * acx - abx * acz;
  const czp = abx * acy - aby * acx;

  return 0.5 * Math.sqrt(cxp * cxp + cyp * cyp + czp * czp);
}

function volumeTriangulo(positions, i0, i1, i2) {
  const ax = positions[i0 * 3];
  const ay = positions[i0 * 3 + 1];
  const az = positions[i0 * 3 + 2];
  const bx = positions[i1 * 3];
  const by = positions[i1 * 3 + 1];
  const bz = positions[i1 * 3 + 2];
  const cx = positions[i2 * 3];
  const cy = positions[i2 * 3 + 1];
  const cz = positions[i2 * 3 + 2];

  return (
    (ax * (by * cz - bz * cy) +
      ay * (bz * cx - bx * cz) +
      az * (bx * cy - by * cx)) /
    6
  );
}

function expandBounds(bounds, positions) {
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < bounds.minX) bounds.minX = x;
    if (y < bounds.minY) bounds.minY = y;
    if (z < bounds.minZ) bounds.minZ = z;
    if (x > bounds.maxX) bounds.maxX = x;
    if (y > bounds.maxY) bounds.maxY = y;
    if (z > bounds.maxZ) bounds.maxZ = z;
  }
}

/**
 * Análise de malha a partir de buffers serializados (worker ou main thread).
 * @param {Array<{ positions: Float32Array, indices: Uint32Array|null, hasNormal?: boolean, hasUv?: boolean, hasColor?: boolean, materialCount?: number, textureCount?: number, groupCount?: number }>} meshes
 */
export function analisarMeshesData(meshes) {
  let vertices = 0;
  let triangulos = 0;
  let malhas = meshes.length;
  let geometrias = meshes.length;
  let areaSuperficie = 0;
  let volume = 0;
  let comNormais = 0;
  let comUv = 0;
  let comCores = 0;
  let indexadas = 0;
  let naoIndexadas = 0;
  let materiais = 0;
  let texturas = 0;
  let grupos = 0;

  const bounds = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };

  for (const mesh of meshes) {
    const positions = mesh.positions;
    if (!positions?.length) continue;

    vertices += positions.length / 3;
    expandBounds(bounds, positions);

    if (mesh.hasNormal) comNormais += 1;
    if (mesh.hasUv) comUv += 1;
    if (mesh.hasColor) comCores += 1;
    materiais += mesh.materialCount || 0;
    texturas += mesh.textureCount || 0;
    grupos += mesh.groupCount || 0;

    if (mesh.indices?.length) {
      indexadas += 1;
      triangulos += mesh.indices.length / 3;
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const i0 = mesh.indices[i];
        const i1 = mesh.indices[i + 1];
        const i2 = mesh.indices[i + 2];
        areaSuperficie += areaTriangulo(positions, i0, i1, i2);
        volume += volumeTriangulo(positions, i0, i1, i2);
      }
    } else {
      naoIndexadas += 1;
      triangulos += positions.length / 9;
      for (let i = 0; i < positions.length / 3; i += 3) {
        areaSuperficie += areaTriangulo(positions, i, i + 1, i + 2);
        volume += volumeTriangulo(positions, i, i + 1, i + 2);
      }
    }
  }

  const tamanho = {
    x: bounds.maxX - bounds.minX,
    y: bounds.maxY - bounds.minY,
    z: bounds.maxZ - bounds.minZ,
  };
  const centro = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  };
  const diagonal = Math.sqrt(tamanho.x ** 2 + tamanho.y ** 2 + tamanho.z ** 2);

  return {
    vertices,
    triangulos,
    malhas,
    geometrias,
    areaSuperficie,
    volume: Math.abs(volume),
    comNormais,
    comUv,
    comCores,
    indexadas,
    naoIndexadas,
    materiais,
    texturas,
    grupos,
    tamanho,
    centro,
    diagonal,
  };
}
