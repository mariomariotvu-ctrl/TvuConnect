/**
 * Firestore Restore Script
 * 
 * Restore collections from JSON backup file
 * Run: npx ts-node scripts/restore-firestore.ts backups/firestore-backup-xxxxx.json
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';
import * as fs from 'fs';

// Your NEW Firebase config (project you want to restore to)
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

async function restoreCollection(collectionName: string, documents: any[]) {
  console.log(`📦 Restoring ${collectionName}...`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const docData of documents) {
    try {
      const { id, ...data } = docData;
      await setDoc(doc(db, collectionName, id), data);
      successCount++;
    } catch (error) {
      console.error(`❌ Error restoring document:`, error);
      errorCount++;
    }
  }
  
  console.log(`✅ ${collectionName}: ${successCount} restored, ${errorCount} errors`);
}

async function restoreAll(backupFilePath: string) {
  console.log('🚀 Starting Firestore restore...\n');
  
  // Read backup file
  if (!fs.existsSync(backupFilePath)) {
    console.error(`❌ Backup file not found: ${backupFilePath}`);
    process.exit(1);
  }
  
  const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf-8'));
  
  console.log(`📅 Backup timestamp: ${backupData.timestamp}`);
  console.log(`📊 Collections: ${Object.keys(backupData.collections).length}\n`);
  
  // Confirm before restore
  console.log('⚠️  WARNING: This will overwrite existing data!');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Restore each collection
  for (const [collectionName, documents] of Object.entries(backupData.collections)) {
    await restoreCollection(collectionName, documents as any[]);
  }
  
  console.log(`\n✅ Restore complete!`);
}

// Get backup file path from command line argument
const backupFilePath = process.argv[2];

if (!backupFilePath) {
  console.error('❌ Usage: npx ts-node scripts/restore-firestore.ts <backup-file-path>');
  process.exit(1);
}

restoreAll(backupFilePath).catch(console.error);
