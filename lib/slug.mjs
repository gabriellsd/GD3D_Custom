/** Slug URL/pasta a partir de texto legível. */
export function nomeToSlug(nome) {
  return String(nome)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}
