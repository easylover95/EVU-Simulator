import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const host = process.env.TAURI_DEV_HOST;
const isGithubPages = process.env.GITHUB_ACTIONS === 'true';
const githubPagesBase = '/EVU-Simulator/';

/**
 * Public assets stay in /public because the desktop/Tauri build consumes them
 * directly. GitHub Pages serves this app below a repository sub-path, so only
 * known public asset roots are rewritten in emitted production files.
 */
function githubPagesPublicAssets() {
  const assetRoot = /([\"'`(])\/(assets|locos|wagons|maps|icons|bg-rail-atmosphere\.webp|manifest\.json|sw\.js)(?=[/'\"`\)])/g;
  return {
    name: 'github-pages-public-assets',
    generateBundle(_options: unknown, bundle: Record<string, { type: string; source?: string; code?: string }>) {
      if (!isGithubPages) return;
      for (const item of Object.values(bundle)) {
        if (item.type === 'asset' && typeof item.source === 'string') {
          item.source = item.source.replace(assetRoot, `$1${githubPagesBase}$2`);
        }
        if (item.type === 'chunk' && typeof item.code === 'string') {
          item.code = item.code.replace(assetRoot, `$1${githubPagesBase}$2`);
        }
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: isGithubPages ? githubPagesBase : '/',
  plugins: [react(), githubPagesPublicAssets()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['lucide-react', 'leaflet', 'three', 'gsap'],
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      output: {
        // Stabiler Browser-Cache für den App-Shell-Unterbau. Karten und Fachansichten
        // behalten ihre fachlichen React.lazy-Grenzen und werden nicht künstlich zerlegt.
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('/node_modules/@supabase/')) {
            return 'vendor-supabase';
          }
        },
      },
    },
  },
});
