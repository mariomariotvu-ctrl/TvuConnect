import React from 'react';
import { auth, googleProvider, signInWithPopup, signInWithRedirect, signOut } from '../firebase';
import { LogIn, LogOut, AlertCircle, UserRound } from 'lucide-react';
import { User, getRedirectResult } from 'firebase/auth';
import { logger } from '@/utils/logger';
import {
  isRestrictedAuthWebView,
} from '@/utils/authBrowser';
import { getDiagnosticSupportCode, logError, trackClientEvent } from '@/utils/errorTracking';
import { ExternalBrowserLogin } from './ExternalBrowserLogin';

interface AuthProps {
  user: User | null;
  loading: boolean;
  onProfileClick?: () => void;
  userProfile?: { photoURL?: string; fullName?: string } | null;
}

export const Auth: React.FC<AuthProps> = ({ user, loading, onProfileClick, userProfile }) => {
  const [error, setError] = React.useState<string | null>(null);
  const [isWebView] = React.useState(() => isRestrictedAuthWebView());
  const [localLoading, setLocalLoading] = React.useState(false);
  const loginPending = React.useRef(false);

  // Use profile photo if available, otherwise fall back to Firebase Auth photo
  const displayPhoto = userProfile?.photoURL || user?.photoURL;
  const displayName = userProfile?.fullName || user?.displayName;

  React.useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const externalAuthRequest = currentUrl.searchParams.get('externalAuth');
    const handoffId = currentUrl.searchParams.get('handoffId') || undefined;

    // Redirect login cannot preserve Firebase's initial state inside Zalo and
    // similar storage-partitioned webviews. Never try to recover a redirect in
    // those browsers; the login card below directs users to Safari/Chrome.
    if (isWebView) {
      if (externalAuthRequest === 'google') {
        trackClientEvent('auth.handoff_stayed_in_webview', { handoffId });
      }
      setLocalLoading(false);
      return undefined;
    }

    if (externalAuthRequest === 'google') {
      trackClientEvent('auth.handoff_arrived', { handoffId });
      currentUrl.searchParams.delete('externalAuth');
      window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
      // Never auto-start another OAuth round trip on arrival. App's auth observer
      // restores an existing user; otherwise the button starts login from a tap.
      if (auth.currentUser) trackClientEvent('auth.handoff_reused_session', { handoffId });
    }

    // Handle the redirect result when the component mounts
    let isMounted = true;
    getRedirectResult(auth).then((result) => {
      if (result && isMounted) {
        logger.log('Successfully logged in via redirect');
        trackClientEvent('auth.redirect_completed', { handoffId, provider: 'google' });
      } else if (handoffId && externalAuthRequest !== 'google' && isMounted) {
        trackClientEvent('auth.redirect_no_result', { handoffId, provider: 'google' });
      }
    }).catch((error) => {
      if (!isMounted) return;
      console.error('Redirect login error:', error);
      logError(error?.message || 'Firebase redirect login failed', {
        eventType: 'auth.redirect_failed',
        stack: error?.stack,
        severity: 'high',
        context: { handoffId, code: error?.code || 'unknown' },
      });
      if (error.code === 'auth/unauthorized-domain') {
        setError('Tên miền này chưa được cấp phép trong Firebase Console.');
      } else if (error.code === 'auth/operation-not-allowed') {
        setError('Đăng nhập Google chưa được bật trong Firebase.');
      } else if (error.code === 'auth/popup-blocked') {
        setError('Trình duyệt đã chặn cửa sổ đăng nhập. Hãy thử lại.');
      } else if (error.message?.includes('api-key-not-valid')) {
        setError('Hệ thống đang cập nhật. Vui lòng thử lại sau vài phút.');
      } else {
        if (error.code !== 'auth/popup-closed-by-user') {
          setError('Có lỗi xảy ra. Hãy thử mở ứng dụng bằng Safari hoặc Chrome.');
        }
      }
    }).finally(() => {
      // Keep handoffId until login succeeds so a later button tap is correlated.
      if (isMounted) setLocalLoading(false);
    });

    return () => { isMounted = false; };
  }, [isWebView]);

  const handleLogin = async () => {
    setError(null);

    if (isWebView || loginPending.current || auth.currentUser) return;

    loginPending.current = true;
    setLocalLoading(true);
    const handoffId = new URL(window.location.href).searchParams.get('handoffId') || undefined;
    
    const hostname = window.location.hostname;
    const isIP = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname);
    
    if (isIP && hostname !== '127.0.0.1' && hostname !== 'localhost') {
      setError(`Google cấm đăng nhập từ địa chỉ IP (${hostname}). Hãy thêm IP này vào 'Authorized Domains' trong Firebase Console.`);
      setLocalLoading(false);
      loginPending.current = false;
      return;
    }

    try {
      // Step 1: Always try Popup first (Most stable for session management)
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      trackClientEvent('auth.popup_started', { provider: 'google', handoffId });
      
      try {
        await signInWithPopup(auth, googleProvider);
        trackClientEvent('auth.popup_completed', { provider: 'google', handoffId });
      } catch (error: any) {
        // Step 2: Fallback to Redirect if Popup is blocked or restricted
        if (error.code === 'auth/popup-blocked') {
          logger.log('Popup restricted, falling back to redirect...');
          trackClientEvent('auth.popup_fallback_redirect', { code: error.code, handoffId });
          await signInWithRedirect(auth, googleProvider);
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      setLocalLoading(false);
      console.error('Login error:', error);
      logError(error?.message || 'Google login failed', {
        eventType: 'auth.login_failed',
        stack: error?.stack,
        severity: 'high',
        context: { code: error?.code || 'unknown', handoffId },
      });
      
      if (error.code === 'auth/unauthorized-domain') {
        setError(`Tên miền '${hostname}' chưa được cấp phép trong Firebase (Authentication -> Settings -> Authorized domains).`);
      } else if (error.code === 'auth/popup-closed-by-user') {
        setError('Cửa sổ đăng nhập đã bị đóng hoặc bị trình duyệt chặn. Hãy thử lại hoặc dùng Safari/Chrome.');
      } else if (error.message?.includes('api-key-not-valid') || error.message?.includes('API key')) {
        console.error('Firebase API Key Error:', {
          apiKey: import.meta.env.VITE_FIREBASE_API_KEY ? 'Exists' : 'Missing',
          projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
          error: error.message
        });
        setError('Lỗi kết nối Firebase. Vui lòng thử lại hoặc liên hệ admin.');
      } else {
        setError('Không thể đăng nhập lúc này. Vui lòng thử lại bằng Safari hoặc Chrome.');
      }
    } finally {
      loginPending.current = false;
      setLocalLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setError(null);
      await signOut(auth);
      // Clean reload ensures all auth states are wiped
      window.location.replace(window.location.origin);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading && !isWebView) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse transition-all">
        <div className="w-5 h-5 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
        <div className="w-20 h-4 bg-gray-300 dark:bg-gray-600 rounded"></div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4">
        {/* Profile Avatar - clickable to go to Profile */}
        <div 
          onClick={onProfileClick}
          className="flex items-center gap-2 pr-3 pl-1 py-1 bg-white hover:bg-gray-50 border border-gray-100 rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_15px_rgba(0,0,0,0.08)] transition-all group shrink-0 cursor-pointer active:scale-95 dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {displayPhoto ? (
            <img
              src={displayPhoto}
              alt={displayName || 'User'}
              className="w-8 h-8 md:w-9 md:h-9 rounded-full object-cover shadow-sm group-hover:opacity-90 transition-opacity"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-600 dark:to-blue-600 flex items-center justify-center shadow-sm">
              {displayName ? (
                <span className="font-bold text-indigo-600 dark:text-white text-sm">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              ) : (
                <UserRound className="h-4 w-4 text-indigo-600 dark:text-white" />
              )}
            </div>
          )}
          <span className="text-[13px] md:text-sm font-extrabold text-gray-900 dark:text-white tracking-tight hidden sm:inline max-w-[120px] truncate">
            {displayName?.split(' ').pop()}
          </span>
        </div>
        
        {/* Logout button */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-[#e11d48] bg-[#ffe4e6] hover:bg-[#fecdd3] rounded-full transition-all active:scale-95 border border-[#fecdd3] shrink-0 whitespace-nowrap"
        >
          <LogOut className="w-4 h-4 stroke-[2.5]" />
          <span>Đăng xuất</span>
        </button>
      </div>
    );
  }

  // === LOGIN SCREEN ===
  if (isWebView) return <ExternalBrowserLogin />;

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-[320px]">
      <div className="w-full">
        <button
          onClick={handleLogin}
          disabled={localLoading}
          className={`w-full min-h-12 flex items-center justify-center gap-3 px-6 py-3.5 text-base font-semibold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 rounded-xl shadow-sm border border-indigo-600 dark:border-indigo-400 ${localLoading ? 'opacity-70 cursor-wait' : 'cursor-pointer'}`}
        >
          {localLoading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white" aria-hidden="true"></div>
          ) : (
            <LogIn className="h-5 w-5 text-white" aria-hidden="true" />
          )}
          <span>
            {localLoading
              ? 'Đang xử lý...'
              : 'Đăng nhập bằng Google'}
          </span>
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-xl text-[10px] text-red-600 dark:text-red-400 font-bold border border-red-100 dark:border-red-800/50 w-full text-left">
          <AlertCircle className="mt-0.5 w-3.5 h-3.5 shrink-0" />
          <span className="min-w-0">
            <span className="block">{error}</span>
            <span className="mt-1 block font-mono opacity-80">Mã hỗ trợ: {getDiagnosticSupportCode()}</span>
          </span>
        </div>
      )}
    </div>
  );
};
