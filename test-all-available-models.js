// Test all available models to find one that works
const API_KEY = process.argv[2] || 'AIzaSyAtQzqogz_Eim0rk9frPWYsAgOO9DsPHlY';

const MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-pro',
];

async function testModel(model) {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  
  try {
    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'Xin chào!' }]
        }]
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      return { model, success: true, response: data.candidates[0].content.parts[0].text };
    } else {
      return { model, success: false, error: data.error };
    }
  } catch (error) {
    return { model, success: false, error: error.message };
  }
}

async function testAllModels() {
  console.log('🧪 Testing all available models...\n');
  
  for (const model of MODELS) {
    console.log(`Testing ${model}...`);
    const result = await testModel(model);
    
    if (result.success) {
      console.log(`✅ ${model} HOẠT ĐỘNG!`);
      console.log(`📝 Response: ${result.response}\n`);
      console.log(`\n🎉 SỬ DỤNG MODEL NÀY: ${model}`);
      return;
    } else {
      console.log(`❌ ${model} failed:`, result.error?.code || result.error);
      console.log('');
    }
  }
  
  console.log('\n😢 Tất cả models đều hết quota hoặc không khả dụng.');
  console.log('\n💡 Giải pháp:');
  console.log('   1. Đợi đến 7:00 sáng mai để quota reset');
  console.log('   2. Hoặc dùng tài khoản Google khác để tạo API key mới');
  console.log('   3. Hoặc nâng cấp lên Paid Plan (chỉ ~$1.50/tháng)');
}

testAllModels();
