/**
 * Loader OFF simples (Three.js nÃ£o inclui OFFLoader nas versÃµes atuais).
 */
import * as THREE from "three";

export class OFFLoader {
  parse(texto) {
    const linhas = texto.split(/\r?\n/);
    let i = 0;

    while (i < linhas.length) {
      const limpa = linhas[i].trim();
      i += 1;
      if (!limpa || limpa.startsWith("#")) continue;
      if (limpa.toUpperCase() === "OFF") continue;

      const [nv, nf] = limpa.split(/\s+/).map(Number);
      if (!nv || Number.isNaN(nv)) continue;

      const posicoes = [];
      for (let v = 0; v < nv && i < linhas.length; v++, i++) {
        let linha = linhas[i].trim();
        while (!linha && i < linhas.length) {
          i += 1;
          linha = linhas[i]?.trim() ?? "";
        }
        if (linha.startsWith("#")) {
          v -= 1;
          continue;
        }
        const [x, y, z] = linha.split(/\s+/).map(Number);
        posicoes.push(x, y, z);
      }

      const indices = [];
      for (let f = 0; f < (nf || 0) && i < linhas.length; f++, i++) {
        let linha = linhas[i].trim();
        while (!linha && i < linhas.length) {
          i += 1;
          linha = linhas[i]?.trim() ?? "";
        }
        if (linha.startsWith("#")) {
          f -= 1;
          continue;
        }
        const partes = linha.split(/\s+/).map(Number);
        const n = partes[0];
        for (let j = 1; j < n - 1; j++) {
          indices.push(partes[1], partes[1 + j], partes[2 + j]);
        }
      }

      const geometria = new THREE.BufferGeometry();
      geometria.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(posicoes, 3)
      );
      if (indices.length) geometria.setIndex(indices);
      geometria.computeVertexNormals();
      return geometria;
    }

    throw new Error("Arquivo OFF invÃ¡lido ou vazio");
  }

  async loadAsync(url) {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`Falha ao carregar OFF: ${resposta.status}`);
    return this.parse(await resposta.text());
  }
}
