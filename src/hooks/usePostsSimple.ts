/**
 * usePostsSimple - Simple Real-time Posts Hook
 * 
 * Đơn giản, real-time, không có filter phức tạp
 */

import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where,
  orderBy, 
  limit, 
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../firebase';
import { Post } from '../types';
import { logger } from '@/utils/logger';

const POSTS_PER_PAGE = 20;

interface UsePostsSimpleResult {
  posts: Post[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

// Global memory cache to eliminate skeletons on tab switch
let globalPostsCache: Post[] = [];
let isFirstLoad = true;

/**
 * Simple real-time posts hook
 * - Real-time listener (tự động cập nhật)
 * - Không có filter 18 giờ
 * - Không có pagination phức tạp
 * - Chỉ load 20 bài mới nhất
 * - Hỗ trợ Global Memory Cache để chuyển tab tức thì
 */
export function usePostsSimple(): UsePostsSimpleResult {
  const [posts, setPosts] = useState<Post[]>(globalPostsCache);
  const [loading, setLoading] = useState(isFirstLoad);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  /**
   * Refresh posts
   */
  const refresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  /**
   * Real-time listener
   */
  useEffect(() => {
    if (isFirstLoad) {
      setLoading(true);
    }
    setError(null);

    // Tính toán thời điểm 2 ngày trước (48 giờ)
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // Query: Load 20 bài mới nhất trong 2 ngày qua, sắp xếp theo createdAt desc
    const postsQuery = query(
      collection(db, 'posts'),
      where('createdAt', '>=', twoDaysAgo),
      orderBy('createdAt', 'desc'),
      limit(POSTS_PER_PAGE)
    );

    // Subscribe to real-time updates
    const unsubscribe: Unsubscribe = onSnapshot(
      postsQuery,
      (snapshot) => {
        const postsData: Post[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          postsData.push({
            id: doc.id,
            userId: data.userId || '',
            userName: data.userName || 'Người dùng',
            userAvatar: data.userAvatar || '',
            content: data.content || '',
            images: data.images || [],
            createdAt: data.createdAt,
            likes: data.likes || [],
            likeCount: data.likeCount || 0,
            reactions: data.reactions || [],
            reactionCounts: data.reactionCounts || {
              like: 0,
              love: 0,
              haha: 0,
              wow: 0,
              sad: 0,
              angry: 0,
            },
            commentCount: data.commentCount || 0,
          });
        });

        logger.log('[usePostsSimple] Loaded posts:', postsData.length);
        
        // Skip re-render if data is identical (avoids flicker on tab switch back)
        const newHash = postsData.map(p => `${p.id}:${p.likeCount}:${p.commentCount}:${p.reactions?.length ?? 0}:${p.content}:${p.images?.length ?? 0}`).join('|');
        const oldHash = globalPostsCache.map(p => `${p.id}:${p.likeCount}:${p.commentCount}:${p.reactions?.length ?? 0}:${p.content}:${p.images?.length ?? 0}`).join('|');
        
        // Always update global cache
        globalPostsCache = postsData;
        isFirstLoad = false;
        
        // Only trigger React re-render if data actually changed
        if (newHash !== oldHash) {
          setPosts(postsData);
        } else {
          // Still clear loading state on first load
          setLoading(false);
        }
        setLoading(false);
      },
      (err) => {
        console.error('[usePostsSimple] Error:', err);
        setError(err as Error);
        setLoading(false);
      }
    );

    // Cleanup
    return () => {
      unsubscribe();
    };
  }, [refreshKey]);

  return {
    posts,
    loading,
    error,
    refresh,
  };
}
