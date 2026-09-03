// Quick test for new Gemini API key
const API_KEY = 'AIzaSyDXp8b7hK6cBlS0-__E5SgQWDgCOLjNbQI';
const MODEL = 'gemini-2.5-flash'; // Best working model!

async function testAPI() {
  console.log('🔑 Testing API Key:', API_KEY.substring(0, 20) + '...');
  console.log('📦 Model:', MODEL);
  console.log('⏳ Sending request...\n');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: 'Xin chào!' }]
            }
          ],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 50,
          }
        })
      }
    );

    console.log('📊 Status Code:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
      
      console.log('✅ SUCCESS! API key is working!');
      console.log('🤖 AI Response:', aiResponse);
      console.log('\n✨ API key is ready to use!');
    } else {
      const errorData = await response.json();
      console.log('❌ ERROR! Status:', response.status);
      console.log('📄 Error Details:', JSON.stringify(errorData, null, 2));
      
      if (response.status === 429) {
        console.log('\n⚠️  QUOTA EXCEEDED!');
        console.log('Possible reasons:');
        console.log('1. New API key also hit quota limit (tested too many times)');
        console.log('2. Google is rate limiting by IP/account, not just API key');
        console.log('3. Need to wait 24 hours for quota reset');
        console.log('\n💡 Solutions:');
        console.log('- Wait 24 hours');
        console.log('- Try creating API key from different Google account');
        console.log('- Enable billing in Google Cloud Console for higher quota');
      } else if (response.status === 403) {
        console.log('\n⚠️  API KEY INVALID!');
        console.log('- API key might be disabled or restricted');
        console.log('- Check API key settings in Google AI Studio');
      } else if (response.status === 404) {
        console.log('\n⚠️  MODEL NOT FOUND!');
        console.log('- Model name might be incorrect');
        console.log('- Try using: gemini-2.0-flash or gemini-1.5-flash');
      }
    }
  } catch (error) {
    console.log('❌ CONNECTION ERROR!');
    console.log('Error:', error.message);
  }
}

testAPI();
