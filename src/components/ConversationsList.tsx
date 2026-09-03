import React, { useState, useEffect, useRef, memo } from 'react';
import { db, auth, collection, query, where, onSnapshot, getDoc, doc, orderBy, handleFirestoreError, OperationType, getDocs, limit } from '../firebase';
import { Conversation, StudentProfile } from '../types';
import { MessageSquare, User, Loader2, Search, ChevronRight, Plus } from 'lucide-react';
import { ConversationSkeleton } from './SkeletonLoader';
import { FIRESTORE_LIMITS } from '../utils/constants';
import { LRUCache } from '../utils/cache';
import { useTheme } from '../contexts/ThemeContext';
import { OnlineStatus } from './OnlineStatus';

interface ConversationsListProps {
  onStartChat: (uid: string) => void;
  onNewChat: () => void;
}

// Global cache for instant tab switching
let globalConversationsCache: (Conversation & { otherUser: StudentProfile })[] = [];
let isConversationsLoaded = false;

export const ConversationsList: React.FC<ConversationsListProps> = ({ onStartChat, onNewChat }) => {
  const { theme } = useTheme();
  const [conversations, setConversations] = useState<(Conversation & { otherUser: StudentProfile })[]>(globalConversationsCache);
  const [loading, setLoading] = useState(!isConversationsLoaded);
  const [searchTerm, setSearchTerm] = useState('');
  const [blockedUids, setBlockedUids] = useState<string[]>([]);
  const profileCacheRef = useRef(new LRUCache<string, StudentProfile>(50)); // LRU Cache với max 50 profiles

  // Scroll momentum tracking refs
  const isScrollingRef = useRef(false);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const blockedUidsRef = useRef<string[]>([]);
  
  useEffect(() => {
    blockedUidsRef.current = blockedUids;
  }, [blockedUids]);

  // Scroll momentum tracking: block tap khi đang scroll (fix iOS ghost tap)
  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;

    const handleScroll = () => {
      isScrollingRef.current = true;
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 150);
    };

    listEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      listEl.removeEventListener('scroll', handleScroll);
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;

    const blocksRef = collection(db, 'blocks');
    const myBlocksQuery = query(blocksRef, where('blockerUid', '==', auth.currentUser.uid));
    const theirBlocksQuery = query(blocksRef, where('blockedUid', '==', auth.currentUser.uid));

    const unsubMyBlocks = onSnapshot(myBlocksQuery, (snap) => {
      const blockedByMe = snap.docs.map(doc => doc.data().blockedUid);
      setBlockedUids(prev => [...new Set([...blockedByMe, ...prev.filter(id => !blockedByMe.includes(id))])]);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'blocks', true);
    });

    const unsubTheirBlocks = onSnapshot(theirBlocksQuery, (snap) => {
      const blockedByThem = snap.docs.map(doc => doc.data().blockerUid);
      setBlockedUids(prev => [...new Set([...blockedByThem, ...prev.filter(id => !blockedByThem.includes(id))])]);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'blocks', true);
    });

    return () => {
      unsubMyBlocks();
      unsubTheirBlocks();
    };
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', auth.currentUser.uid),
      orderBy('lastMessageAt', 'desc'),
      limit(FIRESTORE_LIMITS.CONVERSATIONS_LIMIT)
    );

    const unsubscribe = onSnapshot(q, async (snap) => {
      try {
        const currentBlocked = blockedUidsRef.current;
        // Batch fetch profiles instead of individual fetches
        const conversationsData = snap.docs.map(d => ({
          id: d.id,
          ...d.data() as Conversation
        }));

        const otherUids = conversationsData
          .map(conv => conv.participants.find(p => p !== auth.currentUser?.uid))
          .filter((uid): uid is string => uid !== undefined);

        // Remove duplicates and limit to 10 (Firestore 'in' limit)
        const uniqueUids = [...new Set(otherUids)].slice(0, 10);

        // Batch fetch profiles
        const profilesMap = new Map<string, StudentProfile>();
        
        if (uniqueUids.length > 0) {
          // Check cache first
          uniqueUids.forEach(uid => {
            const cached = profileCacheRef.current.get(uid);
            if (cached) {
              profilesMap.set(uid, cached);
            }
          });

          // Fetch missing profiles
          const missingUids = uniqueUids.filter(uid => !profilesMap.has(uid));
          if (missingUids.length > 0) {
            const profilesQuery = query(
              collection(db, 'profiles'),
              where('__name__', 'in', missingUids)
            );
            const profilesSnap = await getDocs(profilesQuery);
            profilesSnap.docs.forEach(doc => {
              const profile = doc.data() as StudentProfile;
              profilesMap.set(doc.id, profile);
              profileCacheRef.current.set(doc.id, profile);
            });
          }
        }

        // Combine conversations with profiles
        const results = conversationsData
          .map(conv => {
            const otherUid = conv.participants.find(p => p !== auth.currentUser?.uid);
            if (!otherUid) return null;
            
            const otherUser = profilesMap.get(otherUid);
            if (!otherUser) return null;

            return {
              ...conv,
              otherUser
            };
          })
          .filter((c): c is (Conversation & { otherUser: StudentProfile }) => c !== null);

        // Sort by last message time
        const sortedResults = results.sort((a, b) => {
          const timeA = a.lastMessageAt?.toMillis?.() || 0;
          const timeB = b.lastMessageAt?.toMillis?.() || 0;
          return timeB - timeA;
        });

        // Update global cache
        globalConversationsCache = sortedResults;
        isConversationsLoaded = true;

        setConversations(sortedResults);
        setLoading(false);
      } catch (error) {
        console.error('Error processing conversations:', error);
        setLoading(false);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'conversations', true);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const filteredConversations = conversations.filter(c =>
    c.otherUser.fullName.toLowerCase().includes(searchTerm.toLowerCase()) &&
    !blockedUids.includes(c.otherUser.uid)
  );

  // Guard click khi đang scroll (tránh ghost tap trên iOS)
  const handleConversationClick = (uid: string) => {
    if (isScrollingRef.current) return;
    onStartChat(uid);
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <h2 className="text-3xl font-black mb-6 text-gray-900 dark:text-gray-100">
          Tin nhắn
        </h2>
        <ConversationSkeleton />
        <ConversationSkeleton />
        <ConversationSkeleton />
        <ConversationSkeleton />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 md:py-8">
      <div className="flex justify-between items-center mb-6 md:mb-8">
        <div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight page-heading">
            Tin nhắn
          </h2>
          <p className="mt-1 font-medium leading-relaxed conversations-subtitle">
            Kết nối sinh viên TVU - cùng sẻ chia và phát triển
          </p>
        </div>
        <button
          onClick={onNewChat}
          className="p-3 md:p-4 bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 text-white rounded-2xl shadow-lg shadow-indigo-100 hover:opacity-90 transition-all group"
          title="Tìm bạn mới"
        >
          <Plus className="w-5 h-5 md:w-6 md:h-6 group-hover:rotate-90 transition-transform" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Tìm kiếm cuộc trò chuyện..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3.5 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all border"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(31,41,55,0.8)' : '#ffffff',
            color: theme === 'dark' ? '#f3f4f6' : '#111827',
            borderColor: theme === 'dark' ? 'rgba(75,85,99,0.5)' : '#e5e7eb',
            colorScheme: theme === 'dark' ? 'dark' : 'light',
          }}
        />
      </div>

      {filteredConversations.length === 0 ? (
        <div
          className="rounded-[2.5rem] p-16 text-center shadow-sm border"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(31,41,55,0.6)' : '#ffffff',
            borderColor: theme === 'dark' ? 'rgba(55,65,81,0.8)' : '#f3f4f6',
          }}
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: theme === 'dark' ? 'rgba(59,130,246,0.1)' : '#eff6ff' }}
          >
            <MessageSquare className="w-10 h-10" style={{ color: theme === 'dark' ? '#1d4ed8' : '#bfdbfe' }} />
          </div>
          <h3 className="text-xl font-black mb-2 uppercase tracking-tight" style={{ color: theme === 'dark' ? '#f3f4f6' : '#111827' }}>
            Hộp thư đang trống
          </h3>
          <p className="max-w-xs mx-auto font-medium leading-relaxed" style={{ color: theme === 'dark' ? '#9ca3af' : '#6b7280' }}>
            Hãy bắt đầu tìm kiếm những người bạn mới và gửi lời chào đầu tiên thôi nào!
          </p>
        </div>
      ) : (
        <div className="space-y-3" ref={listRef}>
          {filteredConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => handleConversationClick(conv.otherUser.uid)}
              className="w-full p-3 md:p-4 rounded-3xl shadow-sm border transition-all flex items-center gap-3 md:gap-4 group text-left hover:shadow-md"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(31,41,55,0.7)' : '#ffffff',
                borderColor: theme === 'dark' ? 'rgba(55,65,81,0.8)' : '#f3f4f6',
                touchAction: 'manipulation',
              }}
            >
              <div className="relative flex-shrink-0">
                {conv.otherUser.photoURL ? (
                  <img
                    src={conv.otherUser.photoURL}
                    alt=""
                    className="w-14 h-14 rounded-2xl object-cover shadow-sm"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(conv.otherUser.fullName || 'U')}&background=8b5cf6&color=fff`;
                    }}
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gray-100 dark:bg-gray-700">
                    <User className="w-7 h-7 text-gray-300 dark:text-gray-500" />
                  </div>
                )}
                {/* Online Status Indicator */}
                <div className="absolute -bottom-1 -right-1">
                  <OnlineStatus 
                    userId={conv.otherUser.uid} 
                    size="sm" 
                    showText={false}
                    className="rounded-full p-0.5 shadow-sm"
                  />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline gap-2 mb-1">
                  <h4
                    className="font-bold transition-colors flex-1 min-w-0 group-hover:text-indigo-500 truncate"
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: theme === 'dark' ? '#f9fafb' : '#111827',
                    }}
                  >
                    {conv.otherUser.fullName}
                  </h4>
                  {conv.lastMessageAt && (
                    <span
                      className="text-[10px] font-medium flex-shrink-0 whitespace-nowrap text-gray-400 dark:text-gray-500"
                    >
                      {new Date(conv.lastMessageAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <p className="text-sm truncate text-gray-500 dark:text-gray-400">
                  {conv.lastMessage || 'Bắt đầu cuộc trò chuyện mới'}
                </p>
              </div>

              <ChevronRight className="w-5 h-5 group-hover:text-blue-400 transition-colors flex-shrink-0 text-gray-300 dark:text-gray-600" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
