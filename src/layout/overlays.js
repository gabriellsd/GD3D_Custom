export function renderOverlays() {
  return `
    <div id="toast-container" class="fixed bottom-5 right-5 z-50 flex flex-col gap-2"></div>
    <div id="product-modal" class="fixed inset-0 bg-black/70 backdrop-blur-md z-[70] flex items-center justify-center p-4 hidden">
        <div class="bg-slate-950 border border-slate-700/80 rounded-3xl max-w-2xl w-full overflow-hidden relative shadow-2xl shadow-black/50">
            <button type="button" data-modal-close class="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800/80 p-2 rounded-full border border-slate-700/50 transition z-10">
                <i class="fa-solid fa-xmark text-lg"></i>
            </button>
            <div class="grid grid-cols-1 md:grid-cols-2">
                <div id="modal-preview" class="store-preview-panel relative flex items-center justify-center p-8 border-r border-slate-800 h-64 md:h-full min-h-[300px]">
                    <div id="modal-image" class="text-7xl drop-shadow-sm"></div>
                </div>
                <div class="p-6 sm:p-8 flex flex-col justify-between space-y-6">
                    <div>
                        <h3 id="modal-title" class="text-2xl font-bold text-white">Nome do Produto</h3>
                        <p id="modal-price" class="text-xl font-extrabold text-brand-500 mt-1">R$ 0,00</p>
                        <p id="modal-desc" class="text-sm text-slate-400 mt-4 leading-relaxed">Descrição detalhada do produto.</p>
                        <div id="modal-sizes" class="mt-4"></div>
                    </div>
                    <div class="pt-4 border-t border-slate-800">
                        <button type="button" id="modal-add-btn" class="w-full py-3 bg-brand-500 hover:bg-brand-600 text-brand-900 font-bold rounded-xl transition flex items-center justify-center gap-2">
                            <i class="fa-solid fa-cart-plus"></i> Adicionar ao Carrinho
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div id="cart-panel" class="fixed inset-y-0 right-0 w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl z-[70] transform translate-x-full transition-transform duration-300 flex flex-col justify-between">
        <div class="p-6 border-b border-slate-800 flex items-center justify-between">
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-cart-shopping text-brand-500 text-xl"></i>
                <h3 class="text-lg font-bold text-white">Carrinho de Encomenda</h3>
            </div>
            <button type="button" data-cart-toggle class="text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-lg transition">
                <i class="fa-solid fa-xmark text-lg"></i>
            </button>
        </div>
        <div id="cart-items" class="p-6 flex-grow overflow-y-auto space-y-4">
            <div id="cart-empty" class="text-center py-16 space-y-4">
                <i class="fa-solid fa-box-open text-slate-600 text-5xl"></i>
                <p class="text-slate-400 text-sm">O seu carrinho ainda está vazio.</p>
                <a href="/produtos.html" class="text-brand-500 font-bold text-xs uppercase tracking-wider hover:underline">Ver produtos</a>
            </div>
        </div>
        <div class="p-6 border-t border-slate-800 bg-slate-950 space-y-4">
            <div class="flex items-center justify-between text-sm font-semibold">
                <span class="text-slate-400">Subtotal</span>
                <span id="cart-total" class="text-white text-lg font-extrabold">R$ 0,00</span>
            </div>
            <p class="text-[10px] text-slate-500 leading-relaxed">
                As encomendas são enviadas via CTT ou recolhidas localmente. O pagamento é realizado por MBWay ou Transferência após confirmação rápida no WhatsApp.
            </p>
            <button type="button" data-cart-checkout class="w-full py-3.5 bg-green-600 hover:bg-green-500 text-white font-extrabold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-green-600/10">
                <i class="fa-brands fa-whatsapp text-lg animate-bounce"></i> Enviar Pedido via WhatsApp
            </button>
        </div>
    </div>`;
}
