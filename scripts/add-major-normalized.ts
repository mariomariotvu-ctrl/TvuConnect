/**
 * Migration Script: Add majorNormalized field to all profiles
 * 
 * This script reads all profiles from Firestore and adds a normalized
 * version of the major field for efficient database-level filtering.
 * 
 * Usage: npx ts-node scripts/add-major-normalized.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';

// Firebase configuration (replace with your config)
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Normalize Vietnamese text for consistent matching
 */
function normalizeVietnameseText(text: string): string {
  if (!text) return '';
  
  // Step 1: Convert to lowercase
  let normalized = text.toLowerCase();
  
  // Step 2: Remove Vietnamese accents
  normalized = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
  
  // Step 3: Remove extra spaces and trim
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Main migration function
 */
async function addMajorNormalizedField() {
  console.log('🚀 Starting migration: Add majorNormalized field');
  console.log('📊 Reading all profiles from Firestore...');
  
  try {
    // Read all profiles
    const profilesSnapshot = await getDocs(collection(db, 'profiles'));
    const totalProfiles = profilesSnapshot.size;
    
    console.log(`✅ Found ${totalProfiles} profiles`);
    
    if (totalProfiles === 0) {
      console.log('⚠️  No profiles found. Exiting.');
      return;
    }
    
    // Process in batches (Firestore batch limit is 500)
    const BATCH_SIZE = 500;
    let processedCount = 0;
    let updatedCount = 0;
    let batch = writeBatch(db);
    let batchCount = 0;
    
    for (const profileDoc of profilesSnapshot.docs) {
      const profileData = profileDoc.data();
      const major = profileData.major;
      
      // Skip if major is empty or majorNormalized already exists
      if (!major) {
        processedCount++;
        continue;
      }
      
      // Add majorNormalized field
      const majorNormalized = normalizeVietnameseText(major);
      batch.update(doc(db, 'profiles', profileDoc.id), {
        majorNormalized: majorNormalized
      });
      
      batchCount++;
      updatedCount++;
      processedCount++;
      
      // Commit batch when it reaches the limit
      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        console.log(`✅ Committed batch: ${updatedCount}/${totalProfiles} profiles updated`);
        batch = writeBatch(db);
        batchCount = 0;
      }
    }
    
    // Commit remaining batch
    if (batchCount > 0) {
      await batch.commit();
      console.log(`✅ Committed final batch: ${updatedCount}/${totalProfiles} profiles updated`);
    }
    
    console.log('\n🎉 Migration completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Total profiles: ${totalProfiles}`);
    console.log(`   - Profiles updated: ${updatedCount}`);
    console.log(`   - Profiles skipped: ${processedCount - updatedCount}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration
addMajorNormalizedField()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
