import React, { useState, useEffect } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { isIosDevice, isStandaloneApp } from '../utils/platform';

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Check if user has already dismissed or installed
      const dismissed = localStorage.getItem('pwa_prompt_dismissed');
      if (!dismissed) {
        setIsVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    const dismissed = localStorage.getItem('pwa_prompt_dismissed');
    const iosTimer = window.setTimeout(() => {
      if (isIosDevice() && !isStandaloneApp() && !dismissed) {
        setShowIosInstructions(true);
        setIsVisible(true);
      }
    }, 2_500);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.clearTimeout(iosTimer);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('pwa_prompt_dismissed', 'true');
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="fixed bottom-24 left-4 right-4 md:left-auto md:right-8 md:bottom-8 md:w-80 z-[100]"
        >
          <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <button 
              onClick={handleDismiss}
              className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Đóng gợi ý cài đặt"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950">
                {showIosInstructions
                  ? <Share2 className="w-6 h-6 text-indigo-600" />
                  : <Download className="w-6 h-6 text-indigo-600" />}
              </div>
              <div className="flex-1">
                <h4 className="mb-1 pr-8 text-lg font-bold leading-tight text-slate-950 dark:text-white">
                  {showIosInstructions ? 'Cài TVU Connect trên iPhone' : 'Cài đặt TVU Connect'}
                </h4>
                <p className="mb-4 text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-300">
                  {showIosInstructions
                    ? 'Trong Safari, nhấn Chia sẻ, chọn Thêm vào Màn hình chính, rồi mở ứng dụng vừa cài để bật thông báo.'
                    : 'Mở nhanh từ màn hình chính và nhận thông báo kể cả khi đã đóng web.'}
                </p>
                <button
                  onClick={showIosInstructions ? handleDismiss : handleInstall}
                  className="min-h-11 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  {showIosInstructions ? 'Đã hiểu' : 'Cài đặt ngay'}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
