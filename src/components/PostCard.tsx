import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { Post, Reaction, ReactionType } from '../types';
import { db, doc, updateDoc, deleteDoc, onSnapshot } from '../firebase';
import { Trash2, User as UserIcon, MessageCircle, Edit2, X, Check, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { ReactionPicker } from './ReactionPicker';
import { ReactionsModal } from './ReactionsModal';
import { CommentSection } from './CommentSection';
import { compressImage } from '../utils/imageCompression';
import { logger } from '../utils/logger';

// Adaptive Image Layout Component - Optimized for mobile performance
const AdaptiveImageLayout: React.FC<{ images: string[] }> = React.memo(({ images }) => {
  const { theme } = useTheme();
  const [orientations, setOrientations] = useState<('landscape' | 'portrait' | 'square')[]>([]);

  // Memoize style values to prevent re-creating on every render
  const styles = React.useMemo(() => ({
    bgGradient: theme === 'dark' 
      ? 'linear-gradient(to bottom right, #1e293b, #0f172a)' 
      : 'linear-gradient(to bottom right, #f9fafb, #f3f4f6)',
    borderColor: theme === 'dark' 
      ? 'rgba(51, 65, 85, 0.5)' 
      : 'rgba(229, 231, 235, 0.5)'
  }), [theme]);

  useEffect(() => {
    // Detect orientation of all images
    const detectOrientations = async () => {
      const results = await Promise.all(
        images.map((src) => {
          return new Promise<'landscape' | 'portrait' | 'square'>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const aspectRatio = img.naturalWidth / img.naturalHeight;
              if (aspectRatio > 1.2) resolve('landscape');
              else if (aspectRatio < 0.8) resolve('portrait');
              else resolve('square');
            };
            img.onerror = () => resolve('square'); // Fallback on error
            img.src = src;
          });
        })
      );
      setOrientations(results);
    };

    detectOrientations();
  }, [images]);

  if (orientations.length === 0) {
    // Loading state
    return <div className="mb-4 h-64 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--tw-prose-body)' }} />;
  }

  // 1 image: Adaptive height based on orientation
  if (images.length === 1) {
    const orientation = orientations[0];
    const maxHeight = orientation === 'portrait' ? '450px' : orientation === 'landscape' ? '350px' : '400px';
    
    return (
      <div className="mb-4">
        <div 
          className="relative rounded-2xl flex items-center justify-center overflow-hidden shadow-sm"
          style={{ 
            maxHeight, 
            padding: '4px',
            background: styles.bgGradient,
            border: `1px solid ${styles.borderColor}`
          }}
        >
          <img
            src={images[0]}
            alt="Ảnh"
            className="w-full h-auto object-contain rounded-xl relative z-10"
            loading="lazy"
            draggable={false}
            style={{ 
              maxHeight: `calc(${maxHeight} - 8px)`,
              WebkitBackfaceVisibility: 'hidden',
              backfaceVisibility: 'hidden'
            }}
          />
        </div>
      </div>
    );
  }

  // 2 images: Side by side với aspect-ratio cố định thay vì min/max-height
  if (images.length === 2) {
    return (
      <div className="mb-4 grid grid-cols-2 gap-1.5">
        {images.map((img, index) => (
          <div
            key={index}
            className="relative rounded-xl overflow-hidden"
            style={{
              aspectRatio: '4/3',
            }}
          >
            <img
              src={img}
              alt={`Ảnh ${index + 1}`}
              className="w-full h-full object-cover rounded-xl"
              loading="lazy"
              draggable={false}
            />
          </div>
        ))}
      </div>
    );
  }

  // 3 images: Adaptive layout based on orientations
  if (images.length === 3) {
    const landscapeCount = orientations.filter(o => o === 'landscape').length;
    const portraitCount = orientations.filter(o => o === 'portrait').length;

    // Case 1: 1 landscape + 2 portraits → Landscape on top, portraits below
    if (landscapeCount === 1 && portraitCount === 2) {
      const landscapeIndex = orientations.indexOf('landscape');
      const portraitIndices = orientations.map((o, i) => o === 'portrait' ? i : -1).filter(i => i !== -1);

      return (
        <div className="mb-4">
          {/* Landscape image on top */}
          <div 
            className="relative rounded-2xl flex items-center justify-center overflow-hidden mb-2 shadow-sm"
            style={{ 
              maxHeight: '300px', 
              padding: '4px',
              background: styles.bgGradient,
              border: `1px solid ${styles.borderColor}`
            }}
          >
            <img
              src={images[landscapeIndex]}
              alt="Ảnh phong cảnh"
              className="w-full h-auto object-contain rounded-xl"
              loading="lazy"
              draggable={false}
              style={{ maxHeight: '292px' }}
            />
          </div>

          {/* 2 portrait images below */}
          <div className="grid grid-cols-2 gap-2">
            {portraitIndices.map((idx) => (
              <div 
                key={idx}
                className="relative rounded-2xl flex items-center justify-center overflow-hidden shadow-sm"
                style={{ 
                  minHeight: '200px', 
                  maxHeight: '300px', 
                  padding: '4px',
                  background: styles.bgGradient,
                  border: `1px solid ${styles.borderColor}`
                }}
              >
                <img
                  src={images[idx]}
                  alt={`Ảnh ${idx + 1}`}
                  className="w-full h-auto object-contain rounded-xl"
                  loading="lazy"
                  draggable={false}
                  style={{ 
                    maxHeight: '292px',
                    WebkitBackfaceVisibility: 'hidden',
                    backfaceVisibility: 'hidden'
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Case 2: All landscape → 3 columns
    if (landscapeCount === 3) {
      return (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {images.map((img, index) => (
            <div 
              key={index}
              className="relative rounded-2xl flex items-center justify-center overflow-hidden shadow-sm"
              style={{ 
                minHeight: '120px', 
                maxHeight: '200px', 
                padding: '3px',
                background: styles.bgGradient,
                border: `1px solid ${styles.borderColor}`
              }}
            >
              <img
                src={img}
                alt={`Ảnh ${index + 1}`}
                className="w-full h-auto object-contain rounded-lg"
                loading="lazy"
                draggable={false}
                style={{ maxHeight: '194px' }}
              />
            </div>
          ))}
        </div>
      );
    }

    // Case 3: All portrait → 3 columns
    if (portraitCount === 3) {
      return (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {images.map((img, index) => (
            <div 
              key={index}
              className="relative rounded-2xl flex items-center justify-center overflow-hidden shadow-sm"
              style={{ 
                minHeight: '150px', 
                maxHeight: '300px', 
                padding: '3px',
                background: styles.bgGradient,
                border: `1px solid ${styles.borderColor}`
              }}
            >
              <img
                src={img}
                alt={`Ảnh ${index + 1}`}
                className="w-full h-auto object-contain rounded-lg"
                loading="lazy"
                draggable={false}
                style={{ maxHeight: '294px' }}
              />
            </div>
          ))}
        </div>
      );
    }

    // Default: 3 columns grid
    return (
      <div className="mb-4 grid grid-cols-3 gap-2">
        {images.map((img, index) => (
          <div 
            key={index}
            className="relative rounded-2xl flex items-center justify-center overflow-hidden shadow-sm"
            style={{ 
              minHeight: '150px', 
              maxHeight: '300px', 
              padding: '3px',
              background: styles.bgGradient,
              border: `1px solid ${styles.borderColor}`
            }}
          >
            <img
              src={img}
              alt={`Ảnh ${index + 1}`}
              className="w-full h-auto object-contain rounded-lg"
              loading="lazy"
              draggable={false}
              style={{ maxHeight: '294px' }}
            />
          </div>
        ))}
      </div>
    );
  }

  return null;
});

// Module-level avatar cache — tránh gọi Firestore lặp lại cho cùng 1 userId
// TTL 10 phút, tự xóa sau khi hết hạn
const avatarCache = new Map<string, { url: string; expiresAt: number }>();
const AVATAR_CACHE_TTL = 10 * 60 * 1000; // 10 phút

// Hook to get avatar for a user — cache-first, chỉ gọi Firestore 1 lần/userId/10 phút
const useUserAvatar = (userId: string, fallbackAvatar: string) => {
  const cached = avatarCache.get(userId);
  const initialAvatar = (cached && cached.expiresAt > Date.now()) ? cached.url : fallbackAvatar;

  const [avatar, setAvatar] = useState(initialAvatar);
  const [timestamp, setTimestamp] = useState(Date.now());

  useEffect(() => {
    // Nếu cache còn hạn thì dùng luôn, không cần gọi Firestore
    const hit = avatarCache.get(userId);
    if (hit && hit.expiresAt > Date.now()) {
      if (hit.url !== avatar) {
        setAvatar(hit.url);
      }
      return;
    }

    const fetchAvatar = async () => {
      try {
        const { getDoc } = await import('firebase/firestore');
        const profileRef = doc(db, 'profiles', userId);
        const docSnap = await getDoc(profileRef);
        if (docSnap.exists()) {
          const profileData = docSnap.data();
          const newAvatar = profileData.photoURL || fallbackAvatar;
          // Lưu vào cache
          avatarCache.set(userId, { url: newAvatar, expiresAt: Date.now() + AVATAR_CACHE_TTL });
          setAvatar(newAvatar);
          setTimestamp(Date.now());
        }
      } catch (error) {
        logger.error('[PostCard useUserAvatar] Error fetching avatar:', error);
      }
    };

    fetchAvatar();
  }, [userId]); // chỉ chạy lại khi userId thay đổi

  return { avatar, timestamp };
};

interface PostCardProps {
  post: Post;
  currentUser: User;
  onDelete?: () => void;
  onProfileClick?: (uid: string) => void;
}

const PostCardComponent: React.FC<PostCardProps> = ({ post, currentUser, onDelete, onProfileClick }) => {
  const { theme } = useTheme();
  const [isReacting, setIsReacting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReactionsModal, setShowReactionsModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(post.content);
  const [editedImages, setEditedImages] = useState<string[]>(post.images || []);
  const [isSaving, setIsSaving] = useState(false);
  const isOwner = post.userId === currentUser.uid;

  // Debounce ref: chặn reaction trong vòng 300ms kể từ lần gọi cuối
  const lastReactionTimeRef = useRef<number>(0);

  // Optimistic displayed state — updates immediately on save without waiting for Firestore
  const [displayedContent, setDisplayedContent] = useState(post.content);
  const [displayedImages, setDisplayedImages] = useState<string[]>(post.images || []);

  // Sync displayed state when Firestore pushes new data from outside.
  // NOTE: intentionally excludes `isEditing` from deps — we must NOT overwrite
  // the optimistic state when isEditing flips to false (post.content is still
  // the old value at that point; Firestore hasn't confirmed yet).
  useEffect(() => {
    setDisplayedContent(post.content);
    setDisplayedImages(post.images || []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.content, post.images]);

  // Optimistic reactions state - starts with post.reactions, updates immediately on click
  const [optimisticReactions, setOptimisticReactions] = useState<Reaction[]>(
    Array.isArray(post.reactions) ? post.reactions : []
  );

  // Sync optimistic state with post.reactions when it changes from Firestore
  useEffect(() => {
    const postReactions = Array.isArray(post.reactions) ? post.reactions : [];
    setOptimisticReactions(postReactions);
  }, [post.reactions]);

  // Get real-time avatar for post author
  const { avatar: postUserAvatar, timestamp: avatarTimestamp } = useUserAvatar(
    post.userId,
    post.userAvatar || ''
  );

  // Check if avatar is a data URL (base64) - don't add timestamp
  const isDataUrl = postUserAvatar?.startsWith('data:');
  const postAvatarSrc = isDataUrl ? postUserAvatar : `${postUserAvatar}?t=${avatarTimestamp}`;

  // Use optimistic reactions for immediate UI updates
  const reactions = optimisticReactions;
  
  // Get current user's reaction
  const currentUserReaction = reactions.find(r => r.userId === currentUser.uid);
  
  // Calculate total reactions
  const totalReactions = reactions.length;

  const formatTimeAgo = (timestamp: any): string => {
    if (!timestamp) return 'Vừa xong';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'Vừa xong';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} ngày trước`;
    
    return date.toLocaleDateString('vi-VN');
  };

  const handleReaction = async (type: ReactionType) => {
    const now = Date.now();

    // Block nếu < 300ms kể từ lần reaction cuối (debounce cho mobile tap)
    if (now - lastReactionTimeRef.current < 300) {
      return;
    }

    if (isReacting || !post.id) {
      logger.log('Cannot react:', { isReacting, postId: post.id });
      return;
    }
    
    logger.log('Starting reaction:', { type, postId: post.id, userId: currentUser.uid });
    
    lastReactionTimeRef.current = now;
    setIsReacting(true);
    
    try {
      // Get current reactions from optimistic state
      const reactions = [...optimisticReactions];
      
      logger.log('Current reactions:', reactions);
      
      // Check if user already reacted
      const existingReactionIndex = reactions.findIndex(r => r.userId === currentUser.uid);
      
      let newReactions: Reaction[];
      
      if (existingReactionIndex >= 0) {
        // User already reacted
        const existingReaction = reactions[existingReactionIndex];
        
        if (existingReaction.type === type) {
          // Same reaction - remove it
          newReactions = reactions.filter(r => r.userId !== currentUser.uid);
          logger.log('Removing reaction');
        } else {
          // Different reaction - update it
          newReactions = [...reactions];
          newReactions[existingReactionIndex] = {
            userId: currentUser.uid,
            userName: currentUser.displayName || 'Người dùng',
            userAvatar: currentUser.photoURL || '',
            type,
            createdAt: new Date(),
          };
          logger.log('Updating reaction');
        }
      } else {
        // New reaction
        newReactions = [
          ...reactions,
          {
            userId: currentUser.uid,
            userName: currentUser.displayName || 'Người dùng',
            userAvatar: currentUser.photoURL || '',
            type,
            createdAt: new Date(),
          }
        ];
        logger.log('Adding new reaction');
      }
      
      // OPTIMISTIC UPDATE - Update UI immediately
      setOptimisticReactions(newReactions);
      
      // Calculate reaction counts
      const reactionCounts = {
        like: 0,
        love: 0,
        haha: 0,
        wow: 0,
        sad: 0,
        angry: 0,
      };
      
      newReactions.forEach(r => {
        if (r.type in reactionCounts) {
          reactionCounts[r.type]++;
        }
      });
      
      logger.log('New reactions:', newReactions);
      logger.log('Reaction counts:', reactionCounts);
      
      // Update Firestore in background
      const postRef = doc(db, 'posts', post.id);
      await updateDoc(postRef, {
        reactions: newReactions,
        reactionCounts: reactionCounts,
        likeCount: newReactions.length,
        likes: newReactions.map(r => r.userId), // Keep for backward compatibility
      });
      
      logger.log('Firestore updated successfully');
    } catch (error: any) {
      logger.error('Error toggling reaction:', error);
      logger.error('Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      
      // Revert optimistic update on error
      setOptimisticReactions(Array.isArray(post.reactions) ? post.reactions : []);
      toast.error('Không thể thực hiện. Vui lòng thử lại.');
    } finally {
      setIsReacting(false);
    }
  };

  const handleDelete = async () => {
    if (!post.id || !isOwner) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'posts', post.id));
      
      // FIX: Invalidate cache immediately after delete
      try {
        sessionStorage.removeItem('posts:feed');
        logger.log('[PostCard] Cache invalidated after delete');
      } catch (err) {
        logger.warn('[PostCard] Could not invalidate cache:', err);
      }
      
      toast.success('Đã xóa bài viết');
      if (onDelete) onDelete();
    } catch (error) {
      logger.error('Error deleting post:', error);
      toast.error('Không thể xóa bài viết. Vui lòng thử lại.');
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditedContent(displayedContent);
    setEditedImages([...displayedImages]);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent(displayedContent);
    setEditedImages([...displayedImages]);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = 3 - editedImages.length;
    if (remainingSlots <= 0) {
      toast.error('Chỉ được tải tối đa 3 ảnh');
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    
    try {
      const compressedImages = await Promise.all(
        filesToProcess.map(file => compressImage(file))
      );
      
      // Extract dataUrl from CompressedImage objects
      const imageDataUrls = compressedImages.map(img => img.dataUrl);
      
      setEditedImages(prev => [...prev, ...imageDataUrls]);
      toast.success(`Đã thêm ${compressedImages.length} ảnh`);
    } catch (error) {
      logger.error('Error uploading images:', error);
      toast.error('Không thể tải ảnh lên');
    }
  };

  const handleRemoveImage = (index: number) => {
    setEditedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async () => {
    if (!post.id || !isOwner) return;

    // Validation
    if (editedContent.trim().length === 0 && editedImages.length === 0) {
      toast.error('Bài viết phải có nội dung hoặc ảnh');
      return;
    }

    if (editedContent.length > 250) {
      toast.error('Nội dung không được vượt quá 250 ký tự');
      return;
    }

    setIsSaving(true);
    const savedContent = editedContent.trim();
    const savedImages = [...editedImages];
    try {
      const postRef = doc(db, 'posts', post.id);
      await updateDoc(postRef, {
        content: savedContent,
        images: savedImages,
        updatedAt: new Date(),
      });

      // OPTIMISTIC UPDATE: show new content immediately without waiting for Firestore listener
      setDisplayedContent(savedContent);
      setDisplayedImages(savedImages);

      // Invalidate caches so listener re-fires with fresh data
      try {
        sessionStorage.removeItem('posts:feed');
        logger.log('[PostCard] Cache invalidated after edit');
      } catch (err) {
        logger.warn('[PostCard] Could not invalidate cache:', err);
      }

      toast.success('Đã cập nhật bài viết');
      setIsEditing(false);
    } catch (error) {
      logger.error('Error updating post:', error);
      toast.error('Không thể cập nhật bài viết. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  // Tính class variant dựa trên số lượng ảnh để contain-intrinsic-size chính xác
  const cardClass = [
    'post-card',
    post.images?.length === 0 ? 'text-only' : '',
    (post.images?.length ?? 0) > 1 ? 'multi-image' : '',
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={`${cardClass} rounded-2xl p-4 md:p-5 shadow-sm border hover:shadow-md transition-shadow relative overflow-hidden`}
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.6)' : '#ffffff',
        borderColor: theme === 'dark' ? '#374151' : '#e5e7eb'
      }}
    >
      {/* Inline Delete Confirmation Overlay */}
      {showDeleteConfirm && (
        <div 
          className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl gap-3 px-6"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(17, 24, 39, 0.97)' : 'rgba(255, 255, 255, 0.97)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-1">
            <Trash2 className="w-6 h-6 text-red-500" />
          </div>
          <p className="font-bold text-base text-center text-gray-900 dark:text-gray-100">
            Xoá bài viết này?
          </p>
          <p className="text-sm text-center text-gray-500 dark:text-gray-400">
            Hành động này không thể hoàn tác
          </p>
          <div className="flex gap-3 w-full mt-1">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all text-gray-700 dark:text-gray-300"
              style={{
                backgroundColor: theme === 'dark' ? '#374151' : '#f3f4f6',
              }}
            >
              Huỷ
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {isDeleting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Xoá ngay
            </button>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {postUserAvatar ? (
            <img
              src={postAvatarSrc}
              alt={post.userName}
              className="w-10 h-10 rounded-full object-cover"
              referrerPolicy="no-referrer"
              key={avatarTimestamp}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(post.userName || 'U')}&background=8b5cf6&color=fff`;
              }}
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-600 dark:to-blue-600 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-indigo-600 dark:text-white" />
            </div>
          )}
          
          <div>
            <p 
              className="font-bold text-gray-900 dark:text-white"
              style={{
                fontSize: '15px',
                opacity: 1
              }}
            >
              {post.userName}
            </p>
            <p 
              className="text-xs text-gray-600 dark:text-gray-400"
              style={{
                fontSize: '12px',
                opacity: 1
              }}
            >
              {formatTimeAgo(post.createdAt)}
            </p>
          </div>
        </div>

        {/* Edit and Delete buttons for owner */}
        {isOwner && (
          <div className="flex items-center gap-1.5">
            {!isEditing && (
              <button
                onClick={handleEdit}
                className="btn-icon-sm flex items-center gap-1 px-3 py-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors text-xs font-medium"
                title="Sửa bài viết"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sửa</span>
              </button>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className="btn-icon-sm flex items-center gap-1 px-3 py-2 text-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50 text-xs font-medium"
              title="Xóa bài viết"
            >
              {isDeleting ? (
                <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Xóa</span>
            </button>
          </div>
        )}
      </div>

      {/* Content - Edit Mode or Display Mode */}
      {isEditing ? (
        <div className="mb-4 space-y-3">
          {/* Edit Textarea */}
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            maxLength={250}
            className="w-full p-3 rounded-xl border resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : '#ffffff',
              borderColor: theme === 'dark' ? '#4b5563' : '#d1d5db',
              minHeight: '100px'
            }}
            placeholder="Nội dung bài viết..."
          />
          
          {/* Character count */}
          <div className="flex items-center justify-between text-sm">
            <span 
              className={editedContent.length > 250 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}
            >
              {editedContent.length}/250 ký tự
            </span>
          </div>

          {/* Image Management */}
          <div className="space-y-2">
            {/* Current Images */}
            {editedImages.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {editedImages.map((img, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={img}
                      alt={`Ảnh ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    <button
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Image Button */}
            {editedImages.length < 3 && (
              <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                style={{
                  borderColor: theme === 'dark' ? '#4b5563' : '#d1d5db'
                }}
              >
                <ImageIcon className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Thêm ảnh ({editedImages.length}/3)
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveEdit}
              disabled={isSaving || (editedContent.trim().length === 0 && editedImages.length === 0)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Đang lưu...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Lưu
                </>
              )}
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={isSaving}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Display Content */}
          <p 
            className="whitespace-pre-wrap mb-4 leading-relaxed text-gray-900 dark:text-gray-100"
            style={{
              fontSize: '15px',
              fontWeight: '400',
              opacity: 1
            }}
          >
            {displayedContent}
          </p>

          {/* Images - Adaptive Smart Layout */}
          {displayedImages.length > 0 && (
            <AdaptiveImageLayout images={displayedImages} />
          )}
        </>
      )}

      {/* Footer - Reactions & Comments */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
        
        {/* Reactions & Comments Summary */}
        {(totalReactions > 0 || (post.commentCount || 0) > 0) && (
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center">
              {totalReactions > 0 && (
                <button 
                  onClick={() => setShowReactionsModal(true)}
                  className="flex items-center gap-2 group cursor-pointer"
                >
                  <div className="flex -space-x-1.5">
                    {/* Render up to 3 avatars */}
                    {reactions.slice(0, 3).map((r, i) => (
                      r.userAvatar ? (
                        <img 
                          key={i} 
                          src={r.userAvatar} 
                          alt={r.userName}
                          className="w-5 h-5 rounded-full border border-white dark:border-gray-800 object-cover z-[3] group-hover:z-[10] transition-transform group-hover:scale-110"
                          style={{ zIndex: 3 - i }}
                        />
                      ) : (
                        <div 
                          key={i} 
                          className="w-5 h-5 rounded-full border border-white dark:border-gray-800 bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-900 dark:to-blue-900 flex items-center justify-center z-[3] group-hover:z-[10] transition-transform group-hover:scale-110"
                          style={{ zIndex: 3 - i }}
                        >
                          <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400">{r.userName.charAt(0)}</span>
                        </div>
                      )
                    ))}
                  </div>
                  <span className="text-[13px] text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                    {currentUserReaction 
                      ? (totalReactions === 1 
                          ? 'Bạn' 
                          : `Bạn${totalReactions === 2 ? ` và ${reactions.find(r => r.userId !== currentUser.uid)?.userName.split(' ').pop() || '1 người khác'}` : `, ${reactions.find(r => r.userId !== currentUser.uid)?.userName.split(' ').pop() || ''} và ${totalReactions - 2} người khác`}`)
                      : `${reactions[0]?.userName.split(' ').pop()}${totalReactions > 1 ? ` và ${totalReactions - 1} người khác` : ''}`
                    }
                  </span>
                </button>
              )}
            </div>
            
            {(post.commentCount || 0) > 0 && (
              <button 
                onClick={() => setShowComments(!showComments)}
                className="text-[13px] text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                {post.commentCount} bình luận
              </button>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between px-1 pt-1 border-t border-gray-50 dark:border-gray-800/50">
          <div className="flex-1">
            {/* Reaction Button */}
            <ReactionPicker
              onReact={handleReaction}
              currentReaction={currentUserReaction?.type}
            />
          </div>
          
          <div className="flex-1 flex justify-end">
            {/* Comment Button */}
            <button
              onClick={() => setShowComments(!showComments)}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium touch-manipulation"
            >
              <MessageCircle className="w-5 h-5" />
              <span>Bình luận</span>
            </button>
          </div>
        </div>

        {/* Comment Section */}
        {showComments && (
          <MemoizedCommentSection
            key={`comments-${post.id}`}
            postId={post.id!}
            postOwnerId={post.userId}
            currentUser={currentUser}
            onProfileClick={onProfileClick}
          />
        )}
      </div>

      {/* Reactions Modal */}
      <ReactionsModal
        isOpen={showReactionsModal}
        onClose={() => setShowReactionsModal(false)}
        reactions={reactions}
        onProfileClick={onProfileClick}
      />
    </div>
  );
};

// Deep comparison to prevent re-renders when other posts update in the feed
export const PostCard = React.memo(PostCardComponent, (prevProps, nextProps) => {
  // If currentUser uid changes, re-render
  if (prevProps.currentUser.uid !== nextProps.currentUser.uid) return false;
  
  // If post id changes, re-render
  if (prevProps.post.id !== nextProps.post.id) return false;
  
  // Quick checks for common changes
  if (prevProps.post.likeCount !== nextProps.post.likeCount) return false;
  if (prevProps.post.commentCount !== nextProps.post.commentCount) return false;
  if (prevProps.post.content !== nextProps.post.content) return false;

  // Check if images changed (length or any URL changed)
  const prevImages = prevProps.post.images || [];
  const nextImages = nextProps.post.images || [];
  if (prevImages.length !== nextImages.length) return false;
  for (let i = 0; i < prevImages.length; i++) {
    if (prevImages[i] !== nextImages[i]) return false;
  }

  // Check if reactions changed by comparing lengths or stringified versions
  const prevReactions = prevProps.post.reactions || [];
  const nextReactions = nextProps.post.reactions || [];
  if (prevReactions.length !== nextReactions.length) return false;
  
  // Deep equality for the post object as fallback
  // Note: we omit timestamp comparison as it can be tricky with Firebase Timestamp objects
  // but content, counts, and reactions are enough to detect meaningful changes
  return true;
});

// Memoized CommentSection wrapper to prevent re-renders
const MemoizedCommentSection = React.memo(CommentSection, (prevProps, nextProps) => {
  // Only re-render if postId or currentUser changes
  return prevProps.postId === nextProps.postId && 
         prevProps.currentUser.uid === nextProps.currentUser.uid;
});
