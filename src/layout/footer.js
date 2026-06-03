import { NAV } from './nav.js';

export function renderFooter() {
  const navItems = NAV.map(
    ({ href, label }) =>
      `<li><a href="${href}" class="hover:text-brand-500 transition">${label}</a></li>`
  ).join('');

  return `
    <footer class="site-footer bg-slate-950 border-t border-slate-900 py-5 sm:py-6">
        <div class="w-full px-4 sm:px-6 lg:px-8">
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
                <div class="col-span-2 md:col-span-1 space-y-2">
                    <a href="/" class="inline-block">
                        <img src="/logo/gd3d-header.png" alt="GD3D" class="h-10 sm:h-11 w-auto max-w-[200px] object-contain object-left" width="360" height="135" />
                    </a>
                    <p class="text-[11px] text-slate-500 leading-snug max-w-[220px]">
                        Modelos 3D prontos para encomenda. Projetos personalizados disponíveis.
                    </p>
                </div>
                <div>
                    <h4 class="site-footer-heading">Navegação</h4>
                    <ul class="site-footer-list">${navItems}</ul>
                </div>
                <div>
                    <h4 class="site-footer-heading">Garantia</h4>
                    <ul class="site-footer-list text-slate-500">
                        <li><i class="fa-solid fa-check text-brand-500 mr-1.5 text-[10px]"></i>Inspeção manual</li>
                        <li><i class="fa-solid fa-check text-brand-500 mr-1.5 text-[10px]"></i>Filamentos de qualidade</li>
                        <li><i class="fa-solid fa-check text-brand-500 mr-1.5 text-[10px]"></i>Suporte especializado</li>
                    </ul>
                </div>
            </div>
            <p class="site-footer-copy">gd3d.com.br — Todos os direitos reservados.</p>
        </div>
    </footer>`;
}
