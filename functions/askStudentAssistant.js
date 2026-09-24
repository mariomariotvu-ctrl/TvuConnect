const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp();
}

const MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.5-flash-lite';
const FAST_MODEL = 'gemini-3.1-flash-lite';
const MAX_MESSAGE_LENGTH = 1_500;
const MAX_HISTORY_ITEMS = 8;
const MAX_HISTORY_TEXT_LENGTH = 1_000;
const MAX_IMAGE_BASE64_LENGTH = 2_000_000;
const MAX_REQUESTS_PER_MINUTE = 8;
const MAX_PROVIDER_ATTEMPTS = 1;
const PROVIDER_TIMEOUT_MS = 9_000;
const RETRYABLE_PROVIDER_STATUSES = new Set([408, 500, 502, 503, 504]);
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_MODES = new Set(['normal', 'library-search', 'image-study']);

const SYSTEM_INSTRUCTION = [
  'Bạn là TVU BuBu, trợ lý học tập thân thiện cho sinh viên Đại học Trà Vinh.',
  'Bạn hỗ trợ nhiều khối ngành ở bậc đại học: sức khỏe, kỹ thuật, công nghệ, kinh tế, luật, nông nghiệp, xã hội, ngôn ngữ và sư phạm.',
  'Trả lời bằng tiếng Việt rõ ràng, đi thẳng vào câu hỏi. Với câu học thuật, hãy xác định khái niệm cốt lõi, giải thích từng bước, đưa ví dụ thực tế hoặc công thức khi cần, rồi chốt cách tự kiểm tra kết quả.',
  'Nếu đề bài thiếu dữ kiện quan trọng, hỏi đúng một câu ngắn để làm rõ. Không biến câu trả lời đơn giản thành bài viết dài.',
  'Khi người dùng muốn tìm sách, giáo trình hoặc đề thi, nhắc họ dùng kết quả từ Thư viện Drive ngay trong TVU Connect; tuyệt đối không bịa tên file, tác giả, đường dẫn hay trích dẫn.',
  'Không bịa địa điểm, sự kiện, học liệu, chính sách, con người hoặc dữ liệu thời gian thực. Nếu thiếu dữ liệu, nói rõ và chỉ cách kiểm tra nguồn chính thức.',
  'Không yêu cầu mật khẩu, mã OTP, địa chỉ chính xác, số điện thoại, MSSV hoặc dữ liệu nhạy cảm. Nhắc người dùng kiểm tra nguồn khi trả lời ảnh hưởng tới học tập, sức khỏe, pháp lý hoặc tài chính.',
  'Không hỗ trợ gian lận học thuật. Có thể giải thích, lập kế hoạch ôn tập, đưa ví dụ và khuyến khích tự làm.',
].join(' ');

const LIBRARY_SEARCH_INSTRUCTION = [
  'Người dùng đang tìm học liệu. Hãy dựa trên các nguồn học liệu mở do hệ thống cung cấp và nội dung ảnh nếu có.',
  'Ưu tiên nguồn chính thức của trường đại học, thư viện, nhà xuất bản, OpenStax, DOAB, Internet Archive và file Google Drive được chủ sở hữu chia sẻ công khai.',
  'Chỉ giới thiệu tài liệu có thể đọc hợp pháp; không hướng dẫn vượt quyền truy cập hoặc tìm bản sao vi phạm bản quyền.',
  'Trả lời ngắn gọn bằng tiếng Việt: xác định đúng môn/chủ đề, gợi ý tối đa 5 nguồn tốt nhất và nói rõ nguồn nào cần kiểm tra thêm. Không tự bịa đường dẫn.',
].join(' ');

const IMAGE_STUDY_INSTRUCTION = [
  'Người dùng đã gửi ảnh trang sách, đề bài hoặc ghi chú.',
  'Hãy đọc chữ trong ảnh cẩn thận, xác định môn/chủ đề, chép lại phần quan trọng có thể đọc được và hỗ trợ đúng yêu cầu.',
  'Nếu ảnh mờ hoặc thiếu phần cần thiết, nói rõ phần nào chưa đọc được thay vì đoán.',
].join(' ');

const COMPLEX_ACADEMIC_QUERY = /\b(chung minh|phan tich|giai (bai|phuong trinh)|tinh toan|lap luan|so sanh|danh gia|thiet ke|thuat toan|ca lam sang|case study|do an|nghien cuu)\b/i;

const asText = (value, maxLength) => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

const normalizeHistory = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => {
      const role = item?.role === 'model' ? 'model' : 'user';
      const text = asText(item?.parts?.[0]?.text, MAX_HISTORY_TEXT_LENGTH);
      return text ? { role, parts: [{ text }] } : null;
    })
    .filter(Boolean);
};

const normalizeForRouting = (value) => asText(value, MAX_MESSAGE_LENGTH)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .toLowerCase();

const SEARCH_STOP_WORDS = new Set([
  'tim', 'kiem', 'giup', 'minh', 'toi', 'cho', 'sach', 'ebook', 'tai', 'lieu',
  'giao', 'trinh', 'hoc', 'lieu', 'cong', 'khai', 'phu', 'hop', 'doc', 'tren',
  'mang', 'drive', 've', 'mon', 'nganh', 'va', 'hoac',
]);
const ACADEMIC_SEARCH_ALIASES = [
  ['sinh ly', 'human physiology'],
  ['giai phau', 'anatomy'],
  ['duoc ly', 'pharmacology'],
  ['vi sinh', 'microbiology'],
  ['lap trinh', 'programming'],
  ['ke toan', 'accounting'],
  ['hoa hoc', 'chemistry'],
  ['vat ly', 'physics'],
  ['kinh te', 'economics'],
];
const CURATED_OPEN_BOOKS = [
  {
    phrases: ['sinh ly', 'giai phau', 'physiology', 'anatomy'],
    title: 'Anatomy and Physiology 2e — OpenStax (Rice University)',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/1-introduction',
  },
  {
    phrases: ['vi sinh', 'microbiology'],
    title: 'Microbiology 2e — OpenStax (Rice University)',
    url: 'https://openstax.org/books/microbiology/pages/1-introduction',
  },
  {
    phrases: ['ke toan', 'accounting'],
    title: 'Principles of Accounting — OpenStax (Rice University)',
    url: 'https://openstax.org/books/principles-financial-accounting/pages/1-why-it-matters',
  },
  {
    phrases: ['vat ly', 'physics'],
    title: 'University Physics — OpenStax (Rice University)',
    url: 'https://openstax.org/books/university-physics-volume-1/pages/1-introduction',
  },
  {
    phrases: ['hoa hoc', 'chemistry'],
    title: 'Chemistry 2e — OpenStax (Rice University)',
    url: 'https://openstax.org/books/chemistry-2e/pages/1-introduction',
  },
];

const extractAcademicSearchQuery = (message) => message
  .split(/\s+/)
  .map((token) => token.replace(/[^\p{L}\p{N}._-]+/gu, ''))
  .filter(Boolean)
  .filter((token) => !SEARCH_STOP_WORDS.has(normalizeForRouting(token)))
  .slice(0, 12)
  .join(' ')
  .trim();

const getAcademicSearchAliases = (query) => {
  const normalized = normalizeForRouting(query);
  return ACADEMIC_SEARCH_ALIASES
    .filter(([phrase]) => normalized.includes(phrase))
    .map(([, alias]) => alias);
};

const sourceTitleMatchesQuery = (title, query, aliases) => {
  const normalizedTitle = normalizeForRouting(title);
  if (aliases.some((alias) => normalizedTitle.includes(alias))) return true;

  const tokens = normalizeForRouting(query).split(/\s+/).filter((token) => token.length > 1);
  if (!tokens.length) return false;
  const matches = tokens.filter((token) => normalizedTitle.includes(token)).length;
  return matches >= Math.ceil(tokens.length * 0.7);
};

const selectThinkingLevel = (message) => (
  COMPLEX_ACADEMIC_QUERY.test(normalizeForRouting(message)) ? 'medium' : 'low'
);

const selectModelCandidates = (message, hasImage = false) => {
  if (hasImage) return [FALLBACK_MODEL, FAST_MODEL];
  if (selectThinkingLevel(message) === 'medium') return [MODEL, FAST_MODEL];
  return [FAST_MODEL, FALLBACK_MODEL];
};

const normalizeMode = (value) => (ALLOWED_MODES.has(value) ? value : 'normal');

const normalizeImage = (value) => {
  const mimeType = asText(value?.mimeType, 64).toLowerCase();
  const data = typeof value?.data === 'string' ? value.data.trim() : '';

  if (!mimeType || !data) return null;
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new HttpsError('invalid-argument', 'Định dạng ảnh chưa được hỗ trợ.');
  }
  if (data.length > MAX_IMAGE_BASE64_LENGTH || !/^[a-zA-Z0-9+/=]+$/.test(data)) {
    throw new HttpsError('invalid-argument', 'Ảnh quá lớn hoặc không hợp lệ.');
  }
  return { mimeType, data };
};

const buildSystemInstruction = (mode, hasImage) => [
  SYSTEM_INSTRUCTION,
  mode === 'library-search' ? LIBRARY_SEARCH_INSTRUCTION : '',
  hasImage ? IMAGE_STUDY_INSTRUCTION : '',
].filter(Boolean).join(' ');

const buildGeminiRequest = (key, message, history, requestOptions = {}) => {
  const mode = normalizeMode(requestOptions.mode);
  const image = normalizeImage(requestOptions.image);
  const sourceContext = Array.isArray(requestOptions.sources)
    ? requestOptions.sources.slice(0, 8).map((source, index) => (
      `${index + 1}. ${asText(source?.title, 180)} — ${asText(source?.url, 2_000)}`
    )).filter((source) => !source.startsWith('.'))
    : [];
  const enrichedMessage = sourceContext.length
    ? `${message}\n\nNguồn học liệu mở hệ thống đã kiểm tra:\n${sourceContext.join('\n')}`
    : message;
  const userParts = [{ text: enrichedMessage }];
  if (image) userParts.push({ inlineData: image });

  const body = {
    systemInstruction: { parts: [{ text: buildSystemInstruction(mode, Boolean(image)) }] },
    contents: [...normalizeHistory(history), { role: 'user', parts: userParts }],
    generationConfig: {
      maxOutputTokens: selectThinkingLevel(message) === 'medium' ? 2_048 : 1_024,
      thinkingConfig: {
        thinkingLevel: selectThinkingLevel(message),
      },
    },
  };

  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${requestOptions.model || MODEL}:generateContent`,
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    },
  };
};

const safeSourceUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
};

async function fetchJson(url, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': 'TVU-Connect-Academic-Assistant/1.0' },
    signal: dependencies.signal || AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Open academic source returned ${response.status}`);
  return response.json();
}

async function searchOpenAcademicSources(message, dependencies = {}) {
  const query = extractAcademicSearchQuery(message) || asText(message, 120);
  if (!query) return [];
  const aliases = getAcademicSearchAliases(query);
  const normalizedQuery = normalizeForRouting(query);
  const titleClauses = [query, ...aliases]
    .map((term) => `title:\"${term.replace(/\"/g, '')}\"`)
    .join(' OR ');

  const openLibraryUrl = new URL('https://openlibrary.org/search.json');
  openLibraryUrl.searchParams.set('q', titleClauses);
  openLibraryUrl.searchParams.set('limit', '12');
  openLibraryUrl.searchParams.set('fields', 'key,title,author_name,public_scan_b,ia');

  const archiveUrl = new URL('https://archive.org/advancedsearch.php');
  archiveUrl.searchParams.set('q', `(${titleClauses}) AND mediatype:texts AND NOT collection:inlibrary AND NOT access-restricted-item:true`);
  archiveUrl.searchParams.append('fl[]', 'identifier');
  archiveUrl.searchParams.append('fl[]', 'title');
  archiveUrl.searchParams.append('fl[]', 'creator');
  archiveUrl.searchParams.set('rows', '8');
  archiveUrl.searchParams.set('page', '1');
  archiveUrl.searchParams.set('output', 'json');

  const [openLibraryResult, archiveResult] = await Promise.allSettled([
    fetchJson(openLibraryUrl.toString(), dependencies),
    fetchJson(archiveUrl.toString(), dependencies),
  ]);
  const candidates = CURATED_OPEN_BOOKS
    .filter((book) => book.phrases.some((phrase) => normalizedQuery.includes(phrase)))
    .map(({ title, url }) => ({ title, url, curated: true }));

  if (openLibraryResult.status === 'fulfilled') {
    for (const document of openLibraryResult.value?.docs || []) {
      const identifier = Array.isArray(document?.ia) ? asText(document.ia[0], 240) : '';
      if (!document?.public_scan_b || !identifier) continue;
      const author = Array.isArray(document?.author_name) ? asText(document.author_name[0], 120) : '';
      candidates.push({
        title: [asText(document?.title, 180), author].filter(Boolean).join(' — '),
        url: `https://archive.org/details/${encodeURIComponent(identifier)}`,
      });
    }
  }

  if (archiveResult.status === 'fulfilled') {
    for (const document of archiveResult.value?.response?.docs || []) {
      const identifier = asText(document?.identifier, 240);
      const title = asText(document?.title, 180);
      if (!identifier || !title) continue;
      const creator = Array.isArray(document?.creator)
        ? asText(document.creator[0], 120)
        : asText(document?.creator, 120);
      candidates.push({
        title: [title, creator].filter(Boolean).join(' — '),
        url: `https://archive.org/details/${encodeURIComponent(identifier)}`,
      });
    }
  }

  const seen = new Set();
  return candidates.filter((source) => {
    const url = safeSourceUrl(source.url);
    if (!source.title || !url || seen.has(url) || (!source.curated && !sourceTitleMatchesQuery(source.title, query, aliases))) return false;
    seen.add(url);
    source.url = url;
    return true;
  }).slice(0, 8).map(({ title, url }) => ({ title, url }));
}

const extractGroundingSources = (payload) => {
  const chunks = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];

  const seen = new Set();
  return chunks.flatMap((chunk) => {
    const title = asText(chunk?.web?.title, 180);
    const rawUrl = asText(chunk?.web?.uri, 2_000);
    if (!title || !rawUrl || seen.has(rawUrl)) return [];

    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return [];
      seen.add(rawUrl);
      return [{ title, url: rawUrl }];
    } catch {
      return [];
    }
  }).slice(0, 8);
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchGeminiWithRetry(url, options, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const sleep = dependencies.sleep || wait;
  const maxAttempts = dependencies.maxAttempts || MAX_PROVIDER_ATTEMPTS;
  let lastResponse;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      lastResponse = await fetchImpl(url, options);
    } catch (error) {
      if (attempt === maxAttempts - 1) throw error;
      await sleep(500 * (2 ** attempt));
      continue;
    }

    if (!RETRYABLE_PROVIDER_STATUSES.has(lastResponse.status) || attempt === maxAttempts - 1) {
      return lastResponse;
    }

    await sleep(500 * (2 ** attempt));
  }

  return lastResponse;
}

async function consumeRateLimit(uid) {
  const firestore = getFirestore();
  const rateLimitRef = firestore.collection('_systemAiRateLimits').doc(uid);
  const now = Date.now();

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(rateLimitRef);
    const previous = snapshot.data() || {};
    const startedAt = previous.windowStartedAt instanceof Timestamp
      ? previous.windowStartedAt.toMillis()
      : 0;
    const withinWindow = now - startedAt < 60_000;
    const nextCount = withinWindow ? Number(previous.requestCount || 0) + 1 : 1;

    if (nextCount > MAX_REQUESTS_PER_MINUTE) {
      throw new HttpsError(
        'resource-exhausted',
        'Bạn đã hỏi khá nhiều. Hãy đợi khoảng một phút rồi thử lại nhé.',
      );
    }

    transaction.set(rateLimitRef, {
      requestCount: nextCount,
      windowStartedAt: Timestamp.fromMillis(withinWindow ? startedAt : now),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

exports.askStudentAssistant = onCall(
  {
    timeoutSeconds: 35,
    memory: '256MiB',
    secrets: [geminiApiKey],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để dùng trợ lý học tập.');
    }

    const key = geminiApiKey.value();
    if (!key) {
      throw new HttpsError('failed-precondition', 'Trợ lý AI chưa được cấu hình.');
    }

    const message = asText(request.data?.message, MAX_MESSAGE_LENGTH);
    if (!message) {
      throw new HttpsError('invalid-argument', 'Câu hỏi không hợp lệ.');
    }

    await consumeRateLimit(request.auth.uid);

    const mode = normalizeMode(request.data?.mode);
    const image = normalizeImage(request.data?.image);
    const startedAt = Date.now();
    let sources = mode === 'library-search' && !image
      ? await searchOpenAcademicSources(message).catch((error) => {
        console.warn('Open academic search failed', error?.message || error);
        return [];
      })
      : [];

    if (mode === 'library-search' && !image) {
      return {
        answer: sources.length
          ? `Mình đã tìm được ${sources.length} nguồn học liệu mở, ưu tiên sách có thể đọc trực tuyến hợp pháp. Bạn chọn nguồn bên dưới để đọc trong TVU Connect.`
          : 'Mình chưa tìm thấy nguồn mở đủ khớp. Bạn hãy thêm tên tác giả, chuyên ngành hoặc một phần tên sách để tìm chính xác hơn.',
        sources,
      };
    }

    const modelCandidates = selectModelCandidates(message, Boolean(image));
    let modelUsed = modelCandidates[0];
    let response;
    for (const candidate of modelCandidates) {
      modelUsed = candidate;
      const geminiRequest = buildGeminiRequest(key, message, request.data?.history, {
        mode,
        image,
        sources,
        model: modelUsed,
      });
      try {
        response = await fetchGeminiWithRetry(geminiRequest.url, geminiRequest.options);
      } catch (error) {
        console.warn('AI model did not respond', modelUsed, error?.message || error);
        response = null;
      }

      if (response?.ok) break;
      const shouldTryNext = !response
        || response.status === 404
        || response.status === 408
        || response.status === 429
        || response.status >= 500;
      if (!shouldTryNext) break;
    }

    if (!response) {
      throw new HttpsError('unavailable', 'Dịch vụ AI đang tạm bận. Hãy thử lại sau.');
    }

    if (!response.ok) {
      const providerError = await response.text();
      console.error('Gemini request failed', response.status, modelUsed, providerError.slice(0, 500));

      if (mode === 'library-search' && sources.length) {
        return {
          answer: `Mình đã tìm được ${sources.length} nguồn học liệu mở để bạn kiểm tra. AI đang hết lượt phản hồi tạm thời, nhưng các nguồn bên dưới vẫn có thể mở và đọc ngay.`,
          sources,
        };
      }

      if (response.status === 429) {
        throw new HttpsError('resource-exhausted', 'Dịch vụ AI đang quá tải. Hãy thử lại sau ít phút.');
      }
      if (response.status === 401 || response.status === 403) {
        throw new HttpsError('failed-precondition', 'Cấu hình AI không hợp lệ.');
      }
      if (response.status >= 500) {
        throw new HttpsError('unavailable', 'Dịch vụ AI đang tạm bận.');
      }
      throw new HttpsError('internal', 'Không thể tạo câu trả lời AI.');
    }

    const payload = await response.json();
    const answer = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();

    const groundedSources = extractGroundingSources(payload);
    sources = [...sources, ...groundedSources].filter((source, index, list) => (
      list.findIndex((candidate) => candidate.url === source.url) === index
    )).slice(0, 8);

    if (mode === 'library-search' && image && answer) {
      const imageSources = await searchOpenAcademicSources(`${message} ${answer.slice(0, 500)}`)
        .catch(() => []);
      sources = [...sources, ...imageSources].filter((source, index, list) => (
        list.findIndex((candidate) => candidate.url === source.url) === index
      )).slice(0, 8);
    }

    if (!answer) return {
      answer: 'Mình chưa thể trả lời câu này một cách đáng tin cậy. Bạn hãy thử diễn đạt cụ thể hơn nhé.',
      sources,
    };

    console.info('Student assistant response', {
      durationMs: Date.now() - startedAt,
      hasImage: Boolean(image),
      mode,
      modelUsed,
      sourceCount: sources.length,
      thinkingLevel: selectThinkingLevel(message),
      uid: request.auth.uid,
    });
    return { answer, sources };
  },
);

exports.buildGeminiRequest = buildGeminiRequest;
exports.fetchGeminiWithRetry = fetchGeminiWithRetry;
exports.extractGroundingSources = extractGroundingSources;
exports.extractAcademicSearchQuery = extractAcademicSearchQuery;
exports.normalizeImage = normalizeImage;
exports.searchOpenAcademicSources = searchOpenAcademicSources;
exports.selectModelCandidates = selectModelCandidates;
exports.selectThinkingLevel = selectThinkingLevel;
exports.FALLBACK_MODEL = FALLBACK_MODEL;
exports.FAST_MODEL = FAST_MODEL;
exports.MODEL = MODEL;
