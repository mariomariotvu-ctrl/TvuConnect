/**
 * Firestore Backup Script
 * 
 * Backup all collections to JSON files
 * Run: npx ts-node scripts/backup-firestore.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Your Firebase config
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Collections to backup
const COLLECTIONS = [
  'profiles',
  'messages',
  'conversations',
  'posts',
  'comments',
  'places',
  'checkIns',
  'events',
  'reviews',
  'blocks',
  'reports',
  'favorites',
  'matches'
];

async function backupCollection(collectionName: string) {
  console.log(`📦 Backing up ${collectionName}...`);
  
  try {
    const snapshot = await getDocs(collection(db, collectionName));
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`✅ ${collectionName}: ${data.length} documents`);
    return data;
  } catch (error) {
    console.error(`❌ Error backing up ${collectionName}:`, error);
    return [];
  }
}

async function backupAll() {
  console.log('🚀 Starting Firestore backup...\n');
  
  const backup: any = {
    timestamp: new Date().toISOString(),
    collections: {}
  };
  
  for (const collectionName of COLLECTIONS) {
    backup.collections[collectionName] = await backupCollection(collectionName);
  }
  
  // Create backup directory if not exists
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }
  
  // Save to file
  const filename = `firestore-backup-${Date.now()}.json`;
  const filepath = path.join(backupDir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));
  
  console.log(`\n✅ Backup complete!`);
  console.log(`📁 Saved to: ${filepath}`);
  console.log(`📊 Total collections: ${COLLECTIONS.length}`);
  
  // Summary
  let totalDocs = 0;
  for (const [name, data] of Object.entries(backup.collections)) {
    totalDocs += (data as any[]).length;
  }
  console.log(`📄 Total documents: ${totalDocs}`);
}

backupAll().catch(console.error);
