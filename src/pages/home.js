import { initShell } from '../layout/shell.js';
import { renderHomeFeatured } from '../home/featured.js';

initShell({
  page: 'inicio',
  title: 'GD3D Creative — Loja de Modelos 3D Prontos',
});

renderHomeFeatured();
