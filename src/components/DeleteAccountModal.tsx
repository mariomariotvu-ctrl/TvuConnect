import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, AlertTriangle, X, Shield } from 'lucide-react';
import { reauthenticateWithPopup } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions, googleProvider } from '../firebase';
import { toast } from 'sonner';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ 
  isOpen, 
  onClose,
  userEmail 
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonDetails, setReasonDetails] = useState('');

  const handleClose = () => {
    if (isDeleting) return;
    setStep(1);
    setConfirmText('');
    setReason('');
    setReasonDetails('');
    onClose();
  };

  const handleDeleteAccount = async () => {
    if (confirmText !== 'XÓA TÀI KHOẢN') {
      toast.error('Vui lòng nhập chính xác "XÓA TÀI KHOẢN"');
      return;
    }

    setIsDeleting(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error('Không tìm thấy thông tin người dùng');
        return;
      }

      await reauthenticateWithPopup(user, googleProvider);
      await user.getIdToken(true);
      const deleteAccount = httpsCallable<
        { reason?: string },
        { deleted: boolean }
      >(functions, 'deleteStudentAccount', { timeout: 120_000 });
      const selectedReason = reason === 'Lý do khác' ? reasonDetails : reason;
      await deleteAccount({ reason: selectedReason.trim() || undefined });

      // Clear local storage
      localStorage.clear();
      sessionStorage.clear();

      toast.success('Tài khoản đã được xóa thành công', {
        duration: 3000,
      });

      // Reload page after 2 seconds
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error: any) {
      console.error('Error deleting account:', error);
      
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        toast.info('Bạn đã hủy xác minh. Tài khoản chưa bị xóa.');
      } else if (error.code === 'auth/requires-recent-login' || error.code === 'functions/failed-precondition') {
        toast.error('Vui lòng xác minh lại tài khoản rồi thử xóa lần nữa.', {
          duration: 5000,
        });
      } else {
        toast.error('Có lỗi xảy ra khi xóa tài khoản. Vui lòng thử lại sau.', {
          duration: 4000,
        });
      }
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Close button */}
          {!isDeleting && (
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10"
              aria-label="Đóng hộp thoại xóa tài khoản"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          )}

          {/* Step 1: Warning */}
          {step === 1 && (
            <>
              <div className="bg-gradient-to-r from-red-600 to-red-500 p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <AlertTriangle className="w-8 h-8" />
                  <h2 className="text-2xl font-black">Cảnh báo quan trọng!</h2>
                </div>
                <p className="text-red-100 text-sm">
                  Bạn đang yêu cầu xóa tài khoản vĩnh viễn
                </p>
              </div>

              <div className="p-6">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
                  <p className="text-sm text-red-800 dark:text-red-200 font-semibold mb-3">
                    Hành động này không thể hoàn tác. Khi xóa tài khoản:
                  </p>
                  <ul className="text-sm text-red-700 dark:text-red-300 space-y-2 ml-4">
                    <li>• Toàn bộ thông tin cá nhân sẽ bị xóa vĩnh viễn</li>
                    <li>• Tất cả tin nhắn của bạn sẽ bị xóa</li>
                    <li>• Lịch sử trò chuyện sẽ bị xóa</li>
                    <li>• Bạn sẽ không thể đăng nhập lại với tài khoản này</li>
                    <li>• Dữ liệu KHÔNG THỂ khôi phục sau khi xóa</li>
                  </ul>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
                  <p className="text-sm text-blue-800 dark:text-blue-200 font-semibold mb-2">
                    Bạn có thể thử các lựa chọn khác:
                  </p>
                  <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 ml-4">
                    <li>• Đăng xuất tạm thời và quay lại sau</li>
                    <li>• Ẩn hồ sơ thay vì xóa tài khoản</li>
                    <li>• Liên hệ hỗ trợ nếu gặp vấn đề</li>
                  </ul>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleClose}
                    className="flex-1 px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-bold rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all"
                  >
                    Tiếp tục xóa
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Step 2: Reason (Optional) */}
          {step === 2 && (
            <>
              <div className="bg-gradient-to-r from-orange-600 to-orange-500 p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <Shield className="w-8 h-8" />
                  <h2 className="text-2xl font-black">Lý do rời đi</h2>
                </div>
                <p className="text-orange-100 text-sm">
                  Giúp chúng tôi cải thiện dịch vụ (không bắt buộc)
                </p>
              </div>

              <div className="p-6">
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  Bạn có thể chia sẻ lý do rời khỏi TVU Connect để giúp chúng tôi cải thiện:
                </p>

                <div className="space-y-2 mb-4">
                  {[
                    'Không tìm được người phù hợp',
                    'Giao diện khó sử dụng',
                    'Thiếu tính năng cần thiết',
                    'Gặp vấn đề kỹ thuật',
                    'Không còn nhu cầu sử dụng',
                    'Lý do khác',
                  ].map((option) => (
                    <label
                      key={option}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                    >
                      <input
                        type="radio"
                        name="reason"
                        value={option}
                        checked={reason === option}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-4 h-4 text-orange-600 focus:ring-orange-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {option}
                      </span>
                    </label>
                  ))}
                </div>

                {reason === 'Lý do khác' && (
                  <textarea
                    placeholder="Vui lòng chia sẻ chi tiết hơn..."
                    value={reasonDetails}
                    onChange={(e) => setReasonDetails(e.target.value.slice(0, 240))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    rows={3}
                  />
                )}

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-bold rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                  >
                    Quay lại
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="flex-1 px-6 py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 transition-all"
                  >
                    Tiếp tục
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Final Confirmation */}
          {step === 3 && (
            <>
              <div className="bg-gradient-to-r from-red-700 to-red-600 p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <Trash2 className="w-8 h-8" />
                  <h2 className="text-2xl font-black">Xác nhận cuối cùng</h2>
                </div>
                <p className="text-red-100 text-sm">
                  Nhập chính xác để xác nhận xóa tài khoản
                </p>
              </div>

              <div className="p-6">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 mb-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Tài khoản:
                  </p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {userEmail}
                  </p>
                </div>

                <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-xl p-4 mb-4">
                  <p className="text-sm text-red-800 dark:text-red-200 font-semibold mb-3">
                    Để xác nhận, vui lòng nhập chính xác:
                  </p>
                  <p className="text-center text-lg font-black text-red-600 dark:text-red-400 mb-3 bg-white dark:bg-gray-800 py-2 rounded-lg">
                    XÓA TÀI KHOẢN
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                    placeholder="Nhập chính xác: XÓA TÀI KHOẢN"
                    disabled={isDeleting}
                    className="w-full p-3 border-2 border-red-300 dark:border-red-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-semibold text-center focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(2)}
                    disabled={isDeleting}
                    className="flex-1 px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-bold rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Quay lại
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={confirmText !== 'XÓA TÀI KHOẢN' || isDeleting}
                    className="flex-1 px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isDeleting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Đang xóa...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-5 h-5" />
                        Xóa vĩnh viễn
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
