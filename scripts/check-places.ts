/**
 * Check Places Script
 * 
 * Check if places collection has data
 * Run: npx ts-node scripts/check-places.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';

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

async function checkPlaces() {
  console.log('🔍 Checking places collection...\n');
  
  try {
    const placesRef = collection(db, 'places');
    const q = query(placesRef, limit(20));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('❌ Collection "places" is EMPTY');
      console.log('📝 No places found in database');
      console.log('\n💡 Tip: Wait for quota to reset, then run seed script');
      return;
    }
    
    console.log(`✅ Found ${snapshot.size} places in database:\n`);
    
    snapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`${index + 1}. ${data.name}`);
      console.log(`   Category: ${data.category}`);
      console.log(`   Address: ${data.location?.address || 'N/A'}`);
      console.log(`   Rating: ${data.rating || 0} ⭐`);
      console.log(`   Created by: ${data.createdBy || 'unknown'}`);
      console.log('');
    });
    
    console.log(`\n📊 Total: ${snapshot.size} places`);
    
  } catch (error) {
    console.error('❌ Error checking places:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('resource-exhausted')) {
        console.log('\n⚠️  Firestore quota exceeded!');
        console.log('⏰ Quota resets at 7:00 AM Pacific Time (22:00 VN time)');
      } else if (error.message.includes('permission-denied')) {
        console.log('\n⚠️  Permission denied!');
        console.log('🔐 Make sure you have deployed firestore.rules');
      }
    }
  }
}

checkPlaces().catch(console.error);
