import React, { useState, useEffect, useRef, useTransition, useCallback, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { auth, onAuthStateChanged, User, db, collection, query, where, onSnapshot, orderBy, limit, getDoc, doc, updateDoc, serverTimestamp, signOut, handleFirestoreError, OperationType, getDocs } from './firebase';
import { TermsModal } from './components/TermsModal';
import { NotificationPermission } from './components/NotificationPermission';
import { FeedbackModal } from './components/FeedbackModal';
import { useFeedbackPrompt } from './hooks/useFeedbackPrompt';
import { useTheme } from './contexts/ThemeContext';
import { StudentProfile, View, Message } from './types';
import { User as UserIcon, Heart, Search, Users, Zap, BookOpen, Smile } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Logo } from './components/Logo';
import { LandingPage } from './components/LandingPage';
import { AppNavigation } from './components/AppNavigation';
import { MobileMoreMenu } from './components/MobileMoreMenu';
import { NotificationBell } from './components/NotificationBell';
import { toast } from 'sonner';
import { quotaManager } from './utils/quotaManager';

import { ProfileCompletionBanner } from './components/ProfileCompletionBanner';
import { CallDialog } from './components/CallDialog';
import { LiveLocationTracker } from './components/LiveLocationTracker';
import { InstallPrompt } from './components/InstallPrompt';
import { QuotaExceededBanner } from './components/QuotaExceededBanner';
import { validateProfile, RESTRICTED_FEATURES, PUBLIC_FEATURES } from './utils/profileValidation';
import { setupForegroundListener, getFCMToken } from './utils/fcm';
import { showNotification, formatMessageNotification } from './utils/notifications';
import { onlineStatusManager } from './utils/onlineStatusManager';
import { subscribeToIncomingCalls } from './services/callService';
import { CallContext, CallKind, CallSession } from './types/call';
import { initializeAppSounds, playAppSound } from './utils/appSounds';
import { safeNotificationRoute } from './services/notificationCenterService';

// Lazy-loaded components for code splitting
import { 
  LazyProfileForm, 
  LazyMatching, 
  LazyChat, 
  LazyConversationsList, 
  LazyNotificationCenter,
  LazyProfileCard, 
  LazySettings, 
  LazyPostsList, 
  LazyMapView, 
  LazyDocumentRepository,
  LazyStudentDirectory,
  LazyOnboardingTour
} from './routes/lazyRoutes';
import { RouteLoader } from './components/RouteLoader';
import { getCachedData, setCachedData } from './utils/cacheManager';
import { logger } from '@/utils/logger';
import { performanceMonitor } from './utils/performance';
import {
  canonicalAppPath,
  migrateLegacyHash,
  pathForChat,
  pathForExplore,
  pathForMatching,
  pathForView,
  resolveAppRoute,
  type ExploreTab,
  type MatchingMode,
} from './routes/appRoutes';

interface ActiveCall {
  direction: 'incoming' | 'outgoing';
  kind: CallKind;
  peer: StudentProfile | null;
  incomingCall?: CallSession;
  context?: CallContext;
}

export default function App() {
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const route = resolveAppRoute(location.pathname);
  const view = route.view;
  const matchingMode = route.matchingMode ?? 'quick';
  const exploreTab = route.exploreTab ?? 'list';
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [matchedProfile, setMatchedProfile] = useState<StudentProfile | null>(null);
  const [chatReceiverUid, setChatReceiverUid] = useState<string | null>(route.chatUid ?? null);
  const [hasProfile, setHasProfile] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<StudentProfile | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const initialLoadRef = useRef(true);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const seenUnreadMessageIdsRef = useRef<Set<string>>(new Set());
  const unreadListenerReadyRef = useRef(false);
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

  const setView = useCallback((nextView: View, replace = false) => {
    navigate(pathForView(nextView), { replace });
  }, [navigate]);

  useEffect(() => initializeAppSounds(), []);

  useEffect(() => {
    if (route.chatUid) setChatReceiverUid(route.chatUid);
  }, [route.chatUid]);

  useEffect(() => {
    const canonicalPath = canonicalAppPath(location.pathname);
    if (canonicalPath !== location.pathname) {
      navigate(canonicalPath, { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    const migratedPath = migrateLegacyHash(window.location.hash);
    if (!migratedPath) return;
    navigate(migratedPath, { replace: true });
  }, [navigate]);

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
    if (!user) return;

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
  }, [user]);

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

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  // Safety timeout for loading screen - prevent infinite loading
  useEffect(() => {
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        logger.warn('Loading timeout - forcing load completion');
        setLoading(false);
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
        setHasProfile(false);
        setIsLoadingProfile(false); // No user = not loading
        sessionStorage.removeItem('has_reloaded_login');
        initialLoadRef.current = true;
      } else {
        initialLoadRef.current = false;
        setIsLoadingProfile(true); // Start loading profile
        
        // Read the local terms flag before making a network request.
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
      toast.error(`${featureName} cần hồ sơ hoàn chỉnh`, {
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
  }, [hasProfile, user]);


  // Calls are created only when neither participant has blocked the other (the
  // Firestore rule enforces this). The listener only needs the caller profile.
  useEffect(() => {
    if (!user || !profileComplete) return;

    return subscribeToIncomingCalls(user.uid, async (incomingCall) => {
      if (!incomingCall || activeCallRef.current) return;

      try {
        const callerProfile = await getDoc(doc(db, 'profiles', incomingCall.callerUid));

        const callState: ActiveCall = {
          direction: 'incoming',
          kind: incomingCall.kind,
          incomingCall,
          context: {
            privacyMode: incomingCall.privacyMode,
            source: incomingCall.source,
            sourceSessionId: incomingCall.sourceSessionId,
          },
          peer: callerProfile.exists()
            ? { ...callerProfile.data(), uid: incomingCall.callerUid } as StudentProfile
            : null,
        };
        activeCallRef.current = callState;
        setActiveCall(callState);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `calls/${incomingCall.id}`, true);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'calls', true);
    });
  }, [profileComplete, user]);

  // In-app foreground notification. The initial snapshot only records existing
  // unread messages; it never surprises a student with old notifications.
  useEffect(() => {
    if (!user) return;

    seenUnreadMessageIdsRef.current.clear();
    unreadListenerReadyRef.current = false;

    const q = query(
      collection(db, 'messages'),
      where('participants', 'array-contains', user.uid),
      where('receiverUid', '==', user.uid),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const currentView = viewRef.current;
      const currentChatReceiver = chatReceiverUidRef.current;

      if (!unreadListenerReadyRef.current) {
        snapshot.docs.forEach((messageDoc) => seenUnreadMessageIdsRef.current.add(messageDoc.id));
        unreadListenerReadyRef.current = true;
        return;
      }

      const newMessages = snapshot.docChanges()
        .filter((change) => change.type === 'added')
        .filter((change) => !seenUnreadMessageIdsRef.current.has(change.doc.id));

      for (const change of newMessages) {
        seenUnreadMessageIdsRef.current.add(change.doc.id);
        const newMsg = change.doc.data() as Message;

        // Never interrupt the chat the student is currently reading.
        if (currentView === 'chat' && currentChatReceiver === newMsg.senderUid) continue;

        void playAppSound('message-in', { cooldownMs: 650 });

        try {
          const senderDoc = await getDoc(doc(db, 'profiles', newMsg.senderUid));
          const senderName = senderDoc.exists() ? senderDoc.data().fullName : 'Người dùng TVU';
          const toastId = toast.info('Bạn có tin nhắn mới', {
            description: `Từ ${senderName}`,
            action: {
              label: 'Xem ngay',
              onClick: () => {
                setChatReceiverUid(newMsg.senderUid);
                navigate(pathForChat(newMsg.senderUid));
                toast.dismiss(toastId);
              },
            },
            duration: 5000,
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `profiles/${newMsg.senderUid}`, true);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages', true);
    });

    return () => unsubscribe();
  }, [navigate, user]);

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
      setView('students');
      toast.success('Hồ sơ đã hoàn thành. Bạn có thể sử dụng mọi tính năng.', {
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
      toast.error('Tính năng cần hồ sơ hoàn chỉnh', {
        duration: 4000,
        description: `Vui lòng cập nhật: ${profileValidation.missingFieldsVN.join(', ')}`,
      });
      navigate(pathForView('profile'));
      return false;
    }
    return true;
  }, [navigate, profileComplete, profileValidation.missingFieldsVN]);

  const handleViewChange = useCallback((newView: View) => {
    const publicViews = Object.keys(PUBLIC_FEATURES);

    if (publicViews.includes(newView)) {
      startTransition(() => {
        navigate(pathForView(newView));
      });
      return;
    }
    
    // Nhóm tính năng Khóa (Restricted): cần profile hoàn chỉnh
    const restrictedViews = Object.keys(RESTRICTED_FEATURES);
    
    if (restrictedViews.includes(newView)) {
      if (canAccessFeature()) {
        navigate(pathForView(newView));
      }
    } else {
      navigate(pathForView(newView));
    }
  }, [canAccessFeature, navigate]);

  const handleMatchFound = useCallback((profile: StudentProfile) => {
    setMatchedProfile(profile);
    startTransition(() => {
      navigate(pathForView('results'));
    });
  }, [navigate]);

  const handleStartChat = useCallback((uid: string) => {
    setChatReceiverUid(uid);
    startTransition(() => {
      navigate(pathForChat(uid));
    });
  }, [navigate]);

  const handleStartCall = useCallback((profile: StudentProfile, kind: CallKind, context?: CallContext) => {
    if (activeCallRef.current) {
      toast.info('Bạn đang có một cuộc gọi khác. Hãy kết thúc cuộc gọi đó trước nhé.');
      return;
    }

    const callState: ActiveCall = { direction: 'outgoing', kind, peer: profile, context };
    activeCallRef.current = callState;
    setActiveCall(callState);
  }, []);

  const handleCloseCall = useCallback(() => {
    activeCallRef.current = null;
    setActiveCall(null);
  }, []);

  const handleOpenExploreTab = useCallback((tab: ExploreTab) => {
    navigate(pathForExplore(tab));
  }, [navigate]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  const renderView = () => {
    if (!user) {
      return <LandingPage user={user} loading={loading} />;
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
            <LazyMatching
              currentUser={user}
              onMatchFound={handleMatchFound}
              onStartChat={handleStartChat}
              onStartCall={(profile, kind, context) => handleStartCall(profile, kind, context)}
              mode={matchingMode || 'quick'}
            />
          </RouteLoader>
        );
      case 'students':
        return (
          <RouteLoader minHeight="min-h-[600px]">
            <LazyStudentDirectory
              currentUser={user}
              currentProfile={currentProfile}
              onStartChat={handleStartChat}
            />
          </RouteLoader>
        );
      case 'chat':
        return chatReceiverUid ? (
          <RouteLoader minHeight="min-h-[500px]">
            <LazyChat
              receiverUid={chatReceiverUid}
              onBack={() => setView('conversations')}
              onStartCall={handleStartCall}
            />
          </RouteLoader>
        ) : null;
      case 'conversations':
        return (
          <RouteLoader minHeight="min-h-[500px]">
            <LazyConversationsList onStartChat={handleStartChat} onNewChat={() => navigate(pathForMatching('quick'))} />
          </RouteLoader>
        );
      case 'notifications':
        return (
          <RouteLoader minHeight="min-h-[500px]">
            <LazyNotificationCenter
              currentUser={user}
              onOpenRoute={(routePath) => navigate(routePath)}
            />
          </RouteLoader>
        );
      case 'settings':
        return user ? (
          <RouteLoader minHeight="min-h-[400px]">
            <LazySettings user={user} onLogout={handleLogout} onShowBlockedList={() => {
              navigate(`${pathForView('profile')}#blocked-users`);
              window.setTimeout(() => {
                document.getElementById('blocked-users')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 250);
            }} onShowTour={() => {
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
            <LazyMapView currentUser={user} currentProfile={currentProfile} initialTab={exploreTab} onProfileClick={async (uid) => {
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
                onRematch={() => navigate(pathForMatching(matchingMode))}
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
            <button onClick={() => navigate(pathForMatching('quick'))} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-full">Quay lại</button>
          </div>
        );
      case 'home':
      default:
        return (
          <div className="home-dashboard max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-center">
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
                      onClick={() => handleViewChange('students')}
                      className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 dark:from-indigo-700 dark:via-violet-700 dark:to-blue-600 text-white font-bold rounded-2xl shadow-lg dark:shadow-indigo-500/50 hover:opacity-90 dark:hover:shadow-indigo-500/70 transition-all flex items-center justify-center gap-2 text-base active:scale-[0.97]"
                    >
                      <Users className="w-5 h-5" />
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
                      onClick={() => handleViewChange('students')}
                      className="ghost-button w-full sm:w-auto px-8 py-4 rounded-2xl border-2 shadow-sm transition-all flex items-center justify-center gap-2 text-base active:scale-[0.97] font-bold bg-white text-gray-900 border-gray-100 dark:bg-transparent dark:text-gray-100 dark:border-gray-300"
                    >
                      <Users className="w-5 h-5" />
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
                        toast.error('Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này.', {
                          duration: 3000,
                        });
                        setView('profile');
                        return;
                      }
                      navigate(pathForMatching('lover'));
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
                      Hẹn hò ẩn mặt {!profileComplete && '(Cần hồ sơ)'}
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
                        toast.error('Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này.', {
                          duration: 3000,
                        });
                        setView('profile');
                        return;
                      }
                      navigate(pathForMatching('quick'));
                    }}
                    className={`w-full h-36 bg-gradient-to-br from-indigo-950 to-gray-900 rounded-2xl shadow-md border border-transparent dark:border-indigo-500/30 p-4 flex flex-col justify-end text-white text-left transition-all group ${profileComplete ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                  >
                    <Zap className={`w-8 h-8 text-yellow-400 mb-2 transition-transform ${profileComplete ? 'group-hover:scale-110' : ''}`} />
                    <p className="font-black text-base leading-tight tracking-tight">
                      Gọi nhanh {!profileComplete && '(Cần hồ sơ)'}
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
                        toast.error('Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này.', {
                          duration: 3000,
                        });
                        setView('profile');
                        return;
                      }
                      navigate(pathForMatching('study'));
                    }}
                    className={`w-full h-36 bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 dark:from-indigo-700 dark:via-violet-700 dark:to-blue-600 rounded-2xl shadow-md border border-transparent dark:border-violet-500/30 dark:shadow-indigo-500/30 p-4 flex flex-col justify-end text-white text-left transition-all group ${profileComplete ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                  >
                    <BookOpen className={`w-8 h-8 mb-2 transition-transform ${profileComplete ? 'group-hover:scale-110' : ''}`} />
                    <p className="font-black text-base leading-tight tracking-tight">
                      Phòng học nhóm {!profileComplete && '(Cần hồ sơ)'}
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
                        toast.error('Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này.', {
                          duration: 3000,
                        });
                        setView('profile');
                        return;
                      }
                      navigate(pathForMatching('hobby'));
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
                      Sở thích chung {!profileComplete && '(Cần hồ sơ)'}
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
                      toast.error('Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này.', {
                        duration: 3000,
                      });
                      setView('profile');
                      return;
                    }
                    navigate(pathForMatching('lover'));
                  }}
                  className={`feature-card-lover w-full h-52 rounded-3xl shadow-lg border p-5 flex flex-col justify-end text-left transition-all group ${profileComplete ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'} shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_0_20px_rgba(239,68,68,0.3),_0_4px_6px_-1px_rgba(0,0,0,0.1)]`}
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(31,41,55,0.8)' : '#ffffff',
                    borderColor: theme === 'dark' ? 'rgba(239,68,68,0.2)' : '#f3f4f6'
                  }}
                >
                  <Heart className={`w-11 h-11 text-red-500 mb-3 transition-transform ${profileComplete ? 'group-hover:scale-110 group-hover:rotate-6' : ''}`} />
                  <p className={`font-black text-xl leading-tight tracking-tight ${theme === 'dark' ? 'text-gray-100' : 'text-gray-700'}`}>
                    Hẹn hò ẩn mặt {!profileComplete && '(Cần hồ sơ)'}
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
                      toast.error('Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này.', {
                        duration: 3000,
                      });
                      setView('profile');
                      return;
                    }
                    navigate(pathForMatching('quick'));
                  }}
                  className={`w-full h-52 bg-gradient-to-br from-indigo-950 to-gray-900 rounded-3xl shadow-lg border border-transparent dark:border-indigo-500/30 p-5 flex flex-col justify-end text-white text-left transition-all group ${profileComplete ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                >
                  <Zap className={`w-11 h-11 text-yellow-400 mb-3 transition-transform ${profileComplete ? 'group-hover:scale-110 group-hover:-rotate-6' : ''}`} />
                  <p className="font-black text-xl leading-tight tracking-tight">
                    Gọi nhanh bằng giọng nói {!profileComplete && '(Cần hồ sơ)'}
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
                      toast.error('Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này.', {
                        duration: 3000,
                      });
                      setView('profile');
                      return;
                    }
                    navigate(pathForMatching('study'));
                  }}
                  className={`w-full h-52 bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 dark:from-indigo-700 dark:via-violet-700 dark:to-blue-600 rounded-3xl shadow-lg border border-transparent dark:border-violet-500/30 dark:shadow-indigo-500/30 p-5 flex flex-col justify-end text-white text-left transition-all group ${profileComplete ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                >
                  <BookOpen className={`w-11 h-11 mb-3 transition-transform ${profileComplete ? 'group-hover:scale-110 group-hover:rotate-3' : ''}`} />
                  <p className="font-black text-xl leading-tight tracking-tight">
                    Phòng học thoại nhóm {!profileComplete && '(Cần hồ sơ)'}
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
                      toast.error('Vui lòng hoàn thiện hồ sơ để sử dụng tính năng này.', {
                        duration: 3000,
                      });
                      setView('profile');
                      return;
                    }
                    navigate(pathForMatching('hobby'));
                  }}
                  className={`feature-card-hobby w-full h-52 rounded-3xl shadow-lg border p-5 flex flex-col justify-end text-left transition-all group ${profileComplete ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'} shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_0_20px_rgba(234,179,8,0.25),_0_4px_6px_-1px_rgba(0,0,0,0.1)]`}
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(31,41,55,0.8)' : '#ffffff',
                    borderColor: theme === 'dark' ? 'rgba(234,179,8,0.2)' : '#f3f4f6'
                  }}
                >
                  <Smile className={`w-11 h-11 text-yellow-500 mb-3 transition-transform ${profileComplete ? 'group-hover:scale-110 group-hover:-rotate-3' : ''}`} />
                  <p className={`font-black text-xl leading-tight tracking-tight ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                    Sở thích chung {!profileComplete && '(Cần hồ sơ)'}
                  </p>
                </motion.button>
              </div>
            </div>
          </div>
        );
    }
  };

  useEffect(() => {
    if (!user || !hasProfile) return;

    // Refresh a previously granted token on every signed-in session. The banner
    // asks only when permission is still undecided, so this is non-intrusive.
    if ('Notification' in window && Notification.permission === 'granted') {
      void getFCMToken(user.uid);
    }

    const unsubscribe = setupForegroundListener((payload) => {
      const data = payload.data || {};
      // The Firestore listener already provides an in-app toast while visible.
      // Avoid a duplicate native notification in the same open tab.
      if (document.visibilityState === 'visible' || data.type !== 'message') return;

      const notification = formatMessageNotification(data);
      const nativeNotification = showNotification(notification.title, notification.options);
      if (nativeNotification) {
        nativeNotification.onclick = () => {
          nativeNotification.close();
          if (data.senderUid) {
            handleStartChat(data.senderUid);
          } else {
            setView('conversations');
          }
          window.focus();
        };
      }
    });

    return unsubscribe;
  }, [handleStartChat, hasProfile, setView, user]);

  // Listen for Service Worker messages (notification clicks)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'NOTIFICATION_CLICKED') {
        const data = event.data.data || {};
        if (typeof data.route === 'string') {
          navigate(safeNotificationRoute(data.route));
          return;
        }
        if (data.type === 'message') {
          if (data.senderUid) {
            handleStartChat(data.senderUid);
          } else {
            setView('conversations');
          }
        } else if (data.type === 'call') {
          // The real-time incoming-call listener opens the dialog if the call
          // is still ringing; this navigation merely brings the app forward.
          setView('home');
        } else if (data.type === 'encounter') {
          navigate(pathForExplore('people'));
        } else if (['friend_request', 'friend_accepted', 'new_profile'].includes(data.type)) {
          setView('students');
        } else if (data.type === 'dating_match') {
          navigate(pathForMatching('lover'));
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [handleStartChat, navigate, setView]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--app-bg)]">
        <div className="flex flex-col items-center gap-6 px-6" role="status" aria-live="polite">
          <Logo size="lg" />
          <div className="h-1 w-32 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-indigo-600 dark:bg-indigo-400" />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Đang chuẩn bị không gian của bạn…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">

      {user && hasProfile && (
        <>
          <NotificationPermission currentUser={user} />
          <LiveLocationTracker currentUser={user} />
        </>
      )}

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
            <div className="flex items-center flex-shrink-0">
              <button
                type="button"
                aria-label="Về trang chủ"
                className="flex items-center rounded-xl border-0 bg-transparent p-1 cursor-pointer"
                onClick={() => handleViewChange('home')}
              >
                <Logo size="sm" showText={false} />
                <span className="ml-2 text-base md:text-lg font-extrabold tracking-[-0.03em] whitespace-nowrap text-slate-950 dark:text-white">
                  TVU Connect
                </span>
              </button>
            </div>

            {user && (
              <div className="hidden xl:flex flex-1 justify-center px-4">
                <AppNavigation view={view} onNavigate={handleViewChange} />
              </div>
            )}

            {/* Right: Auth and Logout */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {user && (
                <>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <NotificationBell
                      uid={user.uid}
                      active={view === 'notifications'}
                      onOpen={() => handleViewChange('notifications')}
                    />
                    {/* User Profile Button with Avatar and Name */}
                    <button
                      data-tour="profile"
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
                      className="hidden xl:flex items-center justify-center px-3 py-2 md:px-4 md:py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all duration-300 active:scale-95 whitespace-nowrap flex-shrink-0 shadow-md hover:shadow-xl relative overflow-hidden group"
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
      <main className={`max-w-7xl mx-auto mb-24 xl:mb-0 min-h-[calc(100dvh-5rem)] relative ${view === 'home' ? 'md:flex md:items-center md:justify-center' : ''} ${view === 'explore' ? '' : view === 'home' ? '' : 'px-4 sm:px-6 lg:px-8 py-4 md:py-12'}`}>

        <div className="w-full h-full">
          <AnimatePresence initial={false}>
            <motion.div
              key={view}
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="w-full h-full"
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {user && (
        <>
          <MobileMoreMenu
            open={showMobileMenu}
            onClose={() => setShowMobileMenu(false)}
            onNavigate={handleViewChange}
            onOpenExplore={handleOpenExploreTab}
            onLogout={handleLogout}
          />
          <AppNavigation
            view={view}
            mobile
            moreOpen={showMobileMenu}
            onNavigate={(nextView) => {
              setShowMobileMenu(false);
              handleViewChange(nextView);
            }}
            onMore={() => setShowMobileMenu((open) => !open)}
          />
        </>
      )}

      {/* Footer */}
      <footer className="hidden xl:block py-12 border-t border-gray-100 dark:border-gray-800 mt-12 bg-white dark:bg-gray-900/50">
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
      {activeCall && user && (
        <CallDialog
          currentUser={user}
          peer={activeCall.peer}
          direction={activeCall.direction}
          kind={activeCall.kind}
          incomingCall={activeCall.incomingCall}
          context={activeCall.context}
          onClose={handleCloseCall}
        />
      )}
      <InstallPrompt />
    </div>
  );
}
