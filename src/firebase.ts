import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, User, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, query, where, getDocs, onSnapshot, serverTimestamp, Timestamp, getDocFromServer, addDoc, orderBy, limit, startAfter, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { getDatabase, ref as dbRef, set as dbSet, update as dbUpdate, onValue, onDisconnect, serverTimestamp as dbServerTimestamp, get as dbGet, remove as dbRemove, query as dbQuery, orderByChild, equalTo } from 'firebase/database';

import { quotaManager } from './utils/quotaManager';
import { logger } from '@/utils/logger';

// Firebase configuration - Using environment variables with fallback
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
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

// Use database ID from environment variable, fallback to default
// Note: "(default)" string means use the default database, not a named database
const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID;
const isNamedDatabase = databaseId && databaseId !== '(default)' && databaseId.trim() !== '';
export const db = isNamedDatabase ? getFirestore(app, databaseId) : getFirestore(app);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);
export const storage = getStorage(app, firebaseConfig.storageBucket);
export const realtimeDb = getDatabase(app);
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
  getDocFromServer,
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

// Test connection with timeout
async function testConnection() {
  try {
    const testPromise = getDocFromServer(doc(db, 'test', 'connection'));
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout')), 5000)
    );
    await Promise.race([testPromise, timeoutPromise]);
    logger.log('✅ Firestore connected successfully');
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        logger.warn('⚠️ Firestore connection slow, using cache');
      } else if (error.message.includes('offline')) {
        logger.warn('⚠️ Firestore offline, will retry automatically');
      } else {
        logger.warn('⚠️ Firestore connection issue:', error.message);
      }
    }
  }
}
testConnection();
