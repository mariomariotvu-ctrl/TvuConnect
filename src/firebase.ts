import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, User, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, query, where, getDocs, onSnapshot, serverTimestamp, Timestamp, addDoc, orderBy, limit, startAfter, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { getDatabase, ref as dbRef, set as dbSet, update as dbUpdate, onValue, onDisconnect, serverTimestamp as dbServerTimestamp, get as dbGet, remove as dbRemove, query as dbQuery, orderByChild, equalTo } from 'firebase/database';
import { getFunctions } from 'firebase/functions';

import { quotaManager } from './utils/quotaManager';
import { logger } from '@/utils/logger';
import { resolveFirebaseAuthDomain } from '@/config/firebaseAuthDomain';

// Firebase configuration - Using environment variables with fallback
const firebaseProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: resolveFirebaseAuthDomain(
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    firebaseProjectId,
  ),
  projectId: firebaseProjectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Validate environment variables
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('❌ Missing Firebase environment variables. Check your .env.local file.');
  console.error('Config status:', {
    apiKey: firebaseConfig.apiKey ? 'Set' : 'Missing',
    authDomain: firebaseConfig.authDomain ? 'Set' : 'Missing',
    projectId: firebaseConfig.projectId ? 'Set' : 'Missing',
    storageBucket: firebaseConfig.storageBucket ? 'Set' : 'Missing',
    messagingSenderId: firebaseConfig.messagingSenderId ? 'Set' : 'Missing',
    appId: firebaseConfig.appId ? 'Set' : 'Missing',
  });
} else {
  logger.log('✅ Firebase config loaded from environment variables');
}

// Initialize Firebase SDK
// Note: For full lazy initialization, use modules from ./firebase/lazyInit.ts
export let app: any;
try {
  app = initializeApp(firebaseConfig);
  logger.log('✅ Firebase initialized');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  app = null as any;
}

// App Check must be initialized before Firestore/Functions start making calls.
// Enforcement stays disabled server-side until this configuration reaches the
// production web bundle, avoiding an accidental lockout of the current site.
export let appCheck: ReturnType<typeof initializeAppCheck> | null = null;
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY
  || (firebaseConfig.projectId === 'tvu-connect-1dc97'
    ? '6LdOps0tAAAAAOLluSYsfTEmyHc-SVg1nikzqv2i'
    : undefined);
if (app && typeof window !== 'undefined' && appCheckSiteKey) {
  try {
    const debugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
    if (import.meta.env.DEV && debugToken) {
      (globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean })
        .FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken === 'true' ? true : debugToken;
    }
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    logger.log('✅ Firebase App Check initialized');
  } catch (error) {
    logger.warn('Firebase App Check could not be initialized:', error);
  }
} else if (app && typeof window !== 'undefined') {
  logger.warn('Firebase App Check site key is not configured for this build.');
}

// Use database ID from environment variable, fallback to default
// Note: "(default)" string means use the default database, not a named database
const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID;
const isNamedDatabase = databaseId && databaseId !== '(default)' && databaseId.trim() !== '';
const initializeOfflineFirestore = () => {
  try {
    const settings = {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    };
    return isNamedDatabase
      ? initializeFirestore(app, settings, databaseId)
      : initializeFirestore(app, settings);
  } catch (error) {
    logger.warn('Persistent Firestore cache is unavailable; using memory cache:', error);
    return isNamedDatabase ? getFirestore(app, databaseId) : getFirestore(app);
  }
};

export const db = initializeOfflineFirestore();

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);
export const storage = getStorage(app, firebaseConfig.storageBucket);
export const realtimeDb = getDatabase(app);
// Callable functions keep provider keys and abuse controls on the server.
export const functions = getFunctions(
  app,
  import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1',
);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export { 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut, 
  onAuthStateChanged,
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  getDocs, 
  onSnapshot, 
  serverTimestamp,
  addDoc,
  orderBy,
  limit,
  startAfter,
  arrayUnion,
  arrayRemove,
  ref,
  uploadBytes,
  getDownloadURL,
  uploadBytesResumable
};
export type { User, Timestamp };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, silent: boolean = false) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  
  const isQuotaError = errInfo.error.includes('Quota limit exceeded') || 
                       errInfo.error.includes('resource-exhausted');
  
  if (isQuotaError) {
    logger.warn('Firestore Quota Limit Reached. Using cached data if available.', path);
    quotaManager.setQuotaExceeded();
    return; // Don't throw for quota errors to allow app to use cache
  }
  
  if (silent) {
    console.error('Firestore Error (Silenced): ', JSON.stringify(errInfo));
    return;
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
