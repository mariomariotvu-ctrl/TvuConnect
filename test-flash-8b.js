// Test with gemini-1.5-flash-8b (lighter model, separate quota)
const API_KEY = process.argv[2] || 'AIzaSyAFbdE99AOjL2qNoNI3A88T_9GRHEhfJ_Q';
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent';

async function testAPI() {
  console.log('🧪 Testing with gemini-1.5-flash-8b...\n');
  
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
      console.log('✅ gemini-1.5-flash-8b hoạt động!');
      console.log('📝 Response:', data.candidates[0].content.parts[0].text);
    } else {
      console.error('❌ Lỗi:', data.error);
    }
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
  }
}

testAPI();
