import { WHATSAPP_PHONE } from '../config.js';
import { PRODUCTS } from '../data/products.js';
import { escapeHtml } from '../shop/sizes.js';
import { formatColorsForMessage } from '../utils/colorLabels.js';
import { formatBRL } from '../utils/format.js';
import { showToast } from '../utils/toast.js';

const STORAGE_KEY = 'gd3d-cart';

let cart = loadCart();

function catalogProduct(item) {
  return PRODUCTS.find((p) => p.id === item.id);
}

function enrichCartItem(item) {
  const product = catalogProduct(item);
  if (!product) return item;
  return {
    ...item,
    previewImage: item.previewImage || product.previewImage,
    icon: item.icon || product.icon,
    colors: item.colors?.length ? item.colors : product.colors,
  };
}

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items.map(enrichCartItem) : [];
  } catch {
    return [];
  }
}

function renderCartEmptyState() {
  const el = document.createElement('div');
  el.id = 'cart-empty';
  el.className = 'text-center py-16 space-y-4';
  el.innerHTML = `
    <i class="fa-solid fa-box-open text-slate-600 text-5xl"></i>
    <p class="text-slate-400 text-sm">O seu carrinho ainda está vazio.</p>
    <a href="/produtos.html" class="text-brand-500 font-bold text-xs uppercase tracking-wider hover:underline">Ver produtos</a>`;
  return el;
}

function buildCartThumbHtml(item) {
  const src = item.previewImage || catalogProduct(item)?.previewImage;
  if (src) {
    return `<div class="cart-item-thumb">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(item.name)}" loading="lazy" />
    </div>`;
  }
  return `<div class="cart-item-thumb cart-item-thumb--icon">
    <i class="${item.icon || 'fa-solid fa-cube'}"></i>
  </div>`;
}

function persistCart() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

export function getCart() {
  return cart;
}

export function toggleCart() {
  document.getElementById('cart-panel')?.classList.toggle('translate-x-full');
}

function updateCartUI() {
  const container = document.getElementById('cart-items');
  const countBadge = document.getElementById('cart-count');
  const totalText = document.getElementById('cart-total');
  if (!container || !countBadge || !totalText) return;

  const totalQty = cart.reduce((acc, curr) => acc + curr.qty, 0);
  countBadge.textContent = totalQty;

  if (cart.length === 0) {
    container.replaceChildren(renderCartEmptyState());
    totalText.textContent = formatBRL(0);
    return;
  }

  container.replaceChildren();
  let totalVal = 0;

  cart.forEach((item, index) => {
    totalVal += item.price * item.qty;
    const itemDiv = document.createElement('div');
    itemDiv.className = 'flex items-center justify-between gap-4 p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/60';
    itemDiv.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        ${buildCartThumbHtml(item)}
        <div class="min-w-0">
          <h4 class="text-xs font-bold text-white line-clamp-1">${escapeHtml(item.name)}</h4>
          <p class="text-[10px] text-slate-500">${item.size ? `Tamanho: ${item.size} · ` : ''}Unidade: ${formatBRL(item.price)}</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <button type="button" data-qty-minus="${index}" class="px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-800 text-xs transition">-</button>
          <span class="px-2 text-xs font-mono text-white">${item.qty}</span>
          <button type="button" data-qty-plus="${index}" class="px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-800 text-xs transition">+</button>
        </div>
        <button type="button" data-cart-remove="${index}" class="text-slate-500 hover:text-red-500 p-1 transition" title="Remover">
          <i class="fa-regular fa-trash-can text-sm"></i>
        </button>
      </div>`;
    container.appendChild(itemDiv);
  });

  totalText.textContent = formatBRL(totalVal);
}

export function addToCart(item) {
  const sizeKey = item.size || '';
  const existing = cart.find((i) => i.id === item.id && (i.size || '') === sizeKey);
  if (existing) {
    existing.qty += 1;
    if (!existing.previewImage && item.previewImage) existing.previewImage = item.previewImage;
  } else {
    cart.push({ ...enrichCartItem(item), qty: 1 });
  }
  persistCart();
  updateCartUI();
  showToast(`"${item.name}" adicionado ao carrinho!`);
}

function updateQty(index, change) {
  const item = cart[index];
  if (!item) return;
  item.qty += change;
  if (item.qty <= 0) cart.splice(index, 1);
  persistCart();
  updateCartUI();
}

function removeFromCart(index) {
  const name = cart[index].name;
  cart.splice(index, 1);
  persistCart();
  updateCartUI();
  showToast(`"${name}" removido do carrinho.`, 'error');
}

function buildWhatsAppOrderMessage() {
  let total = 0;
  const lines = ['*Pedido — GD3D Creative*', ''];

  cart.forEach((item, i) => {
    const sub = item.price * item.qty;
    total += sub;
    const product = catalogProduct(item);
    const colors =
      item.colors?.length ? formatColorsForMessage(item.colors) : formatColorsForMessage(product?.colors);

    lines.push(`*${i + 1}. ${item.name}*`);
    if (item.size) lines.push(`Tamanho: ${item.size}`);
    lines.push(`Quantidade: ${item.qty}`);
    lines.push(`Subtotal: ${formatBRL(sub)}`);
    if (colors) lines.push(`Cores: ${colors} (conforme o site)`);
    lines.push('');
  });

  lines.push(`*Total estimado:* ${formatBRL(total)}`);
  lines.push('');
  lines.push('Gostaria de finalizar este pedido.');
  lines.push('');
  lines.push(
    'Pode indicar como prefere receber (envio CTT ou recolha local) e a forma de pagamento (MBWay ou transferência)? Confirmamos prazo e valor final por aqui.'
  );
  lines.push('');
  lines.push('Obrigado!');

  return lines.join('\n');
}

function checkoutToWhatsApp() {
  if (cart.length === 0) {
    showToast('O carrinho está vazio para encomendar!', 'error');
    return;
  }

  const text = buildWhatsAppOrderMessage();
  window.open(`https://api.whatsapp.com/send?phone=${WHATSAPP_PHONE}&text=${encodeURIComponent(text)}`, '_blank');
}

export function bindCartUI() {
  cart = cart.map(enrichCartItem);
  persistCart();

  document.querySelectorAll('[data-cart-toggle]').forEach((el) => {
    el.addEventListener('click', toggleCart);
  });

  document.querySelector('[data-cart-checkout]')?.addEventListener('click', checkoutToWhatsApp);

  document.getElementById('cart-items')?.addEventListener('click', (e) => {
    const minus = e.target.closest('[data-qty-minus]');
    const plus = e.target.closest('[data-qty-plus]');
    const remove = e.target.closest('[data-cart-remove]');
    if (minus) {
      e.preventDefault();
      updateQty(Number(minus.dataset.qtyMinus), -1);
      return;
    }
    if (plus) {
      e.preventDefault();
      updateQty(Number(plus.dataset.qtyPlus), 1);
      return;
    }
    if (remove) {
      e.preventDefault();
      removeFromCart(Number(remove.dataset.cartRemove));
    }
  });

  updateCartUI();
}
