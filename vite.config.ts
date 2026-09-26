import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { isLocalInspectorRequest } from './dev/locationInspectorAccess';

function localLocationInspector(projectId: string): Plugin {
  return {
    name: 'tvu-local-location-inspector',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url || '/', 'http://localhost');
        if (requestUrl.pathname !== '/__dev/live-locations') {
          next();
          return;
        }

        const allowed = isLocalInspectorRequest({
          remoteAddress: request.socket.remoteAddress,
          host: request.headers.host,
          forwardedFor: request.headers['x-forwarded-for'],
        });
        if (!allowed || request.method !== 'GET') {
          response.statusCode = 403;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ error: 'Local developer access only.' }));
          return;
        }

        try {
          if (!projectId) throw new Error('VITE_FIREBASE_PROJECT_ID is missing.');
          const appName = 'tvu-local-location-inspector';
          const adminApp = getApps().find((app) => app.name === appName)
            || initializeApp({ credential: applicationDefault(), projectId }, appName);
          const firestore = getFirestore(adminApp);
          const now = Timestamp.now();
          const snapshot = await firestore.collection('sharedStudentLocations')
            .where('expiresAt', '>', now)
            .limit(200)
            .get();
          const viewerUid = (requestUrl.searchParams.get('viewerUid') || '').trim();
          const focusUid = (requestUrl.searchParams.get('focusUid') || '').trim();
          const documents = snapshot.docs.filter((document) => (
            !focusUid || document.id === focusUid || document.id === viewerUid
          ));
          const profileRefs = documents.map((document) => firestore.collection('profiles').doc(document.id));
          const profiles = profileRefs.length ? await firestore.getAll(...profileRefs) : [];
          const profilesByUid = new Map(profiles.map((profile) => [profile.id, profile.data() || {}]));
          const locations = documents.map((document) => {
            const location = document.data();
            const profile = profilesByUid.get(document.id) || {};
            return {
              uid: document.id,
              latitude: Number(location.latitude),
              longitude: Number(location.longitude),
              accuracy: Number(location.accuracy) || 0,
              visibility: location.visibility,
              updatedAt: location.updatedAt?.toMillis?.() || 0,
              expiresAt: location.expiresAt?.toMillis?.() || 0,
              fullName: profile.fullName || profile.nickname || 'Sinh viên TVU',
              photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : null,
              major: typeof profile.major === 'string' ? profile.major : '',
              isFriend: false,
              isOwn: document.id === viewerUid,
              isMoving: false,
              heading: null,
            };
          });

          response.statusCode = 200;
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ locations }));
        } catch (error) {
          server.config.logger.error(`Local location inspector failed: ${String(error)}`);
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ error: 'Local location inspector is unavailable.' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  plugins: [react(), tailwindcss(), localLocationInspector(env.VITE_FIREBASE_PROJECT_ID || '')],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // `.kiro` contains historical bug-reproduction specs with intentionally
    // stale mocks. Keep CI focused on the maintained regression suite.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'functions/**',
      '.kiro/**',
      '**/*bug-exploration.test.*',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020', // Modern browsers only - smaller output, faster parsing
    rollupOptions: {
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
          if (id.includes('node_modules/leaflet.markercluster/') || id.includes('node_modules/react-leaflet-cluster/')) {
            return 'map-cluster-vendor';
          }
          // UI libraries - frequently used
          if (id.includes('node_modules/lucide-react/') || id.includes('node_modules/sonner/') || id.includes('node_modules/react-joyride/')) {
            return 'ui-vendor';
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
    // CI/remote editors can disable HMR explicitly; local development keeps it on.
    hmr: process.env.DISABLE_HMR !== 'true',
    // Root-level Vercel Functions are not mounted by `vite dev`. Proxy map
    // tiles through the deployed same-origin endpoint so localhost behaves
    // like production without exposing or duplicating an external provider.
    proxy: {
      '/api/map-tile': {
        target: 'https://tvuconnect.vercel.app',
        changeOrigin: true,
      },
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self), fullscreen=(self)',
    },
  },
  };
});
