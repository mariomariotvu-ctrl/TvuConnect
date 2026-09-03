/**
 * Firebase Lazy Initialization
 * Defers Firebase initialization until after first paint to improve initial load performance
 */

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import { logger } from '@/utils/logger';

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Singleton instances
let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firebaseDb: Firestore | null = null;
let firebaseStorage: FirebaseStorage | null = null;

// Initialization state
let firebaseInitialized = false;
let firebaseInitPromise: Promise<void> | null = null;

/**
 * Wait for first paint before initializing Firebase
 */
async function waitForFirstPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') {
      resolve();
    } else if (document.readyState === 'interactive') {
      window.addEventListener('load', () => resolve(), { once: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        window.addEventListener('load', () => resolve(), { once: true });
      }, { once: true });
    }
  });
}

/**
 * Initialize Firebase lazily
 */
export async function initializeFirebase(): Promise<void> {
  if (firebaseInitialized) {
    return;
  }

  if (firebaseInitPromise) {
    return firebaseInitPromise;
  }

  firebaseInitPromise = (async () => {
    try {
      logger.log('[Firebase] Starting lazy initialization...');
      
      // Wait for first paint
      await waitForFirstPaint();
      
      // Dynamic import Firebase modules
      const [
        { initializeApp },
        { getAuth, setPersistence, browserLocalPersistence },
        { getFirestore },
        { getStorage }
      ] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
        import('firebase/storage')
      ]);

      // Initialize Firebase app
      firebaseApp = initializeApp(firebaseConfig);
      logger.log('[Firebase] App initialized');

      // Initialize Auth
      firebaseAuth = getAuth(firebaseApp);
      await setPersistence(firebaseAuth, browserLocalPersistence);
      logger.log('[Firebase] Auth initialized');

      // Initialize Firestore
      firebaseDb = getFirestore(firebaseApp);
      logger.log('[Firebase] Firestore initialized');

      // Initialize Storage
      firebaseStorage = getStorage(firebaseApp, firebaseConfig.storageBucket);
      logger.log('[Firebase] Storage initialized');

      firebaseInitialized = true;
      logger.log('[Firebase] Lazy initialization complete');
    } catch (error) {
      console.error('[Firebase] Initialization failed:', error);
      firebaseInitPromise = null;
      throw error;
    }
  })();

  return firebaseInitPromise;
}

/**
 * Get Firebase App instance
 */
export function getFirebaseApp(): FirebaseApp {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return firebaseApp;
}

/**
 * Get Firebase Auth instance
 */
export function getFirebaseAuth(): Auth {
  if (!firebaseAuth) {
    throw new Error('Firebase Auth not initialized. Call initializeFirebase() first.');
  }
  return firebaseAuth;
}

/**
 * Get Firebase Firestore instance
 */
export function getFirebaseDb(): Firestore {
  if (!firebaseDb) {
    throw new Error('Firebase Firestore not initialized. Call initializeFirebase() first.');
  }
  return firebaseDb;
}

/**
 * Get Firebase Storage instance
 */
export function getFirebaseStorage(): FirebaseStorage {
  if (!firebaseStorage) {
    throw new Error('Firebase Storage not initialized. Call initializeFirebase() first.');
  }
  return firebaseStorage;
}

/**
 * Check if Firebase is initialized
 */
export function isFirebaseInitialized(): boolean {
  return firebaseInitialized;
}
