/**
 * Presets visuais de filamento para preview.
 */
import * as THREE from "three";

export const PRESETS_MATERIAIS = {
  padrao: { label: "PadrÃ£o", roughness: 0.6, metalness: 0.1 },
  pla_fosco: { label: "PLA fosco", roughness: 0.85, metalness: 0.0 },
  petg_brilho: { label: "PETG brilhante", roughness: 0.25, metalness: 0.05 },
  silk: { label: "Silk", roughness: 0.35, metalness: 0.45 },
  madeira: { label: "Madeira", roughness: 0.95, metalness: 0.0, colorTint: 0xc4a574 },
  metal: { label: "Metal", roughness: 0.3, metalness: 0.85 },
};

const backup = new Map();

function clonarProps(mat) {
  return {
    roughness: mat.roughness,
    metalness: mat.metalness,
    color: mat.color?.clone(),
  };
}

export function salvarMateriaisOriginais(object) {
  backup.clear();
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    backup.set(
      child.uuid,
      mats.map((m) => clonarProps(m))
    );
  });
}

export function aplicarPresetMaterial(object, presetId) {
  const preset = PRESETS_MATERIAIS[presetId] || PRESETS_MATERIAIS.padrao;

  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];

    mats.forEach((mat) => {
      if (mat.roughness !== undefined) mat.roughness = preset.roughness;
      if (mat.metalness !== undefined) mat.metalness = preset.metalness;
      if (preset.colorTint && mat.color && !mat.map) {
        mat.color.set(preset.colorTint);
      }
      mat.needsUpdate = true;
    });
  });
}

export function restaurarMateriais(object) {
  object.traverse((child) => {
    if (!child.isMesh || !backup.has(child.uuid)) return;
    const orig = backup.get(child.uuid);
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((mat, i) => {
      if (!orig[i]) return;
      mat.roughness = orig[i].roughness;
      mat.metalness = orig[i].metalness;
      if (orig[i].color) mat.color.copy(orig[i].color);
      mat.needsUpdate = true;
    });
  });
}
