/**
 * Script tạo người dùng ảo (Fake Users) cho TVU Connect
 * Dùng để test tính năng ghép cặp
 * 
 * Cách chạy:
 * node scripts/create-fake-users.js
 */

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Firebase config - Hardcoded for script execution
const firebaseConfig = {
  apiKey: "AIzaSyByuf-sL2MfEE2zE4reYHxqAGlDg5CcJ9w",
  authDomain: "gen-lang-client-0050597412.firebaseapp.com",
  projectId: "gen-lang-client-0050597412",
  storageBucket: "gen-lang-client-0050597412.firebasestorage.app",
  messagingSenderId: "43871673395",
  appId: "1:43871673395:web:00e950c3694f2a49291746",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log('✅ Firebase initialized successfully');
console.log('📦 Project ID:', firebaseConfig.projectId);

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
const genders = ['Nam', 'Nữ'];

// Năm sinh (18-25 tuổi)
const birthYears = [1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006];

// Random helper
const random = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomMultiple = (arr, count) => {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// Generate MSSV
const generateMSSV = () => {
  const year = random([21, 22, 23, 24]); // Năm nhập học
  const code = Math.floor(Math.random() * 900000) + 100000;
  return `${year}${code}`;
};

// Generate phone
const generatePhone = () => {
  const prefixes = ['032', '033', '034', '035', '036', '037', '038', '039', '070', '076', '077', '078', '079', '081', '082', '083', '084', '085', '086', '088', '089', '090', '091', '092', '093', '094', '096', '097', '098', '099'];
  const prefix = random(prefixes);
  const number = Math.floor(Math.random() * 9000000) + 1000000;
  return `${prefix}${number}`;
};

// Generate fake user data
const generateFakeUser = (index) => {
  const firstName = random(firstNames);
  const lastName = random(lastNames);
  const fullName = `${lastName} ${firstName}`;
  const gender = random(genders);
  const msv = generateMSSV();
  
  return {
    email: `fakeuser${index}@tvu.edu.vn`,
    password: 'Test123456', // Password mặc định
    profile: {
      fullName,
      msv,
      class: random(classes),
      faculty: random(faculties),
      phoneNumber: generatePhone(),
      gender,
      birthYear: random(birthYears),
      hobbies: randomMultiple(hobbies.flat(), 3),
      bio: random(bios),
      personality: randomMultiple(personalities.flat(), 3),
      goals: randomMultiple(goals.flat(), 2),
      isOnline: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  };
};

// Create user in Firebase
const createFakeUser = async (userData) => {
  try {
    // 1. Create auth user
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      userData.email,
      userData.password
    );
    
    const uid = userCredential.user.uid;
    
    // 2. Create profile in Firestore
    await setDoc(doc(db, 'profiles', uid), {
      ...userData.profile,
      uid,
      email: userData.email,
    });
    
    console.log(`✅ Created: ${userData.profile.fullName} (${userData.email})`);
    return { success: true, user: userData };
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      console.log(`⚠️  Email already exists: ${userData.email}`);
      return { success: false, error: 'Email exists' };
    }
    console.error(`❌ Error creating ${userData.email}:`, error.message);
    return { success: false, error: error.message };
  }
};

// Main function
const main = async () => {
  console.log('🚀 Bắt đầu tạo người dùng ảo cho TVU Connect...\n');
  console.log('📍 Checking Firebase connection...');
  
  // Test Firebase connection
  try {
    console.log('✅ Auth initialized:', !!auth);
    console.log('✅ Firestore initialized:', !!db);
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    process.exit(1);
  }
  
  // Số lượng user cần tạo
  const COUNT = 50; // Tạo 50 người dùng ảo
  
  console.log(`📝 Sẽ tạo ${COUNT} người dùng...\n`);
  
  const results = {
    success: 0,
    failed: 0,
    users: []
  };
  
  for (let i = 1; i <= COUNT; i++) {
    const userData = generateFakeUser(i);
    const result = await createFakeUser(userData);
    
    if (result.success) {
      results.success++;
      results.users.push({
        email: userData.email,
        password: userData.password,
        name: userData.profile.fullName
      });
    } else {
      results.failed++;
    }
    
    // Delay để tránh rate limit
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📊 Kết quả:');
  console.log(`✅ Thành công: ${results.success}`);
  console.log(`❌ Thất bại: ${results.failed}`);
  console.log(`📝 Tổng cộng: ${COUNT}`);
  
  console.log('\n📋 Danh sách tài khoản đã tạo:');
  console.log('Email | Password | Tên');
  console.log('------|----------|-----');
  results.users.forEach(user => {
    console.log(`${user.email} | ${user.password} | ${user.name}`);
  });
  
  console.log('\n✨ Hoàn thành! Bạn có thể đăng nhập bằng các tài khoản trên để test.');
  process.exit(0);
};

// Run
main().catch(error => {
  console.error('❌ Lỗi:', error);
  process.exit(1);
});
