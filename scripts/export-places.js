// Export Places Collection to JSON
// Run: node scripts/export-places.js

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require('../firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'gen-lang-client-0050597412'
});

const db = admin.firestore();

async function exportPlaces() {
  console.log('🔄 Đang xuất dữ liệu collection "places"...');
  
  try {
    const placesRef = db.collection('places');
    const snapshot = await placesRef.get();
    
    if (snapshot.empty) {
      console.log('⚠️  Collection "places" trống!');
      return;
    }
    
    const places = [];
    snapshot.forEach(doc => {
      places.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Convert Timestamps to ISO strings
    const cleanedPlaces = places.map(place => {
      const cleaned = { ...place };
      
      // Convert all Timestamp fields
      Object.keys(cleaned).forEach(key => {
        if (cleaned[key] && typeof cleaned[key].toDate === 'function') {
          cleaned[key] = cleaned[key].toDate().toISOString();
        }
      });
      
      return cleaned;
    });
    
    // Save to JSON file
    const outputPath = path.join(__dirname, '..', 'places-export.json');
    fs.writeFileSync(
      outputPath,
      JSON.stringify({ places: cleanedPlaces }, null, 2),
      'utf8'
    );
    
    console.log(`✅ Đã xuất ${cleanedPlaces.length} địa điểm`);
    console.log(`📁 File: ${outputPath}`);
    console.log(`📊 Kích thước: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    process.exit(1);
  }
}

exportPlaces();
