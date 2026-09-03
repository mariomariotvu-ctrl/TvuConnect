import { db, collection, addDoc, serverTimestamp } from '../firebase';
import { logger } from '@/utils/logger';

// Sample places data near TVU Campus
const samplePlaces = [
  {
    name: "Highlands Coffee TVU",
    category: "cafe",
    location: {
      lat: 9.9345,
      lng: 106.3461,
      address: "123 Đường 30/4, Phường 1, Trà Vinh"
    },
    description: "Quán cafe yên tĩnh, phù hợp học nhóm. Wifi tốt, có ổ cắm điện.",
    amenities: ["wifi", "ac", "parking", "quiet"],
    priceRange: "$",
    openHours: "7:00 - 22:00",
    rating: 4.5,
    reviewCount: 23,
    checkInCount: 156,
    currentVisitors: 0,
    createdBy: "system",
    isVerified: true
  },
  {
    name: "The Coffee House",
    category: "cafe",
    location: {
      lat: 9.9355,
      lng: 106.3471,
      address: "456 Đường Phạm Thái Bường, Phường 4, Trà Vinh"
    },
    description: "Không gian rộng rãi, nhiều chỗ ngồi. Phù hợp làm việc nhóm.",
    amenities: ["wifi", "ac", "parking"],
    priceRange: "$",
    openHours: "6:30 - 23:00",
    rating: 4.3,
    reviewCount: 45,
    checkInCount: 234,
    currentVisitors: 0,
    createdBy: "system",
    isVerified: true
  },
  {
    name: "Quán Cơm Sinh Viên",
    category: "restaurant",
    location: {
      lat: 9.9340,
      lng: 106.3455,
      address: "789 Đường Nguyễn Đáng, Phường 1, Trà Vinh"
    },
    description: "Cơm ngon, giá rẻ, phù hợp sinh viên. Nhiều món ăn đa dạng.",
    amenities: ["parking"],
    priceRange: "$",
    openHours: "6:00 - 20:00",
    rating: 4.8,
    reviewCount: 89,
    checkInCount: 456,
    currentVisitors: 0,
    createdBy: "system",
    isVerified: true
  },
  {
    name: "Thư Viện Trường Đại Học Trà Vinh",
    category: "library",
    location: {
      lat: 9.9350,
      lng: 106.3465,
      address: "Số 126 Nguyễn Thiện Thành, Phường 5, Trà Vinh"
    },
    description: "Thư viện trường, yên tĩnh, phù hợp tự học. Có điều hòa, wifi miễn phí.",
    amenities: ["wifi", "ac", "quiet", "study_room"],
    priceRange: "$",
    openHours: "7:00 - 21:00",
    rating: 4.7,
    reviewCount: 67,
    checkInCount: 789,
    currentVisitors: 0,
    createdBy: "system",
    isVerified: true
  },
  {
    name: "Công Viên Trà Vinh",
    category: "park",
    location: {
      lat: 9.9360,
      lng: 106.3450,
      address: "Đường Phạm Hùng, Phường 1, Trà Vinh"
    },
    description: "Công viên rộng, thoáng mát. Phù hợp chạy bộ, tập thể dục buổi sáng.",
    amenities: ["parking", "outdoor"],
    priceRange: "$",
    openHours: "5:00 - 22:00",
    rating: 4.2,
    reviewCount: 34,
    checkInCount: 123,
    currentVisitors: 0,
    createdBy: "system",
    isVerified: true
  },
  {
    name: "Phở 24",
    category: "restaurant",
    location: {
      lat: 9.9335,
      lng: 106.3475,
      address: "234 Đường Lê Lợi, Phường 1, Trà Vinh"
    },
    description: "Phở ngon, nước dùng đậm đà. Giá cả phải chăng.",
    amenities: ["parking", "ac"],
    priceRange: "$",
    openHours: "6:00 - 22:00",
    rating: 4.6,
    reviewCount: 56,
    checkInCount: 234,
    currentVisitors: 0,
    createdBy: "system",
    isVerified: true
  },
  {
    name: "Sân Bóng Đá TVU",
    category: "sport",
    location: {
      lat: 9.9365,
      lng: 106.3460,
      address: "Khuôn viên TVU, Phường 5, Trà Vinh"
    },
    description: "Sân bóng đá cỏ nhân tạo. Phù hợp tập luyện, thi đấu.",
    amenities: ["parking", "outdoor", "shower"],
    priceRange: "$",
    openHours: "6:00 - 21:00",
    rating: 4.4,
    reviewCount: 28,
    checkInCount: 89,
    currentVisitors: 0,
    createdBy: "system",
    isVerified: true
  },
  {
    name: "Gong Cha - Trà Sữa",
    category: "cafe",
    location: {
      lat: 9.9342,
      lng: 106.3468,
      address: "567 Đường 30/4, Phường 1, Trà Vinh"
    },
    description: "Trà sữa ngon, nhiều topping. Không gian trẻ trung.",
    amenities: ["wifi", "ac"],
    priceRange: "$",
    openHours: "8:00 - 22:00",
    rating: 4.5,
    reviewCount: 78,
    checkInCount: 345,
    currentVisitors: 0,
    createdBy: "system",
    isVerified: true
  },
  {
    name: "Phòng Tự Học 24/7",
    category: "study",
    location: {
      lat: 9.9348,
      lng: 106.3463,
      address: "890 Đường Nguyễn Đáng, Phường 1, Trà Vinh"
    },
    description: "Phòng tự học mở cửa 24/7. Yên tĩnh, có điều hòa, wifi tốt.",
    amenities: ["wifi", "ac", "quiet", "24h"],
    priceRange: "$",
    openHours: "24/7",
    rating: 4.9,
    reviewCount: 123,
    checkInCount: 567,
    currentVisitors: 0,
    createdBy: "system",
    isVerified: true
  },
  {
    name: "Bún Bò Huế Mẹ Tý",
    category: "restaurant",
    location: {
      lat: 9.9338,
      lng: 106.3458,
      address: "345 Đường Lê Duẩn, Phường 1, Trà Vinh"
    },
    description: "Bún bò Huế đậm đà, cay nồng. Giá sinh viên.",
    amenities: ["parking"],
    priceRange: "$",
    openHours: "6:00 - 14:00",
    rating: 4.7,
    reviewCount: 45,
    checkInCount: 178,
    currentVisitors: 0,
    createdBy: "system",
    isVerified: true
  }
];

/**
 * Seed sample places to Firestore
 * Run this once to populate the database with sample data
 */
export const seedPlaces = async () => {
  try {
    logger.log('🌱 Starting to seed places...');
    
    const placesRef = collection(db, 'places');
    let successCount = 0;
    
    for (const place of samplePlaces) {
      try {
        await addDoc(placesRef, {
          ...place,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        successCount++;
        logger.log(`✅ Added: ${place.name}`);
      } catch (error) {
        console.error(`❌ Failed to add ${place.name}:`, error);
      }
    }
    
    logger.log(`🎉 Seeding complete! Added ${successCount}/${samplePlaces.length} places.`);
    return { success: true, count: successCount };
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    return { success: false, error };
  }
};
