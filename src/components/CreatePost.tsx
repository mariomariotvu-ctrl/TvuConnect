import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { db, collection, addDoc, serverTimestamp, doc, onSnapshot, updateDoc } from '../firebase';
import { Send, User as UserIcon, Camera, X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { moderateContent, checkUserSpamHistory, calculateSpamScore, ModerationResult, detectAdvancedSpam } from '../utils/contentModeration';
import { moderateImages, hasBlockedImage, getBlockedReasons } from '../utils/imageModeration';
import { compressImage } from '../utils/imageCompression';
import { isImageBlocked, addToBlacklist } from '../utils/imageHashBlocking';
import { isImageDangerous, analyzeImage } from '../utils/basicImageDetection';
import { checkBanStatus, applyBan, recordViolation, formatTimeRemaining } from '../utils/banSystem';
import { logger } from '../utils/logger';

interface CreatePostProps {
  user: User;
  userProfile: { fullName: string; photoURL?: string } | null;
  onPostCreated?: () => void;
}

const MAX_CONTENT_LENGTH = 250;
const MIN_POST_INTERVAL = 20 * 1000; // 20 giây giữa các bài
const MAX_POSTS_PER_DAY = 7; // 7 bài/ngày, reset vào 00:00
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB sau khi nén
const MAX_IMAGES = 3; // Tối đa 3 ảnh (tối ưu cho Firestore 1MB limit)

export const CreatePost: React.FC<CreatePostProps> = ({ user, userProfile, onPostCreated }) => {
  const { theme } = useTheme();
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [currentUserAvatar, setCurrentUserAvatar] = useState(userProfile?.photoURL || user.photoURL || '');
  const [avatarTimestamp, setAvatarTimestamp] = useState(Date.now());
  const [images, setImages] = useState<string[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Listen to current user's profile for avatar updates
  useEffect(() => {
    const profileRef = doc(db, 'profiles', user.uid);
    const unsubscribe = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        const profileData = docSnap.data();
        const newAvatar = profileData.photoURL || user.photoURL || '';
        if (newAvatar !== currentUserAvatar) {
          setCurrentUserAvatar(newAvatar);
          setAvatarTimestamp(Date.now()); // Force new timestamp when avatar changes
        }
      }
    });

    return () => unsubscribe();
  }, [user.uid, user.photoURL, currentUserAvatar]);

  // Check if avatar is a data URL (base64) - don't add timestamp
  const isDataUrl = currentUserAvatar?.startsWith('data:');
  const avatarSrc = isDataUrl ? currentUserAvatar : `${currentUserAvatar}?t=${avatarTimestamp}`;

  const canPost = (): boolean => {
    // Check last post time (20 seconds cooldown)
    const lastPostTime = localStorage.getItem(`lastPost_${user.uid}`);
    if (lastPostTime) {
      const elapsed = Date.now() - parseInt(lastPostTime);
      if (elapsed < MIN_POST_INTERVAL) {
        const remainingSeconds = Math.ceil((MIN_POST_INTERVAL - elapsed) / 1000);
        toast.error(`Vui lòng đợi ${remainingSeconds} giây nữa để đăng bài tiếp`, { duration: 2000 });
        return false;
      }
    }

    // Check posts today (reset at 00:00)
    const today = new Date().toDateString();
    const postsToday = localStorage.getItem(`postsToday_${user.uid}_${today}`);
    const count = postsToday ? parseInt(postsToday) : 0;
    
    if (count >= MAX_POSTS_PER_DAY) {
      toast.error(`Bạn đã đăng ${MAX_POSTS_PER_DAY} bài hôm nay. Vui lòng thử lại vào ngày mai.`, { duration: 3000 });
      return false;
    }

    return true;
  };

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    // Kiểm tra số lượng ảnh
    const remainingSlots = MAX_IMAGES - images.length;
    if (fileArray.length > remainingSlots) {
      toast.error(`Chỉ còn ${remainingSlots} vị trí trống. Tối đa ${MAX_IMAGES} ảnh/bài viết.`, {
        description: `Bạn đang chọn ${fileArray.length} ảnh`,
        duration: 3000,
      });
      return;
    }

    setCompressing(true);
    const newImages: string[] = [];
    let successCount = 0;

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        
        // Kiểm tra loại file
        if (!file.type.startsWith('image/')) {
          toast.error(`"${file.name}" không phải là ảnh`, { duration: 2000 });
          continue;
        }
        
        // Nén ảnh (1200x1200, quality 0.92 cho chất lượng cao)
        const compressed = await compressImage(file, 1200, 1200, 0.92);
        
        // CHECK: Ảnh có bị block không? (Hash-based blocking)
        // Chỉ chặn ảnh đã được admin xác nhận vi phạm
        if (isImageBlocked(compressed.dataUrl)) {
          recordViolation(user.uid, 'Ảnh bị block');
          const banInfo = applyBan(user.uid);
          
          toast.error(banInfo.message, { 
            description: `${banInfo.description}\n${banInfo.nextPenalty}`,
            duration: 5000
          });
          continue;
        }
        
        // ⚠️ BASIC IMAGE DETECTION TẠM THỜI TẮT
        // Lý do: False positive cao (15-20%) - Chặn nhầm ảnh tối màu bình thường
        // Giải pháp: Dựa vào user report + admin review thay vì tự động chặn
        // 
        // const isDangerous = await isImageDangerous(compressed.dataUrl);
        // if (isDangerous) {
        //   recordViolation(user.uid, 'Ảnh nguy hiểm');
        //   const banInfo = applyBan(user.uid);
        //   toast.error(banInfo.message, { 
        //     description: `${banInfo.description}\n${banInfo.nextPenalty}`,
        //     duration: 5000
        //   });
        //   continue;
        // }
        
        // Kiểm tra kích thước sau nén
        if (compressed.size > MAX_IMAGE_SIZE) {
          toast.error(`"${file.name}" quá lớn sau khi nén`, { duration: 2000 });
          continue;
        }

        newImages.push(compressed.dataUrl);
        successCount++;
      }

      if (successCount > 0) {
        setImages([...images, ...newImages]);
        toast.success(`Đã thêm ${successCount} ảnh thành công! 📸`, { duration: 2000 });
      }
    } catch (error: any) {
      logger.error('Error compressing images:', error);
      toast.error(error.message || 'Không thể xử lý ảnh', { duration: 2000 });
    } finally {
      setCompressing(false);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    await processFiles(files);
    
    // Reset input
    e.target.value = '';
  };

  // Drag & Drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processFiles(files);
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handlePost = async () => {
    // Dismiss all toasts trước khi validate
    toast.dismiss();
    
    // CHECK BAN STATUS TRƯỚC TIÊN
    const banStatus = checkBanStatus(user.uid);
    if (banStatus.isBanned) {
      const timeRemaining = formatTimeRemaining(banStatus.timeRemaining);
      toast.error(banStatus.banInfo!.message, {
        description: `${banStatus.banInfo!.description}\n⏱️ Còn lại: ${timeRemaining}`,
        duration: 5000
      });
      return;
    }
    
    // Validation: Cho phép đăng nếu có content HOẶC có ảnh
    if (!content.trim() && images.length === 0) {
      toast.error('Vui lòng nhập nội dung hoặc chọn ảnh', { duration: 2000 });
      return;
    }

    // Chỉ kiểm tra length nếu có content
    if (content.trim() && content.length > MAX_CONTENT_LENGTH) {
      toast.error(`Nội dung không được vượt quá ${MAX_CONTENT_LENGTH} ký tự`, { duration: 2000 });
      return;
    }

    // Kiểm duyệt nội dung (CHỈ nếu có content)
    let moderation: ModerationResult = { 
      isAllowed: true, 
      severity: 'safe' 
    };
    
    if (content.trim()) {
      moderation = moderateContent(content);
      
      if (!moderation.isAllowed) {
        recordViolation(user.uid, 'Nội dung vi phạm');
        const banInfo = applyBan(user.uid);
        
        toast.error(banInfo.message, {
          description: `${banInfo.description}\n${banInfo.nextPenalty}`,
          duration: 5000
        });
        return;
      }

      // Check advanced spam (bổ sung)
      if (detectAdvancedSpam(content)) {
        recordViolation(user.uid, 'Spam patterns');
        const banInfo = applyBan(user.uid);
        
        toast.error(banInfo.message, {
          description: `${banInfo.description}\n${banInfo.nextPenalty}`,
          duration: 5000
        });
        return;
      }

      if (moderation.warnings && moderation.warnings.length > 0) {
        const spamScore = calculateSpamScore(content);
        if (spamScore > 50) {
          toast.warning('Nội dung có dấu hiệu spam', {
            description: moderation.warnings.join(', '),
            duration: 3000,
          });
        }
      }
    }

    // KIỂM DUYỆT ẢNH - TẠM THỜI TẮT
    // Gemini Vision API cần paid plan, sẽ bật lại sau khi nâng cấp
    // Hiện tại chỉ dựa vào content moderation và user reports
    
    if (!canPost()) {
      return;
    }

    setPosting(true);
    try {
      const docRef = await addDoc(collection(db, 'posts'), {
        userId: user.uid,
        userName: userProfile?.fullName || user.displayName || 'Người dùng',
        userAvatar: currentUserAvatar || userProfile?.photoURL || user.photoURL || '',
        content: content.trim(),
        images: images,
        createdAt: serverTimestamp(),
        likes: [],
        likeCount: 0,
        reactions: [],
        reactionCounts: {
          like: 0,
          love: 0,
          haha: 0,
          wow: 0,
          sad: 0,
          angry: 0,
        },
        moderation: {
          severity: moderation.severity,
          checkedAt: new Date().toISOString(),
          imagesChecked: images.length > 0
        }
      });

      // Update rate limiting
      localStorage.setItem(`lastPost_${user.uid}`, Date.now().toString());
      const today = new Date().toDateString();
      const postsToday = localStorage.getItem(`postsToday_${user.uid}_${today}`);
      const count = postsToday ? parseInt(postsToday) : 0;
      localStorage.setItem(`postsToday_${user.uid}_${today}`, (count + 1).toString());

      // CẬP NHẬT lastPostTime trong profile (cho Firestore Rules)
      try {
        await updateDoc(doc(db, 'profiles', user.uid), {
          lastPostTime: serverTimestamp()
        });
      } catch (error) {
        logger.warn('Could not update lastPostTime:', error);
        // Không block user nếu update fail
      }

      setContent('');
      setImages([]);
      toast.success('Đã đăng bài thành công!', { duration: 2000 });
      
      // Gọi callback để refresh danh sách bài viết
      if (onPostCreated) {
        onPostCreated();
      }
    } catch (error) {
      logger.error('Error creating post:', error);
      toast.error('Không thể đăng bài. Vui lòng thử lại.', { duration: 2000 });
    } finally {
      setPosting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePost();
    }
  };

  return (
    <div 
      className="rounded-3xl shadow-lg border glass-morphism p-4 w-full active-pop"
      style={{
        boxSizing: 'border-box',
      }}
    >
      <div className="flex gap-3" style={{ width: '100%' }}>
        {/* Avatar */}
        <div className="flex-shrink-0">
          {currentUserAvatar ? (
            <img
              src={avatarSrc}
              alt="Avatar"
              className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover"
              referrerPolicy="no-referrer"
              key={avatarTimestamp}
            />
          ) : (
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-600 dark:to-blue-600 flex items-center justify-center">
              <UserIcon className="w-5 h-5 md:w-6 md:h-6 text-indigo-600 dark:text-white" />
            </div>
          )}
        </div>

        {/* Input area - FIX: width 100% với box-sizing */}
        <div style={{ 
          flex: '1 1 0',
          minWidth: 0, // Quan trọng: cho phép flex item shrink
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {/* Drag & Drop Zone */}
          <div
            ref={dropZoneRef}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative transition-all ${
              isDragging ? 'ring-2 ring-indigo-500 ring-offset-2' : ''
            }`}
            style={{ width: '100%', boxSizing: 'border-box' }}
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={images.length > 0 ? "Thêm mô tả cho ảnh (không bắt buộc)..." : "Bạn đang nghĩ gì?"}
              maxLength={MAX_CONTENT_LENGTH}
              rows={3}
              disabled={posting || compressing}
              style={{
                width: '100%', // FIX: 100% width
                boxSizing: 'border-box', // FIX: box-sizing để padding không làm tràn
                padding: '12px 16px', // Padding đồng nhất
                backgroundColor: theme === 'dark' ? 'rgba(17, 24, 39, 0.5)' : '#ffffff',
                color: theme === 'dark' ? '#f3f4f6' : '#000000',
                borderColor: isDragging 
                  ? '#6366f1' 
                  : theme === 'dark' ? '#4b5563' : '#d1d5db',
                fontSize: '16px',
                fontWeight: '400',
                borderWidth: '2px',
                borderStyle: 'solid',
                borderRadius: '12px',
                outline: 'none',
                resize: 'none',
                transition: 'all 0.2s'
              }}
              className="focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
            />
            
            {/* Drag Overlay */}
            {isDragging && (
              <div className="absolute inset-0 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-dashed border-indigo-500 rounded-xl flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Upload className="w-8 h-8 text-indigo-600 dark:text-indigo-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                    Thả ảnh vào đây
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {/* Image Preview - FIX: Căn giữa và loại bỏ khoảng trống */}
          {images.length > 0 && (
            <div 
              className="mt-3 rounded-xl" 
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px',
                backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.5)' : '#f9fafb',
                border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {images.length} ảnh
                  </span>
                </div>
                {images.length === MAX_IMAGES && (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                    Đã đạt giới hạn
                  </span>
                )}
              </div>
              
              {/* FIX: Grid căn giữa với justify-items-center */}
              <div 
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                  justifyItems: 'center',
                  width: '100%'
                }}
              >
                {images.map((img, index) => (
                  <div 
                    key={index} 
                    style={{
                      position: 'relative',
                      width: '100%',
                      paddingBottom: '100%',
                      overflow: 'visible', // FIX: Cho phép nút X hiện ra ngoài
                      borderRadius: '8px'
                    }}
                  >
                    <img
                      src={img}
                      alt={`Ảnh ${index + 1}`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        border: `2px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
                        borderRadius: '8px',
                        pointerEvents: 'none',
                        userSelect: 'none',
                        imageRendering: 'auto', // High quality rendering
                        WebkitBackfaceVisibility: 'hidden',
                        backfaceVisibility: 'hidden'
                      }}
                      draggable={false}
                      loading="lazy"
                    />
                    {/* FIX: Nút X đẹp hơn, không bị khuất */}
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-full shadow-lg transition-all transform hover:scale-110 active:scale-95"
                      disabled={posting}
                      title="Xóa ảnh"
                      style={{
                        position: 'absolute',
                        top: '-6px',
                        right: '-6px',
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        border: `2px solid ${theme === 'dark' ? '#1f2937' : '#ffffff'}`,
                        zIndex: 20
                      }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Action Bar - FIX: Không cho xuống hàng, nút cân đối */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '12px',
              gap: '8px',
              flexWrap: 'nowrap', // FIX: Không cho xuống hàng
              width: '100%',
              boxSizing: 'border-box'
            }}
          >
            {/* Left side: Character count + Image button */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              flex: '1 1 auto',
              minWidth: 0
            }}>
              {/* Character Count */}
              <span 
                className={`text-xs font-medium ${
                  content.length > MAX_CONTENT_LENGTH * 0.9 
                    ? 'text-orange-600 dark:text-orange-400' 
                    : 'text-gray-500 dark:text-gray-400'
                }`}
                style={{ whiteSpace: 'nowrap' }}
              >
                {content.length}/{MAX_CONTENT_LENGTH}
              </span>
              
              {/* Image Upload Button - FIX: Thu nhỏ trên mobile */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                disabled={posting || compressing || images.length >= MAX_IMAGES}
                className="hidden"
              />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={posting || compressing || images.length >= MAX_IMAGES}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px', // FIX: Thu nhỏ padding
                  borderRadius: '10px',
                  fontSize: '14px', // FIX: Thu nhỏ font
                  fontWeight: '600',
                  border: 'none',
                  cursor: posting || compressing || images.length >= MAX_IMAGES ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                  background: posting || compressing || images.length >= MAX_IMAGES
                    ? theme === 'dark' ? '#374151' : '#f3f4f6'
                    : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  color: posting || compressing || images.length >= MAX_IMAGES
                    ? theme === 'dark' ? '#6b7280' : '#9ca3af'
                    : '#ffffff',
                  opacity: posting || compressing || images.length >= MAX_IMAGES ? 0.5 : 1,
                  boxShadow: posting || compressing || images.length >= MAX_IMAGES 
                    ? 'none' 
                    : '0 2px 8px rgba(99, 102, 241, 0.3)'
                }}
                title={images.length >= MAX_IMAGES ? `Đã đạt giới hạn ${MAX_IMAGES} ảnh` : 'Thêm ảnh'}
              >
                {compressing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span className="hidden sm:inline">Xử lý...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>
                      {images.length > 0 ? `${images.length}/${MAX_IMAGES}` : 'Ảnh'}
                    </span>
                  </>
                )}
              </button>
            </div>
            
            {/* Post Button - FIX: Không bị đẩy tràn + Touch-friendly */}
            <button
              onClick={handlePost}
              onTouchEnd={(e) => {
                // Fix cho mobile: Xử lý touch event
                e.preventDefault();
                if (!(!content.trim() && images.length === 0) && !posting && !compressing && content.length <= MAX_CONTENT_LENGTH) {
                  handlePost();
                }
              }}
              disabled={(!content.trim() && images.length === 0) || posting || compressing || content.length > MAX_CONTENT_LENGTH}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 20px',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #3b82f6 100%)',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '15px',
                borderRadius: '10px',
                border: 'none',
                cursor: (!content.trim() && images.length === 0) || posting || compressing || content.length > MAX_CONTENT_LENGTH ? 'not-allowed' : 'pointer',
                opacity: (!content.trim() && images.length === 0) || posting || compressing || content.length > MAX_CONTENT_LENGTH ? 0.5 : 1,
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)',
                whiteSpace: 'nowrap',
                flexShrink: 0, // FIX: Không cho shrink
                touchAction: 'manipulation', // FIX: Tối ưu cho touch
                WebkitTapHighlightColor: 'transparent', // FIX: Bỏ highlight trên iOS
                userSelect: 'none', // FIX: Không cho select text
                zIndex: 10 // FIX: Đảm bảo nút luôn ở trên
              }}
            >
              {posting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Đăng</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Đăng</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
