// Script to add places from thongtindiadiem.md to Firestore
// Run: node scripts/add-places-from-file.js

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import * as dotenv from 'dotenv';

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const places = [
  {
    name: "Highlands Coffee Điện Biên Phủ - Trà Vinh",
    category: "cafe",
    location: {
      lat: 9.9345,
      lng: 106.3461,
      address: "Điện Biên Phủ, Trà Vinh"
    },
    description: "Quán Highlands Coffee có không gian sáng, sạch, hiện đại, có chỗ ngồi trong và ngoài, phù hợp gặp gỡ và thư giãn.",
    amenities: ["wifi", "ac", "parking", "view"],
    priceRange: "29.000 - 79.000 VNĐ",
    openHours: "07:00 - 21:00",
    rating: 4.5,
    reviewCount: 0,
    checkInCount: 0,
    currentVisitors: 0,
    createdBy: "system",
    isVerified: true,
    mapsLink: "https://maps.app.goo.gl/PLEJjuxawpU9rBD99"
  },
  {
    name: "Mì Cay Yagami Trà Vinh",
    category: "restaurant",
    location: {
      lat: 9.9340,
      lng: 106.3455,
      address: "Trà Vinh"
    },
    description: "Quán Mì cay Yagami có không gian mang phong cách nhật bản và hàn quốc, có chỗ ngồi sạch sẽ thoáng mát",
    amenities: ["wifi", "ac", "parking", "view"],
    priceRange: "25.000 - 45.000 VNĐ",
    openHours: "07:00 - 21:00",
    rating: 4.3,
    reviewCount: 0,
    checkInCount: 0,
    currentVisitors: 0,
    createdBy: "system",
    isVerified: true,
    mapsLink: "https://maps.app.goo.gl/wwW6kTDVqkfgxSDs9"
  },
  {
    name: "Căn tin Trường Đại học Trà Vinh",
    category: "restaurant",
    location: {
      lat: 9.9350,
      lng: 106.3465,
      address: "Trường Đại học Trà Vinh"
    },
    description: "Căn tin Trường Đại Học Trà Vinh thân thiện sạch sẽ phù hợp cho sinh viên giá cả hợp lý, không gian sạch sẽ thoáng mát",
    amenities: ["parking", "student_friendly"],
    priceRange: "25.000 VNĐ",
    openHours: "07:00 - 17:00",
    rating: 4.7,
    reviewCount: 0,
    checkInCount: 0,
    currentVisitors: 0,
    createdBy: "system",
    isVerified: true,
    mapsLink: "https://maps.app.goo.gl/SbBwAwZUF8H1PE5GA"
  },
  {
    name: "Mì Cay Sasin Trà Vinh",
    category: "restaurant",
    location: {
      lat: 9.9355,
      lng: 106.3471,
      address: "Trà Vinh"
    },
    description: "Mỳ Cay Sasin Trà Vinh đồ ăn ngon, không gian thoáng mát yên tĩnh có thiết kế sang trọng đẹp mắt",
    amenities: ["wifi", "ac", "view", "modern"],
    priceRange: "18.000 - 169.000 VNĐ",
    openHours: "07:00 - 21:00",
    rating: 4.6,
    reviewCount: 0,
    checkInCount: 0,
    currentVisitors: 0,
    createdBy: "system",
    isVerified: true,
    mapsLink: "https://maps.app.goo.gl/HrH7qzeSuVxCj5ri9"
  }
];

async function addPlaces() {
  try {
    console.log('🌱 Bắt đầu thêm địa điểm...\n');
    
    let successCount = 0;
    
    for (const place of places) {
      try {
        await addDoc(collection(db, 'places'), {
          ...place,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        successCount++;
        console.log(`✅ Đã thêm: ${place.name}`);
      } catch (error) {
        console.error(`❌ Lỗi khi thêm ${place.name}:`, error.message);
      }
    }
    
    console.log(`\n🎉 Hoàn thành! Đã thêm ${successCount}/${places.length} địa điểm.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi:', error);
    process.exit(1);
  }
}

addPlaces();
