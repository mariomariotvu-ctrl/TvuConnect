// Test new Gemini API key
const API_KEY = 'AIzaSyBIW4hYh2YhCAqYYitQIAGrxeE97QxNdlQ';

async function testAPI() {
  console.log('🧪 Testing new API key...\n');
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: 'Hello, test message' }]
          }]
        })
      }
    );

    if (response.ok) {
      const data = await response.json();
      console.log('✅ API key hoạt động tốt!');
      console.log('📊 Response:', data.candidates[0].content.parts[0].text.substring(0, 100) + '...');
    } else {
      const error = await response.json();
      console.error('❌ Lỗi:', response.status, error);
    }
  } catch (error) {
    console.error('❌ Lỗi kết nối:', error.message);
  }
}

testAPI();
