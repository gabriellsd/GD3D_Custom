import { initShell } from '../layout/shell.js';
import { initCustomizer } from '../customizer/scene.js';
import { initViewerCatalog, bindViewerOrderButton } from '../viewer/catalog.js';

initShell({
  page: 'visualizador',
  title: 'Visualizar em 3D — GD3D Creative',
});

initCustomizer();
initViewerCatalog();
bindViewerOrderButton();
