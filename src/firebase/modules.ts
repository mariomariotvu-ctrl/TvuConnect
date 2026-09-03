import { initializeFirebase, getFirebaseAuth as getAuthSync, getFirebaseDb as getDbSync, getFirebaseStorage as getStorageSync } from './lazyInit';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';

// Cached instances
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

/**
 * Get Firebase Auth instance (lazy loaded)
 */
export async function getFirebaseAuth(): Promise<Auth> {
  if (authInstance) return authInstance;
  
  await initializeFirebase();
  authInstance = getAuthSync();
  return authInstance;
}

/**
 * Get Firestore instance (lazy loaded)
 */
export async function getFirebaseDb(): Promise<Firestore> {
  if (dbInstance) return dbInstance;
  
  await initializeFirebase();
  dbInstance = getDbSync();
  return dbInstance;
}

/**
 * Get Firebase Storage instance (lazy loaded)
 */
export async function getFirebaseStorage(): Promise<FirebaseStorage> {
  if (storageInstance) return storageInstance;
  
  await initializeFirebase();
  storageInstance = getStorageSync();
  return storageInstance;
}

/**
 * Reset cached instances (useful for testing)
 */
export function resetFirebaseInstances() {
  authInstance = null;
  dbInstance = null;
  storageInstance = null;
}
