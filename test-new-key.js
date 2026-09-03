// Script test nhanh API key mới
// Cách dùng: Thay API_KEY bên dưới, rồi chạy: node test-new-key.js

const API_KEY = 'PASTE_API_KEY_MOI_VAO_DAY';

async function testNewKey() {
  console.log('🔍 Testing new API key...\n');
  console.log('Key:', API_KEY.substring(0, 20) + '...\n');

  if (API_KEY === 'PASTE_API_KEY_MOI_VAO_DAY') {
    console.log('❌ Bạn chưa paste API key mới vào!');
    console.log('📝 Mở file test-new-key.js và thay dòng:');
    console.log('   const API_KEY = "PASTE_API_KEY_MOI_VAO_DAY";');
    console.log('   thành:');
    console.log('   const API_KEY = "AIzaSy...";');
    return;
  }

  // Test model gemini-2.5-flash-lite (nhẹ nhất, tiết kiệm quota)
  const model = 'gemini-2.5-flash-lite';
  
  try {
    console.log(`Testing ${model}...`);
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ 
            role: 'user', 
            parts: [{ text: 'Chào bạn!' }] 
          }],
          generationConfig: { 
            maxOutputTokens: 50,
            temperature: 0.7
          }
        })
      }
    );

    if (response.ok) {
      const data = await response.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
      
      console.log('\n✅ THÀNH CÔNG! API key hoạt động tốt!\n');
      console.log('📝 AI trả lời:', reply);
      console.log('\n🎯 BƯỚC TIẾP THEO:');
      console.log('1. Copy API key này');
      console.log('2. Mở file .env.local');
      console.log('3. Thay dòng VITE_GEMINI_API_KEY=...');
      console.log('4. Chạy: npm run dev');
      console.log('5. Test AI trên http://localhost:5173');
      
    } else {
      const error = await response.json();
      const message = error.error?.message || 'Unknown error';
      
      console.log('\n❌ LỖI:', response.status);
      console.log('📝 Chi tiết:', message);
      
      if (response.status === 429) {
        console.log('\n⚠️ API key này đã hết quota!');
        console.log('💡 Giải pháp:');
        console.log('   - Tạo API key từ Google account KHÁC');
        console.log('   - Hoặc đợi 24h để quota reset');
      } else if (response.status === 400) {
        console.log('\n⚠️ API key không hợp lệ!');
        console.log('💡 Kiểm tra lại:');
        console.log('   - Key có đúng format AIzaSy... không?');
        console.log('   - Có copy đầy đủ không bị thiếu ký tự?');
      } else if (response.status === 404) {
        console.log('\n⚠️ Model không tồn tại!');
        console.log('💡 Thử model khác: gemini-2.5-flash');
      }
    }
    
  } catch (error) {
    console.log('\n❌ LỖI KẾT NỐI:', error.message);
    console.log('💡 Kiểm tra:');
    console.log('   - Kết nối internet');
    console.log('   - Firewall/Proxy');
  }
}

testNewKey();
