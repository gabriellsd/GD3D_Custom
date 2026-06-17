import { resolveProductAssetUrl } from '../utils/asset-url.js';
import { carregar3mf } from './advanced/loader-3mf.js';

export { decodeBambuPaintSlot, extractFilamentColorsFrom3mfBuffer } from './bambu3mfParse.js';

/** Parse Bambu/Orca 3MF — delega ao loader unificado do visualizador. */
export function parseBambu3mfBuffer(buffer, options = {}) {
  return carregar3mf(buffer, options).object;
}

/**
 * Carrega 3MF Bambu com paint_color (multicolor AMS).
 */
export function loadBambuPaint3mf(url, onLoad, onProgress, onError) {
  fetch(resolveProductAssetUrl(url))
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((buffer) => {
      onProgress?.({ loaded: buffer.byteLength, total: buffer.byteLength });
      onLoad(parseBambu3mfBuffer(buffer));
    })
    .catch((err) => {
      console.warn('Bambu 3MF loader:', err);
      onError?.(err);
    });
}
