import { WHATSAPP_PHONE } from '../config.js';

export function initBudgetForm() {
  const form = document.getElementById('budget-form');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const name = document.getElementById('budget-name').value;
    const link = document.getElementById('budget-link').value || 'Nenhum link fornecido';
    const material = document.getElementById('budget-material').value;
    const size = document.getElementById('budget-size').value || 'Tamanho padrão sugerido';
    const msg = document.getElementById('budget-message').value || 'Sem notas extras';

    const text =
      `🛠️ *PROJETO À MEDIDA — GD3D* 🛠️\n\n` +
      `👤 *Nome:* ${name}\n` +
      `🔗 *Link do Ficheiro:* ${link}\n` +
      `🧬 *Material:* ${material}\n` +
      `📐 *Tamanho:* ${size}\n` +
      `💬 *Especificações:* ${msg}\n\n` +
      `_Pretendo obter um orçamento rápido de impressão com base nos detalhes informados._`;

    window.open(`https://api.whatsapp.com/send?phone=${WHATSAPP_PHONE}&text=${encodeURIComponent(text)}`, '_blank');
  });
}
