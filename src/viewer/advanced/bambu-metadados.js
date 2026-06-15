/**
 * Metadados extras de impressÃ£o Bambu (project_settings).
 */

function parseCampoNumerico(texto, campo) {
  const m = texto.match(new RegExp(`"${campo}"\\s*:\\s*([\\d.]+)`));
  return m ? parseFloat(m[1]) : null;
}

function parseCampoString(texto, campo) {
  const m = texto.match(new RegExp(`"${campo}"\\s*:\\s*"([^"]*)"`));
  return m ? m[1] : null;
}

export function extrairMetadadosBambu(projectSettings) {
  if (!projectSettings) return {};

  const nozzle = parseCampoNumerico(projectSettings, "nozzle_diameter");
  const layer = parseCampoNumerico(projectSettings, "layer_height");
  const infill = parseCampoNumerico(projectSettings, "sparse_infill_density");
  const brim = parseCampoString(projectSettings, "brim_type");
  const suporte = parseCampoString(projectSettings, "enable_support");
  const perfil = parseCampoString(projectSettings, "print_settings_id");

  const temps = [];
  for (let i = 0; i < 8; i++) {
    const t = parseCampoNumerico(projectSettings, `nozzle_temperature_${i}`);
    if (t !== null) temps.push(t);
  }

  return {
    bicoMm: nozzle,
    alturaCamadaMm: layer,
    preenchimentoPct: infill,
    brim,
    suporteAtivo: suporte,
    perfil,
    temperaturasBico: temps,
  };
}

export function secaoMetadadosBambu(meta) {
  if (!meta || !Object.keys(meta).length) return null;

  const itens = [];
  if (meta.perfil) itens.push(["Perfil", meta.perfil]);
  if (meta.bicoMm != null) itens.push(["Bico", `${meta.bicoMm} mm`]);
  if (meta.alturaCamadaMm != null) itens.push(["Altura de camada", `${meta.alturaCamadaMm} mm`]);
  if (meta.preenchimentoPct != null) itens.push(["Preenchimento", `${meta.preenchimentoPct}%`]);
  if (meta.brim) itens.push(["Brim", meta.brim]);
  if (meta.suporteAtivo) itens.push(["Suportes", meta.suporteAtivo]);
  if (meta.temperaturasBico?.length) {
    itens.push(["Temp. bico", `${meta.temperaturasBico[0]}Â°C`]);
  }

  if (!itens.length) return null;
  return { titulo: "ImpressÃ£o Bambu", itens };
}
