/**
 * Extrai ZIP com modelo + texturas e retorna arquivos para carregamento.
 */
import * as fflate from "three/addons/libs/fflate.module.js";

const EXT_MODELO = [".fbx", ".glb", ".gltf", ".obj", ".stl", ".3mf", ".mf3", ".ply", ".off", ".amf"];

function normalizarCaminho(chave) {
  return chave.replace(/\\/g, "/").replace(/^\.\//, "");
}

function extensao(nome) {
  const i = nome.lastIndexOf(".");
  return i >= 0 ? nome.slice(i).toLowerCase() : "";
}

function mimePorExt(ext) {
  const map = {
    ".fbx": "application/octet-stream",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".obj": "text/plain",
    ".stl": "application/octet-stream",
    ".3mf": "application/3mf",
    ".ply": "application/octet-stream",
    ".off": "text/plain",
    ".amf": "application/xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".tga": "image/tga",
  };
  return map[ext] || "application/octet-stream";
}

export async function extrairZip(file) {
  const buffer = await file.arrayBuffer();
  const zip = fflate.unzipSync(new Uint8Array(buffer));
  const entradas = [];

  for (const [chave, dados] of Object.entries(zip)) {
    const caminho = normalizarCaminho(chave);
    if (!caminho || caminho.endsWith("/")) continue;
    const nome = caminho.split("/").pop();
    const ext = extensao(nome);
    const blob = new Blob([dados], { type: mimePorExt(ext) });
    entradas.push(new File([blob], nome, { type: mimePorExt(ext) }));
  }

  if (!entradas.length) throw new Error("ZIP vazio");

  const modelos = entradas.filter((f) => EXT_MODELO.includes(extensao(f.name)));
  if (!modelos.length) throw new Error("Nenhum modelo 3D no ZIP");

  const prioridade = [".fbx", ".glb", ".3mf", ".mf3", ".obj", ".stl", ".amf", ".ply", ".off", ".gltf"];
  modelos.sort((a, b) => {
    const ea = extensao(a.name);
    const eb = extensao(b.name);
    return prioridade.indexOf(ea) - prioridade.indexOf(eb);
  });

  return { principal: modelos[0], todos: entradas };
}
