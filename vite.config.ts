import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: 'es2020', // Modern browsers only - smaller output, faster parsing
      rollupOptions: {
        treeshake: {
          moduleSideEffects: false, // Aggressive tree shaking
          propertyReadSideEffects: false,
        },
        output: {
          manualChunks: (id) => {
            // React core - highest priority (must be first to avoid circular deps)
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'react-vendor';
            }
            // Firebase - separate chunk for better caching
            if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) {
              return 'firebase-vendor';
            }
            // Map libraries - heavy, lazy loaded (check before UI to avoid circular)
            if (id.includes('node_modules/leaflet/') || id.includes('node_modules/react-leaflet/')) {
              return 'map-vendor';
            }
            // UI libraries - frequently used
            if (id.includes('node_modules/lucide-react/') || id.includes('node_modules/sonner/') || id.includes('node_modules/react-joyride/')) {
              return 'ui-vendor';
            }
            // AI libraries - lazy loaded
            if (id.includes('node_modules/@google/generative-ai/')) {
              return 'ai-vendor';
            }
            // Motion library - animation heavy
            if (id.includes('node_modules/motion/') || id.includes('node_modules/framer-motion/')) {
              return 'motion-vendor';
            }
          }
        }
      },
      chunkSizeWarningLimit: 650,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true, // Remove console.log in production
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'], // Remove specific console methods
          passes: 2, // Two compression passes for smaller output
        },
        mangle: {
          safari10: true, // Fix Safari 10 issues
        },
      },
      // Enable source maps for production debugging (optional)
      sourcemap: false, // Disable to reduce bundle size
      // Optimize CSS
      cssCodeSplit: true,
      // Report compressed size
      reportCompressedSize: true,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
  };
});
