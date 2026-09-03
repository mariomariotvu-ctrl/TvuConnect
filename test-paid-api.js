// Test script for Gemini API Paid Plan
// Usage: node test-paid-api.js YOUR_API_KEY

const API_KEY = process.argv[2];

if (!API_KEY) {
  console.error('❌ Vui lòng cung cấp API key!');
  console.log('Usage: node test-paid-api.js YOUR_API_KEY');
  process.exit(1);
}

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';

async function testAPI() {
  console.log('🧪 Đang test API key...\n');
  
  try {
    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'Xin chào! Hãy giới thiệu về bản thân bạn trong 2 câu.' }]
        }]
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ API Key hoạt động HOÀN HẢO!');
      console.log('📊 Status:', response.status);
      console.log('🤖 Model: gemini-2.0-flash-lite');
      console.log('\n📝 Response từ AI:');
      console.log('─'.repeat(50));
      console.log(data.candidates[0].content.parts[0].text);
      console.log('─'.repeat(50));
      console.log('\n✨ Bạn có thể sử dụng API key này cho production!');
      
      // Check if it's a paid API key by looking at quota info
      if (data.usageMetadata) {
        console.log('\n📈 Usage Metadata:');
        console.log('  - Prompt tokens:', data.usageMetadata.promptTokenCount);
        console.log('  - Response tokens:', data.usageMetadata.candidatesTokenCount);
        console.log('  - Total tokens:', data.usageMetadata.totalTokenCount);
      }
    } else {
      console.error('❌ Lỗi:', data);
      
      if (data.error?.code === 429) {
        console.log('\n💡 Gợi ý: API key này vẫn đang ở Free Tier.');
        console.log('   Hãy đảm bảo bạn đã:');
        console.log('   1. Enable Billing trên Google Cloud Console');
        console.log('   2. Link billing account với project');
        console.log('   3. Đợi 5-10 phút để quota được cập nhật');
      } else if (data.error?.code === 403) {
        console.log('\n💡 Gợi ý: API chưa được enable.');
        console.log('   Vào: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com');
        console.log('   Nhấn ENABLE');
      }
    }
  } catch (error) {
    console.error('❌ Lỗi kết nối:', error.message);
  }
}

testAPI();
