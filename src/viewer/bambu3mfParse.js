import * as fflate from 'three/addons/libs/fflate.module.js';

/** Códigos Bambu/Orca por slot de filamento (1-based após decode). */
const SLOT_CODES = [
  '4',
  '8',
  '0C',
  '1C',
  '2C',
  '3C',
  '4C',
  '5C',
  '6C',
  '7C',
  '8C',
  '9C',
  'AC',
  'BC',
  'CC',
  'DC',
  'EC',
  'FC',
];

const TRIANGLE_RE =
  /<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"(?:\s+paint_color="([^"]*)")?\s*\/>/g;
const VERTEX_RE = /<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g;

export function decodeBambuPaintSlot(paintColor) {
  if (!paintColor || paintColor === '0') return null;

  let remaining = paintColor;
  let slot = null;

  for (let i = SLOT_CODES.length - 1; i >= 0; i--) {
    const code = SLOT_CODES[i];
    if (remaining.includes(code)) {
      remaining = remaining.split(code).join('');
      slot = i + 1;
    }
  }

  return slot;
}

export function normalizeColorHex(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const trimmed = hex.trim();
  if (!trimmed) return null;
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(withHash)) return withHash.toUpperCase();
  return withHash.toUpperCase();
}

function zipKey(files, suffix) {
  const normalized = suffix.replace(/^\//, '');
  return (
    Object.keys(files).find((k) => k.replace(/\\/g, '/').endsWith(normalized)) ?? null
  );
}

function readZipText(files, suffix) {
  const key = zipKey(files, suffix);
  if (!key) return null;
  return new TextDecoder().decode(files[key]);
}

export function parseFilamentColours(projectSettings) {
  if (!projectSettings) return [];

  const block = projectSettings.match(/"filament_colour"\s*:\s*\[([\s\S]*?)\]/);
  if (!block) return [];

  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter(Boolean);
}

function parseDefaultExtruder(modelSettings) {
  if (!modelSettings) return 1;
  const match = modelSettings.match(/key="extruder"\s+value="(\d+)"/);
  return match ? parseInt(match[1], 10) : 1;
}

function parseObjectModelPath(mainModelXml) {
  const match = mainModelXml.match(/p:path="([^"]+\.model)"/i);
  if (!match) return '3D/Objects/object_1.model';
  return match[1].replace(/^\//, '');
}

function collectUsedSlots(objectXml, defaultExtruder) {
  const trianglesPart = objectXml.match(/<triangles>[\s\S]*?<\/triangles>/);
  if (!trianglesPart) return new Set();

  const used = new Set();
  let match;

  while ((match = TRIANGLE_RE.exec(trianglesPart[0])) !== null) {
    const paintedSlot = decodeBambuPaintSlot(match[4]);
    used.add(paintedSlot ?? defaultExtruder);
  }

  return used;
}

/**
 * Cores de filamento realmente usadas no mesh (ordem estável por slot).
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string[]}
 */
export function extractFilamentColorsFrom3mfBuffer(buffer) {
  const files = fflate.unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));

  const mainModel = readZipText(files, '3D/3dmodel.model');
  if (!mainModel) return [];

  const projectSettings = readZipText(files, 'Metadata/project_settings.config');
  const modelSettings = readZipText(files, 'Metadata/model_settings.config');
  const filamentColours = parseFilamentColours(projectSettings);
  const defaultExtruder = parseDefaultExtruder(modelSettings);

  const objectPath = parseObjectModelPath(mainModel);
  const objectXml = readZipText(files, objectPath);
  if (!objectXml) return [];

  const usedSlots = [...collectUsedSlots(objectXml, defaultExtruder)].sort((a, b) => a - b);
  const seen = new Set();
  const colors = [];

  for (const slot of usedSlots) {
    const hex = normalizeColorHex(filamentColours[slot - 1]);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    colors.push(hex);
  }

  return colors;
}

export function readBambu3mfZip(buffer) {
  return fflate.unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
}

export function getBambu3mfMeshXml(files) {
  const mainModel = readZipText(files, '3D/3dmodel.model');
  if (!mainModel) throw new Error('3MF Bambu: 3dmodel.model em falta');

  const objectPath = parseObjectModelPath(mainModel);
  const objectXml = readZipText(files, objectPath);
  if (!objectXml) throw new Error(`3MF Bambu: ${objectPath} em falta`);

  return {
    objectXml,
    projectSettings: readZipText(files, 'Metadata/project_settings.config'),
    modelSettings: readZipText(files, 'Metadata/model_settings.config'),
  };
}

export { VERTEX_RE, TRIANGLE_RE };
