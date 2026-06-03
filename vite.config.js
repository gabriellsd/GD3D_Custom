import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { runProductsSync } from './scripts/sync-products.mjs';

function productsSyncPlugin() {
  let debounceTimer;
  let syncing = false;

  return {
    name: 'gd3d-products-sync',
    buildStart() {
      runProductsSync({ quiet: true });
    },
    configureServer(server) {
      const productsDir = resolve(__dirname, 'public/products').replace(/\\/g, '/');

      const scheduleSync = (file) => {
        const normalized = file.replace(/\\/g, '/');
        if (!normalized.includes('/public/products/')) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (syncing) return;
          syncing = true;
          try {
            const { changed } = runProductsSync({ quiet: true });
            if (changed) {
              // HMR atualiza products.catalog.js — sem full-reload (evita piscar)
            }
          } finally {
            syncing = false;
          }
        }, 900);
      };

      server.watcher.add(productsDir);
      server.watcher.on('add', scheduleSync);
      server.watcher.on('unlink', scheduleSync);
      server.watcher.on('change', (file) => {
        const normalized = file.replace(/\\/g, '/').toLowerCase();
        if (
          normalized.endsWith('/product.json') ||
          normalized.endsWith('/info.txt') ||
          normalized.endsWith('/produto.txt')
        ) {
          scheduleSync(file);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), productsSyncPlugin()],
  server: {
    watch: {
      ignored: ['**/public/products/**/*.stl', '**/public/products/**/*.3mf'],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        produtos: resolve(__dirname, 'produtos.html'),
        visualizador: resolve(__dirname, 'visualizador.html'),
        materiais: resolve(__dirname, 'materiais.html'),
        sobre: resolve(__dirname, 'sobre.html'),
        contato: resolve(__dirname, 'contato.html'),
      },
    },
  },
});
