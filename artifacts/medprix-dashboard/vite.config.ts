import fs from 'fs';
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT ?? '3000';
const port = Number(rawPort);
const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    {
      name: 'copy-404-and-root-dist',
      closeBundle() {
        const outDir = path.resolve(import.meta.dirname, 'dist');
        const rootDist = path.resolve(import.meta.dirname, '../../dist');
        const indexPath = path.join(outDir, 'index.html');
        const notFoundPath = path.join(outDir, '404.html');

        if (fs.existsSync(indexPath)) {
          fs.copyFileSync(indexPath, notFoundPath);

          const appRoutes = [
            'login',
            'dashboard',
            'pos',
            'review',
            'inventory',
            'supplier',
            'procurement',
            'wholesale',
            'system-ad',
            'user-management',
          ];

          for (const route of appRoutes) {
            // 1. Create route/index.html
            const routeDir = path.join(outDir, route);
            if (!fs.existsSync(routeDir)) {
              fs.mkdirSync(routeDir, { recursive: true });
            }
            fs.copyFileSync(indexPath, path.join(routeDir, 'index.html'));

            // 2. Create route.html
            fs.copyFileSync(indexPath, path.join(outDir, `${route}.html`));
          }
        }

        try {
          if (!fs.existsSync(rootDist)) {
            fs.mkdirSync(rootDist, { recursive: true });
          }
          fs.cpSync(outDir, rootDist, { recursive: true });
        } catch {
          // ignore if root dist already populated
        }
      },
    },
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
