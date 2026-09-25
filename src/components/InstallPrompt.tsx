import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, MonitorSmartphone, MoreVertical, Share2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { APP_INSTALL_REQUEST_EVENT, isAndroidDevice, isIosDevice, isStandaloneApp } from '../utils/platform';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __tvuInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

type InstallMode = 'prompt' | 'ios' | 'manual' | 'installed';

const DISMISS_KEY = 'pwa_prompt_v2_dismissed_at';
const DISMISS_TTL = 3 * 24 * 60 * 60 * 1000;

const wasRecentlyDismissed = (): boolean => {
  const previousLegacyValue = localStorage.getItem('pwa_prompt_dismissed');
  const dismissedAt = Number(localStorage.getItem(DISMISS_KEY));

  if (previousLegacyValue) localStorage.removeItem('pwa_prompt_dismissed');
  // Do not let the old passive "Đã hiểu" card hide the new install flow.
  localStorage.removeItem('pwa_prompt_dismissed_at');
  return Number.isFinite(dismissedAt) && dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_TTL;
};

export const InstallPrompt: React.FC = () => {
  const installEventRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [mode, setMode] = useState<InstallMode>('manual');
  const [isInstalling, setIsInstalling] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const openNativeInstallPrompt = useCallback(async (event: BeforeInstallPromptEvent) => {
    setMode('prompt');
    setIsVisible(true);
    setIsInstalling(true);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') {
        setIsVisible(false);
      } else {
        setMode(isIosDevice() ? 'ios' : 'manual');
        setShowGuide(true);
      }
      installEventRef.current = null;
      window.__tvuInstallPrompt = null;
    } finally {
      setIsInstalling(false);
    }
  }, []);

  useEffect(() => {
    if (isStandaloneApp()) return;

    if (window.__tvuInstallPrompt) {
      installEventRef.current = window.__tvuInstallPrompt;
      setMode('prompt');
    }

    const showBestInstallExperience = (force = false) => {
      if (isStandaloneApp()) return;
      if (!force && wasRecentlyDismissed()) return;

      const capturedEvent = window.__tvuInstallPrompt || installEventRef.current;
      if (capturedEvent) {
        installEventRef.current = capturedEvent;
        setMode('prompt');
        setShowGuide(false);
      }
      else if (isIosDevice()) setMode('ios');
      else setMode('manual');
      setIsVisible(true);
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      installEventRef.current = event as BeforeInstallPromptEvent;
      window.__tvuInstallPrompt = event as BeforeInstallPromptEvent;
      if (!wasRecentlyDismissed()) {
        setMode('prompt');
        setShowGuide(false);
        setIsVisible(true);
      }
    };

    const handleInstallReady = () => {
      if (!window.__tvuInstallPrompt) return;
      installEventRef.current = window.__tvuInstallPrompt;
      setMode('prompt');
      setShowGuide(false);
      if (!wasRecentlyDismissed()) setIsVisible(true);
    };

    const handleInstallRequest = () => {
      const event = window.__tvuInstallPrompt || installEventRef.current;
      if (event) {
        // This custom event is dispatched synchronously by the user's click in
        // the utility menu, so Chrome can open its native installer immediately.
        void openNativeInstallPrompt(event);
        return;
      }
      showBestInstallExperience(true);
    };
    const handleAppInstalled = () => {
      installEventRef.current = null;
      window.__tvuInstallPrompt = null;
      localStorage.removeItem(DISMISS_KEY);
      localStorage.setItem('pwa_app_installed', 'true');
      setMode('installed');
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('tvu-connect:install-ready', handleInstallReady);
    window.addEventListener(APP_INSTALL_REQUEST_EVENT, handleInstallRequest);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Be proactive: surface installation without making people hunt through
    // the utility menu. Chrome upgrades this card to the one-click native
    // prompt as soon as its install event is available.
    const proactiveTimer = window.setTimeout(
      () => showBestInstallExperience(),
      isIosDevice() ? 1_500 : 4_000,
    );

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('tvu-connect:install-ready', handleInstallReady);
      window.removeEventListener(APP_INSTALL_REQUEST_EVENT, handleInstallRequest);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.clearTimeout(proactiveTimer);
    };
  }, [openNativeInstallPrompt]);

  const handleInstall = async () => {
    const event = window.__tvuInstallPrompt || installEventRef.current;
    if (!event) {
      setMode(isIosDevice() ? 'ios' : 'manual');
      setShowGuide(true);
      return;
    }

    await openNativeInstallPrompt(event);
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

  const manualSteps = isAndroidDevice()
    ? [
        <>Nhấn nút <MoreVertical className="inline h-4 w-4" aria-hidden="true" /> ở góc trên bên phải Chrome.</>,
        <>Chọn <strong>Thêm vào màn hình chính</strong> hoặc <strong>Cài đặt ứng dụng</strong>.</>,
        <>Nhấn <strong>Cài đặt</strong>; sau đó mở TVU Connect từ màn hình chính.</>,
      ]
    : [
        <>Nhấn biểu tượng cài đặt ở bên phải thanh địa chỉ, nếu trình duyệt đang hiển thị.</>,
        <>Nếu chưa thấy, mở menu trình duyệt và chọn <strong>Cài đặt TVU Connect</strong>.</>,
        <>Xác nhận <strong>Cài đặt</strong> để mở TVU Connect như một ứng dụng riêng.</>,
      ];

  const iosSteps = [
    <>Mở trang này bằng <strong>Safari</strong>.</>,
    <>Nhấn nút <Share2 className="inline h-4 w-4" aria-hidden="true" /> <strong>Chia sẻ</strong> trên thanh công cụ.</>,
    <>Chọn <strong>Thêm vào Màn hình chính</strong>, rồi nhấn <strong>Thêm</strong>.</>,
  ];

  const guideSteps = mode === 'ios' ? iosSteps : manualSteps;
  const shouldShowGuide = mode === 'ios' || mode === 'manual' || showGuide;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[12500] md:bottom-8 md:left-auto md:right-8 md:w-[26rem]"
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
                <p className={`${shouldShowGuide ? 'mb-3' : 'mb-4'} text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-300`}>{description}</p>
                {shouldShowGuide && mode !== 'installed' && (
                  <ol className="mb-4 space-y-2 rounded-xl bg-slate-50 p-3 text-xs font-medium leading-relaxed text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {guideSteps.map((step, index) => (
                      <li key={index} className="flex gap-2">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-indigo-600 text-[10px] font-black text-white">{index + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <button
                  type="button"
                  onClick={mode === 'installed' || shouldShowGuide ? handleDismiss : mode === 'prompt' ? handleInstall : () => setShowGuide(true)}
                  disabled={isInstalling}
                  className={`min-h-11 w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${mode === 'installed' ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                >
                  {isInstalling
                    ? 'Đang mở cài đặt…'
                    : mode === 'prompt'
                      ? 'Cài đặt ngay'
                      : mode === 'installed'
                        ? 'Xong'
                        : shouldShowGuide
                          ? 'Để sau'
                          : 'Xem cách cài'}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
