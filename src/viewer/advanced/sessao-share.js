/**
 * Compartilhar/restaurar estado da sessÃ£o via URL.
 */

export function serializarSessao(estado) {
  const json = JSON.stringify(estado);
  return btoa(unescape(encodeURIComponent(json)));
}

export function desserializarSessao(hash) {
  try {
    const json = decodeURIComponent(escape(atob(hash)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function gerarLinkCompartilhamento(estado) {
  const base = `${location.origin}${location.pathname}`;
  const s = serializarSessao(estado);
  return `${base}?sessao=${encodeURIComponent(s)}`;
}

export function lerSessaoDaUrl() {
  const params = new URLSearchParams(location.search);
  const s = params.get("sessao");
  if (!s) return null;
  return desserializarSessao(s);
}

export async function copiarLinkCompartilhamento(estado) {
  const url = gerarLinkCompartilhamento(estado);
  await navigator.clipboard.writeText(url);
  return url;
}
