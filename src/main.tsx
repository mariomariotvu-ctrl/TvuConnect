import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Toaster } from 'sonner';
import { logger } from '@/utils/logger';
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
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);

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
