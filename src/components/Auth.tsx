import React from 'react';
import { auth, googleProvider, signInWithPopup, signInWithRedirect, signOut } from '../firebase';
import { LogIn, LogOut, AlertCircle } from 'lucide-react';
import { User, getRedirectResult } from 'firebase/auth';
import { useTheme } from '../contexts/ThemeContext';
import { logger } from '@/utils/logger';

interface AuthProps {
  user: User | null;
  loading: boolean;
  onProfileClick?: () => void;
  userProfile?: { photoURL?: string; fullName?: string } | null;
}

export const Auth: React.FC<AuthProps> = ({ user, loading, onProfileClick, userProfile }) => {
  const { theme } = useTheme();
  const [error, setError] = React.useState<string | null>(null);
  const [isWebView, setIsWebView] = React.useState(false);
  const [localLoading, setLocalLoading] = React.useState(false);

  // Use profile photo if available, otherwise fall back to Firebase Auth photo
  const displayPhoto = userProfile?.photoURL || user?.photoURL;
  const displayName = userProfile?.fullName || user?.displayName;

  React.useEffect(() => {
    // Detect if we are in a restrictive WebView (Zalo, FB, etc.)
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isRestricted = /Zalo|FBAN|FBAV|Instagram|TikTok|Line/i.test(ua);
    setIsWebView(isRestricted);

    // Handle the redirect result when the component mounts
    let isMounted = true;
    getRedirectResult(auth).then((result) => {
      if (result && isMounted) {
        logger.log('Successfully logged in via redirect');
      }
    }).catch((error) => {
      if (!isMounted) return;
      console.error('Redirect login error:', error);
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
      if (isMounted) setLocalLoading(false);
    });

    return () => { isMounted = false; };
  }, []);

  const handleLogin = async () => {
    setError(null);
    setLocalLoading(true);
    
    const hostname = window.location.hostname;
    const isIP = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname);
    
    if (isIP && hostname !== '127.0.0.1' && hostname !== 'localhost') {
      setError(`Google cấm đăng nhập từ địa chỉ IP (${hostname}). Hãy thêm IP này vào 'Authorized Domains' trong Firebase Console.`);
      setLocalLoading(false);
      return;
    }

    try {
      // Step 1: Always try Popup first (Most stable for session management)
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (error: any) {
        // Step 2: Fallback to Redirect if Popup is blocked or restricted
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
          logger.log('Popup restricted, falling back to redirect...');
          await signInWithRedirect(auth, googleProvider);
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      setLocalLoading(false);
      console.error('Login error:', error);
      
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
        setError(`Lỗi: ${error.message || 'Không thể kết nối. Hãy thử dùng Safari/Chrome.'}`);
      }
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

  if (loading) {
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
              <span className="font-black text-indigo-500 dark:text-white text-sm">
                {displayName ? displayName.charAt(0).toUpperCase() : '👤'}
              </span>
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
  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-[320px]">
      {/* WebView Notice Banner - Clean amber info style */}
      {isWebView && (
        <div className="flex items-start gap-3 w-full px-4 py-3 mb-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertCircle className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200 leading-relaxed">
            Nhấn <span className="inline-block px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-700 rounded font-black text-[12px] mx-0.5">···</span> ở góc trên, chọn <span className="font-black underline decoration-dotted">"Mở bằng trình duyệt"</span> để đăng nhập bằng Google.
          </p>
        </div>
      )}
      
      {/* Login Button */}
      <div className="relative group w-full">
        <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-500 rounded-full blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
        <button
          onClick={handleLogin}
          disabled={localLoading}
          className={`relative w-full flex items-center justify-center gap-3 px-8 py-4 text-base font-black bg-white rounded-full shadow-xl border-2 border-gray-100 transition-all active:scale-[0.98] ${localLoading ? 'opacity-70 cursor-wait' : 'hover:shadow-2xl hover:border-indigo-200'}`}
        >
          {localLoading ? (
            <div className="w-5 h-5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin"></div>
          ) : (
            <LogIn className="w-5 h-5 text-indigo-600" />
          )}
          <span className="font-black text-gray-900 tracking-wide">
            {localLoading ? 'Đang xử lý...' : 'Đăng nhập bằng Google'}
          </span>
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-xl text-[10px] text-red-600 dark:text-red-400 font-bold border border-red-100 dark:border-red-800/50 w-full text-center justify-center">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
