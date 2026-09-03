import React, { useState, useEffect, useRef, useTransition, useLayoutEffect, useCallback, Suspense } from 'react';
import { auth, onAuthStateChanged, User, db, collection, query, where, onSnapshot, orderBy, limit, getDoc, doc, updateDoc, serverTimestamp, signOut, handleFirestoreError, OperationType, getDocs } from './firebase';
import { Auth } from './components/Auth';
import { ThemeToggle } from './components/ThemeToggle';
import { TermsModal } from './components/TermsModal';
import { NotificationPermission } from './components/NotificationPermission';
import { FeedbackModal } from './components/FeedbackModal';
import { useFeedbackPrompt } from './hooks/useFeedbackPrompt';
import { useTheme } from './contexts/ThemeContext';
import { StudentProfile, View, Message } from './types';
import { Sparkles, User as UserIcon, Home, Heart, Search, Users, MessageSquare, Zap, BookOpen, Smile, Settings as SettingsIcon, FileText, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Logo } from './components/Logo';
import { toast } from 'sonner';
import { quotaManager } from './utils/quotaManager';

import { ProfileCompletionBanner } from './components/ProfileCompletionBanner';
import { InstallPrompt } from './components/InstallPrompt';
import { QuotaExceededBanner } from './components/QuotaExceededBanner';
import { validateProfile, RESTRICTED_FEATURES, PUBLIC_FEATURES } from './utils/profileValidation';
import { setupForegroundListener, getFCMToken } from './utils/fcm';
import { showNotification, formatMessageNotification, handleNotificationClick } from './utils/notifications';
import { onlineStatusManager } from './utils/onlineStatusManager';

// Lazy-loaded components for code splitting
import { 
  LazyProfileForm, 
  LazyMatching, 
  LazyChat, 
  LazyConversationsList, 
  LazyProfileCard, 
  LazySettings, 
  LazyPostsList, 
  LazyMapView, 
  LazyDocumentRepository,
  LazyOnboardingTour
} from './routes/lazyRoutes';
import { RouteLoader } from './components/RouteLoader';
import { preloadCriticalRoutes, createPreloadHandlers } from './utils/routePreloader';
import { getCachedData, setCachedData } from './utils/cacheManager';
import { logger } from '@/utils/logger';
import { performanceMonitor } from './utils/performance';
export default function App() {
  const { theme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('home');
  const [isPending, startTransition] = useTransition();
  const [matchedProfile, setMatchedProfile] = useState<StudentProfile | null>(null);
  const [chatReceiverUid, setChatReceiverUid] = useState<string | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<StudentProfile | null>(null);
  const [matchingMode, setMatchingMode] = useState<'lover' | 'study' | 'quick' | 'hobby' | null>(null);
  const initialLoadRef = useRef(true);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true); // Track profile loading state
  const [profileValidation, setProfileValidation] = useState({ 
    isComplete: true, // Default to true to prevent flash during loading
    missingFields: [] as string[], 
    missingFieldsVN: [] as string[] 
  });

  // Feedback prompt hook
  const { 
    currentMatch, 
    pendingCount, 
    dismissCurrent, 
    completeCurrent 
  } = useFeedbackPrompt(user?.uid || '');

  // Use quotaManager to track state
  useEffect(() => {
    const checkQuota = () => {
      if (quotaManager.isQuotaExceeded()) {
        setQuotaExceeded(true);
      }
    };
    
    checkQuota();
    // Check every hour
    const interval = setInterval(checkQuota, 3600000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Task 12.3: Integrate PerformanceMonitor into App
   *
   * Đo thời gian load ban đầu ngay khi App mount, sau đó thiết lập kiểm tra
   * metric định kỳ mỗi 60 giây thông qua performanceMonitor.
   * Requirements: 10.1
   */
  useEffect(() => {
    // Đo initial load time khi component mount
    const loadTime = performance.now();
    logger.log('[Performance] Initial load time:', loadTime.toFixed(0) + 'ms');

    // Kiểm tra metric định kỳ mỗi 60 giây — lightweight, chỉ log khi vượt threshold
    const metricsInterval = setInterval(() => {
      const summary = performanceMonitor.getSummary();
      // Chỉ log nếu có metric nào vượt ngưỡng đáng chú ý
      if (summary.load.average > 2500 || summary.render.average > 100 || summary.interaction.average > 300) {
        logger.log('[Performance] Metric exceeds threshold:', summary);
      }
    }, 60000);

    return () => clearInterval(metricsInterval);
  }, []); // empty deps: chỉ chạy 1 lần khi mount

  /**
   * Task 6.2: Cache Warming on App Startup
   * 
   * Pre-load top 20 places into sessionStorage cache before user navigates to explore
   * This reduces initial load time when user first accesses the explore feature
   * 
   * Requirements: 6.2, 6.3
   */
  useEffect(() => {
    const warmCache = async () => {
      try {
        // Only warm cache once per session
        const cacheKey = 'places:top';
        const existingCache = sessionStorage.getItem(cacheKey);
        
        if (existingCache) {
          logger.log('[CacheWarming] Cache already warmed, skipping');
          return;
        }
        
        // Pre-load top 20 places by rating
        const placesQuery = query(
          collection(db, 'places'),
          orderBy('rating', 'desc'),
          limit(20)
        );
        
        const placesSnapshot = await getDocs(placesQuery);
        const places = placesSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        }));
        
        // Store in sessionStorage with 5 minute TTL
        const cacheData = {
          data: places,
          timestamp: Date.now(),
          ttl: 300000, // 5 minutes
        };
        
        sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
        
        logger.log('[CacheWarming] Pre-loaded top 20 places into cache', {
          placesCount: places.length,
          cacheKey,
        });
      } catch (error) {
        // Silently fail cache warming - không ảnh hưởng đến UX
        logger.warn('[CacheWarming] Failed to warm cache:', error);
      }
    };
    
    // Warm cache after a short delay to prioritize critical startup tasks
    const warmTimeout = setTimeout(warmCache, 1000);
    
    return () => clearTimeout(warmTimeout);
  }, []);

  // Show quota warning once
  /* useEffect(() => {
    if (quotaExceeded) {
      toast.warning('Hệ thống đang bảo trì (Hết hạn mức Firestore). Một số tính năng có thể bị giới hạn. Vui lòng thử lại sau 7:00 sáng mai.', {
        duration: 8000,
        id: 'quota-warning',
      });
    }
  }, [quotaExceeded]); */

  /**
   * Task 9.1: Preload routes sớm hơn — không đợi profile load xong
   * Bug_Condition: isFirstVisit = true AND lazyComponent.isLoaded = false AND loadTime > 500ms
   * Expected_Behavior: Lazy component bắt đầu render ≤ 500ms nhờ preload sớm
   * Requirements: 2.6
   */
  useEffect(() => {
    // Preload critical routes ngay sau khi app mount, KHÔNG đợi profile
    // Chạy sau 1000ms để nhường CPU cho critical startup path
    const timer = setTimeout(preloadCriticalRoutes, 1000);
    return () => clearTimeout(timer);
  }, []); // QUAN TRỌNG: empty deps — không đợi profile

  /**
   * Task 9.5: Visual Viewport listener cho CSS variable --visual-viewport-height
   * Bug_Condition: iOS Safari keyboard visible AND containerHeightUnit = 'vh'
   * Expected_Behavior: --visual-viewport-height luôn phản ánh chiều cao viewport thực
   * Requirements: 2.7
   *
   * Cập nhật CSS variable theo Visual Viewport API để Chat container tính đúng chiều cao
   * khi keyboard ảo xuất hiện/ẩn trên iOS Safari và Android Chrome.
   */
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      document.documentElement.style.setProperty('--visual-viewport-height', `${vv.height}px`);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update(); // initial call để set giá trị ngay khi mount

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []); // empty deps: đăng ký 1 lần khi mount, cleanup khi unmount

  /**
   * Task 9.1: Intent-based preloading khi hover/focus nav buttons
   * Preload component tương ứng khi user có intent điều hướng
   */
  const handleNavHover = useCallback((targetView: string) => {
    const preloadMap: Record<string, () => Promise<any>> = {
      posts: () => import('./components/PostsList'),
      chat: () => import('./components/Chat'),
      explore: () => import('./components/MapView'),
      conversations: () => import('./components/ConversationsList'),
      documents: () => import('./components/DocumentRepository'),
      matching: () => import('./components/Matching'),
    };
    preloadMap[targetView]?.();
  }, []);

  // Helper function to check if profile is complete
  // Sử dụng utility function mới để có thông tin chi tiết
  const checkProfileCompletion = (profile: StudentProfile | null) => {
    const validation = validateProfile(profile);
    setProfileValidation(validation);
    setProfileComplete(validation.isComplete);
    return validation.isComplete;
  };

  /**
   * Task 9.3: Sửa hamburger menu đóng ngay khi tap ngoài (không delay)
   * Bug_Condition: menuOpen = true AND tapTarget NOT IN menuElement AND menuCloseDelay > 0
   * Expected_Behavior: Menu đóng < 50ms sau touchstart ngoài menu
   * Requirements: 2.12
   *
   * Thay setTimeout 100ms + click listener bằng touchstart listener đăng ký ngay lập tức.
   * Dùng { passive: true } để không block scrolling trên mobile.
   */
  // Sync mobile menu state with CSS for translation widget movement
  useEffect(() => {
    if (showMobileMenu) {
      document.documentElement.classList.add('mobile-menu-open');

      const handleTouchOutside = (e: TouchEvent) => {
        const target = e.target as HTMLElement;
        const menu = document.getElementById('mobile-menu-container');
        // Đóng ngay lập tức khi touchstart ngoài menu và không phải nút toggle
        if (menu && !menu.contains(target) && !target.closest('[data-menu-toggle]')) {
          setShowMobileMenu(false);
        }
      };

      // Dùng touchstart thay vì click để phản hồi ngay — không có delay
      // passive: true để không block scrolling trên mobile
      document.addEventListener('touchstart', handleTouchOutside, { passive: true });

      return () => {
        document.removeEventListener('touchstart', handleTouchOutside);
        document.documentElement.classList.remove('mobile-menu-open');
      };
    } else {
      document.documentElement.classList.remove('mobile-menu-open');
    }
  }, [showMobileMenu]);

  // Add is-logged-in class when user is authenticated
  useEffect(() => {
    if (user) {
      document.documentElement.classList.add('is-logged-in');
    } else {
      document.documentElement.classList.remove('is-logged-in');
    }
  }, [user]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      sessionStorage.removeItem('has_reloaded_login');
      // Use window.location.reload() for a clean state
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleAcceptTerms = () => {
    if (!user) return;
    
    // Save acceptance to localStorage
    localStorage.setItem(`terms_accepted_${user.uid}`, new Date().toISOString());
    setHasAcceptedTerms(true);
    setShowTermsModal(false);
    
    toast.success('Cảm ơn bạn đã đồng ý với điều khoản!', {
      duration: 3000,
    });
    
    // Check if user wants to see onboarding tour
    const hasSeenTour = localStorage.getItem(`onboarding_seen_${user.uid}`);
    if (!hasSeenTour) {
      setTimeout(() => {
        setShowOnboarding(true);
      }, 1000);
    }
    
    // Continue with profile check
    if (!hasProfile) {
      setView('profile');
    } else {
      // Re-validate profile completion if it exists
      const isComplete = checkProfileCompletion(currentProfile);
      if (!isComplete) {
        setView('profile');
      }
    }
  };

  const handleDeclineTerms = async () => {
    toast.error('Bạn cần đồng ý với điều khoản để sử dụng TVU Connect', {
      duration: 4000,
    });
    
    // Log out user
    try {
      await signOut(auth);
      sessionStorage.removeItem('has_reloaded_login');
      setShowTermsModal(false);
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const prevUserRef = useRef<User | null>(null);
  const viewRef = useRef<View>(view);
  const chatReceiverUidRef = useRef<string | null>(chatReceiverUid);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    chatReceiverUidRef.current = chatReceiverUid;
  }, [chatReceiverUid]);

  // Safety timeout for loading screen - prevent infinite loading
  useEffect(() => {
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        logger.warn('⚠️ Loading timeout - forcing load completion');
        setLoading(false);
        // If still no user after timeout, show home page
        if (!user) {
          setView('home');
        }
      }
    }, 8000); // 8 seconds max loading time

    return () => clearTimeout(loadingTimeout);
  }, [loading, user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // Check if this is a fresh login transition
      if (user && !prevUserRef.current) {
        // Use sessionStorage to mark that we've already reloaded for this auth event
        const loginToken = sessionStorage.getItem('has_reloaded_login');
        if (loginToken !== user.uid) {
          sessionStorage.setItem('has_reloaded_login', user.uid);
          setUser(user);
          setLoading(false);

          // FOR MOBILE: We must wait a bit longer to ensure Persistence is saved before reloading
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
          const delay = isMobile ? 1200 : 200;

          setTimeout(() => {
            window.location.reload();
          }, delay);
          return;
        }
      }

      prevUserRef.current = user;
      setUser(user);
      setLoading(false);

      if (!user) {
        setView('home');
        setHasProfile(false);
        setIsLoadingProfile(false); // No user = not loading
        sessionStorage.removeItem('has_reloaded_login');
        initialLoadRef.current = true;
      } else {
        initialLoadRef.current = false;
        setIsLoadingProfile(true); // Start loading profile
        
        // ⚡ INSTANT terms check from localStorage - no network needed!
        // This shows TermsModal immediately without waiting for Firestore
        const termsAcceptedEarly = localStorage.getItem(`terms_accepted_${user.uid}`);
        if (!termsAcceptedEarly) {
          // Show terms modal instantly - profile fetch runs in background
          setShowTermsModal(true);
        } else {
          setHasAcceptedTerms(true);
        }
        
        // Fetch profile from Firestore in parallel (background)
        const checkProfile = async () => {
          try {
            // Cache-first: kiểm tra cache trước để validate nhanh, tránh redirect sai
            const cacheConfig = { key: `profile_${user.uid}`, ttl: 10 * 60 * 1000, storage: 'localStorage' as const };
            const cachedProfile = getCachedData<StudentProfile>(cacheConfig);
            if (cachedProfile) {
              // Validate từ cache ngay lập tức — không đợi Firestore
              const cachedValidation = validateProfile(cachedProfile);
              if (cachedValidation.isComplete) {
                setCurrentProfile(cachedProfile);
                setHasProfile(true);
                setProfileValidation(cachedValidation);
                setProfileComplete(true);
                // Không setIsLoadingProfile(false) vì vẫn cần verify với Firestore
              }
            }

            const docSnap = await getDoc(doc(db, 'profiles', user.uid));
            if (docSnap.exists()) {
              const profileData = docSnap.data() as StudentProfile;

              // Merge Firestore với cache: Firestore là source of truth,
              // nhưng field nào Firestore thiếu thì lấy từ cache (tránh redirect sai)
              const mergedProfile: StudentProfile = cachedProfile
                ? { ...cachedProfile, ...profileData }
                : profileData;

              setCurrentProfile(mergedProfile);
              setHasProfile(true);

              // Cập nhật cache với data merged mới nhất
              try { setCachedData(cacheConfig, mergedProfile); } catch (_) {}
              
              // Terms already checked above via localStorage - skip duplicate check
              const termsAccepted = localStorage.getItem(`terms_accepted_${user.uid}`);
              if (!termsAccepted) {
                setIsLoadingProfile(false);
                return; // Terms modal already shown, wait for user to accept
              }
              
              // Check if profile is complete
              const validation = validateProfile(mergedProfile);
              setProfileValidation(validation);
              setProfileComplete(validation.isComplete);
              setIsLoadingProfile(false);
              
              // Preload critical routes after successful login
              preloadCriticalRoutes();
              
              // If profile incomplete, force to profile view
              if (!validation.isComplete) {
                setView('profile');
                toast.warning(`Vui lòng cập nhật: ${validation.missingFieldsVN.join(', ')}`, {
                  duration: 5000,
                });
              }
            } else {
              // No profile yet
              const termsAccepted = localStorage.getItem(`terms_accepted_${user.uid}`);
              if (!termsAccepted) {
                setIsLoadingProfile(false);
                return; // Terms modal already shown
              }
              setIsLoadingProfile(false);
              setView('profile');
            }
          } catch (error) {
            if (error instanceof Error && (error.message.includes('resource-exhausted') || error.message.includes('Quota'))) {
              setQuotaExceeded(true);
            }
            handleFirestoreError(error, OperationType.GET, `profiles/${user.uid}`, true);
            setIsLoadingProfile(false);
          }
        };
        checkProfile();
      }
    });
    return () => unsubscribe();
  }, []);

  // Guard against accessing features without complete profile
  useEffect(() => {
    if (!user || !hasProfile) return;
    
    // Nhóm tính năng Khóa (Restricted) - cần profile hoàn chỉnh
    const restrictedViews = Object.keys(RESTRICTED_FEATURES);
    
    if (restrictedViews.includes(view) && !profileComplete) {
      const featureName = RESTRICTED_FEATURES[view as keyof typeof RESTRICTED_FEATURES];
      toast.error(`🔒 ${featureName} đang bị khóa. Vui lòng hoàn thiện hồ sơ!`, {
        duration: 4000,
        description: `Còn thiếu: ${profileValidation.missingFieldsVN.join(', ')}`,
      });
      setView('profile');
    }
  }, [view, profileComplete, user, hasProfile, profileValidation]);

  // Online Status Tracker
  useEffect(() => {
    if (!user || !hasProfile) return;

    // Start tracking online status
    onlineStatusManager.startHeartbeat(user.uid);

    // Handle visibility change
    const handleVisibilityChange = () => {
      onlineStatusManager.handleVisibilityChange(user.uid);
    };

    // Handle before unload (user closing tab/browser)
    const handleBeforeUnload = () => {
      onlineStatusManager.setOffline(user.uid);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      onlineStatusManager.cleanup(user.uid);
    };
  }, [user, hasProfile]);


  // Listener for new messages - Only when on relevant views
  useEffect(() => {
    if (!user) return;
    
    const q = query(
      collection(db, 'messages'),
      where('participants', 'array-contains', user.uid),
      where('receiverUid', '==', user.uid),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      // Logic inside listener uses refs to get latest state without re-triggering subscription
      const currentView = viewRef.current;
      const currentChatReceiver = chatReceiverUidRef.current;

      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        return;
      }

      if (snapshot.empty) return;

      // Only listen when on conversations or chat view to save resources or home
      if (currentView !== 'conversations' && currentView !== 'chat' && currentView !== 'home') return;

      const newMsg = snapshot.docs[0].data() as Message;

      // Don't notify if we are currently chatting with this person
      if (currentView === 'chat' && currentChatReceiver === newMsg.senderUid) {
        return;
      }

      try {
        const senderDoc = await getDoc(doc(db, 'profiles', newMsg.senderUid));
        const senderName = senderDoc.exists() ? senderDoc.data().fullName : 'Người dùng TVU';

        const toastId = toast.info(`Bạn có tin nhắn mới`, {
          description: `Từ: ${senderName}`,
          action: {
            label: 'Xem ngay',
            onClick: () => {
              setChatReceiverUid(newMsg.senderUid);
              setView('chat');
              toast.dismiss(toastId);
            }
          },
          duration: 5000,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `profiles/${newMsg.senderUid}`, true);
      }
    }, (error) => {
      // Silently handle permission errors and quota errors for global listeners to avoid console noise
      handleFirestoreError(error, OperationType.LIST, 'messages', true);
    });

    return () => unsubscribe();
  }, [user]);

  const handleProfileSave = useCallback((profile: StudentProfile) => {
    setCurrentProfile(profile);
    setHasProfile(true);
    
    // Check if profile is now complete
    const validation = validateProfile(profile);
    setProfileValidation(validation);
    setProfileComplete(validation.isComplete);
    
    if (validation.isComplete) {
      // Clear localStorage flag để banner có thể hiện lại nếu cần
      if (user) {
        localStorage.removeItem(`profile_banner_dismissed_${user.uid}`);
      }
      setView('matching');
      toast.success('🎉 Hồ sơ đã hoàn thành! Bạn có thể sử dụng mọi tính năng.', {
        duration: 3000,
      });
    } else {
      toast.error(`Vui lòng cập nhật: ${validation.missingFieldsVN.join(', ')}`, {
        duration: 5000,
      });
    }
  }, [user]);

  // Guard function to check profile completion before navigation (Feature Gating)
  const canAccessFeature = useCallback((): boolean => {
    if (!profileComplete) {
      toast.error('🔒 Tính năng đang bị khóa', {
        duration: 4000,
        description: `Vui lòng cập nhật: ${profileValidation.missingFieldsVN.join(', ')}`,
      });
      setView('profile');
      return false;
    }
    return true;
  }, [profileComplete, profileValidation.missingFieldsVN]);

  const handleViewChange = useCallback((newView: View) => {
    // Nhóm tính năng Mở (Public): luôn cho phép truy cập
    const publicViews = Object.keys(PUBLIC_FEATURES);

    /**
     * Task 9.2: Push history state cho sub-views để Android Back button hoạt động đúng
     * FIX: Mở rộng danh sách views được push history — bao gồm tất cả main views
     * để Android Back luôn về home thay vì đóng app
     */
    // Tất cả views đều push history state để Back button hoạt động đúng trên Android
    // Sub-views (chat, results, settings, profile) push vì là "cấp 2"
    // Main views (matching, conversations, posts, explore, documents) cũng push
    // để Back từ các màn hình này về home thay vì thoát app
    const allNavigableViews: View[] = [
      'chat', 'results', 'settings', 'profile',
      'matching', 'conversations', 'posts', 'explore', 'documents'
    ];
    if (allNavigableViews.includes(newView)) {
      window.history.pushState({ view: newView }, '', `#${newView}`);
    }

    if (publicViews.includes(newView)) {
      startTransition(() => {
        setView(newView);
      });
      return;
    }
    
    // Nhóm tính năng Khóa (Restricted): cần profile hoàn chỉnh
    const restrictedViews = Object.keys(RESTRICTED_FEATURES);
    
    if (restrictedViews.includes(newView)) {
      if (canAccessFeature()) {
        setView(newView);
      }
      // Nếu không pass, canAccessFeature đã tự động chuyển về profile
    } else {
      setView(newView);
    }
  }, [canAccessFeature]);

  /**
   * Task 9.2: Lắng nghe popstate để xử lý Android Back button đúng cách
   * FIX: Thêm kiểm tra auth và profile trước khi navigate qua history
   */
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as { view?: View } | null;

      if (state?.view) {
        const targetView = state.view;
        const restrictedViews = Object.keys(RESTRICTED_FEATURES) as View[];

        // Nếu view restricted mà chưa đủ điều kiện → redirect về profile
        if (restrictedViews.includes(targetView)) {
          if (!user) {
            setView('home');
            return;
          }
          if (!profileComplete) {
            setView('profile');
            return;
          }
        }

        // Nếu đang ở home mà Back → giữ ở home, không pop nữa
        if (targetView === 'home' || !user) {
          setView('home');
          window.history.pushState({ view: 'home' }, '', '#home');
          return;
        }

        setView(targetView);
      } else {
        // Không có state (history đã hết) → về home
        setView('home');
        window.history.pushState({ view: 'home' }, '', '#home');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user, profileComplete]); // deps: cần user và profileComplete để guard đúng

  const handleMatchFound = useCallback((profile: StudentProfile) => {
    setMatchedProfile(profile);
    startTransition(() => {
      setView('results');
    });
  }, []);

  const handleStartChat = useCallback((uid: string) => {
    setChatReceiverUid(uid);
    startTransition(() => {
      setView('chat');
    });
  }, []);

  /**
   * Task 9.4: Sửa useLayoutEffect cancel scroll animation triệt để
   * Bug_Condition: tabClicked = true AND isScrolling = true AND scrollAnimation.cancelled = false
   * Expected_Behavior: scrollTop = 0 ngay lập tức, mọi animation bị cancel
   * Requirements: 2.13
   *
   * Thêm document.documentElement.scrollTop = 0 và document.body.scrollTop = 0 TRƯỚC scrollTo
   * để force cancel mọi scroll animation đang chạy trên iOS Safari.
   * Sau đó reset tất cả scroll containers có class overflow-y-auto, overflow-auto, [data-scroll-container].
   */
  useLayoutEffect(() => {
    if (!isPending) {
      // Cancel any ongoing scroll bằng cách set scrollTop trực tiếp trước
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      // Sau đó mới dùng scrollTo để đảm bảo tương thích cross-browser
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

      // Reset tất cả scroll containers
      const containers = document.querySelectorAll<HTMLElement>(
        '.overflow-y-auto, .overflow-auto, [data-scroll-container]'
      );
      containers.forEach(el => { el.scrollTop = 0; });
    }
  }, [view, isPending]);

  const renderView = () => {
    if (!user) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] md:min-h-[80vh] text-center px-5 py-10 relative">
          {/* Subtle Background Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-r from-violet-200/30 to-blue-200/30 rounded-full blur-[100px] pointer-events-none"></div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex flex-col items-center gap-8 md:gap-10 relative z-10"
          >
            <Logo size="xl" showText={true} />

            {/* Slogan */}
            <p className="text-base md:text-lg font-bold leading-relaxed max-w-lg mx-auto px-2 text-slate-800 dark:text-gray-200/90 tracking-wide" style={{ color: '#1e293b', WebkitTextFillColor: '#1e293b' }}>
              "Nền tảng giúp sinh viên Đại học Trà Vinh tìm kiếm bạn bè, nhóm học tập và những người cùng sở thích."
            </p>

            {/* Login Button */}
            <div className="mt-2">
              <Auth user={user} loading={loading} />
            </div>
          </motion.div>
        </div>
      );
    }

    switch (view) {
      case 'profile':
        return (
          <RouteLoader minHeight="min-h-[500px]">
            <LazyProfileForm user={user} onSave={handleProfileSave} />
          </RouteLoader>
        );
      case 'matching':
        return (
          <RouteLoader minHeight="min-h-[600px]">
            <LazyMatching currentUser={user} onMatchFound={handleMatchFound} mode={matchingMode || 'quick'} />
          </RouteLoader>
        );
      case 'chat':
        return chatReceiverUid ? (
          <RouteLoader minHeight="min-h-[500px]">
            <LazyChat
              receiverUid={chatReceiverUid}
              onBack={() => setView('conversations')}
            />
          </RouteLoader>
        ) : null;
      case 'conversations':
        return (
          <RouteLoader minHeight="min-h-[500px]">
            <LazyConversationsList onStartChat={handleStartChat} onNewChat={() => setView('matching')} />
          </RouteLoader>
        );
      case 'settings':
        return user ? (
          <RouteLoader minHeight="min-h-[400px]">
            <LazySettings user={user} onLogout={handleLogout} onShowBlockedList={() => setView('profile')} onShowTour={() => {
          // Clear the seen flag so tour can run again
          if (user) {
            localStorage.removeItem(`onboarding_seen_${user.uid}`);
          }
          
          // Navigate to home first so nav elements are visible
          setView('home');
          
          // Wait for the home view to render, then start the tour
          // OnboardingTour handles its own element polling internally
          const isMobile = window.innerWidth < 768;
          const delay = isMobile ? 600 : 300;
          
          setTimeout(() => {
            setShowOnboarding(true);
          }, delay);
        }} />
          </RouteLoader>
        ) : null;
      case 'posts':
        return user ? (
          <RouteLoader minHeight="min-h-[500px]">
            <LazyPostsList 
              currentUser={user} 
              userProfile={currentProfile}
              onProfileClick={async (userId) => {
              try {
                // Fetch the user's profile
                const profileRef = doc(db, 'profiles', userId);
                const profileSnap = await getDoc(profileRef);
                
                if (profileSnap.exists()) {
                  const profile = { uid: userId, ...profileSnap.data() } as StudentProfile;
                  setMatchedProfile(profile);
                  setView('results');
                } else {
                  toast.error('Không tìm thấy hồ sơ người dùng');
                }
              } catch (error) {
                console.error('Error fetching profile:', error);
                toast.error('Không thể tải hồ sơ');
              }
            }}
          />
          </RouteLoader>
        ) : null;
      case 'explore':
        return user ? (
          <RouteLoader minHeight="min-h-[600px]">
            <LazyMapView currentUser={user} onProfileClick={async (uid) => {
              try {
                // Fetch the user's profile
                const profileRef = doc(db, 'profiles', uid);
                const profileSnap = await getDoc(profileRef);
                
                if (profileSnap.exists()) {
                  const profile = { uid: uid, ...profileSnap.data() } as StudentProfile;
                  setMatchedProfile(profile);
                  setView('results');
                } else {
                  toast.error('Không tìm thấy hồ sơ người dùng');
                }
              } catch (error) {
                console.error('Error fetching profile:', error);
                toast.error('Không thể tải hồ sơ');
              }
            }} />
          </RouteLoader>
        ) : null;
      case 'documents':
        return user ? (
          <RouteLoader minHeight="min-h-[500px]">
            <LazyDocumentRepository 
              currentUser={user}
              onProfileClick={async (userId) => {
              try {
                // Fetch the user's profile
                const profileRef = doc(db, 'profiles', userId);
                const profileSnap = await getDoc(profileRef);
                
                if (profileSnap.exists()) {
                  const profile = { uid: userId, ...profileSnap.data() } as StudentProfile;
                  setMatchedProfile(profile);
                  setView('results');
                } else {
                  toast.error('Không tìm thấy hồ sơ người dùng');
                }
              } catch (error) {
                console.error('Error fetching profile:', error);
                toast.error('Không thể tải hồ sơ');
              }
            }}
          />
          </RouteLoader>
        ) : null;
      case 'results':
        return matchedProfile ? (
          <RouteLoader minHeight="min-h-[400px]">
            <div className="flex flex-col items-center w-full max-w-xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-3xl font-black text-gray-900 mb-2">Kết quả ghép cặp!</h2>
                <p className="text-gray-500">Chúng tôi đã tìm thấy một người bạn thú vị cho bạn</p>
              </div>
              <LazyProfileCard
                profile={matchedProfile}
                onRematch={() => setView('matching')}
                onStartChat={handleStartChat}
              />
              <button
                onClick={() => handleViewChange('conversations')}
                className="mt-8 heading-gradient-text font-bold hover:opacity-80 flex items-center gap-2 transition-opacity"
              >
                <Users className="w-4 h-4" />
                Xem danh sách trò chuyện
              </button>
            </div>
          </RouteLoader>
        ) : (
          <div className="text-center">
            <p>Không có kết quả. Vui lòng thử lại.</p>
            <button onClick={() => setView('matching')} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-full">Quay lại</button>
          </div>
        );
      case 'home':
      default:
        return (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-center"
          >
            {/* Left Column: Welcome Text + Buttons */}
            <div className="space-y-5 md:space-y-8 text-center md:text-left">
              <h1 className="text-3xl md:text-6xl font-black leading-[1.15] tracking-tight" style={{ WebkitTextFillColor: 'initial' }}>
                <span style={{ WebkitTextFillColor: 'initial' }}>
                  Chào mừng bạn đến với
                </span>
                <br className="hidden md:block" />
                <span className="heading-gradient-text">
                  TVU Connect
                </span>
              </h1>
              {/* Reset WebkitTextFillColor for all siblings after gradient heading — Safari iOS fix */}
              <div style={{ WebkitTextFillColor: 'initial', color: 'inherit' }}>
              {profileComplete ? (
                <>
                  <p className="home-welcome-text text-base md:text-lg leading-relaxed font-medium tracking-wide text-center md:text-left max-w-xs mx-auto md:mx-0 md:max-w-sm mb-2">
                    Hồ sơ của bạn đã hoàn thiện! Bắt đầu tìm kiếm bạn bè, nhóm học tập và những người cùng sở thích ngay thôi.
                  </p>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-3 md:gap-4 justify-center md:justify-start">
                    <button
                      onClick={() => handleViewChange('matching')}
                      className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 dark:from-indigo-700 dark:via-violet-700 dark:to-blue-600 text-white font-bold rounded-2xl shadow-lg dark:shadow-indigo-500/50 hover:opacity-90 dark:hover:shadow-indigo-500/70 transition-all flex items-center justify-center gap-2 text-base active:scale-[0.97]"
                    >
                      <Search className="w-5 h-5" />
                      Tìm bạn ngay
                    </button>
                    <button
                      onClick={() => handleViewChange('profile')}
                      className="ghost-button w-full sm:w-auto px-8 py-4 rounded-2xl border-2 shadow-sm transition-all flex items-center justify-center gap-2 text-base active:scale-[0.97] font-bold dark:bg-transparent dark:text-gray-100 dark:border-gray-300"
                      style={{ backgroundColor: '#ffffff', color: '#111827', borderColor: '#6b7280', WebkitTextFillColor: 'initial' }}
                    >
                      <UserIcon className="w-5 h-5" />
                      Xem hồ sơ
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-base md:text-lg leading-relaxed text-gray-800 dark:text-gray-200/90 font-medium tracking-wide" style={{ WebkitTextFillColor: 'unset' }}>
                    Hãy bắt đầu bằng việc cập nhật hồ sơ cá nhân để TVU Connect có thể tìm kiếm những người bạn phù hợp nhất với bạn.
                  </p>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-3 md:gap-4 justify-center md:justify-start">
                    <button
                      onClick={() => handleViewChange('profile')}
                      className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 dark:from-indigo-700 dark:via-violet-700 dark:to-blue-600 text-white font-bold rounded-2xl shadow-lg dark:shadow-indigo-500/50 hover:opacity-90 dark:hover:shadow-indigo-500/70 transition-all flex items-center justify-center gap-2 text-base active:scale-[0.97]"
                    >
                      <UserIcon className="w-5 h-5" />
                      Cập nhật hồ sơ
                    </button>
                    <button
                      onClick={() => handleViewChange('matching')}
                      className="ghost-button w-full sm:w-auto px-8 py-4 rounded-2xl border-2 shadow-sm transition-all flex items-center justify-center gap-2 text-base active:scale-[0.97] font-bold bg-white text-gray-900 border-gray-100 dark:bg-transparent dark:text-gray-100 dark:border-gray-300"
                    >
                      <Search className="w-5 h-5" />
                      Tìm bạn ngay
                    </button>
                  </div>
                </>
              )}
              </div>{/* end safari-fix wrapper */}
            </div>

            {/* Right Column: Mode Selection Cards - 2x2 Grid */}
            <div className="relative">
              {/* Mobile: 2-2-1 Layout */}
              <div className="flex flex-col gap-3 md:hidden">
                {/* Hàng 1: Tìm người yêu + Kết nối nhanh */}
                <div className="grid grid-cols-2 gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    onClick={() => { 
                      if (!profileComplete) {
                        toast.error('🔒 Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này!', {
                          duration: 3000,
                        });
                        setView('profile');
                        return;
                      }
                      setMatchingMode('lover'); 
                      handleViewChange('matching'); 
                    }}
                    className={`feature-card-lover w-full h-36 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.08)] border p-4 flex flex-col justify-end text-left transition-all group ${profileComplete ? 'cursor-pointer' : 'cursor-not-allowed'} dark:shadow-[0_0_15px_rgba(239,68,68,0.3)]`}
                    style={{
                      backgroundColor: theme === 'dark' ? '#1e2433' : '#ffffff',
                      borderColor: theme === 'dark' ? 'rgba(239,68,68,0.2)' : '#e5e7eb',
                      color: theme === 'dark' ? '#f9fafb' : '#111827'
                    }}
                  >
                    <Heart className={`w-8 h-8 text-red-500 mb-2 transition-transform ${profileComplete ? 'group-hover:scale-110' : 'opacity-60'}`} />
                    <p className={`font-black text-base leading-tight tracking-tight ${!profileComplete ? 'opacity-60' : ''}`} style={{ color: theme === 'dark' ? '#f9fafb' : '#111827' }}>
                      Tìm người yêu {!profileComplete && '🔒'}
                    </p>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    onClick={() => { 
                      if (!profileComplete) {
                        toast.error('🔒 Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này!', {
                          duration: 3000,
                        });
                        setView('profile');
                        return;
                      }
                      setMatchingMode('quick'); 
                      handleViewChange('matching'); 
                    }}
                    className={`w-full h-36 bg-gradient-to-br from-indigo-950 to-gray-900 rounded-2xl shadow-md border border-transparent dark:border-indigo-500/30 p-4 flex flex-col justify-end text-white text-left transition-all group ${profileComplete ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                  >
                    <Zap className={`w-8 h-8 text-yellow-400 mb-2 transition-transform ${profileComplete ? 'group-hover:scale-110' : ''}`} />
                    <p className="font-black text-base leading-tight tracking-tight">
                      Kết nối nhanh {!profileComplete && '🔒'}
                    </p>
                  </motion.button>
                </div>

                {/* Hàng 2: Bạn cùng học + Sở thích chung */}
                <div className="grid grid-cols-2 gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    onClick={() => { 
                      if (!profileComplete) {
                        toast.error('🔒 Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này!', {
                          duration: 3000,
                        });
                        setView('profile');
                        return;
                      }
                      setMatchingMode('study'); 
                      handleViewChange('matching'); 
                    }}
                    className={`w-full h-36 bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 dark:from-indigo-700 dark:via-violet-700 dark:to-blue-600 rounded-2xl shadow-md border border-transparent dark:border-violet-500/30 dark:shadow-indigo-500/30 p-4 flex flex-col justify-end text-white text-left transition-all group ${profileComplete ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                  >
                    <BookOpen className={`w-8 h-8 mb-2 transition-transform ${profileComplete ? 'group-hover:scale-110' : ''}`} />
                    <p className="font-black text-base leading-tight tracking-tight">
                      Bạn cùng học {!profileComplete && '🔒'}
                    </p>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    onClick={() => { 
                      if (!profileComplete) {
                        toast.error('🔒 Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này!', {
                          duration: 3000,
                        });
                        setView('profile');
                        return;
                      }
                      setMatchingMode('hobby'); 
                      handleViewChange('matching'); 
                    }}
                    className={`feature-card-hobby w-full h-36 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.08)] border p-4 flex flex-col justify-end text-left transition-all group ${profileComplete ? 'cursor-pointer' : 'cursor-not-allowed'} dark:shadow-[0_0_15px_rgba(234,179,8,0.25)]`}
                    style={{
                      backgroundColor: theme === 'dark' ? '#1e2433' : '#ffffff',
                      borderColor: theme === 'dark' ? 'rgba(234,179,8,0.2)' : '#e5e7eb',
                      color: theme === 'dark' ? '#f9fafb' : '#111827'
                    }}
                  >
                    <Smile className={`w-8 h-8 text-yellow-500 mb-2 transition-transform ${profileComplete ? 'group-hover:scale-110' : 'opacity-60'}`} />
                    <p className={`font-black text-base leading-tight tracking-tight ${!profileComplete ? 'opacity-60' : ''}`} style={{ color: theme === 'dark' ? '#f9fafb' : '#111827' }}>
                      Sở thích chung {!profileComplete && '🔒'}
                    </p>
                  </motion.button>
                </div>

              </div>

              {/* Desktop: Equal Size Grid - All tabs same height */}
              <div className="hidden md:grid grid-cols-2 gap-4">
                {/* Row 1, Col 1: Tìm người yêu - h-52 (208px) */}
                <motion.button
                  whileHover={{ scale: 1.02, y: -5 }}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  onClick={() => { 
                    if (!profileComplete) {
                      toast.error('🔒 Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này!', {
                        duration: 3000,
                      });
                      setView('profile');
                      return;
                    }
                    setMatchingMode('lover'); 
                    handleViewChange('matching'); 
                  }}
                  className={`feature-card-lover w-full h-52 rounded-3xl shadow-lg border p-5 flex flex-col justify-end text-left transition-all group ${profileComplete ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'} shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_0_20px_rgba(239,68,68,0.3),_0_4px_6px_-1px_rgba(0,0,0,0.1)]`}
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(31,41,55,0.8)' : '#ffffff',
                    borderColor: theme === 'dark' ? 'rgba(239,68,68,0.2)' : '#f3f4f6'
                  }}
                >
                  <Heart className={`w-11 h-11 text-red-500 mb-3 transition-transform ${profileComplete ? 'group-hover:scale-110 group-hover:rotate-6' : ''}`} />
                  <p className={`font-black text-xl leading-tight tracking-tight ${theme === 'dark' ? 'text-gray-100' : 'text-gray-700'}`}>
                    Tìm người yêu {!profileComplete && '🔒'}
                  </p>
                </motion.button>

                {/* Row 1, Col 2: Kết nối nhanh - h-52 (208px) */}
                <motion.button
                  whileHover={{ scale: 1.02, y: -5 }}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  onClick={() => { 
                    if (!profileComplete) {
                      toast.error('🔒 Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này!', {
                        duration: 3000,
                      });
                      setView('profile');
                      return;
                    }
                    setMatchingMode('quick'); 
                    handleViewChange('matching'); 
                  }}
                  className={`w-full h-52 bg-gradient-to-br from-indigo-950 to-gray-900 rounded-3xl shadow-lg border border-transparent dark:border-indigo-500/30 p-5 flex flex-col justify-end text-white text-left transition-all group ${profileComplete ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                >
                  <Zap className={`w-11 h-11 text-yellow-400 mb-3 transition-transform ${profileComplete ? 'group-hover:scale-110 group-hover:-rotate-6' : ''}`} />
                  <p className="font-black text-xl leading-tight tracking-tight">
                    Kết nối nhanh {!profileComplete && '🔒'}
                  </p>
                </motion.button>

                {/* Row 2, Col 1: Bạn cùng học - h-52 (208px) */}
                <motion.button
                  whileHover={{ scale: 1.02, y: -5 }}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  onClick={() => { 
                    if (!profileComplete) {
                      toast.error('🔒 Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này!', {
                        duration: 3000,
                      });
                      setView('profile');
                      return;
                    }
                    setMatchingMode('study'); 
                    handleViewChange('matching'); 
                  }}
                  className={`w-full h-52 bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 dark:from-indigo-700 dark:via-violet-700 dark:to-blue-600 rounded-3xl shadow-lg border border-transparent dark:border-violet-500/30 dark:shadow-indigo-500/30 p-5 flex flex-col justify-end text-white text-left transition-all group ${profileComplete ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                >
                  <BookOpen className={`w-11 h-11 mb-3 transition-transform ${profileComplete ? 'group-hover:scale-110 group-hover:rotate-3' : ''}`} />
                  <p className="font-black text-xl leading-tight tracking-tight">
                    Bạn cùng học {!profileComplete && '🔒'}
                  </p>
                </motion.button>

                {/* Row 2, Col 2: Sở thích chung - h-52 (208px) */}
                <motion.button
                  whileHover={{ scale: 1.02, y: -5 }}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  onClick={() => { 
                    if (!profileComplete) {
                      toast.error('🔒 Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này!', {
                        duration: 3000,
                      });
                      setView('profile');
                      return;
                    }
                    setMatchingMode('hobby'); 
                    handleViewChange('matching'); 
                  }}
                  className={`feature-card-hobby w-full h-52 rounded-3xl shadow-lg border p-5 flex flex-col justify-end text-left transition-all group ${profileComplete ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'} shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_0_20px_rgba(234,179,8,0.25),_0_4px_6px_-1px_rgba(0,0,0,0.1)]`}
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(31,41,55,0.8)' : '#ffffff',
                    borderColor: theme === 'dark' ? 'rgba(234,179,8,0.2)' : '#f3f4f6'
                  }}
                >
                  <Smile className={`w-11 h-11 text-yellow-500 mb-3 transition-transform ${profileComplete ? 'group-hover:scale-110 group-hover:-rotate-3' : ''}`} />
                  <p className={`font-black text-xl leading-tight tracking-tight ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                    Sở thích chung {!profileComplete && '🔒'}
                  </p>
                </motion.button>
              </div>
            </div>
          </motion.div>
        );
    }
  };

  // Setup Push Notifications - DISABLED FOR LAUNCH
  // Will be enabled after upgrading to Blaze Plan
  useEffect(() => {
    if (!user || !hasProfile) return;
    
    // Push Notifications tạm thời tắt để tiết kiệm chi phí
    // Sẽ bật lại khi có user base ổn định
    logger.log('ℹ️ Push Notifications: Disabled (will enable after launch)');
    
    // TODO: Enable after upgrading to Firebase Blaze Plan
    // Uncomment code below when ready:
    /*
    const setupFCM = async () => {
      try {
        const token = await getFCMToken(user.uid);
        if (token) {
          logger.log('✅ FCM Token obtained:', token.substring(0, 20) + '...');
        }
        
        const unsubscribe = setupForegroundListener((payload) => {
          logger.log('📬 Foreground message received:', payload);
          const notification = formatMessageNotification(payload);
          showNotification(notification.title, notification.options);
        });
        
        return unsubscribe;
      } catch (error) {
        console.error('❌ FCM setup error:', error);
      }
    };
    
    const cleanup = setupFCM();
    return () => {
      cleanup?.then(unsub => unsub?.());
    };
    */
  }, [user, hasProfile]);

  // Listen for Service Worker messages (notification clicks)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'NOTIFICATION_CLICKED') {
        const { conversationId } = event.data.data;
        
        if (conversationId) {
          // Navigate to messages view and open conversation
          setView('conversations');
          setChatReceiverUid(conversationId);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center relative overflow-hidden">
        {/* Subtle glow behind logo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-r from-violet-400/20 to-blue-400/20 rounded-full blur-[60px] pointer-events-none"></div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col items-center gap-10 relative z-10 px-6"
        >
          {/* Logo and Title Side-by-Side (Image 2 Style) */}
          <div className="flex items-center gap-5 md:gap-8">
            <div className="w-[72px] h-[72px] md:w-[88px] md:h-[88px] rounded-[1.2rem] md:rounded-[1.5rem] bg-gradient-to-br from-violet-500 to-blue-500 p-[1.5px] shadow-[0_8px_30px_rgb(124,58,237,0.12)] bg-white shrink-0">
              <div className="w-full h-full bg-white rounded-[17px] md:rounded-[22px] flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <defs>
                      <filter id="glow-loading" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                        <feMerge>
                          <feMergeNode in="coloredBlur"/>
                          <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                      </filter>
                    </defs>
                    
                    {/* Nodes with stronger visibility */}
                    <motion.circle 
                      cx="25" cy="25" r="4"
                      className="fill-violet-900"
                      style={{ filter: 'url(#glow-loading)', opacity: 0.5 }}
                      animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.9, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.circle 
                      cx="80" cy="20" r="4"
                      className="fill-violet-900"
                      style={{ filter: 'url(#glow-loading)', opacity: 0.5 }}
                      animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.9, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                    />
                    <motion.circle 
                      cx="20" cy="75" r="4"
                      className="fill-violet-900"
                      style={{ filter: 'url(#glow-loading)', opacity: 0.5 }}
                      animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.9, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    />
                    <motion.circle 
                      cx="75" cy="80" r="4"
                      className="fill-violet-900"
                      style={{ filter: 'url(#glow-loading)', opacity: 0.5 }}
                      animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.9, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
                    />
                    
                    {/* Lines with stronger visibility */}
                    <motion.line 
                      x1="25" y1="25" x2="80" y2="20" 
                      strokeWidth="1.5"
                      className="stroke-violet-900"
                      style={{ opacity: 0.5 }}
                      animate={{ pathLength: [0, 1, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.line 
                      x1="80" y1="20" x2="20" y2="75" 
                      strokeWidth="1.5"
                      className="stroke-violet-900"
                      style={{ opacity: 0.5 }}
                      animate={{ pathLength: [0, 1, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                    />
                    <motion.line 
                      x1="20" y1="75" x2="75" y2="80" 
                      strokeWidth="1.5"
                      className="stroke-violet-900"
                      style={{ opacity: 0.5 }}
                      animate={{ pathLength: [0, 1, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    />
                  </svg>
                </div>
                <span className="font-black text-2xl md:text-3xl bg-clip-text text-transparent bg-gradient-to-tr from-violet-600 to-blue-500 tracking-tighter relative z-10">
                  TVU
                </span>
              </div>
            </div>

            <h1 className="text-4xl md:text-6xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-500 drop-shadow-sm whitespace-nowrap">
              TVU Connect
            </h1>
          </div>

          {/* Typography */}
          <p 
            className="text-base md:text-lg font-semibold italic leading-relaxed px-6 text-center max-w-2xl"
            style={{ color: '#475569' }}
          >
            "Nền tảng giúp sinh viên Đại học Trà Vinh tìm kiếm bạn bè, nhóm học tập và những người cùng sở thích."
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: theme === 'dark' ? '#111827' : '#ffffff', color: theme === 'dark' ? '#f3f4f6' : '#111827' }}>

      {/* Notification Permission Banner - DISABLED FOR LAUNCH */}
      {/* Will be enabled after upgrading to Firebase Blaze Plan */}
      {/* {user && hasProfile && (
        <NotificationPermission currentUser={user} />
      )} */}

      {/* Terms and Privacy Modal */}
      <TermsModal
        isOpen={showTermsModal}
        onAccept={handleAcceptTerms}
        onDecline={handleDeclineTerms}
      />

      {/* Status Banners - Removed as per user request */}
      {/* <QuotaExceededBanner isVisible={quotaExceeded} /> */}

      {/* Navigation */}
      <nav 
        className="sticky top-0 z-[60] backdrop-blur-md border-b border-gray-100 dark:border-gray-800 pt-[var(--sat)] relative"
        style={{ backgroundColor: 'var(--nav-bg, #ffffff)' }}
      >
        {/* Global Pending Loader (Full Width) */}
        {isPending && (
          <div className="absolute bottom-[-1px] left-0 right-0 z-[100] h-[3px] bg-indigo-100 dark:bg-indigo-900 overflow-hidden">
            <div className="w-full h-full bg-indigo-600 dark:bg-indigo-400 animate-[loading-bar_1s_ease-in-out_infinite]" style={{ transformOrigin: '0% 50%' }}></div>
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Left: Logo */}
            <div className="flex items-center flex-shrink-0">
              <div
                className="cursor-pointer group flex items-center"
                onClick={() => handleViewChange('home')}
              >
                <Logo size="sm" showText={false} />
                <span className="ml-2 text-base md:text-xl font-black tracking-tight whitespace-nowrap" style={{ background: 'linear-gradient(to right, #7c3aed, #4f46e5, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  TVU Connect
                </span>
              </div>
            </div>

            {/* Center: Desktop Navigation */}
            <div className="hidden lg:flex items-center justify-start flex-1 ml-3 mr-2 max-w-[900px]">
              <div className="flex items-center gap-0">
                {user && (
                  <>
                    <button
                      data-tour="home"
                      onClick={() => handleViewChange('home')}
                      className={`min-w-[90px] px-2.5 py-1.5 text-sm font-extrabold rounded-xl transition-all duration-100 flex items-center justify-center gap-2 active:scale-95 ${view === 'home' ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                    >
                      <Home className={`w-6 h-6 ${view === 'home' ? 'fill-white' : ''}`} /> Trang chủ
                    </button>
                    <button
                      data-tour="messages"
                      onClick={() => handleViewChange('conversations')}
                      {...createPreloadHandlers('conversations')}
                      className={`min-w-[90px] px-2.5 py-1.5 text-sm font-extrabold rounded-xl transition-all duration-100 flex items-center justify-center gap-2 active:scale-95 ${view === 'conversations' ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                    >
                      <MessageSquare className={`w-6 h-6 ${view === 'conversations' ? 'fill-white' : ''}`} /> Tin nhắn
                    </button>
                    <button
                      data-tour="posts"
                      onClick={() => handleViewChange('posts')}
                      {...createPreloadHandlers('posts')}
                      className={`min-w-[90px] px-2.5 py-1.5 text-sm font-extrabold rounded-xl transition-all duration-100 flex items-center justify-center gap-2 active:scale-95 ${view === 'posts' ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                    >
                      <FileText className={`w-6 h-6 ${view === 'posts' ? 'fill-white' : ''}`} /> Bảng tin
                    </button>
                    <button
                      data-tour="documents"
                      onClick={() => handleViewChange('documents')}
                      {...createPreloadHandlers('documents')}
                      className={`min-w-[90px] px-2.5 py-1.5 text-sm font-extrabold rounded-xl transition-all duration-100 flex items-center justify-center gap-2 active:scale-95 ${view === 'documents' ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                    >
                      <BookOpen className={`w-6 h-6 ${view === 'documents' ? 'fill-white' : ''}`} /> Tài liệu
                    </button>
                    <button
                      data-tour="explore"
                      onClick={() => handleViewChange('explore')}
                      onMouseEnter={() => handleNavHover('explore')}
                      onFocus={() => handleNavHover('explore')}
                      onTouchStart={() => handleNavHover('explore')}
                      className={`min-w-[90px] px-2.5 py-1.5 text-sm font-extrabold rounded-xl transition-all duration-100 flex items-center justify-center gap-2 active:scale-95 ${view === 'explore' ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                    >
                      <MapPin className={`w-6 h-6 ${view === 'explore' ? 'fill-white' : ''}`} /> Khám phá
                    </button>

                    <button
                      data-tour="profile"
                      onClick={() => handleViewChange('profile')}
                      {...createPreloadHandlers('profile')}
                      className={`min-w-[90px] px-2.5 py-1.5 text-sm font-extrabold rounded-xl transition-all duration-100 flex items-center justify-center gap-2 active:scale-95 ${view === 'profile' ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                    >
                      <UserIcon className={`w-6 h-6 ${view === 'profile' ? 'fill-white' : ''}`} /> Hồ sơ
                    </button>
                    <button
                      data-tour="matching"
                      onClick={() => handleViewChange('matching')}
                      {...createPreloadHandlers('matching')}
                      className={`min-w-[90px] px-2.5 py-1.5 text-sm font-extrabold rounded-xl transition-all duration-100 flex items-center justify-center gap-2 active:scale-95 ${view === 'matching' ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                    >
                      <Heart className={`w-6 h-6 ${view === 'matching' ? 'fill-white' : ''}`} /> Ghép cặp
                    </button>
                    <button
                      onClick={() => handleViewChange('settings')}
                      {...createPreloadHandlers('settings')}
                      className={`min-w-[90px] px-2.5 py-1.5 text-sm font-extrabold rounded-xl transition-all duration-100 flex items-center justify-center gap-2 active:scale-95 ${view === 'settings' ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                    >
                      <SettingsIcon className={`w-6 h-6 ${view === 'settings' ? 'fill-white' : ''}`} /> Cài đặt
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Right: Auth and Logout */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {user && (
                <>
                  <div className="flex items-center gap-2 sm:gap-3">
                    {/* User Profile Button with Avatar and Name */}
                    <button
                      onClick={() => handleViewChange('profile')}
                      className="px-3 py-2 md:px-4 md:py-2.5 rounded-full font-bold text-xs md:text-sm transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap flex-shrink-0"
                      style={{
                        backgroundColor: theme === 'dark' ? 'rgb(31, 41, 55)' : '#ffffff',
                        color: theme === 'dark' ? '#f3f4f6' : '#111827',
                        borderWidth: '1px',
                        borderColor: theme === 'dark' ? 'rgb(55, 65, 81)' : 'rgb(243, 244, 246)',
                      }}
                    >
                      {currentProfile?.photoURL || user.photoURL ? (
                        <img
                          src={currentProfile?.photoURL || user.photoURL || ''}
                          alt="Avatar"
                          className="w-6 h-6 md:w-7 md:h-7 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentProfile?.fullName || user.displayName || 'U')}&background=8b5cf6&color=fff`;
                          }}
                        />
                      ) : (
                        <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
                          <UserIcon className="w-3 h-3 md:w-4 md:h-4 text-white" />
                        </div>
                      )}
                      <span className="hidden sm:inline">{currentProfile?.fullName || user.displayName || 'User'}</span>
                    </button>

                    {/* Logout Button - Hidden on mobile, visible on desktop */}
                    <button
                      onClick={handleLogout}
                      className="hidden md:flex items-center justify-center px-3 py-2 md:px-4 md:py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all duration-300 active:scale-95 whitespace-nowrap flex-shrink-0 shadow-md hover:shadow-xl relative overflow-hidden group"
                      style={{
                        backgroundColor: theme === 'dark' ? '#7f1d1d' : '#fee2e2',
                        color: theme === 'dark' ? '#fecaca' : '#dc2626',
                        borderWidth: '1px',
                        borderColor: theme === 'dark' ? '#991b1b' : '#fecaca',
                      }}
                    >
                      {/* Hover gradient effect */}
                      <span 
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          background: theme === 'dark' 
                            ? 'linear-gradient(135deg, rgba(127, 29, 29, 0.8) 0%, rgba(153, 27, 27, 0.9) 100%)'
                            : 'linear-gradient(135deg, rgba(254, 226, 226, 0.8) 0%, rgba(252, 165, 165, 0.9) 100%)',
                        }}
                      />
                      
                      {/* Text */}
                      <span className="relative z-10">Đăng xuất</span>
                    </button>

                    {/* Mobile Menu Toggle */}
                    <button
                      data-menu-toggle="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMobileMenu(!showMobileMenu);
                      }}
                      className="md:hidden p-2.5 rounded-full shadow-sm active:scale-95 transition-all text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex-shrink-0"
                      style={{
                        backgroundColor: theme === 'dark' ? 'rgb(31, 41, 55)' : '#ffffff',
                        borderWidth: '1px',
                        borderColor: theme === 'dark' ? 'rgb(55, 65, 81)' : 'rgb(243, 244, 246)',
                      }}
                    >
                      <Zap className={`w-5 h-5 transition-transform ${showMobileMenu ? 'rotate-12 scale-110 text-indigo-600' : ''}`} />
                    </button>

                    {/* Mobile Dropdown Menu Container */}
                    <div
                      id="mobile-menu-container"
                      className={`md:hidden fixed inset-x-4 top-20 backdrop-blur-xl border rounded-3xl shadow-2xl p-5 transition-all duration-150 z-[70] origin-top ${showMobileMenu ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'}`}
                      style={{
                        backgroundColor: theme === 'dark' ? 'rgba(17, 24, 39, 0.97)' : 'rgba(255, 255, 255, 0.97)',
                        borderColor: theme === 'dark' ? 'rgb(55, 65, 81)' : 'rgb(243, 244, 246)',
                      }}
                    >
                      <div className="flex flex-col gap-4">
                        {/* Appearance */}
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-2">Giao diện</p>
                          <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
                            style={{ backgroundColor: theme === 'dark' ? 'rgba(31,41,55,0.8)' : '#f9fafb', border: '1px solid', borderColor: theme === 'dark' ? '#374151' : '#e5e7eb' }}
                          >
                            <span className="font-semibold text-sm" style={{ color: theme === 'dark' ? '#e5e7eb' : '#111827' }}>
                              {theme === 'dark' ? '🌙 Chế độ tối' : '☀️ Chế độ sáng'}
                            </span>
                            <ThemeToggle />
                          </div>
                        </div>

                        {/* Account */}
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-2">Tài khoản</p>
                          <button
                            onClick={() => {
                              setShowMobileMenu(false);
                              setView('settings');
                            }}
                            className="w-full flex items-center justify-center gap-3 py-3.5 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20 rounded-2xl hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors font-bold text-sm border border-indigo-100 dark:border-indigo-800/30"
                          >
                            <SettingsIcon className="w-5 h-5" />
                            Cài đặt tài khoản
                          </button>
                          <button
                            onClick={() => {
                              setShowMobileMenu(false);
                              handleLogout();
                            }}
                            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-bold text-sm transition-colors"
                            style={{
                              backgroundColor: theme === 'dark' ? 'rgba(127,29,29,0.3)' : '#fee2e2',
                              color: theme === 'dark' ? '#fca5a5' : '#dc2626',
                              border: '1px solid',
                              borderColor: theme === 'dark' ? '#7f1d1d' : '#fecaca',
                            }}
                          >
                            <span>🚪</span>
                            Đăng xuất
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
      
      {/* Profile Completion Banner - Moved after nav to prevent overlap and push content down */}
      {user && hasProfile && !isLoadingProfile && !profileComplete && (
        <ProfileCompletionBanner
          isComplete={profileComplete}
          missingFields={profileValidation.missingFieldsVN}
          onComplete={() => setView('profile')}
          userId={user.uid}
        />
      )}

      {/* Main Content */}
      <main className={`max-w-7xl mx-auto mb-24 md:mb-0 min-h-[calc(100dvh-5rem)] relative ${view === 'home' ? 'md:flex md:items-center md:justify-center' : ''} ${view === 'explore' ? '' : view === 'home' ? '' : 'px-4 sm:px-6 lg:px-8 py-4 md:py-12'}`}
        style={{ backgroundColor: theme === 'dark' ? '#111827' : '#ffffff' }}
      >

        <div className="w-full h-full">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
              className="w-full h-full"
              style={{ willChange: 'opacity, transform' }}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Nav */}
      {user && (
        <div 
          className="mobile-nav md:hidden fixed bottom-0 left-0 right-0 z-[60] px-2 pb-[calc(0.75rem+var(--sab))] pt-3 flex items-end justify-around border-t border-gray-200 dark:border-gray-700 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]"
          style={{ backgroundColor: 'var(--nav-bg, #ffffff)' }}
        >
          <button
            data-tour="home"
            onClick={() => handleViewChange('home')}
            className={`mobile-nav-tab relative flex flex-col items-center justify-end gap-1 px-2 py-2 rounded-xl min-w-[60px] h-[56px] ${
              view === 'home' 
                ? 'active text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 shadow-sm' 
                : ''
            }`}
            style={view !== 'home' ? { color: theme === 'dark' ? '#FFFFFF' : '#000000' } : undefined}
          >
            <Home className={`w-5.5 h-5.5 flex-shrink-0 stroke-[2px] ${view === 'home' ? 'stroke-[2.5px]' : ''}`} style={view !== 'home' ? { stroke: theme === 'dark' ? '#FFFFFF' : '#000000' } : undefined} />
            <span className="text-[9px] font-bold leading-none whitespace-nowrap">Trang chủ</span>
          </button>
          <button
            data-tour="messages"
            onClick={() => handleViewChange('conversations')}
            {...createPreloadHandlers('conversations')}
            className={`mobile-nav-tab relative flex flex-col items-center justify-end gap-1 px-2 py-2 rounded-xl min-w-[60px] h-[56px] ${
              view === 'conversations' 
                ? 'active text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 shadow-sm' 
                : ''
            }`}
            style={view !== 'conversations' ? { color: theme === 'dark' ? '#FFFFFF' : '#000000' } : undefined}
          >
            <MessageSquare className={`w-5.5 h-5.5 flex-shrink-0 stroke-[2px] ${view === 'conversations' ? 'fill-indigo-500 dark:fill-indigo-400' : ''}`} style={view !== 'conversations' ? { stroke: theme === 'dark' ? '#FFFFFF' : '#000000' } : undefined} />
            <span className="text-[9px] font-bold leading-none whitespace-nowrap">Tin nhắn</span>
          </button>
          <button
            data-tour="posts"
            onClick={() => handleViewChange('posts')}
            {...createPreloadHandlers('posts')}
            className={`mobile-nav-tab relative flex flex-col items-center justify-end gap-1 px-2 py-2 rounded-xl min-w-[60px] h-[56px] ${
              view === 'posts' 
                ? 'active text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 shadow-sm' 
                : ''
            }`}
            style={view !== 'posts' ? { color: theme === 'dark' ? '#FFFFFF' : '#000000' } : undefined}
          >
            <FileText className={`w-5.5 h-5.5 flex-shrink-0 stroke-[2px] ${view === 'posts' ? 'fill-indigo-500 dark:fill-indigo-400' : ''}`} style={view !== 'posts' ? { stroke: theme === 'dark' ? '#FFFFFF' : '#000000' } : undefined} />
            <span className="text-[9px] font-bold leading-none whitespace-nowrap">Bảng tin</span>
          </button>
          <button
            data-tour="documents"
            onClick={() => handleViewChange('documents')}
            {...createPreloadHandlers('documents')}
            className={`mobile-nav-tab relative flex flex-col items-center justify-end gap-1 px-2 py-2 rounded-xl min-w-[60px] h-[56px] ${
              view === 'documents' 
                ? 'active text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 shadow-sm' 
                : ''
            }`}
            style={view !== 'documents' ? { color: theme === 'dark' ? '#FFFFFF' : '#000000' } : undefined}
          >
            <BookOpen className={`w-5.5 h-5.5 flex-shrink-0 stroke-[2px] ${view === 'documents' ? 'fill-indigo-500 dark:fill-indigo-400' : ''}`} style={view !== 'documents' ? { stroke: theme === 'dark' ? '#FFFFFF' : '#000000' } : undefined} />
            <span className="text-[9px] font-bold leading-none whitespace-nowrap">Tài liệu</span>
          </button>
          <button
            data-tour="explore"
            onClick={() => handleViewChange('explore')}
            onMouseEnter={() => handleNavHover('explore')}
            onFocus={() => handleNavHover('explore')}
            onTouchStart={() => handleNavHover('explore')}
            className={`mobile-nav-tab relative flex flex-col items-center justify-end gap-1 px-2 py-2 rounded-xl min-w-[60px] h-[56px] ${
              view === 'explore' 
                ? 'active text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 shadow-sm' 
                : ''
            }`}
            style={view !== 'explore' ? { color: theme === 'dark' ? '#FFFFFF' : '#000000' } : undefined}
          >
            <MapPin className={`w-5.5 h-5.5 flex-shrink-0 stroke-[2px] ${view === 'explore' ? 'fill-indigo-500 dark:fill-indigo-400' : ''}`} style={view !== 'explore' ? { stroke: theme === 'dark' ? '#FFFFFF' : '#000000' } : undefined} />
            <span className="text-[9px] font-bold leading-none whitespace-nowrap">Khám phá</span>
          </button>

          <button
            data-tour="profile"
            onClick={() => handleViewChange('profile')}
            {...createPreloadHandlers('profile')}
            className={`mobile-nav-tab relative flex flex-col items-center justify-end gap-1 px-2 py-2 rounded-xl min-w-[60px] h-[56px] ${
              view === 'profile' 
                ? 'active text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 shadow-sm' 
                : ''
            }`}
            style={view !== 'profile' ? { color: theme === 'dark' ? '#FFFFFF' : '#000000' } : undefined}
          >
            <UserIcon className={`w-5.5 h-5.5 flex-shrink-0 stroke-[2px] ${view === 'profile' ? 'fill-indigo-500 dark:fill-indigo-400' : ''}`} style={view !== 'profile' ? { stroke: theme === 'dark' ? '#FFFFFF' : '#000000' } : undefined} />
            <span className="text-[9px] font-bold leading-none whitespace-nowrap">Hồ sơ</span>
          </button>
        </div>
      )}

      {/* Footer */}
      <footer className="hidden md:block py-12 border-t border-gray-100 dark:border-gray-800 mt-12 bg-white dark:bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm font-semibold tracking-wide">
            © 2026 TVU Student Connect • Dành riêng cho sinh viên Đại học Trà Vinh
          </p>
        </div>
      </footer>

      {/* Onboarding Tour */}
      {user && showOnboarding && (
        <Suspense fallback={null}>
          <LazyOnboardingTour
            run={showOnboarding}
            onComplete={() => {
              setShowOnboarding(false);
              if (user) {
                localStorage.setItem(`onboarding_seen_${user.uid}`, 'true');
              }
            }}
          />
        </Suspense>
      )}

      {/* Feedback Modal */}
      {currentMatch && (
        <FeedbackModal
          isOpen={true}
          onClose={dismissCurrent}
          matchId={currentMatch.matchId}
          matchedUserId={currentMatch.matchedUserId}
          matchedUserName={currentMatch.matchedUserName}
          currentUserId={user?.uid || ''}
        />
      )}
      <InstallPrompt />
    </div>
  );
}

