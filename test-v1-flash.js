const API_KEY = 'AIzaSyCXJYt-_E1K72gROdAuaXxfbRj0vhQaqKs';
const API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';

async function testAPI() {
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
      console.log('✅ API Key hoạt động với gemini-1.5-flash (v1)!');
      console.log('📝 Response:', data.candidates[0].content.parts[0].text);
    } else {
      console.error('❌ Lỗi:', data);
    }
  } catch (error) {
    console.error('❌ Lỗi kết nối:', error.message);
  }
}

testAPI();
