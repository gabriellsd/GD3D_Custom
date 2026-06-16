import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { authDevPlugin } from './scripts/vite-auth-plugin.mjs';
import { runProductsSync } from './scripts/sync-products.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = resolve(__dirname, 'public');

/** Garante .3mf/.stl servidos do disco (novos produtos sem reiniciar o dev). */
function serveProductAssetsPlugin() {
  const MIME = {
    '.3mf': 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
    '.stl': 'model/stl',
    '.mf3': 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
  };

  return {
    name: 'gd3d-serve-product-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url?.split('?')[0] ?? '';
        if (!raw.startsWith('/products/')) return next();

        let rel;
        try {
          rel = decodeURIComponent(raw.slice(1));
        } catch {
          return next();
        }

        if (!/\.(3mf|stl|mf3)$/i.test(rel)) return next();

        const filePath = path.join(PUBLIC_ROOT, ...rel.split('/'));
        if (!filePath.startsWith(PUBLIC_ROOT) || !fs.existsSync(filePath)) return next();

        const ext = path.extname(filePath).toLowerCase();
        res.statusCode = 200;
        res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}

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
          normalized.endsWith('/produto.txt') ||
          /\.(3mf|stl|mf3|png)$/i.test(normalized)
        ) {
          scheduleSync(file);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), authDevPlugin(), serveProductAssetsPlugin(), productsSyncPlugin()],
  server: {
    watch: {
      ignored: ['**/node_modules/**'],
    },
    proxy: {
      '/api/proxy': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
      },
      '/api/converter-step': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        produtos: resolve(__dirname, 'produtos.html'),
        visualizador: resolve(__dirname, 'visualizador.html'),
        visualizadorAvancado: resolve(__dirname, 'visualizador-avancado.html'),
        materiais: resolve(__dirname, 'materiais.html'),
        sobre: resolve(__dirname, 'sobre.html'),
        contato: resolve(__dirname, 'contato.html'),
        login: resolve(__dirname, 'login.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
