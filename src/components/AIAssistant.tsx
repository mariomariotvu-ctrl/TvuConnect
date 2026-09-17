import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
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
  { text: 'Tìm bạn cùng ngành như thế nào?' },
  { text: 'Cách tìm trọ an toàn cho sinh viên' },
  { text: 'Tìm sách và giáo trình theo ngành' },
  { text: 'Lập kế hoạch ôn thi trong 7 ngày' },
];

// Rate limiting: Progressive - Linh hoạt hơn
const MAX_MESSAGES_PER_MINUTE = 10; // Tăng lên 10 cho normal users
const HEAVY_USER_THRESHOLD = 20; // Sau 20 tin trong 5 phút
const HEAVY_USER_LIMIT = 5; // Giảm xuống 5 tin/phút
const RATE_LIMIT_WARNING_THRESHOLD = 3;

export const AIAssistant: React.FC = () => {
  const { theme } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messageTimestamps, setMessageTimestamps] = useState<number[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0 });
  }, []);

  // Auto scroll to bottom ONLY when AI responds (not when user sends)
  useEffect(() => {
    // Only scroll if the last message is from assistant
    if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Convert the visible conversation into the compact server-side format.
  const getGeminiHistory = (): ChatMessage[] => {
    return messages
      .filter(m => m.role !== 'assistant' || m.id !== '1') // Skip welcome message
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));
  };

  const displayMessages = messages;

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

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    // Reuse only stable in-app guidance. Study questions always go to the
    // server-side model so the answer is not stale or fabricated locally.
    if (shouldUseCache(text)) {
      const cachedResponse = findCachedResponse(text);
      if (cachedResponse) {
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
        
        return;
      }
    }

    // Kiểm tra rate limit (chỉ cho API calls)
    const { allowed, remaining, isHeavyUser } = checkRateLimit();
    
    if (!allowed) {
      const message = isHeavyUser 
        ? 'Bạn đã chat khá nhiều. Hãy đợi một phút để TVU Buddy phục vụ mọi người tốt hơn.'
        : 'Bạn đã gửi quá nhiều tin nhắn. Vui lòng đợi một phút.';
      
      toast.error(message, { duration: 5000 });
      return;
    }

    // Cảnh báo khi sắp hết quota
    if (remaining <= RATE_LIMIT_WARNING_THRESHOLD && remaining > 0) {
      const message = isHeavyUser
        ? `Bạn đang dùng nhiều. Còn ${remaining} tin nhắn trong phút này.`
        : `Còn ${remaining} tin nhắn trong phút này.`;
      
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
    
    setIsLoading(true);

    // Cập nhật timestamps
    const now = Date.now();
    setMessageTimestamps(prev => {
      const fiveMinutesAgo = now - 300000;
      return [...prev.filter(t => t > fiveMinutesAgo), now];
    });

    try {
      const aiResponse = await sendMessageToAI(text.trim(), history);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Error in handleSendMessage:', error);
      
      // Hiển thị error message chi tiết hơn
      const errorMessage = error.message || 'Không thể gửi tin nhắn';
      
      // Thêm error message vào chat để user thấy
      const errorChatMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Xin lỗi, có lỗi xảy ra:\n\n${errorMessage}\n\nVui lòng thử lại sau.`,
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

  const handleQuickReply = (reply: { text: string }) => {
    handleSendMessage(reply.text);
  };

  return (
    <div 
      className="flex flex-col overflow-hidden"
      style={{ 
        height: '100%',
        maxHeight: '100dvh'
      }}
    >
      <header className="flex-shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 bg-white dark:bg-slate-900">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-indigo-600 text-white dark:bg-indigo-500">
          <Bot className="w-5 h-5" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base truncate leading-tight text-slate-950 dark:text-white">TVU Buddy</h3>
          <p className="text-xs mt-0.5 text-slate-500 dark:text-slate-400">Trợ lý học tập và hướng dẫn sử dụng</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Sẵn sàng
        </span>
      </header>

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
                      ? 'bg-indigo-600 text-white rounded-tr-md dark:bg-indigo-500'
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
                    {message.content}
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
                    Xin chào! Tớ là TVU Buddy, trợ lý học tập của TVU Connect. Tớ có thể giúp bạn:
                    <br />
                    <br />
                    • Lập kế hoạch ôn tập và giải thích kiến thức
                    <br />
                    • Tìm bạn cùng ngành, tìm trọ và dùng cuộc gọi
                    <br />
                    • Tìm tài liệu, sách và giáo trình hợp pháp
                    <br />
                    • Hướng dẫn dùng các tính năng trong ứng dụng
                    <br />
                    <br />
                    Đừng gửi mật khẩu, mã OTP, MSSV hoặc địa chỉ chính xác. Bạn cần mình hỗ trợ việc gì?
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
                  <span className="text-sm">Đang chuẩn bị câu trả lời…</span>
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
                className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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
