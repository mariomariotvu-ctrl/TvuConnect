import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, AlertCircle, FileText, Shield } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface TermsModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => Promise<void>;
}

export const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onAccept, onDecline }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  const canAccept = termsAccepted && privacyAccepted;

  const handleAccept = async () => {
    if (!canAccept) return;
    setIsAccepting(true);
    await onAccept();
    setIsAccepting(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-3 sm:p-6 overflow-y-auto" style={{ height: '100dvh' }}>
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-md" 
            onClick={onDecline} 
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.96, y: 12 }} 
            animate={{ opacity: 1, scale: 1, y: 0 }} 
            exit={{ opacity: 0, scale: 0.96, y: 12 }} 
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            className={`relative my-auto w-full max-w-2xl max-h-[96vh] sm:max-h-[90vh] rounded-2xl sm:rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col ${isDark ? 'bg-gray-800 ring-1 ring-white/10' : 'bg-white'}`}
          >
            <div className="relative p-4 pt-12 sm:p-6 sm:pt-6 text-white shrink-0" style={{ background: 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)' }}>
            <button 
              onClick={onDecline} 
              className="absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-200 hover:scale-110 active:scale-95 border border-white/20"
            >
              <X className="w-4 h-4 sm:w-4.5 sm:h-4.5" strokeWidth={2.5} />
            </button>
            <h2 className="text-xl sm:text-2xl font-bold mb-1.5 sm:mb-2">Chào mừng đến TVU Connect! </h2>
            <p className="text-white/90 text-xs sm:text-sm">Vui lòng đọc và đồng ý với các điều khoản để tiếp tục</p>
          </div>
          <div className={`flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-6 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className={`rounded-lg sm:rounded-xl p-3 sm:p-5 border-2 transition-all cursor-pointer ${termsAccepted ? (isDark ? 'border-purple-500 bg-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'border-purple-500 bg-purple-50') : (isDark ? 'border-gray-700 bg-gray-900/50 hover:border-gray-600' : 'border-gray-200 bg-gray-50 hover:border-gray-300')}`} onClick={() => setTermsAccepted(!termsAccepted)}>
              <div className="flex items-start gap-2.5 sm:gap-3">
                <div className="shrink-0 mt-0.5 sm:mt-1">{termsAccepted ? <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" /> : <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 ${isDark ? 'border-gray-600' : 'border-gray-300'}`} />}</div>
                <div className="flex-1 min-w-0"><h3 className={`font-semibold text-sm sm:text-lg mb-1.5 sm:mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Điều khoản sử dụng</h3><p className={`text-[13px] sm:text-sm leading-[1.6] sm:leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Tôi đồng ý tuân thủ các quy định về hành vi, nội dung và sử dụng nền tảng một cách có trách nhiệm.</p></div>
              </div>
            </div>
            <div className={`rounded-lg sm:rounded-xl p-3 sm:p-5 border-2 transition-all cursor-pointer ${privacyAccepted ? (isDark ? 'border-blue-500 bg-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'border-blue-500 bg-blue-50') : (isDark ? 'border-gray-700 bg-gray-900/50 hover:border-gray-600' : 'border-gray-200 bg-gray-50 hover:border-gray-300')}`} onClick={() => setPrivacyAccepted(!privacyAccepted)}>
              <div className="flex items-start gap-2.5 sm:gap-3">
                <div className="shrink-0 mt-0.5 sm:mt-1">{privacyAccepted ? <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" /> : <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 ${isDark ? 'border-gray-600' : 'border-gray-300'}`} />}</div>
                <div className="flex-1 min-w-0"><h3 className={`font-semibold text-sm sm:text-lg mb-1.5 sm:mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Chính sách bảo mật</h3><p className={`text-[13px] sm:text-sm leading-[1.6] sm:leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Tôi hiểu và đồng ý với cách TVU Connect thu thập, sử dụng và bảo vệ thông tin cá nhân của tôi.</p></div>
              </div>
            </div>
            <div className="rounded-lg sm:rounded-xl p-3 sm:p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700">
              <div className="flex items-start gap-2.5 sm:gap-3"><AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" /><div className="flex-1 min-w-0"><p className="text-xs sm:text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-1">Lưu ý quan trọng</p><p className="text-[11px] sm:text-xs text-yellow-700 dark:text-yellow-300 leading-relaxed">Bằng việc đồng ý, bạn xác nhận rằng bạn đã đọc, hiểu và chấp nhận tất cả các điều khoản. Nếu bạn không đồng ý, vui lòng không sử dụng dịch vụ.</p></div></div>
            </div>
          </div>
          <div className={`p-3 sm:px-6 sm:py-5 pb-[calc(0.75rem+env(safe-area-inset-bottom)+60px)] sm:pb-5 border-t flex flex-col-reverse sm:flex-row items-center justify-between gap-3 sm:gap-4 shrink-0 ${isDark ? 'bg-[#18181b] border-white/5' : 'bg-gray-50 border-gray-200'} relative z-10`}>
            {/* Modern pill links */}
            <div className="flex items-center justify-center sm:justify-start gap-2 w-full sm:w-auto">
              <a href="/terms-of-service.html" target="_blank" rel="noopener noreferrer" className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-[13px] font-bold tracking-wide flex items-center justify-center gap-1.5 sm:gap-2 transition-all duration-300 border ${isDark ? 'bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/40 hover:text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.1)]' : 'bg-purple-50 border-purple-100 text-purple-700 hover:bg-purple-100 hover:border-purple-200 shadow-sm'} hover:-translate-y-0.5 hover:shadow-md`}>
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Điều khoản
              </a>
              <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-[13px] font-bold tracking-wide flex items-center justify-center gap-1.5 sm:gap-2 transition-all duration-300 border ${isDark ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/40 hover:text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.1)]' : 'bg-blue-50 border-blue-100 text-blue-700 hover:bg-blue-100 hover:border-blue-200 shadow-sm'} hover:-translate-y-0.5 hover:shadow-md`}>
                <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Bảo mật
              </a>
            </div>
            
            <button 
              onClick={handleAccept} 
              disabled={!canAccept || isAccepting} 
              className={`w-full sm:w-auto py-2.5 sm:py-3 px-6 sm:px-8 rounded-[12px] font-bold text-xs sm:text-[14px] tracking-wide transition-all duration-300 ${
                canAccept && !isAccepting 
                  ? 'bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-500 hover:to-blue-400 text-white shadow-[0_4px_14px_0_rgba(147,51,234,0.39)] hover:shadow-[0_6px_20px_rgba(147,51,234,0.23)] hover:-translate-y-0.5' 
                  : 'bg-gray-100 dark:bg-[#27272a] text-gray-400 dark:text-[#71717a] cursor-not-allowed border-transparent dark:border-[#3f3f46]/50 border'
              }`}
            >
              {isAccepting ? 'Đang xử lý...' : 'Đồng ý & Tiếp tục'}
            </button>
          </div>
        </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
