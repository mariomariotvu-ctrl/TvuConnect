import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import { db, auth, collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc, handleFirestoreError, OperationType, storage, ref, uploadBytes, getDownloadURL, uploadBytesResumable, limit, getDocs, deleteDoc } from '../firebase';
import { Message, StudentProfile, Conversation } from '../types';
import { Send, User, ArrowLeft, Loader2, Phone, Mail, GraduationCap, Info, X, Mic, Square, Play, Pause, Trash2, ShieldOff, Smile, Check, CheckCheck, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ProfileCard } from './ProfileCard';
import { ConfirmModal } from './ConfirmModal';
import { FIRESTORE_LIMITS, TIMING, VALIDATION } from '../utils/constants';
import { RateLimiter, validateMessage, validateAudioSize, sanitizeInput, shouldBlockMessage, moderateContent, logViolation } from '../utils/security';
import { MessageSkeleton } from './SkeletonLoader';
import { toast } from 'sonner';
import { a11yProps, handleKeyboardClick } from '../utils/accessibility';
import { retryOperation, isOnline } from '../utils/network';
import { OnlineStatus } from './OnlineStatus';
import { useCachedMessages } from '../hooks/useCachedMessages';
import { logger } from '../utils/logger';
import { listenerRegistry } from '../utils/listenerRegistry';

import { useTheme } from '../contexts/ThemeContext';

interface ChatProps {
  receiverUid: string;
  onBack: () => void;
}

export const Chat: React.FC<ChatProps> = ({ receiverUid, onBack }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  // Generate conversation ID
  const conversationId = auth.currentUser 
    ? [auth.currentUser.uid, receiverUid].sort().join('_')
    : '';

  // Use cached messages hook with single active listener
  const { 
    messages: firestoreMessages, 
    loading, 
    error: messagesError, 
    fromCache,
    hasMore,
    loadMore,
    refresh: refreshMessages 
  } = useCachedMessages(conversationId, receiverUid);

  // Optimistic messages: shown immediately before Firestore confirms
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);

  // Merge: real messages first, then any optimistic ones not yet confirmed
  const messages = useMemo(() => {
    if (optimisticMessages.length === 0) return firestoreMessages;
    // Dùng optimistic ID để track thay vì text — tránh collision khi gửi 2 tin giống nhau
    // Firestore messages có id thật (không bắt đầu bằng 'optimistic_')
    // Optimistic message được confirm khi Firestore có tin nhắn cùng text VÀ timestamp gần nhau
    const firestoreIds = new Set(firestoreMessages.map(m => m.id));
    const pending = optimisticMessages.filter(m => {
      // Nếu đã có trong Firestore (theo id) → loại bỏ
      if (m.id && firestoreIds.has(m.id)) return false;
      // Kiểm tra theo timestamp để tránh hiển thị trùng khi Firestore confirm
      // Tin được confirm khi có tin nhắn Firestore cùng senderUid + text + timestamp gần nhau (±3s)
      const optimisticTime = m.createdAt?.toMillis?.() || (typeof m.createdAt === 'number' ? m.createdAt : 0);
      const isConfirmed = firestoreMessages.some(fm => {
        if (fm.senderUid !== m.senderUid) return false;
        if ((fm.text || fm.audioUrl || '') !== (m.text || m.audioUrl || '')) return false;
        const fmTime = fm.createdAt?.toMillis?.() || (typeof fm.createdAt === 'number' ? fm.createdAt : 0);
        return Math.abs(fmTime - optimisticTime) < 5000; // trong vòng 5 giây
      });
      return !isConfirmed;
    });
    return [...firestoreMessages, ...pending];
  }, [firestoreMessages, optimisticMessages]);

  const [newMessage, setNewMessage] = useState('');
  const [receiverProfile, setReceiverProfile] = useState<StudentProfile | null>(null);
  const [sending, setSending] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [isBlockedByThem, setIsBlockedByThem] = useState(false);
  const [isConfirmBlockOpen, setIsConfirmBlockOpen] = useState(false);
  const [isConfirmUnblockOpen, setIsConfirmUnblockOpen] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [receiverIsTyping, setReceiverIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const isCancelledRef = useRef(false);
  const isMountedRef = useRef(true); // Track mounted state để tránh setState sau unmount
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingUpdateRef = useRef<number>(0);
  
  // Rate limiter for messages
  const messageLimiter = useRef(new RateLimiter(10, 60000)); // 10 messages per minute

  // Bug 1.17/2.18 — Scroll anchor refs để khôi phục vị trí scroll sau loadMore
  // Bug_Condition: loadMoreTriggered = true AND newScrollTop < previousScrollTop
  // Expected_Behavior: newScrollTop = prevScrollTop + heightDiff sau mọi loadMore trigger
  const prevScrollHeightRef = useRef(0);
  const prevScrollTopRef = useRef(0);

  // Popular emojis for quick access
  const emojis = ['😊', '😂', '❤️', '👍', '🎉', '😍', '🔥', '✨', '💯', '🙏', '😭', '😎', '🤔', '👏', '💪', '🎊', '🌟', '💖', '😘', '🥰', '😢', '😅', '🤗', '😇'];

  const handleEmojiClick = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const isBlockedByMeRef = useRef(isBlockedByMe);
  const isBlockedByThemRef = useRef(isBlockedByThem);

  useEffect(() => {
    isBlockedByMeRef.current = isBlockedByMe;
  }, [isBlockedByMe]);

  useEffect(() => {
    isBlockedByThemRef.current = isBlockedByThem;
  }, [isBlockedByThem]);

  useEffect(() => {
    if (!auth.currentUser) return;

    // 1. Receiver profile listener
    const listenerIdReceiver = listenerRegistry.register({
      componentName: 'Chat',
      collection: 'profiles',
      query: `profiles/${receiverUid}`,
      priority: 8,
      conversationId: conversationId,
      unsubscribe: onSnapshot(doc(db, 'profiles', receiverUid), (docSnap) => {
        if (docSnap.exists()) {
          setReceiverProfile(docSnap.data() as StudentProfile);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `profiles/${receiverUid}`, true);
      })
    });

    // 2. Realtime block status listeners (cả 2 chiều)
    // Bug fix: thay one-time getDoc bằng onSnapshot để cập nhật realtime
    // khi block document thay đổi sau khi Chat đã mount
    const myBlockRef = doc(db, 'blocks', `${auth.currentUser.uid}_${receiverUid}`);
    const listenerIdMyBlock = listenerRegistry.register({
      componentName: 'Chat',
      collection: 'blocks',
      query: `blocks/${auth.currentUser.uid}_${receiverUid}`,
      priority: 9,
      conversationId: conversationId,
      unsubscribe: onSnapshot(myBlockRef, (snap) => {
        setIsBlockedByMe(snap.exists());
      }, (error: any) => {
        logger.log('Could not listen to my block status:', error?.code);
        setIsBlockedByMe(false);
      })
    });

    const theirBlockRef = doc(db, 'blocks', `${receiverUid}_${auth.currentUser.uid}`);
    const listenerIdTheirBlock = listenerRegistry.register({
      componentName: 'Chat',
      collection: 'blocks',
      query: `blocks/${receiverUid}_${auth.currentUser.uid}`,
      priority: 9,
      conversationId: conversationId,
      unsubscribe: onSnapshot(theirBlockRef, (snap) => {
        setIsBlockedByThem(snap.exists());
      }, (error: any) => {
        logger.log('Could not listen to their block status:', error?.code);
        setIsBlockedByThem(false);
      })
    });

    // 3. Typing status listener
    const typingRef = doc(db, 'typing', conversationId);
    const listenerIdTyping = listenerRegistry.register({
      componentName: 'Chat',
      collection: 'typing',
      query: `typing/${conversationId}`,
      priority: 6,
      conversationId: conversationId,
      unsubscribe: onSnapshot(typingRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const typingUserId = data?.userId;
          const timestamp = data?.timestamp?.toMillis?.() || 0;
          const now = Date.now();
          
          if (typingUserId === receiverUid && (now - timestamp) < 10000) {
            setReceiverIsTyping(true);
          } else {
            setReceiverIsTyping(false);
          }
        } else {
          setReceiverIsTyping(false);
        }
      }, (error) => {
        logger.log('Could not listen to typing status:', error?.code);
      })
    });

    // Note: Messages listener is now handled by useCachedMessages hook
    // This ensures single active listener per conversation with auto-cleanup

    return () => {
      listenerRegistry.unregister(listenerIdReceiver);
      listenerRegistry.unregister(listenerIdMyBlock);
      listenerRegistry.unregister(listenerIdTheirBlock);
      listenerRegistry.unregister(listenerIdTyping);
    };
  }, [receiverUid, conversationId]); // Dependencies: receiverUid and conversationId

  // Mark messages as read when they arrive — batch only unread messages, avoid re-running on every render
  const lastReadCountRef = useRef(0);
  useEffect(() => {
    if (!auth.currentUser || messages.length === 0) return;

    const unreadMsgs = messages.filter(
      msg => msg.receiverUid === auth.currentUser?.uid && msg.read === false && msg.id && !msg.id.startsWith('optimistic_')
    );

    // Skip if no new unread messages since last run
    if (unreadMsgs.length === 0 || unreadMsgs.length === lastReadCountRef.current) return;
    lastReadCountRef.current = unreadMsgs.length;

    // Batch all updateDoc calls — fire and forget, don't block UI
    Promise.allSettled(
      unreadMsgs.map(msg => updateDoc(doc(db, 'messages', msg.id!), { read: true }))
    ).catch(() => {/* ignore read receipt errors */});
  }, [messages]);

  // Auto-scroll to bottom only when new messages arrive (not when deleting)
  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    const currentCount = messages.length;
    const prevCount = prevMessageCountRef.current;
    
    // Only scroll if message count increased (new message) or typing indicator changed
    if (scrollRef.current && (currentCount > prevCount || receiverIsTyping)) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    
    // Update previous count
    prevMessageCountRef.current = currentCount;
  }, [messages, receiverIsTyping]);

  useEffect(() => {
    // Đánh dấu component đã mounted
    isMountedRef.current = true;
    logger.log('[Chat] Component mounted');

    return () => {
      // Đánh dấu component đã unmount để tránh setState sau unmount
      isMountedRef.current = false;
      logger.log('[Chat] Component unmounted — isMountedRef set to false');

      // Cleanup all timers and refs
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (typingDebounceRef.current) {
        clearTimeout(typingDebounceRef.current);
        typingDebounceRef.current = null;
      }
      
      // Stop media recorder if active
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          logger.log('Error stopping media recorder:', e);
        }
        mediaRecorderRef.current = null;
      }
      
      // Clear audio chunks
      audioChunksRef.current = [];
      
      // Clear typing status when leaving chat
      if (auth.currentUser) {
        const conversationId = [auth.currentUser.uid, receiverUid].sort().join('_');
        const typingRef = doc(db, 'typing', conversationId);
        setDoc(typingRef, { userId: null, timestamp: serverTimestamp() }).catch((error) => {
          logger.error('Error clearing typing status:', error);
        });
      }
    };
  }, [receiverUid]);

  const handleTyping = async () => {
    if (!auth.currentUser || isBlockedByMe || isBlockedByThem) return;

    const conversationId = [auth.currentUser.uid, receiverUid].sort().join('_');
    const typingRef = doc(db, 'typing', conversationId);
    const now = Date.now();

    // Debounce: Only update Firestore every 2 seconds
    if (now - lastTypingUpdateRef.current < 2000) {
      // Clear previous debounce timeout
      if (typingDebounceRef.current) {
        clearTimeout(typingDebounceRef.current);
      }
      
      // Set new debounce timeout
      typingDebounceRef.current = setTimeout(() => {
        handleTyping();
      }, 500);
      return;
    }

    lastTypingUpdateRef.current = now;

    try {
      // Set typing status
      await setDoc(typingRef, {
        userId: auth.currentUser.uid,
        timestamp: serverTimestamp()
      });

      // Clear previous timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Auto-clear typing status after 10 seconds of inactivity
      typingTimeoutRef.current = setTimeout(async () => {
        try {
          await setDoc(typingRef, {
            userId: null,
            timestamp: serverTimestamp()
          });
        } catch (error) {
          // Ignore errors
        }
      }, 10000);
    } catch (error) {
      // Ignore typing errors
    }
  };

  // Clean up optimistic messages once Firestore listener confirms them
  useEffect(() => {
    if (optimisticMessages.length === 0) return;
    const firestoreIds = new Set(firestoreMessages.map(m => m.id));
    const stillPending = optimisticMessages.filter(m => {
      if (m.id && firestoreIds.has(m.id)) return false;
      // Kiểm tra theo timestamp để confirm — cùng logic với useMemo ở trên
      const optimisticTime = m.createdAt?.toMillis?.() || (typeof m.createdAt === 'number' ? m.createdAt : 0);
      const isConfirmed = firestoreMessages.some(fm => {
        if (fm.senderUid !== m.senderUid) return false;
        if ((fm.text || fm.audioUrl || '') !== (m.text || m.audioUrl || '')) return false;
        const fmTime = fm.createdAt?.toMillis?.() || (typeof fm.createdAt === 'number' ? fm.createdAt : 0);
        return Math.abs(fmTime - optimisticTime) < 5000;
      });
      return !isConfirmed;
    });
    if (stillPending.length !== optimisticMessages.length) {
      setOptimisticMessages(stillPending);
    }
  }, [firestoreMessages]);

  // Track local message count to avoid repeated Firestore count queries
  const localMessageCountRef = useRef<number>(0);

  // Keep localMessageCountRef in sync with actual messages list
  useEffect(() => {
    localMessageCountRef.current = messages.length;
  }, [messages.length]);

  // Bug 1.7 — VisualViewport: App.tsx đã đăng ký listener toàn cục cho --visual-viewport-height
  // Chat chỉ cần trigger update 1 lần khi mount để đảm bảo giá trị đúng ngay lập tức
  // Không đăng ký listener mới để tránh double update gây jank trên iOS Safari
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // Trigger update ngay để Chat container tính đúng chiều cao khi mount
    document.documentElement.style.setProperty('--visual-viewport-height', `${vv.height}px`);
  }, []);

  // Bug 1.7 — Scroll-into-view khi input được focus (đợi keyboard iOS animate xong)
  useEffect(() => {
    const inputEl = document.querySelector<HTMLElement>('[data-chat-input]');
    if (!inputEl) return;

    const handleFocus = () => {
      setTimeout(() => {
        inputEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 350);
    };

    inputEl.addEventListener('focus', handleFocus);
    return () => inputEl.removeEventListener('focus', handleFocus);
  }, []);

  // Bug 2.18 — handleLoadMore: lưu scrollHeight và scrollTop trước khi tải thêm
  // Để useEffect bên dưới có thể khôi phục đúng vị trí sau khi tin nhắn cũ được thêm vào DOM
  const handleLoadMore = () => {
    if (scrollRef.current) {
      prevScrollHeightRef.current = scrollRef.current.scrollHeight;
      prevScrollTopRef.current = scrollRef.current.scrollTop;
    }
    loadMore();
  };

  // Bug 2.18 — Khôi phục scroll position sau khi firestoreMessages tăng (loadMore thành công)
  // Expected_Behavior: newScrollTop = prevScrollTop + heightDiff sau mọi loadMore trigger
  useEffect(() => {
    if (prevScrollHeightRef.current === 0) return;
    if (!scrollRef.current) return;

    const newScrollHeight = scrollRef.current.scrollHeight;
    const heightDiff = newScrollHeight - prevScrollHeightRef.current;

    if (heightDiff > 0) {
      scrollRef.current.scrollTop = prevScrollTopRef.current + heightDiff;
      prevScrollHeightRef.current = 0; // reset để không áp dụng lại
    }
  }, [firestoreMessages.length]);

  const handleSendMessage = async (
    e?: React.FormEvent, 
    audioData?: string
  ) => {
    if (e) e.preventDefault();
    if (!audioData && !newMessage.trim()) return;
    if (!auth.currentUser || sending) return;

    // Check if blocked before attempting to send
    if (isBlockedByMe) {
      toast.error('Bạn đã chặn người dùng này. Vui lòng bỏ chặn để gửi tin nhắn.');
      return;
    }
    
    if (isBlockedByThem) {
      toast.error('Bạn đã bị chặn bởi người dùng này.');
      return;
    }

    // Rate limiting
    const canSend = messageLimiter.current.canProceed(auth.currentUser.uid);
    if (!canSend.allowed) {
      toast.error(`Vui lòng đợi ${canSend.retryAfter} giây trước khi gửi tin nhắn tiếp`);
      return;
    }

    // Validate text message
    let sanitizedText = '';
    if (!audioData) {
      sanitizedText = sanitizeInput(newMessage);
      if (sanitizedText.length === 0) {
        toast.error('Tin nhắn không được để trống');
        return;
      }
      const validation = validateMessage(sanitizedText);
      if (!validation.valid) {
        toast.error(validation.error || 'Tin nhắn không hợp lệ');
        return;
      }
    }

    // Validate audio size
    if (audioData) {
      const validation = validateAudioSize(audioData);
      if (!validation.valid) {
        toast.error(validation.error || 'File âm thanh quá lớn');
        return;
      }
    }

    // Check message count limit using local count — avoids a blocking Firestore round-trip
    if (localMessageCountRef.current >= FIRESTORE_LIMITS.MAX_MESSAGES_PER_CHAT) {
      toast.error('Cuộc trò chuyện đã đạt giới hạn 100 tin nhắn');
      return;
    }

    setSending(true);
    logger.log('[Chat] setSending(true) — bắt đầu gửi tin nhắn', { audioData: !!audioData });

    // ── OPTIMISTIC UI ────────────────────────────────────────────────────────
    // Show message instantly BEFORE content moderation (rollback if blocked)
    const optimisticId = `optimistic_${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      senderUid: auth.currentUser.uid,
      receiverUid,
      participants: [auth.currentUser.uid, receiverUid],
      conversationId,
      type: audioData ? 'audio' : 'text',
      createdAt: { toMillis: () => Date.now(), toDate: () => new Date() } as any,
      read: false,
      ...(audioData ? { audioUrl: audioData } : { text: sanitizedText }),
    };

    // Inject optimistic message and clear input immediately (instant feedback)
    setOptimisticMessages(prev => [...prev, optimisticMsg]);
    if (!audioData) setNewMessage('');

    // Content moderation check (after optimistic inject — rollback if blocked)
    if (!audioData) {
      const moderationCheck = shouldBlockMessage(sanitizedText);
      if (moderationCheck.blocked) {
        // Rollback optimistic message
        setOptimisticMessages(prev => prev.filter(m => m.id !== optimisticId));
        setNewMessage(sanitizedText);
        toast.error(moderationCheck.reason || 'Tin nhắn chứa nội dung vi phạm');
        const moderationResult = moderateContent(sanitizedText);
        logViolation(auth.currentUser.uid, sanitizedText, moderationResult);
        setSending(false);
        return;
      }
    }

    // Fire-and-forget: clear typing status (non-blocking)
    const typingRef = doc(db, 'typing', conversationId);
    setDoc(typingRef, { userId: null, timestamp: serverTimestamp() }).catch(() => {});

    // ── FIRESTORE WRITE ──────────────────────────────────────────────────────
    try {
      const msgData: any = {
        senderUid: auth.currentUser.uid,
        receiverUid,
        participants: [auth.currentUser.uid, receiverUid],
        conversationId,
        type: audioData ? 'audio' : 'text',
        createdAt: serverTimestamp(),
        read: false,
      };

      if (audioData) {
        msgData.audioUrl = audioData;
      } else {
        msgData.text = sanitizedText;
      }

      // Write message to Firestore — this is the only critical await
      await addDoc(collection(db, 'messages'), msgData);
      logger.log('[Chat] addDoc thành công — tin nhắn đã được gửi');

      // ── FIRE-AND-FORGET: update conversation doc ─────────────────────────
      // Non-blocking — uses setDoc with merge:true to avoid getDoc round-trip
      const lastMsgText = audioData ? '[Tin nhắn thoại]' : sanitizedText;
      const convRef = doc(db, 'conversations', conversationId);
      setDoc(convRef, {
        participants: [auth.currentUser.uid, receiverUid].sort(),
        lastMessage: lastMsgText,
        lastMessageAt: serverTimestamp(),
      }, { merge: true }).catch((error) => {
        logger.error('Error updating conversation:', error);
      });

    } catch (error: any) {
      // Roll back optimistic message on failure
      setOptimisticMessages(prev => prev.filter(m => m.id !== optimisticId));
      if (!audioData) setNewMessage(sanitizedText); // restore input

      console.error('Error sending message:', error);
      
      if (error?.code === 'permission-denied') {
        toast.error(isBlockedByThem
          ? 'Bạn đã bị chặn bởi người dùng này.'
          : 'Không có quyền gửi tin nhắn. Có thể bạn đã bị chặn.'
        );
      } else if (error?.code === 'unavailable') {
        toast.error('Không thể kết nối đến server. Vui lòng thử lại.');
      } else {
        toast.error('Gửi tin nhắn thất bại. Vui lòng thử lại.');
      }
    } finally {
      if (isMountedRef.current) {
        setSending(false);
        logger.log('[Chat] setSending(false) — hoàn tất gửi tin nhắn');
      } else {
        logger.log('[Chat] setSending(false) bị bỏ qua — component đã unmount');
      }
    }
  };

  const handleBlock = async () => {
    if (!auth.currentUser) return;
    setIsBlocking(true);
    try {
      const blockId = `${auth.currentUser.uid}_${receiverUid}`;
      await setDoc(doc(db, 'blocks', blockId), {
        blockerUid: auth.currentUser.uid,
        blockedUid: receiverUid,
        createdAt: serverTimestamp()
      });
      setIsBlockedByMe(true);
      toast.success('Đã chặn người dùng này.');
    } catch (error) {
      console.error('Error blocking user:', error);
      toast.error('Có lỗi xảy ra khi chặn. Vui lòng thử lại.');
    } finally {
      setIsBlocking(false);
    }
  };

  const handleUnblock = async () => {
    if (!auth.currentUser) return;
    setIsBlocking(true);
    try {
      const blockId = `${auth.currentUser.uid}_${receiverUid}`;
      await deleteDoc(doc(db, 'blocks', blockId));
      setIsBlockedByMe(false);
      toast.success('Đã bỏ chặn người dùng này.');
    } catch (error) {
      console.error('Error unblocking user:', error);
      toast.error('Có lỗi xảy ra khi bỏ chặn. Vui lòng thử lại.');
    } finally {
      setIsBlocking(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (isCancelledRef.current) {
          isCancelledRef.current = false;
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          handleSendMessage(undefined, base64Audio);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      isCancelledRef.current = false;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 14) { // Auto stop at 15s
            stopRecording();
            return 15;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      toast.error('Không thể truy cập micro. Vui lòng kiểm tra quyền truy cập.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      isCancelledRef.current = false;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      isCancelledRef.current = true;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <MessageSkeleton />
        <MessageSkeleton />
        <MessageSkeleton />
      </div>
    );
  }

  // Messages Area
  const handleDeleteMessage = async (messageId: string) => {
    if (!messageId || !auth.currentUser) return;

    // Bug 13.3 — Lưu scroll position trước khi xóa để khôi phục sau
    // Bug_Condition: deleteMessage triggered AND scrollRef.current exists
    // Expected_Behavior: scrollTop sau delete = scrollTop trước delete (không auto-scroll to bottom)
    const savedScrollTop = scrollRef.current?.scrollTop ?? null;
    
    try {
      // Verify ownership before deleting
      const messageRef = doc(db, 'messages', messageId);
      const messageSnap = await getDoc(messageRef);
      
      if (!messageSnap.exists()) {
        toast.error('Tin nhắn không tồn tại');
        return;
      }
      
      const messageData = messageSnap.data();
      if (messageData.senderUid !== auth.currentUser.uid) {
        toast.error('Bạn không có quyền xóa tin nhắn này');
        return;
      }
      
      // Delete message
      await deleteDoc(messageRef);
      toast.success('Đã xóa tin nhắn');

      // Khôi phục scroll position sau khi xóa — tránh auto-scroll to bottom
      if (savedScrollTop !== null && scrollRef.current) {
        // Dùng requestAnimationFrame để đợi DOM cập nhật xong rồi mới restore
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = savedScrollTop;
          }
        });
      }
    } catch (error: any) {
      console.error('Error deleting message:', error);
      
      if (error?.code === 'permission-denied') {
        toast.error('Không có quyền xóa tin nhắn này');
      } else {
        toast.error('Xóa tin nhắn thất bại');
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto md:rounded-[2.5rem] md:h-[85vh] shadow-2xl overflow-hidden flex flex-col"
      style={{
        backgroundColor: isDark ? '#111827' : '#f8f9ff',
        border: isDark ? '1px solid #1f2937' : '1px solid #e5e7f0',
        height: 'calc(100dvh - 64px - 72px - env(safe-area-inset-bottom, 0px))',
        minHeight: '400px',
      }}
    >
      {/* Header */}
      <div className="p-3 md:p-4 border-b flex items-center gap-2 md:gap-4 backdrop-blur-md sticky top-0 z-10 transition-all"
        style={{
          background: isDark
            ? 'linear-gradient(135deg, rgba(17,24,39,0.95) 0%, rgba(30,27,75,0.95) 100%)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,243,255,0.98) 100%)',
          borderColor: isDark ? '#2d2a4a' : '#ede9fe',
          boxShadow: isDark ? '0 1px 12px rgba(0,0,0,0.3)' : '0 1px 12px rgba(99,102,241,0.08)',
        }}
      >
        <button 
          onClick={onBack}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-gray-200" />
        </button>
        <div className="flex items-center gap-3 flex-1">
          {receiverProfile?.photoURL ? (
            <div className="relative">
              <img 
                src={receiverProfile.photoURL} 
                alt={receiverProfile.fullName || 'User'}
                loading="lazy"
                decoding="async"
                className="w-10 h-10 rounded-full object-cover ring-2 ring-violet-200 dark:ring-violet-800"
                referrerPolicy="no-referrer"
                style={{
                  imageRendering: '-webkit-optimize-contrast',
                  backfaceVisibility: 'hidden',
                  transform: 'translateZ(0)',
                }}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(receiverProfile.fullName || 'U')}&background=8b5cf6&color=fff`;
                }}
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <User className="w-6 h-6 text-gray-300" />
            </div>
          )}
          <div>
            <h3 className="font-bold leading-tight text-base" style={{ color: isDark ? '#ffffff' : '#111827' }}>{receiverProfile?.fullName || 'Người dùng TVU'}</h3>
            {/* Online Status */}
            {(isBlockedByMe || isBlockedByThem) ? (
              <p className="text-sm font-medium flex items-center gap-1 text-gray-400">
                <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                Không khả dụng
              </p>
            ) : receiverIsTyping ? (
              <p className="text-sm font-medium flex items-center gap-1 text-blue-500">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                Đang nhập...
              </p>
            ) : (
              <OnlineStatus 
                userId={receiverUid} 
                size="sm" 
                showText={true}
              />
            )}
          </div>
        </div>

        <div className="flex gap-1">
          {isBlockedByMe ? (
            <button 
              onClick={() => setIsConfirmUnblockOpen(true)}
              disabled={isBlocking}
              className="p-2 hover:bg-blue-50 text-blue-600 rounded-xl transition-colors disabled:opacity-50"
              title="Bỏ chặn"
            >
              <ShieldOff className="w-6 h-6 rotate-180" />
            </button>
          ) : (
            <button 
              onClick={() => setIsConfirmBlockOpen(true)}
              disabled={isBlockedByThem || isBlocking}
              className="p-2 hover:bg-red-50 text-red-600 rounded-xl transition-colors disabled:opacity-50"
              title="Chặn"
            >
              <ShieldOff className="w-6 h-6" />
            </button>
          )}
          <button 
            onClick={() => setShowProfile(true)}
            className="p-2 hover:bg-blue-50 text-blue-600 rounded-xl transition-colors"
            title="Xem hồ sơ"
          >
            <Info className="w-6 h-6" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showProfile && receiverProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowProfile(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative">
                <ProfileCard profile={receiverProfile} showActions={false} />
                <button
                  onClick={() => setShowProfile(false)}
                  className="absolute top-4 left-4 p-2 bg-white/20 backdrop-blur-md hover:bg-white/40 text-white rounded-full transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 md:space-y-4"
        style={{
          background: isDark
            ? 'linear-gradient(180deg, #111827 0%, #0f172a 100%)'
            : 'linear-gradient(180deg, #f8f9ff 0%, #f3f4ff 100%)',
        }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 gap-4">
            {receiverProfile?.photoURL ? (
              <img
                src={receiverProfile.photoURL}
                alt={receiverProfile.fullName || 'User'}
                className="w-20 h-20 rounded-full object-cover ring-4 ring-violet-200 dark:ring-violet-800 shadow-lg"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(receiverProfile.fullName || 'U')}&background=8b5cf6&color=fff&size=80`;
                }}
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center shadow-lg">
                <User className="w-10 h-10 text-white" />
              </div>
            )}
            <div className="text-center">
              <p className="font-bold text-gray-800 dark:text-gray-100 text-base mb-1">
                {receiverProfile?.fullName || 'Người dùng TVU'}
              </p>
              <p className="text-gray-400 dark:text-gray-500 text-sm">Hãy gửi lời chào để bắt đầu cuộc trò chuyện!</p>
            </div>
            <button
              type="button"
              onClick={() => setNewMessage('👋 Xin chào!')}
              className="mt-1 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-semibold rounded-2xl hover:opacity-90 transition-all shadow-md shadow-indigo-200 dark:shadow-indigo-900/30 active:scale-95"
            >
              👋 Gửi lời chào
            </button>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center py-2">
                <button
                  onClick={handleLoadMore}
                  className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full text-sm font-medium transition-colors"
                >
                  Tải thêm tin nhắn
                </button>
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <MessageItem 
                key={msg.id || idx} 
                msg={msg} 
                onDelete={handleDeleteMessage} 
              />
            ))}
            
            {/* Typing Indicator */}
            <AnimatePresence>
              {receiverIsTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="flex justify-start"
                >
                  <div className="px-4 py-3 rounded-2xl rounded-tl-none border shadow-sm"
                    style={{ backgroundColor: isDark ? '#1f2937' : '#ffffff', borderColor: isDark ? '#374151' : '#f3f4f6' }}
                  >
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 md:p-4 border-t pb-[calc(0.75rem+var(--sab))] md:pb-4"
        style={{
          background: isDark
            ? 'linear-gradient(135deg, rgba(17,24,39,0.98) 0%, rgba(30,27,75,0.98) 100%)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,243,255,0.98) 100%)',
          borderColor: isDark ? '#2d2a4a' : '#ede9fe',
          boxShadow: isDark ? '0 -1px 12px rgba(0,0,0,0.2)' : '0 -1px 12px rgba(99,102,241,0.06)',
        }}
      >
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 p-4 rounded-2xl mb-4 border border-red-100 dark:border-red-900/50"
            >
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-red-600 font-bold font-mono text-base">{formatTime(recordingTime)}</span>
                <span className="text-red-400 text-sm font-medium">Đang ghi âm...</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={cancelRecording}
                  className="p-2 bg-gray-200 text-gray-600 rounded-xl hover:bg-gray-300 transition-colors"
                  title="Hủy"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button
                  onClick={stopRecording}
                  className="p-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors"
                  title="Gửi"
                >
                  <Square className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={(e) => handleSendMessage(e)} className="flex items-center gap-2">
          {(isBlockedByMe || isBlockedByThem) ? (
            <div className="flex-1 flex items-center justify-between gap-2 py-2.5 px-4 bg-gray-100 dark:bg-gray-800 rounded-2xl">
              <span className="text-gray-500 dark:text-gray-400 font-medium text-sm">
                {isBlockedByMe ? 'Bạn đã chặn người dùng này.' : 'Bạn đã bị chặn bởi người dùng này.'}
              </span>
              {isBlockedByMe && (
                <button
                  type="button"
                  onClick={() => setIsConfirmUnblockOpen(true)}
                  disabled={isBlocking}
                  className="flex-shrink-0 px-3 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-xl transition-colors disabled:opacity-50"
                >
                  Bỏ chặn
                </button>
              )}
            </div>
          ) : (
            <>
              {!isRecording && (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={sending}
                  className="flex-shrink-0 p-2.5 md:p-3 bg-gray-100 text-gray-500 rounded-2xl hover:bg-gray-200 transition-all disabled:opacity-50"
                  title="Ghi âm (tối đa 15s)"
                >
                  <Mic className="w-5 h-5 md:w-6 md:h-6" />
                </button>
              )}
              
              <input
                type="text"
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  handleTyping();
                }}
                disabled={isRecording}
                placeholder={isRecording ? "Đang ghi âm..." : "Nhập tin nhắn..."}
                className="flex-1 min-w-0 px-4 py-2.5 md:py-3 border-2 border-violet-200 dark:border-violet-800/50 rounded-2xl focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none transition-all disabled:opacity-50 text-sm md:text-base"
                style={{
                  backgroundColor: isDark ? 'rgba(31,41,55,0.6)' : 'rgba(255,255,255,0.9)',
                  color: isDark ? '#f3f4f6' : '#111827',
                  colorScheme: isDark ? 'dark' : 'light',
                }}
                data-chat-input
              />
              
              {/* Emoji & Send Buttons Group */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Emoji Picker Button - Visible on all screens */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    disabled={isRecording || sending}
                    className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-2xl transition-all disabled:opacity-50 active:scale-95"
                    title="Chọn emoji"
                  >
                    <Smile className="w-5 h-5" />
                  </button>

                  {/* Emoji Picker Popup */}
                  {showEmojiPicker && (
                    <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-3 w-64 z-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Chọn emoji</span>
                        <button
                          type="button"
                          onClick={() => setShowEmojiPicker(false)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto">
                        {emojis.map((emoji, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleEmojiClick(emoji)}
                            className="text-2xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg p-2 transition-colors"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Send Button */}
                <button
                  type="submit"
                  disabled={(!newMessage.trim() && !isRecording) || sending}
                  className="w-11 h-11 md:w-12 md:h-12 flex items-center justify-center bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 dark:from-indigo-700 dark:via-violet-700 dark:to-blue-600 text-white rounded-2xl hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-indigo-100 dark:shadow-indigo-500/30"
                  title="Gửi tin nhắn"
                >
                  {sending ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : <Send className="w-5 h-5 md:w-6 md:h-6" />}
                </button>
              </div>
            </>
          )}
        </form>
      </div>

      <ConfirmModal
        isOpen={isConfirmBlockOpen}
        onClose={() => setIsConfirmBlockOpen(false)}
        onConfirm={handleBlock}
        title="Chặn người dùng"
        message={`Bạn có chắc chắn muốn chặn ${receiverProfile?.fullName || 'người dùng này'}? Bạn sẽ không thể gửi hoặc nhận tin nhắn từ họ nữa.`}
        confirmText="Chặn ngay"
      />

      <ConfirmModal
        isOpen={isConfirmUnblockOpen}
        onClose={() => setIsConfirmUnblockOpen(false)}
        onConfirm={handleUnblock}
        title="Bỏ chặn người dùng"
        message={`Bạn có muốn bỏ chặn ${receiverProfile?.fullName || 'người dùng này'} để tiếp tục kết nối?`}
        confirmText="Bỏ chặn"
      />
    </div>
  );
};

// Hook long press cho mobile
// Bug_Condition: pressDuration >= 500 AND contextMenu.visible = false
// Expected_Behavior: Nhấn giữ ≥ 500ms hiện context menu trên mọi iOS và Android
const useLongPress = (onLongPress: (pos: { x: number; y: number }) => void, delay = 500) => {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const posRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const start = (e: React.TouchEvent) => {
    posRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    timerRef.current = setTimeout(() => {
      if ('vibrate' in navigator) navigator.vibrate(50);
      onLongPress(posRef.current);
    }, delay);
  };

  const cancel = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  return {
    onLongPressStart: start,
    onLongPressCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(), // Block native menu Android
  };
};

// Context Menu Component cho message
// Xử lý position để menu không tràn viewport
const MessageContextMenu: React.FC<{
  isOwner: boolean;
  position: { x: number; y: number };
  onDelete: () => void;
  onCopy: () => void;
  onClose: () => void;
}> = ({ isOwner, position, onDelete, onCopy, onClose }) => {
  React.useEffect(() => {
    const handleClickOutside = () => onClose();
    document.addEventListener('touchstart', handleClickOutside);
    return () => document.removeEventListener('touchstart', handleClickOutside);
  }, [onClose]);

  return (
    <div
      className="fixed z-[9999] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden"
      style={{
        left: Math.min(position.x, window.innerWidth - 180),
        top: Math.min(position.y, window.innerHeight - 120),
        minWidth: '160px',
      }}
      onClick={e => e.stopPropagation()}
    >
      <button onClick={() => { onCopy(); onClose(); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left text-sm text-gray-700 dark:text-gray-300">
        Copy tin nhắn
      </button>
      {isOwner && (
        <button onClick={() => { onDelete(); onClose(); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 text-left text-sm border-t border-gray-100 dark:border-gray-700">
          Xóa tin nhắn
        </button>
      )}
    </div>
  );
};

// Hook swipe-to-delete cho mobile
// Bug_Condition: swipeDirection = 'left' AND swipeDistance > 60 AND deleteButton.visible = false
// Expected_Behavior: Swipe trái > 80px hiện delete button; > 150px auto-delete
// Preservation: Scroll dọc không bị ảnh hưởng (chỉ xử lý khi swipe ngang rõ ràng)
const useSwipeToDelete = (onDelete: () => void, isOwner: boolean) => {
  const touchStartX = React.useRef(0);
  const touchStartY = React.useRef(0);
  const swipeOffset = React.useRef(0);  // Ref track offset hiện tại (tránh stale closure)
  const isSwipeActiveRef = React.useRef(false);
  const [offset, setOffset] = React.useState(0);

  const SWIPE_THRESHOLD = 80;        // px để hiện nút xóa
  const SWIPE_DELETE_THRESHOLD = 150; // px để auto-delete

  const handlers = {
    onTouchStart: (e: React.TouchEvent) => {
      if (!isOwner) return;
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      // Reset offset tracking khi bắt đầu swipe mới
      // (không dùng offset state vì có thể bị stale closure)
      isSwipeActiveRef.current = true;
    },

    onTouchMove: (e: React.TouchEvent) => {
      if (!isOwner || !isSwipeActiveRef.current) return;
      const deltaX = e.touches[0].clientX - touchStartX.current;
      const deltaY = e.touches[0].clientY - touchStartY.current;

      // Chỉ xử lý khi swipe ngang rõ ràng (|deltaX| > |deltaY| * 1.5)
      if (Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;

      // Chỉ cho phép swipe trái (deltaX < 0)
      if (deltaX > 0) return;

      e.preventDefault(); // Ngăn scroll dọc khi đang swipe ngang
      const clampedOffset = Math.max(deltaX, -SWIPE_DELETE_THRESHOLD);
      swipeOffset.current = clampedOffset;
      setOffset(clampedOffset);
    },

    onTouchEnd: () => {
      if (!isOwner) return;
      isSwipeActiveRef.current = false;

      // Dùng swipeOffset.current để tránh stale closure với React state
      const currentOffset = swipeOffset.current;

      if (currentOffset < -SWIPE_DELETE_THRESHOLD) {
        // Swipe đủ xa → auto-delete
        onDelete();
        swipeOffset.current = 0;
        setOffset(0);
      } else if (currentOffset < -SWIPE_THRESHOLD) {
        // Swipe vừa đủ → giữ lộ nút xóa ở -80px
        swipeOffset.current = -SWIPE_THRESHOLD;
        setOffset(-SWIPE_THRESHOLD);
      } else {
        // Swipe chưa đủ → snap về vị trí ban đầu
        swipeOffset.current = 0;
        setOffset(0);
      }
    },
  };

  return { offset, handlers };
};

// Custom comparison function for MessageItem memoization
// Only re-render when msg.id, msg.text, msg.read, or optimistic state changes
const areMessagePropsEqual = (
  prevProps: { msg: Message; onDelete: (id: string) => void },
  nextProps: { msg: Message; onDelete: (id: string) => void }
) => {
  const prevOptimistic = prevProps.msg.id?.startsWith('optimistic_') ?? false;
  const nextOptimistic = nextProps.msg.id?.startsWith('optimistic_') ?? false;
  return (
    prevProps.msg.id === nextProps.msg.id &&
    prevProps.msg.text === nextProps.msg.text &&
    prevProps.msg.read === nextProps.msg.read &&
    prevProps.msg.audioUrl === nextProps.msg.audioUrl &&
    prevProps.msg.type === nextProps.msg.type &&
    prevOptimistic === nextOptimistic
  );
};

const MessageItem: React.FC<{ msg: Message; onDelete: (id: string) => void }> = memo(({ msg, onDelete }) => {
  const isMe = msg.senderUid === auth.currentUser?.uid;
  const [showDelete, setShowDelete] = React.useState(false);
  const [contextMenuPos, setContextMenuPos] = React.useState<{ x: number; y: number } | null>(null);

  // Hook swipe-to-delete: chỉ áp dụng cho tin nhắn của chính mình, không phải optimistic
  const isOwner = isMe && !!msg.id && !msg.id.startsWith('optimistic_');
  const { offset, handlers: swipeHandlers } = useSwipeToDelete(
    () => onDelete(msg.id!),
    isOwner
  );

  // Hook long press: hiện context menu với vị trí chạm
  const { onLongPressStart, onLongPressCancel, onContextMenu } = useLongPress((pos) => {
    setContextMenuPos(pos);
  });

  const handleTouchStart = (e: React.TouchEvent) => {
    // Chuyển cho swipe handler trước
    swipeHandlers.onTouchStart(e);
    // Bắt đầu long press timer
    onLongPressStart(e);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    swipeHandlers.onTouchEnd();
    onLongPressCancel();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    swipeHandlers.onTouchMove(e);
    // Nếu đang swipe, hủy long press
    onLongPressCancel();
  };

  // Tính width nút xóa theo offset hiện tại
  const deleteButtonWidth = Math.abs(Math.min(offset, 0));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex ${isMe ? 'justify-end' : 'justify-start'} group mb-2`}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      <div className={`flex items-center gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Wrapper có overflow hidden để chứa swipe effect */}
        <div className="relative overflow-hidden rounded-2xl">
          {/* Delete button background — xuất hiện khi swipe trái */}
          {isOwner && deleteButtonWidth > 0 && (
            <div
              className="absolute right-0 top-0 bottom-0 flex items-center justify-center bg-red-500"
              style={{ width: `${deleteButtonWidth}px` }}
              aria-hidden="true"
            >
              <Trash2 className="w-5 h-5 text-white" />
            </div>
          )}

          {/* Message bubble — có thể trượt sang trái */}
          <div
            style={{
              transform: `translateX(${offset}px)`,
              transition: offset === 0 ? 'transform 0.25s ease-out' : 'none',
              touchAction: 'pan-y', // Cho phép scroll dọc mặc định
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onContextMenu={onContextMenu}
          >
            <div className="flex flex-col items-end gap-1">
              <div
                className={`px-4 py-2.5 rounded-2xl text-sm font-medium shadow-sm relative ${
                  isMe
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'rounded-tl-none border border-gray-200'
                }`}
                style={!isMe ? { backgroundColor: '#f3f4f6', color: '#1f2937' } : undefined}
              >
                {msg.type === 'audio' ? (
                  <div className="py-1">
                    <AudioPlayer src={msg.audioUrl!} isMe={isMe} />
                  </div>
                ) : (
                  msg.text
                )}
              </div>

              {/* Read Receipt - Only show for sender's messages */}
              {isMe && (
                <div className="flex items-center gap-1.5 px-1 self-end">
                  {msg.id?.startsWith('optimistic_') ? (
                    <Clock className="w-3.5 h-3.5 text-gray-400 animate-pulse" />
                  ) : msg.read ? (
                    <CheckCheck className="w-4 h-4 text-blue-500" />
                  ) : (
                    <Check className="w-4 h-4 text-gray-500" />
                  )}
                  <span className="text-[10px] text-gray-500 font-medium">
                    {msg.id?.startsWith('optimistic_') ? 'Đang gửi...' : msg.read ? 'Đã xem' : 'Đã gửi'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Button - Trash/Delete (chỉ hiện trên desktop hover) */}
        {isOwner && (
          <button
            onClick={() => onDelete(msg.id!)}
            className={`p-2 bg-white dark:bg-gray-800 text-red-500 rounded-full shadow-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-all shrink-0 ${
              showDelete ? 'opacity-100' : 'opacity-0'
            } hidden md:block`}
            title="Xóa tin nhắn"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Context Menu hiện khi long press trên mobile */}
      {contextMenuPos && (
        <MessageContextMenu
          isOwner={isOwner}
          position={contextMenuPos}
          onDelete={() => { onDelete(msg.id!); setContextMenuPos(null); }}
          onCopy={() => { navigator.clipboard?.writeText(msg.text || ''); setContextMenuPos(null); }}
          onClose={() => setContextMenuPos(null)}
        />
      )}
    </motion.div>
  );
}, areMessagePropsEqual);

const AudioPlayer: React.FC<{ src: string; isMe: boolean }> = memo(({ src, isMe }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const onTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2.5 min-w-[170px] md:min-w-[200px]">
      <button
        onClick={togglePlay}
        className={`p-2 rounded-full transition-all flex-shrink-0 shadow-sm ${
          isMe ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-blue-100 hover:bg-blue-200 text-blue-600'
        }`}
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
      </button>
      
      <div className="flex-1 space-y-1 min-w-0">
        <div className={`h-1 w-full rounded-full relative overflow-hidden ${isMe ? 'bg-white/30' : 'bg-gray-200'}`}>
          <div 
            className={`h-full rounded-full absolute top-0 left-0 transition-all duration-300 ${isMe ? 'bg-white' : 'bg-blue-600'}`} 
            style={{ width: `${(currentTime / duration) * 100}%` }}
          ></div>
        </div>
        <div className={`flex justify-between text-[10px] font-bold ${isMe ? 'text-white/80' : 'text-gray-500'}`}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />
    </div>
  );
});
