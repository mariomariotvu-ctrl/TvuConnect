const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp();
}

const MODEL = 'gemini-2.5-flash';
const MAX_MESSAGE_LENGTH = 1_500;
const MAX_HISTORY_ITEMS = 8;
const MAX_HISTORY_TEXT_LENGTH = 1_000;
const MAX_REQUESTS_PER_MINUTE = 8;
const geminiApiKey = defineSecret('GEMINI_API_KEY');

const SYSTEM_INSTRUCTION = [
  'Bạn là TVU Buddy, trợ lý học tập thân thiện cho sinh viên Đại học Trà Vinh.',
  'Trả lời bằng tiếng Việt rõ ràng, ngắn gọn, dễ làm theo. Ưu tiên học tập, kỹ năng, cách dùng TVU Connect và an toàn số.',
  'Không bịa địa điểm, sự kiện, học liệu, chính sách, con người hoặc dữ liệu thời gian thực. Nếu thiếu dữ liệu, nói rõ và hướng dẫn người dùng kiểm tra trong ứng dụng hoặc nguồn chính thức.',
  'Không yêu cầu mật khẩu, mã OTP, địa chỉ chính xác, số điện thoại, MSSV hoặc dữ liệu nhạy cảm. Nhắc người dùng kiểm tra nguồn khi trả lời ảnh hưởng tới học tập, sức khỏe, pháp lý hoặc tài chính.',
  'Không hỗ trợ gian lận học thuật. Có thể giải thích, lập kế hoạch ôn tập, đưa ví dụ và khuyến khích tự làm.',
].join(' ');

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
    timeoutSeconds: 45,
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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [...normalizeHistory(request.data?.history), { role: 'user', parts: [{ text: message }] }],
          generationConfig: {
            temperature: 0.3,
            topP: 0.8,
            maxOutputTokens: 700,
          },
        }),
      },
    );

    if (!response.ok) {
      const providerError = await response.text();
      console.error('Gemini request failed', response.status, providerError.slice(0, 500));

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

    if (!answer) {
      return { answer: 'Mình chưa thể trả lời câu này một cách đáng tin cậy. Bạn hãy thử diễn đạt cụ thể hơn nhé.' };
    }

    return { answer };
  },
);
