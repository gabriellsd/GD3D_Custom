/**
 * Carregamento FBX com texturas embutidas ou arquivos companheiros (.png, .jpgâ€¦).
 */
import * as THREE from "three";
import { FBXLoader } from "./FBXLoader.js";

const MAPAS_SRGB = ["map", "emissiveMap", "specularMap"];

export function ajustarMateriaisObject3D(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;

    const materiais = Array.isArray(child.material)
      ? child.material
      : [child.material];

    for (const mat of materiais) {
      if (!mat) continue;

      for (const chave of MAPAS_SRGB) {
        if (mat[chave]) mat[chave].colorSpace = THREE.SRGBColorSpace;
      }

      if (mat.map) {
        mat.color.set(0xffffff);
        mat.transparent = mat.transparent || mat.opacity < 1;
      }

      mat.needsUpdate = true;
    }

    if (child.geometry && !child.geometry.attributes.normal) {
      child.geometry.computeVertexNormals();
    }
  });
}

function registrarArquivo(urlsPorNome, arquivo, url) {
  const lower = arquivo.name.toLowerCase();
  const base = lower.split(/[/\\]/).pop();
  const semExt = base.replace(/\.[^.]+$/, "");

  urlsPorNome.set(lower, url);
  urlsPorNome.set(base, url);
  urlsPorNome.set(semExt, url);
}

export function carregarFbx(arquivos) {
  const lista = Array.isArray(arquivos) ? arquivos : [arquivos];
  const fbxFile = lista.find((f) => f.name.toLowerCase().endsWith(".fbx"));
  if (!fbxFile) throw new Error("Arquivo FBX nÃ£o encontrado");

  const urlsPorNome = new Map();
  const urlsCriadas = [];

  for (const arquivo of lista) {
    const url = URL.createObjectURL(arquivo);
    urlsCriadas.push(url);
    registrarArquivo(urlsPorNome, arquivo, url);
  }

  return new Promise((resolve, reject) => {
    let objeto = null;
    const blobsTextura = [];

    const manager = new THREE.LoadingManager(
      () => {
        ajustarMateriaisObject3D(objeto);
        resolve({
          object: objeto,
          urls: [...urlsCriadas, ...blobsTextura],
        });
      },
      undefined,
      (erro) => {
        revogarUrlsFbx([...urlsCriadas, ...blobsTextura]);
        reject(erro);
      }
    );

    manager.setURLModifier((url) => {
      const nome = extrairNomeArquivo(url);
      if (urlsPorNome.has(nome)) return urlsPorNome.get(nome);

      const semExt = nome.replace(/\.[^.]+$/, "");
      if (urlsPorNome.has(semExt)) return urlsPorNome.get(semExt);

      return url;
    });

    const loader = new FBXLoader(manager);
    const criarBlobOriginal = URL.createObjectURL.bind(URL);

    URL.createObjectURL = (blob) => {
      const url = criarBlobOriginal(blob);
      if (blob?.type?.startsWith("image/")) blobsTextura.push(url);
      return url;
    };

    fbxFile
      .arrayBuffer()
      .then((buffer) => {
        try {
          objeto = loader.parse(buffer, fbxFile.name);
          URL.createObjectURL = criarBlobOriginal;
          if (manager.onLoad && manager.pending === 0) {
            manager.onLoad();
          }
        } catch (erro) {
          URL.createObjectURL = criarBlobOriginal;
          revogarUrlsFbx([...urlsCriadas, ...blobsTextura]);
          reject(erro);
        }
      })
      .catch((erro) => {
        URL.createObjectURL = criarBlobOriginal;
        reject(erro);
      });
  });
}

function extrairNomeArquivo(url) {
  if (!url) return "";
  const limpo = url.split("?")[0];
  const base = limpo.split(/[/\\]/).pop() || "";
  try {
    return decodeURIComponent(base).toLowerCase();
  } catch {
    return base.toLowerCase();
  }
}

export function revogarUrlsFbx(urls) {
  urls?.forEach((u) => {
    try {
      URL.revokeObjectURL(u);
    } catch {
      /* ignore */
    }
  });
}
