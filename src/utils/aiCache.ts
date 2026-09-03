import { logger } from './logger';
// Smart AI Cache - Giảm 50-70% API calls
// Cache các câu hỏi phổ biến để không cần gọi API

interface CacheEntry {
  question: string;
  answer: string;
  keywords: string[];
}

// Các câu trả lời được cache sẵn
const CACHED_RESPONSES: CacheEntry[] = [
  {
    question: "ai tạo ra bạn",
    keywords: ["ai tạo", "người sáng lập", "founder", "creator", "ai làm", "ai phát triển", "kiên là ai", "kiên mario", "mario"],
    answer: `Người đặt những viên gạch đầu tiên cho nền tảng kết nối sinh viên TVU Connect của tụi mình chính là anh Mario 🎮. Anh hiện là sinh viên ngành Y của trường mình – một ngành học vốn cực kỳ bận rộn với những đêm trực và lịch trình dày đặc, nhưng Mario vẫn dành trọn tâm huyết để xây dựng cộng đồng này. Sinh ra và lớn lên từ vùng đất Bắc Ninh giàu truyền thống Quan họ, anh mang trong mình trái tim ấm áp với mong muốn mãnh liệt: không để bất kỳ bạn sinh viên nào phải cảm thấy cô đơn như anh đã từng trải qua.

Đó là câu chuyện về người sáng lập TVU Connect! 🌟✨

Bạn có muốn biết thêm thông tin về anh Mario đằng sau lớp mặt nạ không? 🎭`
  },
  {
    question: "danh tính mario",
    keywords: ["danh tính", "tên thật", "thông tin", "đằng sau", "mặt nạ", "thật sự", "ai thật", "tên tuổi", "có", "được", "muốn", "biết thêm"],
    answer: `Xin lỗi bạn nha, anh Mario lựa chọn không công khai danh tính cá nhân đâu. Với anh ấy, việc giữ kín tên tuổi là để tập trung tối đa cho việc học và sứ mệnh phát triển cộng đồng, thay vì bị cuốn vào những ồn ào không cần thiết. Giữa một thế giới số đầy biến động, anh chọn đứng sau ánh hào quang để vừa bảo vệ bản thân, vừa giữ gìn sự an toàn cho chính 'đứa con tinh thần' của mình.

Bạn cứ hãy coi Mario là một 'người giữ lửa' thầm lặng, luôn dõi theo và hỗ trợ mọi người từ phía sau nhé. Anh không cần được biết tên, chỉ cần thấy các bạn đang kết nối và cùng nhau tốt đẹp hơn mỗi ngày là anh ấy vui lắm rồi! 🎮✨`
  },
  {
    question: "câu chuyện hình thành",
    keywords: ["câu chuyện", "hình thành", "nguồn gốc", "ra đời", "bắt đầu", "khởi nguồn", "lịch sử", "giọt nước mắt"],
    answer: `🌟 **Hành trình từ một giọt nước mắt đến lý tưởng kết nối**

Mọi hành trình vĩ đại đều bắt đầu từ những điều nhỏ bé, và với TVU Connect, đó là một giọt nước mắt tại sảnh nhập học.

Vào một buổi chiều đầy nắng tại TVU, giữa dòng người tấp nập làm thủ tục, anh Mario vô tình bắt gặp một bạn tân sinh viên đang ngồi lặng lẽ khóc. Giữa không gian xa lạ, tiếng ồn ào của phố thị và những gương mặt chưa từng quen, bạn ấy cảm thấy mình thật nhỏ bé và đơn độc. Khi hỏi thăm, anh mới biết bạn đang rất lạ lẫm môi trường vì lần đầu rời xa vòng tay cha mẹ để bước vào một chặng đường mới.

Khoảnh khắc đó, ký ức về ngày nhập học của anh Mario ùa về. Anh hiểu rằng: **Cảm giác cô đơn chính là rào cản lớn nhất của sinh viên.**

💡 **Chính vì vậy, ý tưởng về TVU Connect đã được thắp sáng.** Nền tảng này được xây dựng với mục tiêu:

• **Xóa tan khoảng cách**: Để sinh viên không còn cảm thấy lạ lẫm, khó khăn trong việc kết nối và làm quen
• **Kết nối cộng đồng**: Giúp các bạn tìm thấy những người bạn đồng điệu, những người anh chị đi trước sẵn sàng sẻ chia
• **Xây dựng "Digital Home"**: Một hệ sinh thái nơi mỗi sinh viên TVU đều tìm thấy điểm tựa cho riêng mình

💬 *"Anh ấy tạo ra TVU Connect để bạn biết rằng, tại TVU, bạn sẽ không bao giờ phải đi một mình!"* — Mario 🎮✨`
  },
  {
    question: "tìm quán cafe",
    keywords: ["quán cafe", "cafe yên tĩnh", "quán cà phê", "coffee", "đi cafe"],
    answer: `Tui gợi ý mấy quán cafe yên tĩnh gần TVU nhé! ☕✨

📍 **Cách tìm trên TVU Connect**:
1. Vào tab "Khám phá" (Map) 🗺️
2. Tìm icon ☕ trên bản đồ
3. Click vào để xem chi tiết và đánh giá

🌟 **Gợi ý hot**:
• Julia Coffee - Ngay trong khuôn viên TVU
• Các quán gần cổng trường
• Check-in để xem ai đang ở đâu!

Ông/bà thử vào Map xem nhé, có nhiều địa điểm hay lắm! 🎉`
  },
  {
    question: "sự kiện hôm nay",
    keywords: ["sự kiện", "event", "hoạt động", "hôm nay có gì", "làm gì"],
    answer: `Để xem sự kiện hôm nay, ông/bà làm theo nhé! 🎉

📍 **Cách xem Events**:
1. Vào tab "Khám phá" (Map) 🗺️
2. Click vào icon 🎉 trên bản đồ
3. Xem danh sách sự kiện đang diễn ra

✨ **Hoặc**:
• Vào tab "Sự kiện" để xem tất cả
• Check-in tại địa điểm để tạo sự kiện
• Xem ai đang tham gia

Tui không thể xem real-time data, nhưng ông/bà vào app là thấy ngay! 🚀`
  },
  {
    question: "tìm bạn",
    keywords: ["tìm bạn", "matching", "kết bạn", "làm quen", "cùng sở thích"],
    answer: `Tìm bạn cùng sở thích trên TVU Connect dễ lắm! 👥✨

📍 **Cách dùng Matching**:
1. Vào tab "Matching" 💬
2. Hoàn thiện profile của ông/bà (sở thích, khoa, năm học)
3. Hệ thống sẽ gợi ý những người phù hợp
4. Swipe phải nếu thích, trái nếu không

🌟 **Tips**:
• Điền đầy đủ profile để match chính xác hơn
• Thêm nhiều sở thích để tìm được nhiều bạn
• Check-in tại địa điểm để gặp người cùng ở đó

Chúc ông/bà tìm được nhiều bạn mới nhé! 🎉`
  },
  {
    question: "cách sử dụng",
    keywords: ["hướng dẫn", "cách dùng", "cách sử dụng", "làm sao", "how to"],
    answer: `Tui hướng dẫn ông/bà cách dùng TVU Connect nhé! 📱✨

🎯 **Các tính năng chính**:

1. **Matching** 💬
   • Tìm bạn cùng sở thích
   • Swipe để kết nối

2. **Map (Khám phá)** 🗺️
   • Xem địa điểm quanh TVU
   • Check-in tại nơi ông/bà đang ở
   • Xem ai đang ở đâu

3. **Events** 🎉
   • Xem sự kiện đang diễn ra
   • Tạo sự kiện mới
   • Tham gia cùng bạn bè

4. **Posts** 📝
   • Chia sẻ khoảnh khắc
   • Tương tác với bạn bè
   • Xem bảng tin

Ông/bà cần hướng dẫn chi tiết tính năng nào không? 🙏`
  },
  {
    question: "tvuconnect là gì",
    keywords: ["tvu connect", "tvuconnect", "là gì", "giới thiệu", "về app"],
    answer: `TVU Connect là nền tảng kết nối sinh viên Đại học Trà Vinh! 🎓✨

🌟 **Câu chuyện**:
Được tạo ra bởi anh Mario 🎮 - sinh viên Ngành Y. Anh muốn không sinh viên TVU nào phải cảm thấy cô đơn trên giảng đường.

🎯 **Mục tiêu**:
• Kết nối sinh viên cùng sở thích
• Khám phá địa điểm quanh trường
• Tham gia sự kiện cùng nhau
• Tạo cộng đồng gắn kết

💡 **Tính năng**:
• Matching - Tìm bạn
• Map - Khám phá địa điểm
• Events - Sự kiện
• Posts - Chia sẻ khoảnh khắc

Chào mừng ông/bà đến với cộng đồng TVU! 🚀`
  }
];

// Hàm normalize text để so sánh
const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Bỏ dấu tiếng Việt
    .replace(/[^a-z0-9\s]/g, '') // Chỉ giữ chữ và số
    .trim();
};

// Hàm tìm câu trả lời trong cache
export const findCachedResponse = (userQuestion: string): string | null => {
  const normalizedQuestion = normalizeText(userQuestion);
  
  // Tìm trong cache
  for (const entry of CACHED_RESPONSES) {
    // Kiểm tra keywords
    for (const keyword of entry.keywords) {
      if (normalizedQuestion.includes(normalizeText(keyword))) {
        logger.log('✅ Cache hit:', keyword);
        return entry.answer;
      }
    }
  }
  
  logger.log('❌ Cache miss, calling API...');
  return null;
};

// Hàm kiểm tra xem có nên dùng cache không
export const shouldUseCache = (userQuestion: string): boolean => {
  // Không cache nếu câu hỏi quá ngắn (< 3 từ)
  const words = userQuestion.trim().split(/\s+/);
  if (words.length < 2) {
    return false;
  }
  
  // Không cache nếu có từ khóa cần real-time data
  const realtimeKeywords = ['bây giờ', 'hiện tại', 'đang', 'real-time'];
  const normalized = normalizeText(userQuestion);
  
  for (const keyword of realtimeKeywords) {
    if (normalized.includes(normalizeText(keyword))) {
      return false;
    }
  }
  
  return true;
};

// Stats để tracking
export const getCacheStats = () => {
  return {
    totalCachedResponses: CACHED_RESPONSES.length,
    categories: CACHED_RESPONSES.map(r => r.question)
  };
};
