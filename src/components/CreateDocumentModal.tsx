import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink } from 'lucide-react';
import { DocumentFormData, ValidationError } from '../types/documentLink';
import { validateDocumentForm } from '../utils/documentValidation';
import { checkURLSecurity } from '../utils/urlValidation';
import { User } from 'firebase/auth';
import { useTheme } from '../contexts/ThemeContext';

// Shared Google Drive folder where users upload their files
const DRIVE_FOLDER_URL = `https://drive.google.com/drive/folders/1xy-liEmL_JZzarKrpO5Z3jqwdQNC2jP1`;

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
  const [activeTab, setActiveTab] = useState<'link' | 'drive'>('link');
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

  const handleChange = (field: keyof DocumentFormData, value: string) => {    setFormData(prev => ({ ...prev, [field]: value }));
    
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
  const tabInactBg = isDark ? '#374151' : '#f3f4f6';
  const tabInactColor= isDark ? '#d1d5db' : '#374151';

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

          {/* Tab Switcher */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('link')}
              className={`flex-1 px-3 py-2 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'link'
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                  : ''
              }`}
              style={activeTab !== 'link' ? { backgroundColor: tabInactBg, color: tabInactColor } : {}}
            >
              🔗 Gắn link tài liệu
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('drive')}
              className={`flex-1 px-3 py-2 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'drive'
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                  : ''
              }`}
              style={activeTab !== 'drive' ? { backgroundColor: tabInactBg, color: tabInactColor } : {}}
            >
              📁 Kho Drive
            </button>
          </div>

          {/* TAB: Kho Drive */}
          {activeTab === 'drive' && (
            <div className="space-y-3 py-2">
              {/* Giới thiệu */}
              <div className="rounded-xl p-3" style={{
                background: isDark ? 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))' : 'linear-gradient(135deg, #eef2ff, #f5f3ff)',
                border: `1px solid ${isDark ? '#4f46e5' : '#c7d2fe'}`
              }}>
                <div className="flex items-start gap-2">
                  <span className="text-2xl flex-shrink-0">📚</span>
                  <div>
                    <p className="text-sm font-bold mb-1" style={{ color: isDark ? '#a5b4fc' : '#3730a3' }}>
                      Kho Tài Liệu Học Tập TVU Connect
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: isDark ? '#c7d2fe' : '#4338ca' }}>
                      Thư mục Google Drive chung — mọi sinh viên TVU đều có thể upload và xem tài liệu. Miễn phí, không cần tài khoản đặc biệt.
                    </p>
                  </div>
                </div>
              </div>

              {/* Hướng dẫn các bước */}
              <div className="space-y-2">
                <p className="text-xs font-bold" style={{ color: isDark ? '#d1d5db' : '#374151' }}>📋 Cách upload file lên Kho Drive:</p>
                {[
                  { step: '1', icon: '👆', text: 'Nhấn nút "Mở Kho Drive TVU Connect" bên dưới' },
                  { step: '2', icon: '🔑', text: 'Đăng nhập tài khoản Google nếu được yêu cầu' },
                  { step: '3', icon: '⬆️', text: 'Nhấn "+ Mới" → chọn "Tải tệp lên" → chọn file từ máy' },
                  { step: '4', icon: '🔓', text: 'Chuột phải vào file vừa upload → "Chia sẻ" → đặt quyền "Bất kỳ ai có đường liên kết" để mọi người xem được' },
                  { step: '5', icon: '✅', text: 'File đã lưu trong kho — mọi người vào đây đều xem và tải được' },
                ].map(({ step, icon, text }) => (
                  <div key={step} className="flex items-start gap-2 p-2 rounded-lg" style={{
                    backgroundColor: isDark ? '#1f2937' : '#ffffff',
                    border: `1px solid ${isDark ? '#374151' : '#f3f4f6'}`
                  }}>
                    <span className="flex-shrink-0 w-5 h-5 bg-purple-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center">{step}</span>
                    <span className="text-xs" style={{ color: isDark ? '#d1d5db' : '#374151' }}>{icon} {text}</span>
                  </div>
                ))}
              </div>

              {/* Ghi chú phân biệt */}
              <div className="rounded-lg p-2" style={{
                backgroundColor: isDark ? 'rgba(234,179,8,0.1)' : '#fefce8',
                border: `1px solid ${isDark ? '#854d0e' : '#fde68a'}`
              }}>
                <p className="text-[11px] font-medium" style={{ color: isDark ? '#fde68a' : '#854d0e' }}>
                  ⚠️ <strong>Lưu ý:</strong> Upload file lên Kho Drive và Gắn link tài liệu là 2 việc <strong>độc lập</strong>. Upload lên Drive để lưu trữ file — Gắn link để đăng bài hiển thị trên web.
                </p>
              </div>

              {/* Nút mở Drive */}
              <a
                href={DRIVE_FOLDER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl font-bold text-sm transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                <ExternalLink className="w-4 h-4" />
                Mở Kho Drive TVU Connect
              </a>

              <p className="text-center text-[11px]" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                Muốn đăng bài lên web? Chuyển sang tab <strong style={{ color: isDark ? '#a78bfa' : '#7c3aed' }}>"Gắn link tài liệu"</strong>
              </p>
            </div>
          )}

          {/* TAB: Gắn link — toàn bộ form gốc */}
          {activeTab === 'link' && (<>
          {/* Info Banner */}
          <div className="rounded-xl p-2.5" style={{
            backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : '#ffffff',
            border: `1px solid ${isDark ? '#1d4ed8' : '#e5e7eb'}`
          }}>
            <div className="flex items-start gap-2">
              <span className="text-base flex-shrink-0">💡</span>
              <div className="text-xs space-y-1.5">
                <p className="font-bold" style={{ color: isDark ? '#f3f4f6' : '#1f2937' }}>Cách đăng tài liệu lên web:</p>
                <div className="space-y-1">
                  {[
                    { icon: '🔗', text: 'Bạn đã có link tài liệu từ bất kỳ trang web nào (Google Drive, OneDrive, trang web trường, diễn đàn...) → dán vào ô bên dưới' },
                    { icon: '📝', text: 'Điền tiêu đề, chọn ngành học và mô tả tài liệu' },
                    { icon: '✅', text: 'Nhấn "Đóng góp tài liệu" → bài đăng hiển thị trên web để mọi người tìm kiếm' },
                  ].map(({ icon, text }, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="flex-shrink-0 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(139,92,246,0.3)' : '#ede9fe', color: isDark ? '#c4b5fd' : '#6d28d9' }}>{i + 1}</span>
                      <span style={{ color: isDark ? '#d1d5db' : '#374151' }}>{icon} {text}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 pt-0.5" style={{ borderTop: `1px solid ${isDark ? '#1e3a5f' : '#dbeafe'}` }}>
                  <span className="text-[10px]" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>📁 Chưa có file?</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('drive')}
                    className="text-[10px] font-bold underline"
                    style={{ color: isDark ? '#a78bfa' : '#7c3aed' }}
                  >
                    Vào Kho Drive để upload file →
                  </button>
                </div>
              </div>
            </div>
          </div>



          {/* Title */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-bold mb-1" style={{ color: labelColor }}>
              <span className="text-purple-600">📝</span>
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
                <span>⚠️</span> {getFieldError('title')}
              </p>
            )}
          </div>

          {/* Major */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-bold mb-1" style={{ color: labelColor }}>
              <span className="text-purple-600">🎓</span>
              Ngành học <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.major_id}
              onChange={(e) => handleChange('major_id', e.target.value)}
              className="w-full px-3 py-2 border-2 rounded-xl font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 cursor-pointer text-sm"
              style={{ ...inputStyle, borderColor: getFieldError('major_id') ? '#f87171' : inputBorder }}
            >
              <option value="">🎓 Chọn ngành học</option>
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
                <span>⚠️</span> {getFieldError('major_id')}
              </p>
            )}
          </div>

          {/* URL Input */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-bold mb-1" style={{ color: labelColor }}>
              <span className="text-purple-600">🔗</span>
              Link tài liệu (từ Google Drive) <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => handleChange('url', e.target.value)}
              className="w-full px-3 py-2 border-2 rounded-xl font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 text-sm"
              style={{ ...inputStyle, borderColor: getFieldError('url') ? '#f87171' : inputBorder }}
              placeholder="https://drive.google.com/file/d/..."
            />
            {getFieldError('url') && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1 font-medium">
                <span>⚠️</span> {getFieldError('url')}
              </p>
            )}
            {urlWarning && (
              <p className="mt-1 text-xs text-yellow-600 flex items-center gap-1 font-medium">
                <span>⚠️</span> {urlWarning}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="pb-2">
            <label className="flex items-center gap-1.5 text-sm font-bold mb-1" style={{ color: labelColor }}>
              <span className="text-purple-600">💬</span>
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
                <span>⚠️</span> {getFieldError('description')}
              </p>
            )}
          </div>
          </>)}
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
