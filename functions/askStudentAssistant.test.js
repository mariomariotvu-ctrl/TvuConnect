const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGeminiRequest, fetchGeminiWithRetry, MODEL } = require('./askStudentAssistant');

test('uses the current Gemini model and sends auth keys in a private request header', () => {
  const apiKey = 'server-only-auth-key';
  const request = buildGeminiRequest(apiKey, 'Lập kế hoạch ôn thi', []);

  assert.equal(MODEL, 'gemini-3.8-flash');
  assert.equal(request.url, `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`);
  assert.equal(request.options.headers['x-goog-api-key'], apiKey);
  assert.equal(request.url.includes(apiKey), false);
});

test('normalizes history and keeps the latest student question', () => {
  const request = buildGeminiRequest('key', 'Câu hỏi mới', [
    { role: 'user', parts: [{ text: 'Câu hỏi trước' }] },
    { role: 'model', parts: [{ text: 'Câu trả lời trước' }] },
  ]);
  const body = JSON.parse(request.options.body);

  assert.deepEqual(body.contents, [
    { role: 'user', parts: [{ text: 'Câu hỏi trước' }] },
    { role: 'model', parts: [{ text: 'Câu trả lời trước' }] },
    { role: 'user', parts: [{ text: 'Câu hỏi mới' }] },
  ]);
  assert.equal(body.generationConfig.maxOutputTokens, 1_000);
});

test('retries temporary Gemini overload responses', async () => {
  const responses = [
    { ok: false, status: 503 },
    { ok: true, status: 200 },
  ];
  let calls = 0;
  const delays = [];

  const response = await fetchGeminiWithRetry('https://example.test', {}, {
    fetchImpl: async () => responses[calls++],
    sleep: async (milliseconds) => delays.push(milliseconds),
    maxAttempts: 3,
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [500]);
});

test('does not retry permanent provider errors', async () => {
  let calls = 0;
  const response = await fetchGeminiWithRetry('https://example.test', {}, {
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 400 };
    },
    sleep: async () => {},
    maxAttempts: 3,
  });

  assert.equal(response.status, 400);
  assert.equal(calls, 1);
});
