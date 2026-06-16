import * as THREE from "three";
import * as fflate from "three/addons/libs/fflate.module.js";
import { detectarBambu3mf, parseBambu3mfBuffer } from "./bambu-3mf.js";

function normalizarZip(zip) {
  const arquivos = {};
  for (const chave of Object.keys(zip)) {
    arquivos[chave.replace(/\\/g, "/")] = zip[chave];
  }
  return arquivos;
}

function parseTransform(str) {
  if (!str) return null;
  const valores = str.trim().split(/\s+/).map(Number);
  const matriz = new THREE.Matrix4();
  matriz.set(
    valores[0], valores[3], valores[6], valores[9],
    valores[1], valores[4], valores[7], valores[10],
    valores[2], valores[5], valores[8], valores[11],
    0, 0, 0, 1
  );
  return matriz;
}

function parseCor3mf(valor) {
  if (!valor) return new THREE.Color(0x89b4fa);
  const cor = new THREE.Color();
  try {
    const estilo = valor.startsWith("#") ? valor.substring(0, 7) : `#${valor.substring(0, 6)}`;
    cor.setStyle(estilo, THREE.SRGBColorSpace);
  } catch {
    cor.setHex(0x89b4fa);
  }
  return cor;
}

function materialPadrao(opcoes = {}) {
  return new THREE.MeshStandardMaterial({
    color: opcoes.cor ?? 0x89b4fa,
    vertexColors: !!opcoes.vertexColors,
    metalness: 0.1,
    roughness: 0.6,
  });
}

function parseMalha(noMalha) {
  const vertices = [];
  noMalha.querySelectorAll("vertices > vertex").forEach((v) => {
    vertices.push(
      parseFloat(v.getAttribute("x")),
      parseFloat(v.getAttribute("y")),
      parseFloat(v.getAttribute("z"))
    );
  });

  const triangulos = [];
  const propriedades = [];

  noMalha.querySelectorAll("triangles > triangle").forEach((t) => {
    triangulos.push(
      parseInt(t.getAttribute("v1"), 10),
      parseInt(t.getAttribute("v2"), 10),
      parseInt(t.getAttribute("v3"), 10)
    );
    propriedades.push({
      pid: t.getAttribute("pid"),
      p1: t.getAttribute("p1"),
      p2: t.getAttribute("p2"),
      p3: t.getAttribute("p3"),
    });
  });

  return { vertices, triangulos, propriedades };
}

function indicesTriangulo(dados, indiceTri) {
  const base = indiceTri * 3;
  return [
    dados.triangulos[base],
    dados.triangulos[base + 1],
    dados.triangulos[base + 2],
  ];
}

function adicionarTriangulo(posicoes, cores, dados, verts, corTripla) {
  for (let i = 0; i < 3; i++) {
    const v = verts[i];
    posicoes.push(
      dados.vertices[v * 3],
      dados.vertices[v * 3 + 1],
      dados.vertices[v * 3 + 2]
    );
    if (cores && corTripla) {
      const c = corTripla[i];
      cores.push(c.r, c.g, c.b);
    }
  }
}

function tipoRecurso(pid, materiaisBase, gruposCor) {
  if (pid && gruposCor.has(pid)) return "colorgroup";
  if (pid && materiaisBase.has(pid)) return "basematerials";
  return "default";
}

function criarMalhaColorgroup(dados, entrada, indicesTri, paleta) {
  const posicoes = [];
  const cores = [];
  const pindexPadrao = parseInt(entrada.pindex ?? "0", 10);

  indicesTri.forEach((indiceTri) => {
    const prop = dados.propriedades[indiceTri];
    const verts = indicesTriangulo(dados, indiceTri);

    const p1 = prop.p1 != null ? parseInt(prop.p1, 10) : pindexPadrao;
    const p2 = prop.p2 != null ? parseInt(prop.p2, 10) : p1;
    const p3 = prop.p3 != null ? parseInt(prop.p3, 10) : p1;

    const corTripla = [
      paleta[p1] ?? parseCor3mf(),
      paleta[p2] ?? paleta[p1] ?? parseCor3mf(),
      paleta[p3] ?? paleta[p1] ?? parseCor3mf(),
    ];

    adicionarTriangulo(posicoes, cores, dados, verts, corTripla);
  });

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.Float32BufferAttribute(posicoes, 3));
  geometria.setAttribute("color", new THREE.Float32BufferAttribute(cores, 3));
  geometria.computeVertexNormals();

  return new THREE.Mesh(geometria, materialPadrao({ vertexColors: true }));
}

function criarMalhasBasematerials(dados, entrada, indicesTri, bases) {
  const grupo = new THREE.Group();
  const mapaIndice = new Map();
  const pindexPadrao = parseInt(entrada.pindex ?? "0", 10);

  indicesTri.forEach((indiceTri) => {
    const prop = dados.propriedades[indiceTri];
    const pindex = prop.p1 != null ? parseInt(prop.p1, 10) : pindexPadrao;
    if (!mapaIndice.has(pindex)) mapaIndice.set(pindex, []);
    mapaIndice.get(pindex).push(indiceTri);
  });

  mapaIndice.forEach((lista, pindex) => {
    const posicoes = [];

    lista.forEach((indiceTri) => {
      const verts = indicesTriangulo(dados, indiceTri);
      adicionarTriangulo(posicoes, null, dados, verts, null);
    });

    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute("position", new THREE.Float32BufferAttribute(posicoes, 3));
    geometria.computeVertexNormals();

    const base = bases[pindex] ?? bases[0];
    const mesh = new THREE.Mesh(
      geometria,
      materialPadrao({ cor: base?.cor?.getHex() ?? 0x89b4fa })
    );
    if (base?.nome) mesh.name = base.nome;
    grupo.add(mesh);
  });

  return grupo.children.length === 1 ? grupo.children[0] : grupo;
}

function criarMalhaPadrao(dados, entrada, indicesTri, materiaisBase) {
  const posicoes = [];
  indicesTri.forEach((indiceTri) => {
    const verts = indicesTriangulo(dados, indiceTri);
    adicionarTriangulo(posicoes, null, dados, verts, null);
  });

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.Float32BufferAttribute(posicoes, 3));
  geometria.computeVertexNormals();

  let cor = 0x89b4fa;
  if (entrada.pid && materiaisBase.has(entrada.pid)) {
    const bases = materiaisBase.get(entrada.pid);
    const pindex = parseInt(entrada.pindex ?? "0", 10);
    cor = bases[pindex]?.cor?.getHex() ?? bases[0]?.cor?.getHex() ?? cor;
  }

  return new THREE.Mesh(geometria, materialPadrao({ cor }));
}

function construirMalha(dados, entrada, materiaisBase, gruposCor) {
  const mapaRecursos = new Map();

  dados.propriedades.forEach((prop, indiceTri) => {
    const pid = prop.pid || entrada.pid || "default";
    if (!mapaRecursos.has(pid)) mapaRecursos.set(pid, []);
    mapaRecursos.get(pid).push(indiceTri);
  });

  const grupo = new THREE.Group();

  mapaRecursos.forEach((indicesTri, pid) => {
    const tipo = tipoRecurso(pid, materiaisBase, gruposCor);
    let malha;

    if (tipo === "colorgroup") {
      malha = criarMalhaColorgroup(dados, entrada, indicesTri, gruposCor.get(pid));
    } else if (tipo === "basematerials") {
      malha = criarMalhasBasematerials(
        dados,
        entrada,
        indicesTri,
        materiaisBase.get(pid)
      );
    } else {
      malha = criarMalhaPadrao(dados, entrada, indicesTri, materiaisBase);
    }

    grupo.add(malha);
  });

  return grupo.children.length === 1 ? grupo.children[0] : grupo;
}

export function carregar3mf(arrayBuffer, options = {}) {
  const buffer =
    arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);

  if (detectarBambu3mf(buffer)) {
    return parseBambu3mfBuffer(buffer, options);
  }

  return { object: carregar3mfPadrao(buffer), meta: null };
}

function carregar3mfPadrao(arrayBuffer) {
  const zip = normalizarZip(fflate.unzipSync(new Uint8Array(arrayBuffer)));
  const decoder = new TextDecoder();

  const caminhosModelo = Object.keys(zip).filter((k) =>
    /^3D\/.*\.model$/i.test(k)
  );
  if (caminhosModelo.length === 0) {
    throw new Error("Nenhum modelo 3D encontrado no arquivo 3MF.");
  }

  const objetos = new Map();
  const materiaisBase = new Map();
  const gruposCor = new Map();
  const itensBuild = [];

  for (const caminho of caminhosModelo) {
    const xml = decoder.decode(zip[caminho]);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const modelo = doc.querySelector("model");
    if (!modelo) continue;

    modelo.querySelectorAll("basematerials").forEach((no) => {
      const id = no.getAttribute("id");
      const bases = [...no.querySelectorAll("base")].map((base, i) => ({
        cor: parseCor3mf(base.getAttribute("displaycolor")),
        nome: base.getAttribute("name") || `material_${i}`,
      }));
      materiaisBase.set(id, bases);
    });

    modelo.querySelectorAll("colorgroup").forEach((no) => {
      const id = no.getAttribute("id");
      const paleta = [...no.querySelectorAll("color")].map((corNo) =>
        parseCor3mf(corNo.getAttribute("color"))
      );
      gruposCor.set(id, paleta);
    });

    modelo.querySelectorAll("resources > object").forEach((no) => {
      const id = no.getAttribute("id");
      if (!id) return;

      const entrada = {
        id: String(id),
        pid: no.getAttribute("pid"),
        pindex: no.getAttribute("pindex"),
      };

      const noMalha = no.querySelector(":scope > mesh");
      if (noMalha) entrada.malha = parseMalha(noMalha);

      const noComponentes = no.querySelector(":scope > components");
      if (noComponentes) {
        entrada.componentes = [...noComponentes.querySelectorAll("component")].map(
          (c) => ({
            objectId: String(c.getAttribute("objectid")),
            transform: parseTransform(c.getAttribute("transform")),
          })
        );
      }

      objetos.set(String(id), entrada);
    });

    modelo.querySelectorAll("build > item").forEach((item) => {
      itensBuild.push({
        objectId: String(item.getAttribute("objectid")),
        transform: parseTransform(item.getAttribute("transform")),
      });
    });
  }

  const construidos = new Map();

  function construirObjeto(objectId) {
    const id = String(objectId);
    if (construidos.has(id)) return construidos.get(id);

    const dados = objetos.get(id);
    if (!dados) {
      console.warn(`Objeto 3MF ignorado (id ${id} não encontrado)`);
      const vazio = new THREE.Group();
      construidos.set(id, vazio);
      return vazio;
    }

    let resultado;

    if (dados.malha) {
      resultado = construirMalha(dados.malha, dados, materiaisBase, gruposCor);
    } else if (dados.componentes?.length) {
      resultado = new THREE.Group();
      for (const comp of dados.componentes) {
        const filho = construirObjeto(comp.objectId);
        const instancia = filho.clone(true);
        if (comp.transform) instancia.applyMatrix4(comp.transform);
        resultado.add(instancia);
      }
    } else {
      resultado = new THREE.Group();
    }

    construidos.set(id, resultado);
    return resultado;
  }

  const grupo = new THREE.Group();

  if (itensBuild.length > 0) {
    for (const item of itensBuild) {
      const obj = construirObjeto(item.objectId);
      const instancia = obj.clone(true);
      if (item.transform) instancia.applyMatrix4(item.transform);
      grupo.add(instancia);
    }
  } else {
    for (const [id, dados] of objetos) {
      if (dados.malha) grupo.add(construirObjeto(id).clone(true));
    }
  }

  if (grupo.children.length === 0) {
    throw new Error("O arquivo 3MF não contém geometria exibível.");
  }

  return grupo;
}
