// Test all available Gemini models to find best quota
const API_KEY = 'AIzaSyBJliP_991mMtQTaCnr12ZZxExxYMWdxpg';

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
];

async function testModel(model) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
          generationConfig: { maxOutputTokens: 10 }
        })
      }
    );

    if (response.ok) {
      return { model, status: '✅ WORKS', code: 200 };
    } else {
      const error = await response.json();
      const message = error.error?.message || 'Unknown error';
      
      if (response.status === 429) {
        // Extract quota info
        const quotaMatch = message.match(/limit: (\d+)/);
        const quota = quotaMatch ? quotaMatch[1] : 'unknown';
        return { model, status: '⚠️ QUOTA', code: 429, quota };
      } else if (response.status === 404) {
        return { model, status: '❌ NOT FOUND', code: 404 };
      } else {
        return { model, status: `❌ ERROR ${response.status}`, code: response.status };
      }
    }
  } catch (error) {
    return { model, status: '❌ FAILED', error: error.message };
  }
}

async function testAllModels() {
  console.log('🔍 Testing all Gemini models...\n');
  console.log('API Key:', API_KEY.substring(0, 20) + '...\n');
  
  const results = [];
  
  for (const model of MODELS) {
    console.log(`Testing ${model}...`);
    const result = await testModel(model);
    results.push(result);
    
    // Wait 1 second between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📊 RESULTS:\n');
  console.log('Model'.padEnd(30) + 'Status'.padEnd(20) + 'Quota');
  console.log('─'.repeat(70));
  
  const working = [];
  const quotaExceeded = [];
  const notFound = [];
  
  results.forEach(r => {
    const quotaInfo = r.quota ? `(limit: ${r.quota})` : '';
    console.log(r.model.padEnd(30) + r.status.padEnd(20) + quotaInfo);
    
    if (r.status === '✅ WORKS') working.push(r.model);
    else if (r.status === '⚠️ QUOTA') quotaExceeded.push(r);
    else if (r.status === '❌ NOT FOUND') notFound.push(r.model);
  });
  
  console.log('\n🎯 RECOMMENDATION:\n');
  
  if (working.length > 0) {
    console.log('✅ Use these models (they work!):');
    working.forEach(m => console.log('  -', m));
  } else if (quotaExceeded.length > 0) {
    console.log('⚠️ All models hit quota. Best options:');
    quotaExceeded
      .sort((a, b) => parseInt(b.quota || 0) - parseInt(a.quota || 0))
      .forEach(r => console.log(`  - ${r.model} (quota: ${r.quota || 'unknown'})`));
  } else {
    console.log('❌ No working models found. Try:');
    console.log('  1. Wait 24 hours for quota reset');
    console.log('  2. Create API key from different Google account');
    console.log('  3. Enable billing for higher quota');
  }
}

testAllModels();
