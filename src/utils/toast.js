export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl transition duration-300 transform translate-y-5 opacity-0 ${
    type === 'success' ? 'bg-slate-900 border-brand-500 text-white' : 'bg-slate-900 border-red-500 text-white'
  }`;

  const icon = type === 'success' ? 'fa-circle-check text-brand-500' : 'fa-circle-exclamation text-red-500';
  toast.innerHTML = `
    <i class="fa-solid ${icon} text-lg"></i>
    <span class="text-xs font-semibold">${message}</span>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.remove('translate-y-5', 'opacity-0'));

  setTimeout(() => {
    toast.classList.add('translate-y-5', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
