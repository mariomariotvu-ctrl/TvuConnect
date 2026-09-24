import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, Bot, Camera, ExternalLink, Globe2, Loader2, Send, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import {
  sendMessageToAI,
  type ChatMessage,
  type StudentAssistantSource,
} from '../utils/geminiAI';
import { findCachedResponse, shouldUseCache } from '../utils/aiCache';
import {
  extractRecognizedLibraryQueries,
  hasSpecificLibrarySearchTerms,
  isLibrarySearchQuery,
  searchPublicDriveLibrary,
  searchRecognizedDriveLibrary,
  type AILibraryResult,
} from '../utils/aiLibrarySearch';
import { prepareImageForAI, type PreparedAIImage } from '../utils/aiImage';
import { DocumentViewerModal } from './DocumentViewerModal';
import { ImageSourcePicker } from './ImageSourcePicker';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  imagePreview?: string;
  librarySources?: AILibraryResult[];
  librarySearchPending?: boolean;
  webSources?: StudentAssistantSource[];
}

const QUICK_REPLIES = [
  { text: 'Tìm bạn cùng ngành như thế nào?' },
  { text: 'Cách tìm trọ an toàn cho sinh viên' },
  { text: 'Tìm giáo trình Sinh lý học' },
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
  const [loadingLabel, setLoadingLabel] = useState('Đang phân tích câu hỏi…');
  const [messageTimestamps, setMessageTimestamps] = useState<number[]>([]);
  const [selectedImage, setSelectedImage] = useState<PreparedAIImage | null>(null);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [viewerSource, setViewerSource] = useState<StudentAssistantSource | null>(null);

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

  const handleLibrarySearch = async (text: string) => {
    const hasSpecificTerms = hasSpecificLibrarySearchTerms(text);
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((current) => [...current, userMessage]);
    setInputText('');
    if (!hasSpecificTerms) {
      setMessages((current) => [...current, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Bạn cho mình tên môn, ngành hoặc một phần tên sách nhé. Ví dụ: “Tìm giáo trình Sinh lý học” hoặc “Tìm tài liệu kế toán quản trị”.',
        timestamp: new Date(),
      }]);
      return;
    }

    setLoadingLabel('Đang tìm trong Thư viện TVU và nguồn công khai…');
    setIsLoading(true);

    try {
      const history = getGeminiHistory();
      const now = Date.now();
      setMessageTimestamps((current) => [
        ...current.filter((timestamp) => timestamp > now - 300_000),
        now,
      ]);

      const [libraryResult, webResult] = await Promise.allSettled([
        searchPublicDriveLibrary(text),
        sendMessageToAI(text, history, { mode: 'library-search' }),
      ]);
      const librarySources = libraryResult.status === 'fulfilled' ? libraryResult.value : [];
      const webAnswer = webResult.status === 'fulfilled' ? webResult.value.answer : '';
      const webSources = webResult.status === 'fulfilled' ? webResult.value.sources : [];
      if (libraryResult.status === 'rejected') console.warn('TVU library search failed:', libraryResult.reason);
      if (webResult.status === 'rejected') console.warn('Open academic search failed:', webResult.reason);

      const summary = librarySources.length
        ? `Mình tìm thấy ${librarySources.length} tài liệu trong Thư viện TVU. Bạn có thể mở và đọc ngay trong web.`
        : webResult.status === 'fulfilled'
          ? 'Thư viện TVU chưa có file khớp rõ, nên mình đã tìm thêm nguồn học liệu công khai trên Internet.'
          : 'Thư viện TVU chưa có file khớp rõ và nguồn học liệu mở đang tạm bận.';

      setMessages((current) => [...current, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: [summary, webAnswer].filter(Boolean).join('\n\n')
          || 'Mình chưa tìm được nguồn đủ rõ. Bạn thử thêm tên môn, tác giả hoặc một phần tên sách nhé.',
        timestamp: new Date(),
        librarySources,
        webSources,
      }]);
    } catch (error) {
      console.error('Academic material search failed:', error);
      setMessages((current) => [...current, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Nguồn học liệu đang phản hồi chậm. Bạn có thể mở Thư viện TVU để tìm trực tiếp hoặc thử lại sau.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSendMessage = async (text: string) => {
    if ((!text.trim() && !selectedImage) || isLoading || isPreparingImage) return;
    const image = selectedImage;
    const cleanText = text.trim() || 'Đọc chữ trong ảnh, xác định môn học và tìm tài liệu công khai phù hợp để mình đọc tiếp.';

    if (!image && isLibrarySearchQuery(cleanText)) {
      await handleLibrarySearch(cleanText);
      return;
    }

    // Reuse only stable in-app guidance. Study questions always go to the
    // server-side model so the answer is not stale or fabricated locally.
    if (!image && shouldUseCache(cleanText)) {
      const cachedResponse = findCachedResponse(cleanText);
      if (cachedResponse) {
        const userMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content: cleanText,
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
        ? 'Bạn đã chat khá nhiều. Hãy đợi một phút để TVU BuBu phục vụ mọi người tốt hơn.'
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
      content: text.trim() || 'Đọc trang sách này và tìm tài liệu liên quan.',
      timestamp: new Date(),
      imagePreview: image?.previewUrl,
    };

    // Get history BEFORE adding new message
    const history = getGeminiHistory();

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setSelectedImage(null);

    setIsLoading(true);
    setLoadingLabel(image ? 'Đang đọc chữ trong ảnh và đối chiếu học liệu…' : 'Đang phân tích câu hỏi…');

    // Cập nhật timestamps
    const now = Date.now();
    setMessageTimestamps(prev => {
      const fiveMinutesAgo = now - 300000;
      return [...prev.filter(t => t > fiveMinutesAgo), now];
    });

    try {
      const aiResponse = await sendMessageToAI(cleanText, history, {
        mode: image
          ? (isLibrarySearchQuery(cleanText) ? 'library-search' : 'image-study')
          : 'normal',
        image: image ? { data: image.data, mimeType: image.mimeType } : undefined,
      });

      const assistantId = (Date.now() + 1).toString();
      const recognizedLibraryQueries = image
        ? extractRecognizedLibraryQueries(cleanText, aiResponse.answer)
        : [];
      const assistantMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: aiResponse.answer,
        timestamp: new Date(),
        librarySearchPending: recognizedLibraryQueries.length > 0,
        webSources: aiResponse.sources,
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (recognizedLibraryQueries.length > 0) {
        const updateLibraryMatches = (librarySources: AILibraryResult[], pending: boolean) => {
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, librarySources, librarySearchPending: pending }
              : message
          )));
        };

        void searchRecognizedDriveLibrary(cleanText, aiResponse.answer, (librarySources) => {
          updateLibraryMatches(librarySources, false);
        }).then((librarySources) => {
          updateLibraryMatches(librarySources, false);
        }).catch((error) => {
          console.warn('Could not match recognized books in TVU Drive:', error);
          updateLibraryMatches([], false);
        });
      }
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

  const handleImageSelected = async (files: File[]) => {
    const file = files[0];
    if (!file || isLoading) return;

    setIsPreparingImage(true);
    try {
      const prepared = await prepareImageForAI(file);
      setSelectedImage(prepared);
      toast.success('Đã thêm ảnh. Bạn có thể nhập yêu cầu hoặc gửi để BuBu tự đọc và tìm tài liệu.');
      inputRef.current?.focus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể xử lý ảnh này.');
    } finally {
      setIsPreparingImage(false);
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
          <h3 className="font-bold text-base truncate leading-tight text-slate-950 dark:text-white">TVU BuBu</h3>
          <p className="text-xs mt-0.5 text-slate-500 dark:text-slate-400">Trợ lý học tập và hướng dẫn sử dụng</p>
        </div>
        <a href="/library" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-indigo-50 px-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-200" title="Mở Thư viện học liệu">
          <BookOpen className="h-4 w-4" />
          <span className="hidden sm:inline">Thư viện</span>
        </a>
        <span className="hidden items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 sm:inline-flex">
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
                  className={`max-w-[85%] md:max-w-[80%] rounded-2xl px-4 py-3 shadow-md ${message.role === 'user'
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
                  {message.imagePreview && (
                    <img
                      src={message.imagePreview}
                      alt="Trang sách đã gửi cho TVU BuBu"
                      className="mb-2 max-h-56 w-full rounded-xl object-contain bg-black/10"
                    />
                  )}
                  <div className="text-sm leading-relaxed">
                    {message.content}
                  </div>
                  {message.librarySources && message.librarySources.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-[11px] font-extrabold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Trong Thư viện TVU</p>
                      {message.librarySources.map((source) => (
                        <div
                          key={source.id}
                          className="flex min-h-14 items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/80 p-2.5 text-left text-slate-900 transition hover:border-indigo-300 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-white dark:hover:border-indigo-700"
                        >
                          <button
                            type="button"
                            onClick={() => setViewerSource({ title: source.title, url: source.url })}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-300">
                              <BookOpen className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 text-xs font-bold leading-snug">{source.title}</span>
                              <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">
                                {source.folderPath.length ? source.folderPath.join(' / ') : source.category} · Đọc trong TVU Connect
                              </span>
                            </span>
                          </button>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Mở link Drive gốc: ${source.title}`}
                            title="Mở link Drive gốc"
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-indigo-600 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                  {message.librarySearchPending && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-xs font-semibold text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Đang đối chiếu tên sách với thư mục Drive TVU…
                    </div>
                  )}
                  {message.webSources && message.webSources.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Nguồn công khai trên web</p>
                      {message.webSources.map((source) => (
                        <div
                          key={source.url}
                          className="flex min-h-14 items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/80 p-2.5 text-slate-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-white"
                        >
                          <button
                            type="button"
                            onClick={() => setViewerSource(source)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-300">
                              <Globe2 className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 text-xs font-bold leading-snug">{source.title}</span>
                              <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">Đọc trong TVU Connect</span>
                            </span>
                          </button>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Mở nguồn gốc: ${source.title}`}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                  <p
                    className={`text-xs mt-1 ${message.role === 'user'
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
                    Xin chào! Tớ là TVU BuBu, trợ lý học tập của TVU Connect. Tớ có thể giúp bạn:
                    <br />
                    <br />
                    • Lập kế hoạch ôn tập và giải thích kiến thức
                    <br />
                    • Tìm bạn cùng ngành, tìm trọ và dùng cuộc gọi
                    <br />
                    • Tìm tài liệu, sách và giáo trình hợp pháp
                    <br />
                    • Chụp trang sách để đọc chữ và tìm học liệu liên quan
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
                  className={`rounded-xl px-3 py-2 flex items-center gap-2 ${theme === 'dark'
                      ? 'bg-gradient-to-br from-gray-700 to-gray-800 text-gray-100'
                      : 'bg-white text-gray-900 shadow-sm'
                    }`}
                  style={{
                    border: theme === 'light' ? '1px solid rgba(229, 231, 235, 0.8)' : 'none'
                  }}
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">{loadingLabel}</span>
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
            {selectedImage && (
              <div className="mb-2 flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-2 dark:border-indigo-800/60 dark:bg-indigo-950/30">
                <img src={selectedImage.previewUrl} alt="Ảnh chờ TVU BuBu đọc" className="h-14 w-14 rounded-lg bg-white object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{selectedImage.name}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-600 dark:text-slate-300">BuBu sẽ đọc chữ, nhận diện môn và tìm tài liệu liên quan.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white dark:hover:bg-slate-900"
                  aria-label="Bỏ ảnh đã chọn"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(inputText);
              }}
              className="flex gap-2"
            >
              <ImageSourcePicker
                title="Quét trang sách hoặc đề bài"
                disabled={isLoading || isPreparingImage}
                onFilesSelected={handleImageSelected}
              >
                {(openPicker) => (
                  <button
                    type="button"
                    onClick={openPicker}
                    disabled={isLoading || isPreparingImage}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-indigo-100 bg-indigo-50 text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300"
                    aria-label="Chụp hoặc chọn ảnh trang sách"
                    title="Chụp hoặc chọn ảnh trang sách"
                  >
                    {isPreparingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                  </button>
                )}
              </ImageSourcePicker>
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={selectedImage ? 'Nhập yêu cầu hoặc gửi để tự đọc ảnh…' : 'Hỏi bài hoặc tìm sách, giáo trình…'}
                disabled={isLoading || isPreparingImage}
                className="flex-1 px-4 py-2.5 rounded-xl border-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 text-sm font-medium transition-all placeholder:font-medium"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.9)' : '#FFFFFF',
                  borderColor: theme === 'dark' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(209, 213, 219, 1)',
                  color: theme === 'dark' ? '#E5E7EB' : '#1F2937'
                }}
              />
              <button
                type="submit"
                disabled={(!inputText.trim() && !selectedImage) || isLoading || isPreparingImage}
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
      {viewerSource && (
        <DocumentViewerModal
          open
          title={viewerSource.title}
          url={viewerSource.url}
          onClose={() => setViewerSource(null)}
        />
      )}
    </div>
  );
};
