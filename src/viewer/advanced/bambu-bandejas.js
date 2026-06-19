/**
 * Bandejas (plates) em 3MF Bambu Studio — Metadata/plate_N.json + nomes em model_settings.
 */
import * as fflate from "three/addons/libs/fflate.module.js";

const SUPORTE_RE =
  /support|suporte|generic|genérico|generico|cube|cubo|brim|skirt|raft|pin|dummy|placeholder|prime/i;

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

function parsePartesModelSettings(modelSettings) {
  const mapa = new Map();
  if (!modelSettings) return mapa;

  const partRe = /<part id="(\d+)"[\s\S]*?<\/part>/gi;
  let match;
  while ((match = partRe.exec(modelSettings)) !== null) {
    const partId = parseInt(match[1], 10);
    const bloco = match[0];
    const nome = bloco.match(/key="name"\s+value="([^"]*)"/i)?.[1]?.trim() ?? "";
    const subtype = bloco.match(/subtype="([^"]*)"/i)?.[1] ?? "";
    mapa.set(partId, { nome, subtype });
  }
  return mapa;
}

function ehPecaSuporte(nome, subtype = "") {
  if (!nome) return false;
  if (/support/i.test(subtype)) return true;
  return SUPORTE_RE.test(nome);
}

/** @param {Record<string, Uint8Array>} arquivosZip */
export function detectarBandejas3mf(arquivosZip) {
  const arquivos = normalizarZip(arquivosZip);
  const bandejas = [];

  for (let numero = 1; numero < 64; numero++) {
    const chave = chaveZip(arquivos, `Metadata/plate_${numero}.json`);
    if (!chave) break;

    let json;
    try {
      json = JSON.parse(new TextDecoder().decode(arquivos[chave]));
    } catch {
      break;
    }

    const pecas = (json.bbox_objects ?? [])
      .map((obj) => ({
        nome: String(obj.name ?? "").trim(),
        id: obj.id ?? null,
        area: obj.area ?? null,
      }))
      .filter((p) => p.nome && !ehPecaSuporte(p.nome));

    bandejas.push({
      numero,
      pecas,
      bbox: json.bbox_all ?? null,
      bedType: json.bed_type ?? null,
    });
  }

  return bandejas;
}

export function detectarBandejas3mfBuffer(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const arquivos = fflate.unzipSync(buf);
  return detectarBandejas3mf(arquivos);
}

/**
 * Mapa object id (part id no model_settings) → { nome, bandeja, subtype }.
 * @param {Record<string, Uint8Array>} arquivosZip
 */
export function mapearPartesPorObjectId(arquivosZip) {
  const arquivos = normalizarZip(arquivosZip);
  const partes = parsePartesModelSettings(
    lerTextoZip(arquivos, "Metadata/model_settings.config")
  );

  const nomeParaBandeja = new Map();
  for (const bandeja of detectarBandejas3mf(arquivos)) {
    for (const peca of bandeja.pecas) {
      if (peca.nome) nomeParaBandeja.set(peca.nome, bandeja.numero);
    }
  }

  const mapa = new Map();
  for (const [objectId, info] of partes) {
    if (ehPecaSuporte(info.nome, info.subtype)) continue;
    mapa.set(objectId, {
      nome: info.nome,
      subtype: info.subtype,
      bandeja: nomeParaBandeja.get(info.nome) ?? null,
    });
  }
  return mapa;
}

/** Filtra componentes da montagem para uma bandeja (1-based). */
export function filtrarComponentesPorBandeja(components, arquivosZip, bandejaNum) {
  if (!bandejaNum || !components?.length) return components ?? [];
  const partMap = mapearPartesPorObjectId(arquivosZip);
  return components.filter((c) => partMap.get(c.objectId)?.bandeja === bandejaNum);
}
