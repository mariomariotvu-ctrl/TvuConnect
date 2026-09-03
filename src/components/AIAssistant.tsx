import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Bot, Send, Loader2, Zap } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { auth, onAuthStateChanged } from '../firebase';
import { User } from 'firebase/auth';
import { sendMessageToAI, ChatMessage } from '../utils/geminiAI';
import { findCachedResponse, shouldUseCache } from '../utils/aiCache';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const QUICK_REPLIES = [
  { text: "☕ Tìm quán cafe", instant: true },
  { text: "📖 Hướng dẫn sử dụng", instant: true },
  { text: "🎨 Người sáng lập TVU Connect là ai?", instant: true },
  { text: "📚 Câu chuyện hình thành", instant: true }
];

// Rate limiting: Progressive - Linh hoạt hơn
const MAX_MESSAGES_PER_MINUTE = 10; // Tăng lên 10 cho normal users
const HEAVY_USER_THRESHOLD = 20; // Sau 20 tin trong 5 phút
const HEAVY_USER_LIMIT = 5; // Giảm xuống 5 tin/phút
const RATE_LIMIT_WARNING_THRESHOLD = 3;

export const AIAssistant: React.FC = () => {
  const { theme } = useTheme();
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Đang suy nghĩ...');
  const [messageTimestamps, setMessageTimestamps] = useState<number[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Force scroll to top when component mounts - AGGRESSIVE
  useEffect(() => {
    // Immediate scroll reset
    const scrollToTop = () => {
      window.scrollTo({ top: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
      }
    };
    
    // Execute immediately
    scrollToTop();
    
    // Multiple delayed attempts to ensure it works
    const timers = [
      setTimeout(scrollToTop, 0),
      setTimeout(scrollToTop, 50),
      setTimeout(scrollToTop, 100),
      setTimeout(scrollToTop, 200),
    ];
    
    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, []);

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Auto scroll to bottom ONLY when AI responds (not when user sends)
  useEffect(() => {
    // Only scroll if the last message is from assistant
    if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Helper function to render markdown images
  const renderMessageContent = (content: string) => {
    // Regex to match markdown images: ![alt](url)
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const parts: (string | React.ReactElement)[] = [];
    let lastIndex = 0;
    let match;

    while ((match = imageRegex.exec(content)) !== null) {
      // Add text before image
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }

      // Add image
      const alt = match[1];
      const url = match[2];
      parts.push(
        <img
          key={match.index}
          src={url}
          alt={alt}
          className="max-w-full rounded-lg my-2"
          style={{ maxHeight: '300px', objectFit: 'cover' }}
          onError={(e) => {
            // Fallback if image fails to load
            e.currentTarget.style.display = 'none';
            console.error('Failed to load image:', url);
          }}
        />
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return parts.length > 0 ? parts : content;
  };

  // Convert messages to Gemini format
  const getGeminiHistory = (): ChatMessage[] => {
    return messages
      .filter(m => m.role !== 'assistant' || m.id !== '1') // Skip welcome message
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));
  };

  // Memoize sorted and filtered messages for rendering
  // Validates: Requirements 3.4
  const displayMessages = useMemo(() => {
    return messages.filter(m => !m.content.includes('[DELETED]'));
  }, [messages]);

  // Kiểm tra rate limit - Progressive
  const checkRateLimit = (): { allowed: boolean; remaining: number; isHeavyUser: boolean } => {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const fiveMinutesAgo = now - 300000;
    
    // Kiểm tra heavy user (20 tin trong 5 phút)
    const recentFiveMin = messageTimestamps.filter(t => t > fiveMinutesAgo);
    const isHeavyUser = recentFiveMin.length >= HEAVY_USER_THRESHOLD;
    
    // Lọc các timestamps trong 1 phút gần đây
    const recentMessages = messageTimestamps.filter(t => t > oneMinuteAgo);
    const limit = isHeavyUser ? HEAVY_USER_LIMIT : MAX_MESSAGES_PER_MINUTE;
    const remaining = limit - recentMessages.length;
    
    return {
      allowed: recentMessages.length < limit,
      remaining: remaining,
      isHeavyUser: isHeavyUser
    };
  };

  const handleSendMessage = async (text: string, isInstant: boolean = false) => {
    if (!text.trim() || isLoading) return;

    // Kiểm tra cache trước (nếu không phải instant reply)
    if (!isInstant && shouldUseCache(text)) {
      const cachedResponse = findCachedResponse(text);
      if (cachedResponse) {
        // Cache hit! Không cần gọi API
        const userMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content: text.trim(),
          timestamp: new Date()
        };

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: cachedResponse,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage, assistantMessage]);
        setInputText('');
        
        // Hiển thị toast nhẹ
        toast.success('⚡ Trả lời tức thì!', { duration: 1500 });
        return;
      }
    }

    // Kiểm tra rate limit (chỉ cho API calls)
    const { allowed, remaining, isHeavyUser } = checkRateLimit();
    
    if (!allowed) {
      const message = isHeavyUser 
        ? '⏱️ Bạn đã chat rất nhiều! Vui lòng đợi 1 phút để tiếp tục. TVU Buddy cần thời gian để phục vụ tất cả sinh viên nhé! 🦷✨'
        : '⏱️ Bạn đã gửi quá nhiều tin nhắn! Vui lòng đợi 1 phút. 🙏';
      
      toast.error(message, { duration: 5000 });
      return;
    }

    // Cảnh báo khi sắp hết quota
    if (remaining <= RATE_LIMIT_WARNING_THRESHOLD && remaining > 0) {
      const message = isHeavyUser
        ? `⚠️ Bạn đang dùng nhiều! Còn ${remaining} tin nhắn trong phút này.`
        : `💡 Còn ${remaining} tin nhắn trong phút này. Hãy sử dụng có trách nhiệm nhé! 🙏`;
      
      toast.warning(message, { duration: 3000 });
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date()
    };

    // Get history BEFORE adding new message
    const history = getGeminiHistory();
    
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    
    // Check if this is a venue search query
    const isVenueQuery = /quán|cafe|nhà hàng|chỗ|địa điểm|ăn|uống|học/i.test(text.trim());
    if (isVenueQuery && currentUser) {
      setLoadingMessage('Đang tìm quán đúng gu cho bạn...');
    } else {
      setLoadingMessage('Đang suy nghĩ...');
    }
    
    setIsLoading(true);

    // Cập nhật timestamps
    const now = Date.now();
    setMessageTimestamps(prev => {
      const fiveMinutesAgo = now - 300000;
      return [...prev.filter(t => t > fiveMinutesAgo), now];
    });

    try {
      const aiResponse = await sendMessageToAI(text.trim(), history, currentUser?.uid);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('❌ Error in handleSendMessage:', error);
      
      // Hiển thị error message chi tiết hơn
      const errorMessage = error.message || 'Không thể gửi tin nhắn';
      
      // Thêm error message vào chat để user thấy
      const errorChatMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ Xin lỗi, có lỗi xảy ra:\n\n${errorMessage}\n\nVui lòng thử lại sau! 🙏`,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorChatMessage]);
      
      // Toast notification
      toast.error(`Lỗi: ${errorMessage.substring(0, 100)}`, { duration: 5000 });
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleQuickReply = (reply: { text: string; instant?: boolean }) => {
    handleSendMessage(reply.text, reply.instant || false);
  };

  return (
    <div 
      className="flex flex-col overflow-hidden"
      style={{ 
        height: '100%',
        maxHeight: '100dvh'
      }}
    >
      {/* Header - Beautiful Gradient Design */}
      <div 
        className="flex-shrink-0 px-4 py-3 border-b flex items-center gap-3 relative overflow-hidden"
        style={{
          background: theme === 'dark' 
            ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.15) 50%, rgba(168, 85, 247, 0.15) 100%)'
            : 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.08) 50%, rgba(168, 85, 247, 0.08) 100%)',
          borderColor: theme === 'dark' ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.2)',
          backdropFilter: 'blur(12px)',
          boxShadow: theme === 'dark' 
            ? '0 4px 12px rgba(99, 102, 241, 0.1)' 
            : '0 2px 8px rgba(99, 102, 241, 0.08)'
        }}
      >
        {/* Animated gradient background */}
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            background: theme === 'dark'
              ? 'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.1), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.05), transparent)',
            animation: 'shimmer 3s infinite',
            backgroundSize: '200% 100%'
          }}
        />
        
        {/* Bot Icon with glow effect */}
        <div 
          className="w-10 h-10 rounded-xl flex items-center justify-center relative z-10 flex-shrink-0"
          style={{
            background: theme === 'dark' 
              ? 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)'
              : 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)',
            boxShadow: theme === 'dark'
              ? '0 4px 16px rgba(139, 92, 246, 0.4), 0 0 20px rgba(139, 92, 246, 0.2)'
              : '0 4px 12px rgba(139, 92, 246, 0.3), 0 0 16px rgba(139, 92, 246, 0.15)'
          }}
        >
          <Bot 
            className="w-5 h-5 text-white drop-shadow-lg"
          />
        </div>
        
        {/* Title with gradient text */}
        <div className="flex-1 min-w-0 relative z-10">
          <h3 
            className="font-bold text-base truncate leading-tight"
            style={{
              background: theme === 'dark'
                ? 'linear-gradient(135deg, #C7D2FE 0%, #DDD6FE 50%, #E9D5FF 100%)'
                : 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}
          >
            TVU Buddy
          </h3>
          <p 
            className="text-xs mt-0.5"
            style={{ 
              color: theme === 'dark' ? 'rgba(199, 210, 254, 0.7)' : 'rgba(99, 102, 241, 0.7)'
            }}
          >
            Trợ lý AI thông minh ✨
          </p>
        </div>
        
        {/* Status indicator */}
        <div className="flex items-center gap-1.5 relative z-10">
          <div 
            className="w-2 h-2 rounded-full animate-pulse"
            style={{
              backgroundColor: '#10B981',
              boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)'
            }}
          />
          <span 
            className="text-xs font-medium"
            style={{ color: theme === 'dark' ? '#6EE7B7' : '#059669' }}
          >
            Online
          </span>
        </div>
      </div>
      
      {/* Add shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      {/* Content Area - Flex column with space-between */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Messages + Welcome - Scrollable top section */}
        <div 
          ref={containerRef}
          className="flex-shrink overflow-y-auto"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(17, 24, 39, 0.3)' : 'rgba(249, 250, 251, 0.5)',
            padding: '12px'
          }}
        >
          <div className="flex flex-col gap-2">
            {displayMessages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] md:max-w-[80%] rounded-2xl px-4 py-3 shadow-md ${
                    message.role === 'user'
                      ? 'bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 text-white rounded-tr-none'
                      : 'rounded-tl-none'
                  }`}
                  style={{
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap',
                    backgroundColor: message.role === 'user' 
                      ? undefined 
                      : theme === 'dark' 
                        ? '#1e1b4b' 
                        : '#ffffff',
                    color: message.role === 'user' 
                      ? undefined 
                      : theme === 'dark' 
                        ? '#f3f4f6' 
                        : '#1f2937',
                    border: message.role === 'user' 
                      ? 'none' 
                      : theme === 'dark' 
                        ? '1px solid rgba(99, 102, 241, 0.2)' 
                        : '1px solid rgba(229, 231, 235, 1)',
                  }}
                >
                  <div className="text-sm leading-relaxed">
                    {renderMessageContent(message.content)}
                  </div>
                  <p 
                    className={`text-xs mt-1 ${
                      message.role === 'user' 
                        ? 'text-indigo-200' 
                        : theme === 'dark' 
                        ? 'text-gray-400' 
                        : 'text-gray-500'
                    }`}
                  >
                    {message.timestamp.toLocaleTimeString('vi-VN', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>
              </div>
            ))}

            {/* Welcome message when no messages */}
            {displayMessages.length === 0 && !isLoading && (
              <div className="flex items-start justify-start">
                <div 
                  className="max-w-[85%] md:max-w-[80%] rounded-xl px-3 py-2"
                  style={{
                    backgroundColor: theme === 'dark' 
                      ? 'rgba(55, 65, 81, 0.8)' 
                      : '#FFFFFF',
                    border: theme === 'light' ? '1px solid rgba(229, 231, 235, 0.8)' : 'none',
                    boxShadow: theme === 'light' ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none'
                  }}
                >
                  <div className="text-sm leading-relaxed" style={{ color: theme === 'dark' ? '#E5E7EB' : '#1F2937' }}>
                    Xin chào! Tớ là TVU Buddy - trợ lý AI của TVU Connect. Tớ có thể giúp bạn:
                    <br />
                    <br />
                    • Tìm quán cafe yên tĩnh
                    <br />
                    • Xem ai đang bận rộn
                    <br />
                    • Gợi ý sự kiện
                    <br />
                    • Tìm người có cùng sở thích
                    <br />
                    <br />
                    Bạn cần giúp gì không? 😊
                  </div>
                  <p 
                    className="text-xs mt-1"
                    style={{ color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}
                  >
                    {new Date().toLocaleTimeString('vi-VN', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div
                  className={`rounded-xl px-3 py-2 flex items-center gap-2 ${
                    theme === 'dark'
                      ? 'bg-gradient-to-br from-gray-700 to-gray-800 text-gray-100'
                      : 'bg-white text-gray-900 shadow-sm'
                  }`}
                  style={{
                    border: theme === 'light' ? '1px solid rgba(229, 231, 235, 0.8)' : 'none'
                  }}
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">{loadingMessage}</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Quick Replies + Input - Fixed bottom section */}
        <div className="flex-shrink-0">
          {/* Quick Replies */}
          {displayMessages.length === 0 && !isLoading && (
            <div 
              className="px-3 py-2 border-t"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                borderColor: theme === 'dark' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(229, 231, 235, 0.8)'
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {QUICK_REPLIES.map((reply, index) => (
                  <button
                    key={index}
                    onClick={() => handleQuickReply(reply)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-opacity-80 text-left"
                    style={{
                      backgroundColor: theme === 'dark' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)',
                      color: theme === 'dark' ? '#C7D2FE' : '#6366F1',
                      border: `1px solid ${theme === 'dark' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)'}`
                    }}
                  >
                    {reply.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div 
            className="p-2 border-t pb-[calc(0.5rem+var(--sab))]"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.98)' : 'rgba(255, 255, 255, 0.98)',
              borderColor: theme === 'dark' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(209, 213, 219, 1)',
              boxShadow: theme === 'dark' 
                ? '0 -2px 10px rgba(0, 0, 0, 0.3)' 
                : '0 -2px 10px rgba(0, 0, 0, 0.05)'
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(inputText);
              }}
              className="flex gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Nhắn tin với TVU Buddy"
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 rounded-xl border-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 text-sm font-medium transition-all placeholder:font-medium"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.9)' : '#FFFFFF',
                  borderColor: theme === 'dark' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(209, 213, 219, 1)',
                  color: theme === 'dark' ? '#E5E7EB' : '#1F2937'
                }}
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isLoading}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white hover:from-indigo-700 hover:to-indigo-800 transition-all flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
