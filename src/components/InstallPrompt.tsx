import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, MonitorSmartphone, Share2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { APP_INSTALL_REQUEST_EVENT, isIosDevice, isStandaloneApp } from '../utils/platform';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type InstallMode = 'prompt' | 'ios' | 'manual' | 'installed';

const DISMISS_KEY = 'pwa_prompt_dismissed_at';
const DISMISS_TTL = 14 * 24 * 60 * 60 * 1000;

const wasRecentlyDismissed = (): boolean => {
  const previousLegacyValue = localStorage.getItem('pwa_prompt_dismissed');
  const dismissedAt = Number(localStorage.getItem(DISMISS_KEY));

  if (previousLegacyValue) localStorage.removeItem('pwa_prompt_dismissed');
  return Number.isFinite(dismissedAt) && dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_TTL;
};

export const InstallPrompt: React.FC = () => {
  const installEventRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [mode, setMode] = useState<InstallMode>('manual');
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    if (isStandaloneApp()) return;

    const showBestInstallExperience = (force = false) => {
      if (isStandaloneApp()) return;
      if (!force && wasRecentlyDismissed()) return;

      if (installEventRef.current) setMode('prompt');
      else if (isIosDevice()) setMode('ios');
      else setMode('manual');
      setIsVisible(true);
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      installEventRef.current = event as BeforeInstallPromptEvent;
      if (!wasRecentlyDismissed()) {
        setMode('prompt');
        setIsVisible(true);
      }
    };

    const handleInstallRequest = () => showBestInstallExperience(true);
    const handleAppInstalled = () => {
      installEventRef.current = null;
      localStorage.removeItem(DISMISS_KEY);
      localStorage.setItem('pwa_app_installed', 'true');
      setMode('installed');
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener(APP_INSTALL_REQUEST_EVENT, handleInstallRequest);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Safari/Firefox do not expose beforeinstallprompt. They still receive a
    // useful platform-specific installation guide instead of no action at all.
    const fallbackTimer = window.setTimeout(() => showBestInstallExperience(), 3_500);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener(APP_INSTALL_REQUEST_EVENT, handleInstallRequest);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  const handleInstall = async () => {
    const event = installEventRef.current;
    if (!event) {
      setMode(isIosDevice() ? 'ios' : 'manual');
      return;
    }

    setIsInstalling(true);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') setIsVisible(false);
      else localStorage.setItem(DISMISS_KEY, String(Date.now()));
      installEventRef.current = null;
    } finally {
      setIsInstalling(false);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    if (mode !== 'installed') localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const icon = mode === 'ios'
    ? <Share2 className="h-6 w-6 text-indigo-600" />
    : mode === 'installed'
      ? <CheckCircle2 className="h-6 w-6 text-emerald-600" />
      : mode === 'manual'
        ? <MonitorSmartphone className="h-6 w-6 text-indigo-600" />
        : <Download className="h-6 w-6 text-indigo-600" />;

  const title = mode === 'ios'
    ? 'Cài TVU Connect trên iPhone'
    : mode === 'installed'
      ? 'TVU Connect đã được cài'
      : mode === 'manual'
        ? 'Dùng TVU Connect như ứng dụng'
        : 'Cài đặt TVU Connect';

  const description = mode === 'ios'
    ? 'Trong Safari: nhấn Chia sẻ → Thêm vào Màn hình chính → Thêm. Sau đó mở biểu tượng TVU Connect vừa xuất hiện.'
    : mode === 'installed'
      ? 'Ứng dụng đã sẵn sàng trên màn hình chính. Trình duyệt sẽ giữ nguyên trang này để bạn không mất nội dung đang làm.'
      : mode === 'manual'
        ? 'Mở menu của trình duyệt và chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”. Ứng dụng sẽ dùng toàn màn hình và giữ đúng trang khi mở lại.'
        : 'Mở nhanh từ màn hình chính, chọn/chụp ảnh ổn định hơn và nhận thông báo khi đã đóng web.';

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[12500] md:bottom-8 md:left-auto md:right-8 md:w-96"
        >
          <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={handleDismiss}
              className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Đóng gợi ý cài đặt"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${mode === 'installed' ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-indigo-50 dark:bg-indigo-950'}`}>
                {icon}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="mb-1 pr-8 text-lg font-bold leading-tight text-slate-950 dark:text-white">{title}</h4>
                <p className="mb-4 text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-300">{description}</p>
                <button
                  type="button"
                  onClick={mode === 'prompt' ? handleInstall : handleDismiss}
                  disabled={isInstalling}
                  className={`min-h-11 w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${mode === 'installed' ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                >
                  {isInstalling ? 'Đang mở cài đặt…' : mode === 'prompt' ? 'Cài đặt ngay' : mode === 'installed' ? 'Xong' : 'Đã hiểu'}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
