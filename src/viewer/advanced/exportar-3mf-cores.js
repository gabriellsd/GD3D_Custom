/**
 * Exporta 3MF Bambu/Orca com filament_colour atualizado conforme cores do visualizador.
 */
import * as fflate from "three/addons/libs/fflate.module.js";
import { detectarBambu3mf, parseFilamentColours } from "./bambu-3mf.js";
import { normalizarHexCor } from "./cores-modelo.js";
import { coletarCoresFilamentoPorSlot } from "./editor-cores.js";

function normalizarZip(zip) {
  const arquivos = {};
  for (const chave of Object.keys(zip)) {
    arquivos[chave.replace(/\\/g, "/")] = zip[chave];
  }
  return arquivos;
}

function chaveZip(arquivos, sufixo) {
  const normalizado = sufixo.replace(/^\//, "");
  return (
    Object.keys(arquivos).find((k) => k.replace(/\\/g, "/").endsWith(normalizado)) ?? null
  );
}

function lerTextoZip(arquivos, sufixo) {
  const chave = chaveZip(arquivos, sufixo);
  if (!chave) return null;
  return new TextDecoder().decode(arquivos[chave]);
}

export function extensao3mf(nome) {
  return /\.(3mf|mf3)$/i.test(String(nome || ""));
}

export function mesclarFilamentColours(existentes, slotParaHex) {
  const novas = [...existentes];
  let maxSlot = novas.length;

  for (const slotStr of Object.keys(slotParaHex)) {
    maxSlot = Math.max(maxSlot, parseInt(slotStr, 10));
  }

  while (novas.length < maxSlot) {
    novas.push("#CCCCCC");
  }

  for (const [slotStr, hex] of Object.entries(slotParaHex)) {
    const idx = parseInt(slotStr, 10) - 1;
    if (idx < 0) continue;
    const normalizado = normalizarHexCor(hex);
    if (normalizado) novas[idx] = normalizado;
  }

  return novas;
}

export function aplicarFilamentColoursNoProjectSettings(projectSettings, slotParaHex) {
  if (!projectSettings?.includes("filament_colour")) return null;

  const existentes = parseFilamentColours(projectSettings);
  if (!existentes.length && !Object.keys(slotParaHex).length) return null;

  const novas = mesclarFilamentColours(existentes, slotParaHex);
  const bloco = novas.map((cor) => `"${normalizarHexCor(cor) || cor}"`).join(", ");

  return projectSettings.replace(
    /"filament_colour"\s*:\s*\[([\s\S]*?)\]/,
    `"filament_colour": [${bloco}]`
  );
}

function nomeArquivoExportado(nomeOriginal) {
  const base = String(nomeOriginal || "modelo").replace(/\.[^.]+$/, "");
  return `${base}-cores.3mf`;
}

function baixarBuffer(buffer, nome) {
  const blob = new Blob([buffer], { type: "application/vnd.ms-package.3dmanufacturing-3dmodel+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = nome;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {Record<number, string>} slotParaHex mapa slot AMS → #RRGGBB
 * @param {string} [nomeOriginal]
 */
export function exportar3mfComCores(buffer, slotParaHex, nomeOriginal = "modelo.3mf") {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (!detectarBambu3mf(bytes)) {
    throw new Error("Este 3MF não contém metadados Bambu/Orca (filament_colour).");
  }

  const slotMap = slotParaHex instanceof Map ? Object.fromEntries(slotParaHex) : slotParaHex;
  if (!Object.keys(slotMap).length) {
    throw new Error("Nenhuma cor de filamento detectada no modelo.");
  }

  const zip = normalizarZip(fflate.unzipSync(bytes));
  const chaveConfig = chaveZip(zip, "Metadata/project_settings.config");
  if (!chaveConfig) {
    throw new Error("3MF sem Metadata/project_settings.config.");
  }

  const projectSettings = lerTextoZip(zip, "Metadata/project_settings.config");
  const atualizado = aplicarFilamentColoursNoProjectSettings(projectSettings, slotMap);
  if (!atualizado) {
    throw new Error("Não foi possível atualizar filament_colour no ficheiro.");
  }

  zip[chaveConfig] = new TextEncoder().encode(atualizado);

  const saida = fflate.zipSync(zip, { level: 6 });
  baixarBuffer(saida, nomeArquivoExportado(nomeOriginal));
}

export function coletarCoresParaExportacao(object3d, metaBambu = null) {
  return coletarCoresFilamentoPorSlot(object3d, metaBambu);
}
