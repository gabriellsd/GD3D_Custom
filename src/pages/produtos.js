import { initShell } from '../layout/shell.js';
import { initShop } from '../shop/products.js';

initShell({
  page: 'produtos',
  title: 'Loja — Modelos 3D Prontos | GD3D Creative',
}).then(() => initShop());
