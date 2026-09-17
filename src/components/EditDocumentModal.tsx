import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { DocumentFormData, DocumentLink, ValidationError } from '../types/documentLink';
import { validateDocumentForm } from '../utils/documentValidation';
import { checkURLSecurity } from '../utils/urlValidation';

interface EditDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (id: string, data: DocumentFormData) => Promise<void>;
  document: DocumentLink | null;
}

// Major groups for organized dropdown (same as CreateDocumentModal)
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

export function EditDocumentModal({ isOpen, onClose, onSubmit, document }: EditDocumentModalProps) {
  const [formData, setFormData] = useState<DocumentFormData>({
    title: '',
    major_id: '',
    subject: '',
    category: '',
    url: '',
    description: ''
  });
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [urlWarning, setUrlWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill form when document changes
  useEffect(() => {
    if (document) {
      setFormData({
        title: document.title,
        major_id: document.major_id,
        subject: document.subject,
        category: document.category,
        url: document.url,
        description: document.description
      });
    }
  }, [document]);

  // Lock body scroll when modal is open (prevents background from scrolling on mobile)
  useEffect(() => {
    if (isOpen) {
      const prev = window.document.body.style.overflow;
      window.document.body.style.overflow = 'hidden';
      return () => { window.document.body.style.overflow = prev; };
    }
  }, [isOpen]);

  if (!isOpen || !document) return null;

  const handleChange = (field: keyof DocumentFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear errors for this field
    setErrors(prev => prev.filter(e => e.field !== field));

    // Check URL security when URL changes
    if (field === 'url' && value) {
      const security = checkURLSecurity(value);
      setUrlWarning(security.warning);
    }

    // Reset subject when major changes
    if (field === 'major_id') {
      setFormData(prev => ({ ...prev, subject: '' }));
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
      await onSubmit(document.id, formData);
      setErrors([]);
      setUrlWarning(null);
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

  const modalContent = (
    /* Backdrop: fixed, full-screen, never scrolls itself */
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-3 animate-fadeIn overflow-hidden"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal card: constrained height, internal scroll only */}
      <div 
        className="relative bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full flex flex-col animate-slideUp shadow-2xl"
        style={{ maxHeight: 'min(95dvh, 95vh)' }}
      >
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950 dark:text-white">
                Chỉnh sửa tài liệu
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Cập nhật thông tin tài liệu học thuật của bạn
              </p>
            </div>
            <button
              onClick={onClose}
              className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form - Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {/* Info Banner */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
              <p className="mb-0.5 font-semibold">Cập nhật thông tin</p>
              <p>Chỉnh sửa các trường cần thiết, sau đó chọn “Cập nhật” để lưu.</p>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="flex items-center gap-2 text-[15px] font-bold text-gray-800 dark:text-white mb-1.5">
              <span className="text-purple-600 dark:text-purple-300">📝</span>
              Tiêu đề <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className={`w-full px-3.5 py-2.5 border-2 ${
                getFieldError('title') 
                  ? 'border-red-300 dark:border-red-500' 
                  : 'border-gray-200 dark:border-gray-500'
              } rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 placeholder:text-gray-500 dark:placeholder:text-gray-400 placeholder:font-semibold text-[15px]`}
              placeholder="Ví dụ: Đề thi kết thúc học phần"
            />
            {getFieldError('title') && (
              <p className="mt-1.5 text-sm text-red-600 dark:text-red-300 font-medium" role="alert">
                {getFieldError('title')}
              </p>
            )}
          </div>

          {/* Major */}
          <div>
            <label className="text-[15px] font-bold text-gray-800 dark:text-white mb-1.5">
              Ngành học <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <select
              value={formData.major_id}
              onChange={(e) => handleChange('major_id', e.target.value)}
              className={`w-full px-3.5 py-2.5 border-2 ${
                getFieldError('major_id') 
                  ? 'border-red-300 dark:border-red-500' 
                  : 'border-gray-200 dark:border-gray-500'
              } rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 cursor-pointer`}
            >
              <option value="" className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">Chọn ngành học</option>
              {MAJOR_GROUPS.map((group) => (
                <optgroup key={group.group} label={`━━━━ ${group.group} ━━━━`} className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-sm">
                  {group.majors.map((major) => (
                    <option key={major.id} value={major.id} className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white pl-4">
                      • {major.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {getFieldError('major_id') && (
              <p className="mt-1.5 text-sm text-red-600 dark:text-red-300 font-medium" role="alert">
                {getFieldError('major_id')}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[15px] font-bold text-gray-800 dark:text-white mb-1.5">
                Học phần / môn học
              </label>
              <input
                list="edit-document-subjects"
                value={formData.subject}
                onChange={(e) => handleChange('subject', e.target.value)}
                className="w-full px-3.5 py-2.5 border-2 border-gray-200 dark:border-gray-500 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-400"
                placeholder="Ví dụ: Cơ sở dữ liệu"
              />
              <datalist id="edit-document-subjects">
                {subjectOptions.map((subject) => <option key={subject} value={subject} />)}
              </datalist>
            </div>
            <div>
              <label className="text-[15px] font-bold text-gray-800 dark:text-white mb-1.5">
                Loại học liệu
              </label>
              <select
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
                className="w-full px-3.5 py-2.5 border-2 border-gray-200 dark:border-gray-500 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
              >
                <option value="">Chưa phân loại</option>
                {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
          </div>

          {(formData.category === 'Sách PDF' || formData.category === 'Giáo trình') && (
            <p className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs leading-relaxed text-emerald-800 dark:text-emerald-200">
              Chỉ giữ liên kết đến sách mở, giáo trình được phép chia sẻ hoặc nguồn chính thức.
            </p>
          )}

          {/* URL */}
          <div>
            <label className="flex items-center gap-2 text-[15px] font-bold text-gray-800 dark:text-white mb-1.5">
              Đường link (URL) dẫn đến tài liệu <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => handleChange('url', e.target.value)}
              className={`w-full px-3.5 py-2.5 border-2 ${
                getFieldError('url') 
                  ? 'border-red-300 dark:border-red-500' 
                  : 'border-gray-200 dark:border-gray-500'
              } rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-400`}
              placeholder="https://example.edu.vn/tai-lieu.pdf"
            />
            {getFieldError('url') && (
              <p className="mt-1.5 text-sm text-red-600 dark:text-red-300 font-medium" role="alert">
                {getFieldError('url')}
              </p>
            )}
            {urlWarning && (
              <p className="mt-1.5 text-sm text-yellow-700 dark:text-yellow-300 font-medium" role="status">
                {urlWarning}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="text-[15px] font-bold text-gray-800 dark:text-white mb-1.5">
              Mô tả (không bắt buộc)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
              className="w-full px-3.5 py-2.5 border-2 border-gray-200 dark:border-gray-500 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-400 resize-none text-[15px]"
              placeholder="Mô tả ngắn về tài liệu (tùy chọn)..."
            />
            {getFieldError('description') && (
              <p className="mt-1.5 text-sm text-red-600 dark:text-red-300 font-medium" role="alert">
                {getFieldError('description')}
              </p>
            )}
          </div>
        </form>

        {/* Footer Actions - Sticky */}
        <div className="border-t border-gray-200 dark:border-white/10 px-2 py-1.5 bg-gray-50 dark:bg-gray-900 flex-shrink-0">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-1.5 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 font-semibold"
            >
              Hủy
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 px-4 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Đang cập nhật...</span>
                </>
              ) : (
                <span>Cập nhật</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, window.document.body);
}
