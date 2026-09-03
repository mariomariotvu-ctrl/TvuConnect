// Test script for FREE Gemini API Key
// Usage: node test-free-api.js YOUR_API_KEY

const API_KEY = process.argv[2];

if (!API_KEY) {
  console.error('❌ Vui lòng cung cấp API key!');
  console.log('Usage: node test-free-api.js YOUR_API_KEY');
  process.exit(1);
}

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';

async function testAPI() {
  console.log('🧪 Đang test API key miễn phí...\n');
  
  try {
    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'Xin chào! Hãy nói "Xin chào TVU Connect!"' }]
        }]
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ API Key hoạt động HOÀN HẢO!');
      console.log('📊 Status:', response.status);
      console.log('🤖 Model: gemini-2.0-flash-lite');
      console.log('💰 Plan: FREE TIER (1,500 requests/ngày)');
      console.log('\n📝 Response từ AI:');
      console.log('─'.repeat(50));
      console.log(data.candidates[0].content.parts[0].text);
      console.log('─'.repeat(50));
      
      if (data.usageMetadata) {
        console.log('\n📈 Token Usage:');
        console.log('  - Input:', data.usageMetadata.promptTokenCount);
        console.log('  - Output:', data.usageMetadata.candidatesTokenCount);
        console.log('  - Total:', data.usageMetadata.totalTokenCount);
      }
      
      console.log('\n✨ Bạn có thể sử dụng API key này ngay!');
      console.log('\n📋 Bước tiếp theo:');
      console.log('  1. Copy API key này');
      console.log('  2. Cập nhật vào .env.local');
      console.log('  3. Cập nhật trên Vercel');
      console.log('  4. Test trên production');
      
    } else {
      console.error('❌ Lỗi:', data);
      
      if (data.error?.code === 429) {
        console.log('\n💡 API key này đã hết quota!');
        console.log('   Giải pháp:');
        console.log('   1. Tạo API key MỚI từ project MỚI');
        console.log('   2. Vào: https://aistudio.google.com/apikey');
        console.log('   3. Chọn "Create API key in NEW project"');
        console.log('   4. Đợi quota reset vào 7:00 sáng mai');
      } else if (data.error?.code === 403) {
        console.log('\n💡 API key không hợp lệ hoặc bị hạn chế.');
        console.log('   Hãy tạo API key mới.');
      } else if (data.error?.code === 404) {
        console.log('\n💡 Model không tồn tại.');
        console.log('   Đảm bảo bạn đang dùng model: gemini-2.0-flash-lite');
      }
    }
  } catch (error) {
    console.error('❌ Lỗi kết nối:', error.message);
  }
}

testAPI();
