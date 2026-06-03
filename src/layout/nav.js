export const NAV = [
  { id: 'produtos', href: '/produtos.html', label: 'Loja' },
  { id: 'materiais', href: '/materiais.html', label: 'Filamentos' },
  { id: 'sobre', href: '/sobre.html', label: 'Como Funciona' },
  { id: 'contato', href: '/contato.html', label: 'Seu Projeto' },
];

export const CTA_LOJA = { href: '/produtos.html', label: 'Ver Loja' };
export const CTA_PERSONALIZADO = { href: '/contato.html', label: 'Seu Projeto' };

export function navLinkClass(active) {
  const base = active
    ? 'text-brand-500 font-semibold'
    : 'text-slate-300 hover:text-brand-500 font-medium';
  return `${base} transition`;
}
