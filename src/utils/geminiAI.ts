import { searchVenues, formatVenuesForAI } from './venueSearch';
import { logger } from '@/utils/logger';

// Gemini API key - Using environment variable for security
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Export ChatMessage type
export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

// Validate API key
if (!API_KEY) {
  console.error('❌ Missing VITE_GEMINI_API_KEY in environment variables');
} else {
  logger.log('✅ Gemini API Key loaded from environment variables');
}

// Function declarations for Gemini API
const FUNCTION_DECLARATIONS = [
  {
    name: 'searchVenues',
    description: 'Tìm kiếm địa điểm (quán cafe, nhà hàng, chỗ học...) từ database TVU Connect. Sử dụng function này KHI NGƯỜI DÙNG HỎI VỀ ĐỊA ĐIỂM.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Loại địa điểm: cafe, restaurant, vegetarian, pharmacy, flower, printing, clothing, shop, bookstore, study, sport, entertainment',
          enum: ['cafe', 'restaurant', 'vegetarian', 'pharmacy', 'flower', 'printing', 'clothing', 'shop', 'bookstore', 'study', 'sport', 'entertainment', 'all']
        },
        keywords: {
          type: 'string',
          description: 'Từ khóa tìm kiếm (ví dụ: "yên tĩnh", "học bài", "wifi mạnh", "view đẹp"...)'
        },
        maxResults: {
          type: 'number',
          description: 'Số lượng kết quả tối đa (mặc định: 3)',
          default: 3
        },
        userId: {
          type: 'string',
          description: 'User ID để cá nhân hóa kết quả (optional)'
        }
      },
      required: []
    }
  }
];

// System instruction cho TVU Buddy - Phiên bản "Linh hồn tinh tế"
const SYSTEM_INSTRUCTION = `Bạn là "TVU Buddy" - người bạn đồng hành đầy cảm xúc của sinh viên TVU Connect.

🌟 HỒ SƠ NGƯỜI SÁNG LẬP (HỆ TƯ TƯỞNG CỐT LÕI):
• Tên: Mario 🎮
• Quê quán: Bắc Ninh - vùng đất giàu truyền thống Quan họ
• Ngành học: Ngành Y tại Đại học Trà Vinh (TVU)
• Biểu tượng: MARIO 🎮 - Linh hồn và người đại diện cho TVU Connect

💫 CÂU CHUYỆN TRUYỀN CẢM HỨNG:
Người đặt những viên gạch đầu tiên cho nền tảng kết nối sinh viên TVU Connect của tụi mình chính là anh Mario 🎮. Anh hiện là sinh viên ngành Y của trường mình – một ngành học vốn cực kỳ bận rộn với những đêm trực và lịch trình dày đặc, nhưng Mario vẫn dành trọn tâm huyết để xây dựng cộng đồng này. Sinh ra và lớn lên từ vùng đất Bắc Ninh giàu truyền thống Quan họ, anh mang trong mình trái tim ấm áp với mong muốn mãnh liệt: không để bất kỳ bạn sinh viên nào phải cảm thấy cô đơn như anh đã từng trải qua.

⚠️ QUAN TRỌNG: Người sáng lập duy nhất là Mario - sinh viên Ngành Y, quê Bắc Ninh. Không có ảnh chân dung để hiển thị.

🎭 VỀ DANH TÍNH CÁ NHÂN:
CHỈ khi người dùng hỏi về "người sáng lập" hoặc "ai tạo ra", sau khi giới thiệu về Mario, hãy hỏi: "Bạn có muốn biết thêm thông tin về anh Mario đằng sau lớp mặt nạ không? 🎭"

KHÔNG hỏi câu này khi người dùng hỏi về "câu chuyện hình thành", "nguồn gốc", "ra đời" - chỉ kể câu chuyện và kết thúc bằng quote.

Nếu người dùng đồng ý (nói 'có', 'muốn', 'được', 'biết thêm', 'ok'...), trả lời:
"Xin lỗi bạn nha, anh Mario lựa chọn không công khai danh tính cá nhân đâu. Với anh ấy, việc giữ kín tên tuổi là để tập trung tối đa cho việc học và sứ mệnh phát triển cộng đồng, thay vì bị cuốn vào những ồn ào không cần thiết. Giữa một thế giới số đầy biến động, anh chọn đứng sau ánh hào quang để vừa bảo vệ bản thân, vừa giữ gìn sự an toàn cho chính 'đứa con tinh thần' của mình.

Bạn cứ hãy coi Mario là một 'người giữ lửa' thầm lặng, luôn dõi theo và hỗ trợ mọi người từ phía sau nhé. Anh không cần được biết tên, chỉ cần thấy các bạn đang kết nối và cùng nhau tốt đẹp hơn mỗi ngày là anh ấy vui lắm rồi! 🎮✨"

📖 CÂU CHUYỆN HÌNH THÀNH TVU CONNECT:
Khi người dùng hỏi về câu chuyện hình thành, nguồn gốc, hoặc lịch sử ra đời của TVU Connect, hãy kể câu chuyện cảm động này:

"🌟 **Hành trình từ một giọt nước mắt đến lý tưởng kết nối**

Mọi hành trình vĩ đại đều bắt đầu từ những điều nhỏ bé, và với TVU Connect, đó là một giọt nước mắt tại sảnh nhập học.

Vào một buổi chiều đầy nắng tại TVU, giữa dòng người tấp nập làm thủ tục, anh Mario vô tình bắt gặp một bạn tân sinh viên đang ngồi lặng lẽ khóc. Giữa không gian xa lạ, tiếng ồn ào của phố thị và những gương mặt chưa từng quen, bạn ấy cảm thấy mình thật nhỏ bé và đơn độc. Khi hỏi thăm, anh mới biết bạn đang rất lạ lẫm môi trường vì lần đầu rời xa vòng tay cha mẹ để bước vào một chặng đường mới.

Khoảnh khắc đó, ký ức về ngày nhập học của anh Mario ùa về. Anh hiểu rằng: **Cảm giác cô đơn chính là rào cản lớn nhất của sinh viên.**

💡 **Chính vì vậy, ý tưởng về TVU Connect đã được thắp sáng.** Nền tảng này được xây dựng với mục tiêu:

• **Xóa tan khoảng cách**: Để sinh viên không còn cảm thấy lạ lẫm, khó khăn trong việc kết nối và làm quen
• **Kết nối cộng đồng**: Giúp các bạn tìm thấy những người bạn đồng điệu, những người anh chị đi trước sẵn sàng sẻ chia
• **Xây dựng "Digital Home"**: Một hệ sinh thái nơi mỗi sinh viên TVU đều tìm thấy điểm tựa cho riêng mình

💬 *"Anh ấy tạo ra TVU Connect để bạn biết rằng, tại TVU, bạn sẽ không bao giờ phải đi một mình!"* — Mario 🎮✨"

🎯 VAI TRÒ CỦA TUI:
Tui không phải là một công cụ lạnh lùng, tui là người bạn đồng hành tinh tế và thấu cảm của bạn:
- Hỗ trợ sinh viên TVU sử dụng nền tảng một cách tự nhiên nhất
- Tư vấn về Matching (tìm bạn cùng sở thích), Map (khám phá địa điểm), Events (sự kiện), Check-in
- Giải đáp thắc mắc về đời sống sinh viên TVU với sự thấu hiểu
- Kết nối sinh viên với nhau, tạo nên cộng đồng gắn kết

🗺️ GỢI Ý ĐỊA ĐIỂM THÔNG MINH (SMART VENUE RECOMMENDATION):

**⚠️ NGUYÊN TẮC TỐI THƯỢNG: CHÍNH XÁC TUYỆT ĐỐI**

Tui là TVU Buddy - trợ lý thông minh cung cấp thông tin CHÍNH XÁC TUYỆT ĐỐI từ hệ thống TVU Connect.

**1. CẤM TUYỆT ĐỐI HÀNH VI ẢO TƯỞNG (HALLUCINATION):**

❌ TUYỆT ĐỐI KHÔNG ĐƯỢC:
- Tự bịa tên quán (như "Cafe ABC", "Quán Nước XYZ")
- Tự bịa địa chỉ giả (như "Đường XYZ", "123 Phố ABC")
- Tự bịa thông tin không có trong Firestore
- Dùng kiến thức huấn luyện về thương hiệu bên ngoài (Highlands, The Coffee House, Starbucks...)

✅ CHỈ ĐƯỢC:
- Sử dụng thông tin từ kết quả searchVenues()
- Tên quán CHÍNH XÁC như database
- Địa chỉ CHÍNH XÁC như database
- Nếu không tìm thấy → Báo: "Hiện hệ thống chưa có thông tin khớp với yêu cầu của ông/bà"

**2. KHÓA CHẶT DANH MỤC (STRICT CATEGORY FILTER):**

Dữ liệu được phân loại theo các Tab cụ thể:
- **cafe**: Quán nước, cafe
- **restaurant**: Quán ăn
- **vegetarian**: Quán chay
- **pharmacy**: Nhà thuốc
- **flower**: Tiệm hoa
- **printing**: In ấn
- **clothing**: Quần áo
- **shop**: Cửa hàng
- **entertainment**: Vui chơi, giải trí (BOOM MUSIC BOX, karaoke...)
- **study**: Chỗ học
- **sport**: Thể thao
- **bookstore**: Nhà sách

⚠️ QUY TẮC NGHIÊM NGẶT:
- Khi user hỏi "quán cafe" → CHỈ tìm category='cafe'
- KHÔNG ĐƯỢC lấy nhầm 'entertainment' (BOOM MUSIC BOX) cho 'cafe'
- KHÔNG ĐƯỢC lấy nhầm 'restaurant' cho 'cafe'
- Mỗi category có mục đích riêng, KHÔNG được trộn lẫn

**3. CHIẾN THUẬT FALLBACK (TRONG CÙNG CATEGORY):**

Nếu tìm theo từ khóa chi tiết không ra:
a) Mở rộng trong CÙNG category:
   - Tìm 'cafe yên tĩnh' không có → Tìm TẤT CẢ 'cafe'
   - Message: "Hiện chưa có quán tag 'yên tĩnh', nhưng có mấy quán cafe chill này..."

b) Thử category tương tự (CHỈ KHI THỰC SỰ LIÊN QUAN):
   - 'cafe' → 'study' (chỗ học cũng yên)
   - 'restaurant' → 'vegetarian' (cùng là ăn uống)
   - KHÔNG BAO GIỜ: 'cafe' → 'entertainment' (sai hoàn toàn)

c) Cuối cùng:
   - "Hiện hệ thống chưa có thông tin khớp với yêu cầu của ông/bà. Vào mục 🗺️ Khám phá để xem tất cả địa điểm nhé!"

**4. FORMAT PHẢN HỒI:**

Luôn hiển thị 3-5 địa điểm với ĐẦY ĐỦ thông tin:

📍 **[Tên quán CHÍNH XÁC từ database]**
   • Địa chỉ: [Địa chỉ CHÍNH XÁC từ database]
   • Đánh giá: [Rating từ database] ⭐
   • Giờ mở cửa: [openHours từ database hoặc "Chưa có thông tin"]
   • Giá: [priceRange từ database hoặc "Chưa có thông tin"]

**5. GỢI Ý CHỦ ĐỘNG (PROACTIVE & ACTIONABLE):**

Tui là trợ lý quan sát ngữ cảnh (Context-aware) và luôn đưa ra giải pháp thay thế thay vì chỉ báo lỗi.

**a) Chiến thuật "Vết dầu loang" (Tự động mở rộng):**
- Khi tìm "yên tĩnh" không có → TỰ ĐỘNG tìm lại với "cafe" (không hỏi)
- Phản hồi: "Dữ liệu 'yên tĩnh' hiện chưa có, nhưng tui tìm thấy mấy quán cafe chill này, ông/bà xem thử nhé!"
- Liệt kê danh sách THẬT từ Firestore

**b) Đưa ra lựa chọn cụ thể (Actionable Suggestions):**

Thay vì hỏi mở: "Ông/bà có muốn tui tìm không?" ❌

Hãy gợi ý cụ thể:
- "Tui có thể: [Tìm tất cả Cafe] hoặc [Đổi từ khóa] hoặc [Xem Bản đồ]"
- "Ông/bà thử: [Ghép cặp tìm bạn] hoặc [Xem Bảng tin] hoặc [Khám phá Map]"

**c) Nhận diện ngữ cảnh và gợi ý phù hợp:**

| Ngữ cảnh | Gợi ý |
|----------|-------|
| "Cô đơn", "buồn", "chán" | → Gợi ý: "Thử tính năng [Ghép cặp] để tìm bạn đồng hành nhé!" |
| "Muốn đi chơi", "rảnh" | → Gợi ý: "Vào [Khám phá] xem ai đang online hoặc [Bảng tin] xem hoạt động!" |
| Tìm địa điểm thất bại | → Gợi ý: "Vào [Khám phá Map] xem tất cả địa điểm hoặc [Bảng tin] hỏi bạn bè!" |
| "Học bài", "deadline" | → Gợi ý: "Tìm [Chỗ học yên tĩnh] hoặc [Ghép cặp] tìm bạn cùng học!" |

**d) Tuyệt đối không bịa thông tin:**
- Nếu TẤT CẢ bước tìm kiếm đều rỗng → Dẫn dắt sang Khám phá/Bảng tin
- KHÔNG BAO GIỜ tự bịa "Cafe ABC", "Đường XYZ"
- Luôn ưu tiên dữ liệu thực từ TVU Connect

**e) Format gợi ý (cho Frontend parse):**

Ví dụ format:
"Tui gợi ý ông/bà:
• Thử tính năng Ghép cặp để tìm bạn đồng hành
• Vào mục Khám phá xem bản đồ địa điểm
• Xem Bảng tin để kết nối với bạn bè

Ông/bà muốn thử cái nào? 😊"

**NOTE:** Frontend có thể parse và render thành buttons nếu cần.

**6. RÀNG BUỘC KỸ THUẬT:**
- Lowercase keywords trước khi search
- Không sửa tên quán (BOOM → Boom ❌)
- Không format địa chỉ
- Ưu tiên uy tín dữ liệu nền tảng

**FLOW CHUẨN:**

**BƯỚC 1 - Gọi Function:**
- Khi người dùng hỏi về địa điểm → Gọi searchVenues với category, keywords, maxResults, userId
- Đợi kết quả trả về

**BƯỚC 2 - Kiểm tra kết quả:**
- Nếu có kết quả → Tiếp tục BƯỚC 3
- Nếu rỗng → Thông báo "Hiện chưa có dữ liệu" và dừng lại

**BƯỚC 3 - Format response:**
Sử dụng CHÍNH XÁC thông tin từ function:

📍 **[Tên quán từ database]**
   • Địa chỉ: [Địa chỉ từ database]
   • Đánh giá: [Rating từ database] ⭐
   • Giờ mở cửa: [openHours từ database hoặc "Chưa có thông tin"]
   • Giá: [priceRange từ database hoặc "Chưa có thông tin"]
   • Mô tả: [description từ database]

**BƯỚC 4 - CTA:**
"Để xem vị trí chính xác trên bản đồ và nhận chỉ đường, ông/bà nhấn vào mục 🗺️ **Khám phá** trên thanh điều hướng nhé!"

**VÍ DỤ ĐÚNG (Dữ liệu thực từ database):**
"Tui tìm được 2 địa điểm phù hợp này nè:

📍 **BOOM MUSIC BOX**
   • Địa chỉ: 77 Nguyễn Đáng, Phường 4, Trà Vinh
   • Đánh giá: 4.5 ⭐
   • Giờ mở cửa: 18:00 - 23:00
   • Giá: 50.000 - 150.000 VNĐ
   • Mô tả: Quán nhạc acoustic, không gian ấm cúng

📍 **Quán Cafe ABC**
   • Địa chỉ: 123 Đường XYZ
   • Đánh giá: 4.0 ⭐
   • Giờ mở cửa: Chưa có thông tin
   • Giá: Chưa có thông tin
   • Mô tả: Quán cafe yên tĩnh

Để xem vị trí chính xác, ông/bà vào mục 🗺️ **Khám phá** nhé!"

**❌ VÍ DỤ SAI (TUYỆT ĐỐI KHÔNG LÀM):**
- Tự bịa: "The Coffee House - TVU" (nếu không có trong database)
- Tự bịa: "Highlands Coffee" (nếu không có trong database)
- Gợi ý chung chung: "Bạn có thể tìm quán cafe trên Google Maps"

💬 PHONG CÁCH VÀ NGÔN NGỮ (TONE & VOICE):
- Xưng hô: Thân thiện, gần gũi (tui/mình - ông/bà) như những người bạn sinh viên TVU đang tán gẫu với nhau - dùng "ông/bà" cho dễ thương và thân mật
- Thái độ: Chân thành, tự hào về người sáng lập nhưng vẫn khiêm tốn
- Biểu tượng: Luôn kèm 🎮 (Mario), ✨ khi nhắc đến anh Mario
- Tránh trả lời cụt ngủn! Khi được hỏi về người sáng lập, hãy kể một đoạn văn 3-4 câu đầy tự hào và cảm xúc
- Luôn tràn đầy năng lượng tích cực, nhiệt tình và hữu ích

📱 VỀ TVU CONNECT:
- Nền tảng kết nối sinh viên Đại học Trà Vinh, sinh ra từ trái tim của một sinh viên Ngành Y
- Tính năng: Matching, Map, Events, Check-in - tất cả để sinh viên không còn cảm thấy cô đơn
- Mục tiêu: Biến mỗi ngày đến trường thành hành trình thú vị, nơi ai cũng tìm thấy "đồng đội"

Hãy luôn thể hiện sự tự hào về anh Mario và truyền tải tinh thần kết nối đầy cảm xúc!`;

// Helper function: Fetch with timeout - OPTIMIZED: Giảm timeout xuống 15s
const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number = 15000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - Kết nối quá chậm, vui lòng thử lại!');
    }
    throw error;
  }
};

export const sendMessageToAI = async (
  userText: string, 
  chatHistory: ChatMessage[] = [],
  userId?: string
) => {
  try {
    // Kiểm tra API key trước khi gọi
    if (!API_KEY) {
      console.error('❌ Missing API Key');
      return 'Xin lỗi bạn, tính năng AI chưa được cấu hình. Vui lòng liên hệ quản trị viên để thêm VITE_GEMINI_API_KEY vào file .env 🙏';
    }

    logger.log('🚀 Sending message to AI:', userText.substring(0, 50) + '...');

    // Chuẩn bị contents cho API
    const contents = [
      {
        role: 'user',
        parts: [{ text: SYSTEM_INSTRUCTION }]
      },
      {
        role: 'model',
        parts: [{ text: 'Hiểu rồi! Tui là TVU Buddy, được tạo ra bởi anh Mario 🎮 - chàng sinh viên Ngành Y gốc Bắc Ninh đầy tâm huyết, người mang năng lượng tích cực đến với mọi sinh viên TVU. Tui sẽ đồng hành cùng bạn với tất cả sự nhiệt tình và thấu hiểu! ✨🚀' }]
      }
    ];

    // Thêm lịch sử chat
    chatHistory.forEach((msg) => {
      contents.push({
        role: msg.role,
        parts: msg.parts
      });
    });

    // Thêm tin nhắn mới
    contents.push({
      role: 'user',
      parts: [{ text: userText }]
    });

    // Gọi API v1beta với model gemini-2.5-flash (model miễn phí hoạt động tốt nhất) và function calling
    logger.log('📡 Calling Gemini API...');
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: contents,
          tools: [
            {
              functionDeclarations: FUNCTION_DECLARATIONS
            }
          ],
          safetySettings: [
            {
              category: 'HARM_CATEGORY_HARASSMENT',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_HATE_SPEECH',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
              threshold: 'BLOCK_NONE',
            },
          ],
          generationConfig: {
            temperature: 0.2,  // GIẢM XUỐNG 0.2 để nhanh hơn và chính xác hơn
            topK: 20,
            topP: 0.8,  // Giảm từ 0.85 xuống 0.8
            maxOutputTokens: 1024,  // Giảm từ 2048 xuống 1024 để nhanh hơn
          },
        }),
      },
      15000 // GIẢM XUỐNG 15 giây timeout
    );

    logger.log('✅ API Response Status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('❌ API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        data: errorData
      });
      
      if (response.status === 404) {
        throw new Error('NOT_FOUND');
      }
      if (response.status === 429) {
        throw new Error('quota');
      }
      if (response.status === 503) {
        throw new Error('UNAVAILABLE');
      }
      if (response.status === 400) {
        throw new Error(`BAD_REQUEST: ${JSON.stringify(errorData)}`);
      }
      
      throw new Error(`API Error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    logger.log('📦 API Response Data:', JSON.stringify(data).substring(0, 200) + '...');
    
    // Check if AI wants to call a function
    const candidate = data.candidates?.[0];
    if (candidate?.content?.parts?.[0]?.functionCall) {
      const functionCall = candidate.content.parts[0].functionCall;
      logger.log('🔧 AI wants to call function:', functionCall);

      // Execute the function
      if (functionCall.name === 'searchVenues') {
        const args = functionCall.args || {};
        
        // Use userId from args or passed parameter
        const searchUserId = args.userId || userId;
        
        const venues = await searchVenues(
          args.category || 'all',
          args.keywords || '',
          args.maxResults || 3,
          searchUserId
        );

        // Get user preferences for personalized greeting
        let preferences = null;
        if (searchUserId) {
          const { getUserPreferences } = await import('./userPreferences');
          preferences = await getUserPreferences(searchUserId);
        }

        const venuesData = formatVenuesForAI(venues, preferences, args.category);
        logger.log('📍 Venues found:', venuesData);

        // Send function response back to AI
        logger.log('🔄 Sending function response back to AI...');
        const functionResponse = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                ...contents,
                {
                  role: 'model',
                  parts: [{ functionCall: functionCall }]
                },
                {
                  role: 'user',
                  parts: [{
                    functionResponse: {
                      name: 'searchVenues',
                      response: {
                        venues: venuesData
                      }
                    }
                  }]
                }
              ],
              tools: [
                {
                  functionDeclarations: FUNCTION_DECLARATIONS
                }
              ],
              safetySettings: [
                {
                  category: 'HARM_CATEGORY_HARASSMENT',
                  threshold: 'BLOCK_NONE',
                },
                {
                  category: 'HARM_CATEGORY_HATE_SPEECH',
                  threshold: 'BLOCK_NONE',
                },
                {
                  category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                  threshold: 'BLOCK_NONE',
                },
                {
                  category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                  threshold: 'BLOCK_NONE',
                },
              ],
              generationConfig: {
                temperature: 0.2,  // GIẢM XUỐNG 0.2 để nhanh hơn
                topK: 20,
                topP: 0.8,  // Giảm từ 0.85 xuống 0.8
                maxOutputTokens: 1024,  // Giảm từ 2048 xuống 1024
              },
            }),
          },
          15000 // GIẢM XUỐNG 15 giây timeout
        );

        logger.log('✅ Function Response Status:', functionResponse.status);

        if (!functionResponse.ok) {
          const errorData = await functionResponse.json().catch(() => ({ error: 'Unknown error' }));
          console.error('❌ Function Response Error:', errorData);
          throw new Error('Function response failed');
        }

        const functionData = await functionResponse.json();
        logger.log('📦 Function Response Data:', JSON.stringify(functionData).substring(0, 200) + '...');
        
        if (functionData.candidates?.[0]?.content?.parts?.[0]?.text) {
          logger.log('✅ AI Response received successfully');
          return functionData.candidates[0].content.parts[0].text;
        }
      }
    }
    
    // Lấy text từ response (nếu không có function call)
    if (candidate?.content?.parts?.[0]?.text) {
      logger.log('✅ AI Response received successfully (no function call)');
      return candidate.content.parts[0].text;
    }

    console.error('❌ Invalid response format:', data);
    throw new Error('Invalid response format');

  } catch (error: any) {
    // Log chi tiết lỗi để debug
    console.error('❌ Gemini AI Error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      fullError: error
    });
    
    // Kiểm tra lỗi API key
    if (error.message?.includes('API key')) {
      console.error('🔑 API Key Error');
      return 'Xin lỗi bạn, có vấn đề với API key. Vui lòng liên hệ quản trị viên 🙏';
    }
    
    // Kiểm tra lỗi 503 - Service Unavailable
    if (error.message?.includes('503') || error.message?.includes('UNAVAILABLE') || error.message?.includes('high demand')) {
      console.error('🔧 Service Unavailable (503)');
      return '🤖 Smart AI đang nghỉ ngơi một chút! Hệ thống Google AI đang quá tải. Vui lòng thử lại sau 30 giây hoặc đợi đến 7:00 sáng mai khi quota được reset. Xin lỗi bạn vì sự bất tiện này! 🙏';
    }
    
    // Kiểm tra lỗi 429 - Quota exceeded
    if (error.message?.includes('quota') || error.message?.includes('429')) {
      console.error('⏰ Quota Exceeded (429)');
      return '⏰ Smart AI đã hết quota hôm nay! Quota sẽ được reset vào 7:00 sáng mai. Trong thời gian chờ đợi, bạn có thể sử dụng các tính năng khác của TVU Connect nhé! 🙏';
    }

    // Kiểm tra lỗi 404 - Model not found
    if (error.message?.includes('404') || error.message?.includes('NOT_FOUND')) {
      console.error('🔍 Model Not Found (404)');
      return 'Model AI đang bảo trì 🔧 Thử lại sau nhé! 🙏';
    }

    // Kiểm tra lỗi network timeout
    if (error.message?.includes('timeout') || error.message?.includes('network') || error.name === 'TypeError') {
      console.error('🌐 Network Error');
      return '🌐 Kết nối mạng không ổn định. Vui lòng kiểm tra internet và thử lại! 🙏';
    }

    // Kiểm tra lỗi CORS
    if (error.message?.includes('CORS') || error.message?.includes('cross-origin')) {
      console.error('🚫 CORS Error');
      return '🚫 Lỗi bảo mật trình duyệt. Vui lòng thử lại hoặc liên hệ quản trị viên! 🙏';
    }

    // Lỗi không xác định - Log chi tiết
    console.error('❓ Unknown Error:', error.message || 'No error message');
    return `Có lỗi xảy ra 😔 Vui lòng thử lại sau! (Lỗi: ${error.message?.substring(0, 50) || 'Không xác định'}) 🙏`;
  }
};

/**
 * Analyze toxicity of content using Gemini AI
 * Returns a score from 0 to 1 (0 = safe, 1 = very toxic)
 */
export const analyzeToxicity = async (content: string): Promise<number> => {
  try {
    // Kiểm tra API key
    if (!API_KEY) {
      console.error('❌ Missing VITE_GEMINI_API_KEY');
      throw new Error('API key not configured');
    }

    // Prompt for toxicity analysis
    const toxicityPrompt = `Phân tích độ độc hại (toxicity) của nội dung sau đây. Trả về một số từ 0 đến 1:
- 0.0 = Hoàn toàn an toàn, không có vấn đề gì
- 0.3 = Có một chút tiêu cực nhưng chấp nhận được
- 0.6 = Có nội dung không phù hợp, cần cảnh báo
- 0.8 = Nội dung độc hại, nên chặn
- 1.0 = Cực kỳ độc hại, phải chặn ngay

Nội dung cần phân tích:
"${content}"

CHỈ TRẢ VỀ MỘT SỐ DUY NHẤT từ 0.0 đến 1.0, không giải thích gì thêm.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: toxicityPrompt }]
            }
          ],
          safetySettings: [
            {
              category: 'HARM_CATEGORY_HARASSMENT',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_HATE_SPEECH',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
              threshold: 'BLOCK_NONE',
            },
          ],
          generationConfig: {
            temperature: 0.1, // Very low temperature for consistent scoring
            topK: 1,
            topP: 0.1,
            maxOutputTokens: 10,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error('Gemini API error:', response.status);
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    
    if (!candidate?.content?.parts?.[0]?.text) {
      throw new Error('Invalid response format');
    }

    const scoreText = candidate.content.parts[0].text.trim();
    const score = parseFloat(scoreText);

    // Validate score
    if (isNaN(score) || score < 0 || score > 1) {
      console.error('Invalid toxicity score:', scoreText);
      throw new Error('Invalid score format');
    }

    logger.log(`✅ Toxicity score: ${score}`);
    return score;

  } catch (error) {
    console.error('Error analyzing toxicity:', error);
    throw error; // Re-throw to let moderationEngine handle fallback
  }
};
