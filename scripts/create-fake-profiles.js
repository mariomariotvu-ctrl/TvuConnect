/**
 * Script tạo profiles cho fake users trong Firestore
 * Chạy sau khi đã tạo users trong Firebase Authentication
 * 
 * Cách chạy:
 * node scripts/create-fake-profiles.js
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import * as dotenv from 'dotenv';

// Load environment variables từ .env.local
dotenv.config({ path: '.env.local' });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log('✅ Firebase initialized');

// Danh sách tên sinh viên TVU
const firstNames = [
  'Minh', 'Hương', 'Tuấn', 'Linh', 'Khoa', 'Trang', 'Dũng', 'Hà', 
  'Phúc', 'Mai', 'Hoàng', 'Lan', 'Quân', 'Thảo', 'Hải', 'Ngọc',
  'Bảo', 'Vy', 'Long', 'Anh', 'Nam', 'Huyền', 'Đức', 'Phương'
];

const lastNames = [
  'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ',
  'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'
];

// Khoa và lớp TVU
const faculties = [
  'Công nghệ thông tin',
  'Kinh tế',
  'Ngoại ngữ',
  'Sư phạm',
  'Kỹ thuật công nghệ',
  'Khoa học tự nhiên',
  'Nông nghiệp',
  'Luật'
];

const classes = [
  'CNTT1', 'CNTT2', 'CNTT3', 'CNTT4',
  'KT1', 'KT2', 'KT3',
  'NN1', 'NN2', 'NN3',
  'SP1', 'SP2',
  'KTCN1', 'KTCN2',
  'KHTN1', 'KHTN2'
];

// Sở thích
const hobbies = [
  ['Đọc sách', 'Nghe nhạc', 'Xem phim'],
  ['Thể thao', 'Du lịch', 'Chụp ảnh'],
  ['Nấu ăn', 'Vẽ', 'Chơi game'],
  ['Âm nhạc', 'Múa', 'Ca hát'],
  ['Lập trình', 'Thiết kế', 'Viết blog'],
  ['Bóng đá', 'Bóng rổ', 'Cầu lông'],
  ['Yoga', 'Gym', 'Chạy bộ']
];

// Mô tả bản thân
const bios = [
  'Mình là sinh viên TVU, thích làm quen bạn mới!',
  'Yêu thích học tập và khám phá điều mới.',
  'Tìm bạn cùng sở thích để cùng nhau phát triển.',
  'Mình rất thân thiện và hòa đồng nha!',
  'Thích đi cafe và tán gẫu với bạn bè.',
  'Đam mê công nghệ và sáng tạo.',
  'Mong muốn kết nối với nhiều bạn trong trường.'
];

// Tính cách
const personalities = [
  ['Hòa đồng', 'Vui vẻ', 'Năng động'],
  ['Chân thành', 'Nhiệt tình', 'Thân thiện'],
  ['Sáng tạo', 'Tích cực', 'Lạc quan'],
  ['Chu đáo', 'Tận tâm', 'Trách nhiệm'],
  ['Hài hước', 'Dễ gần', 'Cởi mở']
];

// Mục tiêu
const goals = [
  ['Tìm bạn học nhóm', 'Kết bạn mới', 'Phát triển kỹ năng'],
  ['Tìm người yêu', 'Tìm bạn thân', 'Giao lưu văn hóa'],
  ['Học tập', 'Rèn luyện', 'Khám phá'],
  ['Kết nối', 'Chia sẻ', 'Hỗ trợ lẫn nhau']
];

// Giới tính
const genders = ['male', 'female'];

// Năm sinh (18-25 tuổi)
const birthYears = [1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006];

// Niên khóa
const academicYears = ['2020-2024', '2021-2025', '2022-2026', '2023-2027'];

// Random helper
const random = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomMultiple = (arr, count) => {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// Generate MSSV (9 chữ số)
const generateMSSV = (index) => {
  const year = random([21, 22, 23, 24]); // Năm nhập học
  const code = String(1000000 + index).padStart(7, '0');
  return `${year}${code}`;
};

// Generate phone
const generatePhone = () => {
  const prefixes = ['032', '033', '034', '035', '036', '037', '038', '039', '070', '076', '077', '078', '079', '081', '082', '083', '084', '085', '086', '088', '089', '090', '091', '092', '093', '094', '096', '097', '098', '099'];
  const prefix = random(prefixes);
  const number = Math.floor(Math.random() * 9000000) + 1000000;
  return `${prefix}${number}`;
};

// Calculate age from birth year
const calculateAge = (birthYear) => {
  return new Date().getFullYear() - birthYear;
};

// Generate fake profile data
const generateFakeProfile = (index, uid) => {
  const firstName = random(firstNames);
  const lastName = random(lastNames);
  const fullName = `${lastName} ${firstName}`;
  const gender = random(genders);
  const birthYear = random(birthYears);
  const className = random(classes);
  const major = random(faculties);
  
  return {
    uid,
    email: `fakeuser${index}@tvu.edu.vn`,
    fullName,
    mssv: generateMSSV(index), // 9 chữ số
    className, // Tên lớp
    phone: generatePhone(), // Số điện thoại
    gender,
    major,
    academicYear: random(academicYears),
    birthYear,
    age: calculateAge(birthYear),
    interests: randomMultiple(hobbies.flat(), 3),
    bio: random(bios),
    personality: randomMultiple(personalities.flat(), 3),
    goals: randomMultiple(goals.flat(), 2),
    isOnline: false,
    photoURL: '', // Để trống, user có thể tự upload sau
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
};

// QUAN TRỌNG: Danh sách UIDs của fake users
// Bạn cần lấy UIDs từ Firebase Console -> Authentication -> Users
// Copy UID của từng fake user và paste vào đây
const FAKE_USER_UIDS = [
  // TODO: Thay thế bằng UIDs thật từ Firebase Console
  // Ví dụ:
  // 'zyY4w9pT2ZMUzOGvF2qfwW...', // fakeuser1@tvu.edu.vn
  // 'BuW5b2l2LlZ2a1S3tFkHoim...', // fakeuser2@tvu.edu.vn
  // ... thêm các UIDs khác
];

// Create profile in Firestore
const createFakeProfile = async (index, uid) => {
  try {
    const profileData = generateFakeProfile(index, uid);
    
    await setDoc(doc(db, 'profiles', uid), profileData);
    
    console.log(`✅ Created profile: ${profileData.fullName} (${profileData.email})`);
    console.log(`   MSSV: ${profileData.mssv} | Lớp: ${profileData.className} | SĐT: ${profileData.phone}`);
    return { success: true, profile: profileData };
  } catch (error) {
    console.error(`❌ Error creating profile for UID ${uid}:`, error.message);
    return { success: false, error: error.message };
  }
};

// Main function
const main = async () => {
  console.log('🚀 Bắt đầu tạo profiles cho fake users...\n');
  
  if (FAKE_USER_UIDS.length === 0) {
    console.error('❌ FAKE_USER_UIDS rỗng!');
    console.log('\n📝 HƯỚNG DẪN:');
    console.log('1. Vào Firebase Console: https://console.firebase.google.com/project/gen-lang-client-0050597412/authentication/users');
    console.log('2. Copy UID của từng fake user (fakeuser1@tvu.edu.vn, fakeuser2@tvu.edu.vn, ...)');
    console.log('3. Paste vào mảng FAKE_USER_UIDS trong file này');
    console.log('4. Chạy lại script: node scripts/create-fake-profiles.js\n');
    process.exit(1);
  }
  
  console.log(`📝 Sẽ tạo ${FAKE_USER_UIDS.length} profiles...\n`);
  
  const results = {
    success: 0,
    failed: 0,
    profiles: []
  };
  
  for (let i = 0; i < FAKE_USER_UIDS.length; i++) {
    const uid = FAKE_USER_UIDS[i];
    const result = await createFakeProfile(i + 1, uid);
    
    if (result.success) {
      results.success++;
      results.profiles.push(result.profile);
    } else {
      results.failed++;
    }
    
    // Delay để tránh rate limit
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n📊 Kết quả:');
  console.log(`✅ Thành công: ${results.success}`);
  console.log(`❌ Thất bại: ${results.failed}`);
  console.log(`📝 Tổng cộng: ${FAKE_USER_UIDS.length}`);
  
  console.log('\n📋 Danh sách profiles đã tạo:');
  console.log('Email | MSSV | Họ tên | Lớp | SĐT');
  console.log('------|------|--------|------|-----');
  results.profiles.forEach(profile => {
    console.log(`${profile.email} | ${profile.mssv} | ${profile.fullName} | ${profile.className} | ${profile.phone}`);
  });
  
  console.log('\n✨ Hoàn thành! Bây giờ bạn có thể test matching ngay!');
  console.log('👉 Đăng nhập bằng tài khoản thật → Vào "Tìm người yêu" → Sẽ thấy fake users!');
  process.exit(0);
};

// Run
main().catch(error => {
  console.error('❌ Lỗi:', error);
  process.exit(1);
});

