/** URL absoluta para fetch/loaders (caminhos com acentos ou % encoding). */
export function resolveProductAssetUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  try {
    return new URL(path, window.location.origin).href;
  } catch {
    return path;
  }
}
