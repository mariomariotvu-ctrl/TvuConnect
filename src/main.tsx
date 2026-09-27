import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router';
import App from './App.tsx';
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Toaster } from 'sonner';
import { logger } from '@/utils/logger';
import { initializeRuntimeConfig } from '@/config/runtimeConfig';
import '@/utils/errorTracking';
import { app } from './firebase.ts';
import './index.css';
import 'leaflet/dist/leaflet.css';
import './styles/leaflet-custom.css';

// Handle hydration errors gracefully
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (event.message.includes('Minified React error #418') || 
        event.message.includes('Hydration')) {
      console.error('⚠️ React Hydration Error detected. This may be due to missing environment variables.');
      console.error('Please check that all Firebase environment variables are set on Vercel.');
      event.preventDefault(); // Prevent error from crashing the app
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <App />
          <Toaster
            position="top-right"
            expand={false}
            richColors
            closeButton
            duration={2000}
            toastOptions={{
              style: {
                maxWidth: '400px',
              },
            }}
          />
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);

// Operational switches load in the background. Checked-in defaults keep the
// first paint fast and make the app resilient when Remote Config is unreachable.
void initializeRuntimeConfig();

// Firebase Performance complements client error telemetry with real-user page
// load and HTTP request timing. It does not replace JavaScript error logging.
if (import.meta.env.PROD && app) {
  void import('firebase/performance')
    .then(({ getPerformance }) => getPerformance(app))
    .catch(() => undefined);
}

// Register Service Worker for Push Notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/firebase-messaging-sw.js')
      .then((registration) => {
        logger.log('✅ Service Worker registered:', registration.scope);
      })
      .catch((error) => {
        console.error('❌ Service Worker registration failed:', error);
      });
  });
}
