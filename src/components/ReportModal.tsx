import React, { useState } from 'react';
import { toast } from 'sonner';
import { db, collection, setDoc, doc, serverTimestamp } from '../firebase';
import { AlertTriangle, X, Send, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reporterUid: string;
  reportedUid: string;
  reportedName: string;
}

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, reporterUid, reportedUid, reportedName }) => {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const reasons = [
    'Thông tin không chính xác',
    'Ngôn từ công kích/xúc phạm',
    'Quấy rối',
    'Spam/Quảng cáo',
    'Khác'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;

    setSubmitting(true);
    try {
      const reportId = `${reporterUid}_${reportedUid}_${Date.now()}`;
      await setDoc(doc(db, 'reports', reportId), {
        reporterUid,
        reportedUid,
        reason,
        details,
        createdAt: serverTimestamp()
      });
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setReason('');
        setDetails('');
      }, 2000);
    } catch (error) {
      console.error('Error reporting user:', error);
      toast.error('Có lỗi xảy ra khi gửi báo cáo. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-red-50">
              <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold">Báo cáo người dùng</h3>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-red-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-red-400" />
              </button>
            </div>

            <div className="p-6">
              {success ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Send className="w-8 h-8" />
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 mb-2">Đã gửi báo cáo</h4>
                  <p className="text-gray-500">Cảm ơn bạn đã giúp cộng đồng TVU an toàn hơn.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <p className="text-sm text-gray-600 mb-4">
                    Bạn đang báo cáo hồ sơ của <strong>{reportedName}</strong>. Vui lòng chọn lý do:
                  </p>
                  
                  <div className="space-y-2">
                    {reasons.map((r) => (
                      <label 
                        key={r}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                          reason === r ? 'border-red-500 bg-red-50' : 'border-gray-100 hover:border-gray-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name="reason"
                          value={r}
                          checked={reason === r}
                          onChange={(e) => setReason(e.target.value)}
                          className="hidden"
                        />
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          reason === r ? 'border-red-500' : 'border-gray-300'
                        }`}>
                          {reason === r && <div className="w-2 h-2 bg-red-500 rounded-full" />}
                        </div>
                        <span className={`text-sm font-medium ${reason === r ? 'text-red-700' : 'text-gray-700'}`}>
                          {r}
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Chi tiết thêm (không bắt buộc)</label>
                    <textarea
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none transition-all resize-none"
                      rows={3}
                      placeholder="Mô tả thêm về hành vi vi phạm..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!reason || submitting}
                    className="w-full py-4 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 disabled:bg-red-300 transition-all flex items-center justify-center gap-2 shadow-lg"
                  >
                    {submitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        Gửi báo cáo
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
