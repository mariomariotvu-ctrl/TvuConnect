import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Cloud, Link2, Loader2, ShieldCheck, X } from 'lucide-react';
import { DocumentFormData, ValidationError } from '../types/documentLink';
import { validateDocumentForm } from '../utils/documentValidation';
import { checkURLSecurity } from '../utils/urlValidation';
import { User } from 'firebase/auth';
import { useTheme } from '../contexts/ThemeContext';
import {
  buildGoogleDriveShareUrl,
  GoogleDriveError,
  pickGoogleDriveFile,
} from '../utils/googleDriveClient';

interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: DocumentFormData) => Promise<void>;
  currentUser: User;
}

// Major groups for organized dropdown
const MAJOR_GROUPS = [
  {
    group: 'Y - Dược (Khối Sức khỏe)',
    majors: [
      { id: 'y-da-khoa', label: 'Y đa khoa' },
      { id: 'rang-ham-mat', label: 'Răng - Hàm - Mặt' },
      { id: 'dieu-duong', label: 'Điều dưỡng' },
      { id: 'duoc-hoc', label: 'Dược học' },
      { id: 'y-hoc-du-phong', label: 'Y học dự phòng' },
      { id: 'xet-nghiem-y-hoc', label: 'Xét nghiệm y học' },
      { id: 'thu-y', label: 'Thú y' }
    ]
  },
  {
    group: 'Kỹ thuật - Công nghệ',
    majors: [
      { id: 'cntt', label: 'Công nghệ thông tin' },
      { id: 'ai', label: 'Trí tuệ nhân tạo (AI)' },
      { id: 'co-khi', label: 'Công nghệ kỹ thuật cơ khí' },
      { id: 'dien-dien-tu', label: 'Công nghệ kỹ thuật điện, điện tử' },
      { id: 'co-dien-tu', label: 'Công nghệ kỹ thuật cơ điện tử' },
      { id: 'xay-dung', label: 'Công nghệ kỹ thuật công trình xây dựng' },
      { id: 'thuc-pham', label: 'Công nghệ thực phẩm' },
      { id: 'moi-truong', label: 'Kỹ thuật môi trường' },
      { id: 'sinh-hoc', label: 'Công nghệ sinh học' }
    ]
  },
  {
    group: 'Kinh tế - Luật - Quản lý',
    majors: [
      { id: 'quan-tri-kinh-doanh', label: 'Quản trị kinh doanh' },
      { id: 'ke-toan', label: 'Kế toán' },
      { id: 'tai-chinh-ngan-hang', label: 'Tài chính - Ngân hàng' },
      { id: 'luat', label: 'Luật' },
      { id: 'quan-ly-nha-nuoc', label: 'Quản lý nhà nước' },
      { id: 'du-lich', label: 'Du lịch (Quản trị dịch vụ du lịch và lữ hành)' }
    ]
  },
  {
    group: 'Sư phạm - Ngôn ngữ - Văn hóa',
    majors: [
      { id: 'su-pham-tieu-hoc', label: 'Sư phạm tiểu học' },
      { id: 'su-pham-mam-non', label: 'Sư phạm mầm non' },
      { id: 'ngon-ngu-anh', label: 'Ngôn ngữ Anh' },
      { id: 'ngon-ngu-trung', label: 'Ngôn ngữ Trung Quốc' },
      { id: 'ngon-ngu-khmer', label: 'Ngôn ngữ Khmer' }
    ]
  }
];

const SUBJECTS_BY_MAJOR: Record<string, string[]> = {
  'cntt': ['Lập trình C', 'Cấu trúc dữ liệu', 'Cơ sở dữ liệu', 'Mạng máy tính', 'Hệ điều hành'],
  'kinh-te': ['Kinh tế vi mô', 'Kinh tế vĩ mô', 'Kế toán', 'Tài chính', 'Marketing'],
  'luat': ['Luật dân sự', 'Luật hình sự', 'Luật hiến pháp', 'Luật kinh tế', 'Luật lao động'],
  'su-pham': ['Tâm lý học', 'Giáo dục học', 'Phương pháp giảng dạy', 'Đánh giá giáo dục'],
  'nong-nghiep': ['Trồng trọt', 'Chăn nuôi', 'Thủy sản', 'Kinh tế nông nghiệp'],
  'khoa-hoc-tu-nhien': ['Toán học', 'Vật lý', 'Hóa học', 'Sinh học', 'Địa lý']
};

const CATEGORIES = [
  'Đề thi',
  'Slide bài giảng',
  'Sách PDF',
  'Tài liệu tham khảo',
  'Bài tập',
  'Giáo trình'
];

export function CreateDocumentModal({ isOpen, onClose, onSubmit, currentUser }: CreateDocumentModalProps) {
  const [formData, setFormData] = useState<DocumentFormData>({
    title: '',
    major_id: '',
    subject: '', // Optional - will be empty string if not filled
    category: '', // Optional - will be empty string if not filled
    url: '',
    description: ''
  });
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [urlWarning, setUrlWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pickingFromDrive, setPickingFromDrive] = useState(false);
  const [driveSelection, setDriveSelection] = useState<string | null>(null);
  const { theme } = useTheme();

  // Lock body scroll when modal is open (prevents background from scrolling on mobile)
  React.useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof DocumentFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear errors for this field
    setErrors(prev => prev.filter(e => e.field !== field));

    // Check URL security when URL changes
    if (field === 'url' && value) {
      const security = checkURLSecurity(value);
      setUrlWarning(security.warning);
      setDriveSelection(null);
    }

    // Reset subject when major changes
    if (field === 'major_id') {
      setFormData(prev => ({ ...prev, subject: '' }));
    }
  };

  const handlePickFromDrive = async () => {
    setPickingFromDrive(true);
    setUrlWarning(null);

    try {
      const selected = await pickGoogleDriveFile();
      if (!selected) return;

      const driveUrl = buildGoogleDriveShareUrl(selected);
      setFormData((current) => ({
        ...current,
        url: driveUrl,
        title: current.title.trim() ? current.title : selected.name,
      }));
      setErrors((current) => current.filter((error) => error.field !== 'url' && error.field !== 'title'));
      setDriveSelection(selected.name);
    } catch (error) {
      if (error instanceof GoogleDriveError && error.code === 'cancelled') return;
      setUrlWarning(error instanceof GoogleDriveError
        ? error.message
        : 'Không thể kết nối Google Drive. Vui lòng thử lại.');
    } finally {
      setPickingFromDrive(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    const validationErrors = validateDocumentForm(formData);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(formData);
      // Reset form
      setFormData({
        title: '',
        major_id: '',
        subject: '',
        category: '',
        url: '',
        description: ''
      });
      setErrors([]);
      setUrlWarning(null);
      setDriveSelection(null);
      onClose();
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const getFieldError = (field: string) => {
    return errors.find(e => e.field === field)?.message;
  };

  const subjectOptions = formData.major_id ? SUBJECTS_BY_MAJOR[formData.major_id] || [] : [];
  const isDark = theme === 'dark';

  // Style objects dựa vào theme thực tế từ app (không phụ thuộc system dark mode của iOS)
  const modalBg    = isDark ? '#111827' : '#ffffff';
  const inputBg    = isDark ? '#1f2937' : '#ffffff';
  const inputBorder= isDark ? '#4b5563' : '#e5e7eb';
  const inputColor = isDark ? '#f9fafb' : '#111827';
  const labelColor = isDark ? '#ffffff' : '#1f2937';
  const footerBg   = isDark ? '#111827' : '#f9fafb';
  const footerBorder= isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb';

  const inputStyle = {
    backgroundColor: inputBg,
    color: inputColor,
    borderColor: inputBorder,
    colorScheme: isDark ? 'dark' as const : 'light' as const,
  };

  const modalContent = (
    /* Backdrop: fixed, full-screen, never scrolls itself */
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-3 animate-fadeIn overflow-hidden"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal card */}
      <div
        className="relative rounded-2xl max-w-2xl w-full flex flex-col animate-slideUp shadow-2xl"
        style={{ maxHeight: 'min(95dvh, 95vh)', backgroundColor: modalBg, colorScheme: isDark ? 'dark' : 'light' }}
      >
        {/* Header with Gradient - Compact */}
        <div className="relative bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-700 p-2 flex-shrink-0">
          {/* Decorative circles */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full translate-x-1/4 -translate-y-1/4"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white rounded-full -translate-x-1/3 translate-y-1/3"></div>
          </div>
          
          <div className="relative flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-white">
                Đóng góp tài liệu
              </h2>
              <p className="text-xs text-white/90 mt-0.5 line-clamp-2">
                Chia sẻ tài liệu học thuật để xây dựng kho học liệu chung cho cộng đồng sinh viên TVU
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-all duration-200 flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form - Scrollable with max height */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">

          {/* In-app library guidance */}
          <div className="rounded-xl p-2.5" style={{
            backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : '#ffffff',
            border: `1px solid ${isDark ? '#1d4ed8' : '#e5e7eb'}`
          }}>
            <div className="flex items-start gap-2">
              <Link2 className="h-4 w-4 flex-shrink-0 text-indigo-500" />
              <div className="text-xs">
                <p className="font-bold" style={{ color: isDark ? '#f3f4f6' : '#1f2937' }}>Đóng góp nguồn học liệu hợp pháp</p>
                <p className="mt-1 leading-relaxed" style={{ color: isDark ? '#d1d5db' : '#4b5563' }}>
                  Dán liên kết trực tiếp đến PDF, tài liệu công khai hoặc thư viện số. Người đọc sẽ xem ngay trong TVU Connect khi nguồn cho phép nhúng.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Chọn trực tiếp từ Google Drive</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  Chỉ cấp quyền cho file bạn chọn; TVU Connect không đọc toàn bộ Drive.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handlePickFromDrive()}
                disabled={pickingFromDrive || submitting}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
              >
                {pickingFromDrive ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Cloud className="h-4 w-4" aria-hidden="true" />}
                {pickingFromDrive ? 'Đang kết nối…' : 'Chọn từ Drive'}
              </button>
            </div>
            {driveSelection && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">Đã chọn: {driveSelection}</span>
              </div>
            )}
          </div>



          {/* Title */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-bold mb-1" style={{ color: labelColor }}>
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className="w-full px-3 py-2 border-2 rounded-xl font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 text-sm"
              style={{ ...inputStyle, borderColor: getFieldError('title') ? '#f87171' : inputBorder }}
              placeholder="Ví dụ: Đề thi kết thúc học phần"
            />
            {getFieldError('title') && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1 font-medium">
                {getFieldError('title')}
              </p>
            )}
          </div>

          {/* Major */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-bold mb-1" style={{ color: labelColor }}>
              Ngành học <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.major_id}
              onChange={(e) => handleChange('major_id', e.target.value)}
              className="w-full px-3 py-2 border-2 rounded-xl font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 cursor-pointer text-sm"
              style={{ ...inputStyle, borderColor: getFieldError('major_id') ? '#f87171' : inputBorder }}
            >
              <option value="">Chọn ngành học</option>
              {MAJOR_GROUPS.map((group) => (
                <optgroup key={group.group} label={`━━━━ ${group.group} ━━━━`}>
                  {group.majors.map((major) => (
                    <option key={major.id} value={major.id}>• {major.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {getFieldError('major_id') && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1 font-medium">
                {getFieldError('major_id')}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-bold mb-1" style={{ color: labelColor }}>
                Học phần / môn học
              </label>
              <input
                list="create-document-subjects"
                value={formData.subject}
                onChange={(e) => handleChange('subject', e.target.value)}
                className="w-full px-3 py-2 border-2 rounded-xl font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 text-sm"
                style={inputStyle}
                placeholder="Ví dụ: Cơ sở dữ liệu"
              />
              <datalist id="create-document-subjects">
                {subjectOptions.map((subject) => <option key={subject} value={subject} />)}
              </datalist>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-bold mb-1" style={{ color: labelColor }}>
                Loại học liệu
              </label>
              <select
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
                className="w-full px-3 py-2 border-2 rounded-xl font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 text-sm"
                style={inputStyle}
              >
                <option value="">Chưa phân loại</option>
                {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
          </div>

          {(formData.category === 'Sách PDF' || formData.category === 'Giáo trình') && (
            <p className="rounded-xl px-3 py-2 text-xs leading-relaxed" style={{ backgroundColor: isDark ? 'rgba(16,185,129,.12)' : '#ecfdf5', color: isDark ? '#a7f3d0' : '#065f46' }}>
              Chỉ đăng sách mở, giáo trình được phép chia sẻ hoặc liên kết chính thức của nhà trường/nhà xuất bản.
            </p>
          )}

          {/* URL Input */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-bold mb-1" style={{ color: labelColor }}>
              Liên kết tài liệu <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => handleChange('url', e.target.value)}
              className="w-full px-3 py-2 border-2 rounded-xl font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 text-sm"
              style={{ ...inputStyle, borderColor: getFieldError('url') ? '#f87171' : inputBorder }}
              placeholder="https://example.edu.vn/tai-lieu.pdf hoặc chọn từ Google Drive"
            />
            {getFieldError('url') && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1 font-medium">
                {getFieldError('url')}
              </p>
            )}
            {urlWarning && (
              <p className="mt-1 text-xs text-yellow-600 flex items-center gap-1 font-medium">
                {urlWarning}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="pb-2">
            <label className="flex items-center gap-1.5 text-sm font-bold mb-1" style={{ color: labelColor }}>
              Mô tả (không bắt buộc)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border-2 rounded-xl font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 resize-none text-sm"
              style={inputStyle}
              placeholder="Mô tả ngắn về tài liệu (tùy chọn)..."
            />
            {getFieldError('description') && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1 font-medium">
                {getFieldError('description')}
              </p>
            )}
          </div>
        </form>
        {/* Footer Actions - Sticky */}
        <div className="px-2 py-1.5 flex-shrink-0" style={{ borderTop: `1px solid ${footerBorder}`, backgroundColor: footerBg }}>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-1.5 border-2 rounded-t-xl rounded-b-xl transition-all duration-200 font-semibold text-sm"
              style={{ borderColor: isDark ? '#4b5563' : '#d1d5db', color: isDark ? '#d1d5db' : '#374151', backgroundColor: 'transparent' }}
            >
              Hủy
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-t-xl rounded-b-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg flex items-center justify-center gap-2 text-sm"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Đang thêm...</span>
                </>
              ) : (
                <span>Đóng góp tài liệu</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
