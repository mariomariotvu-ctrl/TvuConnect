import { logger } from './logger';

interface CacheEntry {
  question: string;
  answer: string;
  keywords: string[];
}

// Only cache stable in-app guidance. Live facts and study answers always go to
// the server-side assistant so the UI never invents local places or events.
const CACHED_RESPONSES: CacheEntry[] = [
  {
    question: 'tìm bạn',
    keywords: ['tìm bạn', 'kết bạn', 'bạn cùng ngành', 'bạn gần đây'],
    answer: 'Vào Tìm bạn để lọc theo tên, lớp, ngành hoặc niên khóa. Bạn cũng có thể bật Quanh đây; ứng dụng chỉ lưu vị trí gần đúng theo ô 1–2 km và bạn có thể tắt bất cứ lúc nào.',
  },
  {
    question: 'tìm trọ',
    keywords: ['tìm trọ', 'phòng trọ', 'ở ghép', 'nhà trọ'],
    answer: 'Mở Tiện ích → Tìm trọ để lọc theo loại phòng, mức giá và địa chỉ. Khi liên hệ, hãy xác minh giá điện/nước, tiền cọc và xem phòng trực tiếp trước khi chuyển tiền.',
  },
  {
    question: 'tài liệu và sách',
    keywords: ['tài liệu', 'giáo trình', 'tìm sách', 'sách pdf', 'thư viện'],
    answer: 'Vào Tài liệu, chọn ngành học rồi lọc Sách/Giáo trình. Chỉ sử dụng tài liệu mở, liên kết chính thức hoặc tài liệu bạn được phép chia sẻ; đừng đăng bản sao có bản quyền khi chưa được phép.',
  },
  {
    question: 'cuộc gọi',
    keywords: ['gọi điện', 'gọi video', 'video call', 'cuộc gọi'],
    answer: 'Trong cuộc trò chuyện, nhấn biểu tượng điện thoại hoặc video để gọi. Micro/camera chỉ được xin quyền khi bạn bắt đầu hoặc nhận cuộc gọi. Nếu mạng di động chặn kết nối trực tiếp, hãy thử lại bằng Wi‑Fi.',
  },
  {
    question: 'thông báo',
    keywords: ['thông báo', 'tin nhắn mới', 'bật thông báo'],
    answer: 'Khi ứng dụng hỏi quyền thông báo, chọn **Cho phép** để nhận tin nhắn mới. Bạn có thể đổi quyền này sau trong cài đặt của trình duyệt hoặc điện thoại.',
  },
];

const normalizeText = (text: string) => text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const findCachedResponse = (userQuestion: string): string | null => {
  const question = normalizeText(userQuestion);
  if (!question) return null;

  for (const entry of CACHED_RESPONSES) {
    if (entry.keywords.some((keyword) => question.includes(normalizeText(keyword)))) {
      logger.log('AI guidance cache hit:', entry.question);
      return entry.answer;
    }
  }
  return null;
};

export const shouldUseCache = (userQuestion: string): boolean => {
  const question = normalizeText(userQuestion);
  const asksForAppGuidance = [
    'cach ',
    'lam sao',
    'nhu the nao',
    'o dau',
    'huong dan',
    'su dung',
    'trong tvu connect',
    'tren tvu connect',
    'trong app',
    'tren app',
    'bat thong bao',
    'mo tien ich',
  ].some((phrase) => question.includes(phrase));

  return asksForAppGuidance
    && !/\b(hom nay|bay gio|hien tai|moi nhat)\b/.test(question);
};

export const getCacheStats = () => ({
  totalCachedResponses: CACHED_RESPONSES.length,
  categories: CACHED_RESPONSES.map((entry) => entry.question),
});
