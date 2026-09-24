const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildGeminiRequest,
  extractAcademicSearchQuery,
  extractGroundingSources,
  fetchGeminiWithRetry,
  normalizeImage,
  searchOpenAcademicSources,
  selectModelCandidates,
  selectThinkingLevel,
  FALLBACK_MODEL,
  FAST_MODEL,
  MODEL,
} = require('./askStudentAssistant');

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
  assert.equal(body.generationConfig.maxOutputTokens, 1_024);
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'low');
});

test('uses deeper reasoning only for complex academic work', () => {
  assert.equal(selectThinkingLevel('TVU Connect dùng như thế nào?'), 'low');
  assert.equal(selectThinkingLevel('Phân tích và so sánh hai thuật toán này'), 'medium');
  assert.equal(selectThinkingLevel('Chứng minh công thức đạo hàm'), 'medium');
});

test('routes everyday questions to the fast model and keeps the strongest model for hard work', () => {
  assert.deepEqual(selectModelCandidates('Định luật Ohm là gì?'), [FAST_MODEL, FALLBACK_MODEL]);
  assert.deepEqual(selectModelCandidates('Phân tích và so sánh hai thuật toán'), [MODEL, FAST_MODEL]);
  assert.deepEqual(selectModelCandidates('Đọc nội dung ảnh này', true), [FALLBACK_MODEL, FAST_MODEL]);
});

test('adds an inline image and verified source context for study mode', () => {
  const request = buildGeminiRequest('key', 'Đọc ảnh và tìm giáo trình sinh lý', [], {
    mode: 'library-search',
    image: { mimeType: 'image/jpeg', data: 'aGVsbG8=' },
    sources: [{ title: 'Open Physiology', url: 'https://example.edu/physiology' }],
    model: FALLBACK_MODEL,
  });
  const body = JSON.parse(request.options.body);

  assert.equal(request.url.includes(FALLBACK_MODEL), true);
  assert.equal(body.tools, undefined);
  assert.deepEqual(body.contents[0].parts, [
    { text: 'Đọc ảnh và tìm giáo trình sinh lý\n\nNguồn học liệu mở hệ thống đã kiểm tra:\n1. Open Physiology — https://example.edu/physiology' },
    { inlineData: { mimeType: 'image/jpeg', data: 'aGVsbG8=' } },
  ]);
  assert.match(body.systemInstruction.parts[0].text, /nguồn học liệu mở/i);
  assert.match(body.systemInstruction.parts[0].text, /đọc chữ trong ảnh/i);
});

test('extracts the academic subject without generic search words', () => {
  assert.equal(extractAcademicSearchQuery('Tìm giúp mình giáo trình môn Sinh lý học'), 'Sinh lý');
});

test('finds readable open books and removes duplicate Internet Archive links', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('openlibrary.org')) {
      return {
        ok: true,
        json: async () => ({
          docs: [
            { title: 'Human Physiology', author_name: ['A. Author'], public_scan_b: true, ia: ['physiology-open'] },
            { title: 'Locked book', public_scan_b: false, ia: ['locked'] },
          ],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        response: {
          docs: [
            { identifier: 'physiology-open', title: 'Human Physiology' },
            { identifier: 'vn-physiology', title: 'Sinh lý học' },
          ],
        },
      }),
    };
  };

  const sources = await searchOpenAcademicSources('Tìm giáo trình Sinh lý học', {
    fetchImpl,
    signal: undefined,
  });

  assert.equal(sources.length, 3);
  assert.match(sources[0].title, /OpenStax/);
  assert.equal(sources.filter((source) => source.url === 'https://archive.org/details/physiology-open').length, 1);
  assert.equal(sources.some((source) => source.title === 'Sinh lý học'), true);
});

test('rejects unsupported or malformed image payloads', () => {
  assert.throws(
    () => normalizeImage({ mimeType: 'image/gif', data: 'aGVsbG8=' }),
    /Định dạng ảnh chưa được hỗ trợ/,
  );
  assert.throws(
    () => normalizeImage({ mimeType: 'image/jpeg', data: 'not base64!' }),
    /Ảnh quá lớn hoặc không hợp lệ/,
  );
});

test('returns unique safe grounding sources from Gemini metadata', () => {
  const payload = {
    candidates: [{
      groundingMetadata: {
        groundingChunks: [
          { web: { title: 'Open textbook', uri: 'https://example.edu/book.pdf' } },
          { web: { title: 'Duplicate', uri: 'https://example.edu/book.pdf' } },
          { web: { title: 'Unsafe', uri: 'javascript:alert(1)' } },
        ],
      },
    }],
  };

  assert.deepEqual(extractGroundingSources(payload), [
    { title: 'Open textbook', url: 'https://example.edu/book.pdf' },
  ]);
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
