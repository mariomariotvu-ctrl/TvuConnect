import { memo, useState, useEffect } from 'react';
import { ExternalLink, Edit2, Trash2, GraduationCap, BookOpen, Pill, Stethoscope, Heart, Code, TrendingUp, Briefcase, BookText, Scale, Languages, BarChart3, Calculator } from 'lucide-react';
import { DocumentLink } from '../types/documentLink';
import { User } from 'firebase/auth';
import { UploaderInfo } from './UploaderInfo';

interface DocumentCardProps {
  document: DocumentLink;
  currentUser: User;
  onEdit: (document: DocumentLink) => void;
  onDelete: (id: string) => void;
  onProfileClick?: (uid: string) => void;
}

// Helper function to get icon for major
const getMajorIcon = (majorText: string) => {
  const lowerText = majorText.toLowerCase();
  
  // Răng Hàm Mặt - use Stethoscope icon (medical field)
  if (lowerText.includes('răng') || lowerText.includes('rang')) {
    return Stethoscope; // 🦷 Răng Hàm Mặt
  }
  if (lowerText.includes('dược') || lowerText.includes('duoc')) {
    return Pill; // 💊 Dược
  }
  if (lowerText.includes('y khoa') || lowerText.includes('y ')) {
    return Stethoscope; // 🩺 Y Khoa
  }
  if (lowerText.includes('điều dưỡng') || lowerText.includes('dieu duong')) {
    return Heart; // ❤️ Điều Dưỡng
  }
  if (lowerText.includes('cntt') || lowerText.includes('công nghệ thông tin')) {
    return Code; // 💻 CNTT
  }
  if (lowerText.includes('kinh tế') || lowerText.includes('kinh te')) {
    return TrendingUp; // 📈 Kinh Tế
  }
  if (lowerText.includes('quản trị') || lowerText.includes('quan tri')) {
    return Briefcase; // 💼 Quản Trị
  }
  if (lowerText.includes('sư phạm') || lowerText.includes('su pham')) {
    return BookText; // 📖 Sư Phạm
  }
  if (lowerText.includes('luật') || lowerText.includes('luat')) {
    return Scale; // ⚖️ Luật
  }
  if (lowerText.includes('ngoại ngữ') || lowerText.includes('ngoai ngu')) {
    return Languages; // 🌐 Ngoại Ngữ
  }
  if (lowerText.includes('marketing')) {
    return BarChart3; // 📊 Marketing
  }
  if (lowerText.includes('kế toán') || lowerText.includes('ke toan')) {
    return Calculator; // 🧮 Kế Toán
  }
  
  // Default icon
  return GraduationCap;
};

// Helper function to format text with proper capitalization and diacritics
const formatText = (text: string): string => {
  if (!text) return '';
  
  // Common mappings with proper Vietnamese diacritics
  const textMap: { [key: string]: string } = {
    // Majors
    'duoc': 'Dược',
    'y': 'Y Khoa',
    'dieu duong': 'Điều Dưỡng',
    'cntt': 'Công Nghệ Thông Tin',
    'kinh te': 'Kinh Tế',
    'quan tri': 'Quản Trị Kinh Doanh',
    'su pham': 'Sư Phạm',
    'luat': 'Luật',
    'ngoai ngu': 'Ngoại Ngữ',
    'marketing': 'Marketing',
    'ke toan': 'Kế Toán',
    // Subjects - multiple variations
    'rang ham mat': 'Răng Hàm Mặt',
    'rang-ham-mat': 'Răng Hàm Mặt',
    'ranghammat': 'Răng Hàm Mặt',
    'giai phau': 'Giải Phẫu',
    'giai-phau': 'Giải Phẫu',
    'giaiphau': 'Giải Phẫu',
    'sinh ly': 'Sinh Lý',
    'sinh-ly': 'Sinh Lý',
    'sinhly': 'Sinh Lý',
    'hoa sinh': 'Hóa Sinh',
    'hoa-sinh': 'Hóa Sinh',
    'hoasinh': 'Hóa Sinh',
    'duoc ly': 'Dược Lý',
    'duoc-ly': 'Dược Lý',
    'duocly': 'Dược Lý',
    'benh ly': 'Bệnh Lý',
    'benh-ly': 'Bệnh Lý',
    'benhly': 'Bệnh Lý',
  };

  // Normalize the input text (remove dashes, extra spaces, lowercase)
  const normalizedText = text.toLowerCase().trim().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
  
  // Check exact match first
  if (textMap[normalizedText]) {
    return textMap[normalizedText];
  }
  
  // Check if any key matches (for partial matches)
  for (const [key, value] of Object.entries(textMap)) {
    const normalizedKey = key.replace(/[-_]/g, ' ');
    if (normalizedText === normalizedKey || normalizedText.replace(/\s+/g, '') === key.replace(/[-_\s]/g, '')) {
      return value;
    }
  }
  
  // If no mapping found, capitalize first letter of each word
  return text
    .split(/[\s-_]+/)
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

function DocumentCardComponent({ document, currentUser, onEdit, onDelete, onProfileClick }: DocumentCardProps) {
  const isOwner = document.createdBy === currentUser.uid;
  const formattedMajor = formatText(document.major_id);
  const formattedSubject = document.subject ? formatText(document.subject) : '';
  
  // Get appropriate icon for major
  const MajorIcon = getMajorIcon(document.major_id);

  const [isDark, setIsDark] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkDark = () => {
      setIsDark(window.document.documentElement.classList.contains('dark'));
    };
    checkDark();

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          checkDark();
        }
      });
    });
    observer.observe(window.document.documentElement, { attributes: true });

    window.addEventListener('resize', checkMobile);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  const handleOpenDocument = () => {
    window.open(document.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <article 
      className="group relative overflow-hidden rounded-xl border transition-all duration-200 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-100/50 dark:hover:border-indigo-800 dark:hover:shadow-indigo-900/20"
      aria-label={`Document: ${document.title}`}
      style={{
        backgroundColor: isDark ? '#1f2937' : '#ffffff',
        borderColor: isDark ? '#374151' : '#e5e7eb',
        color: isDark ? '#f3f4f6' : '#111827'
      }}
    >
      {/* Desktop Layout: Horizontal with all buttons on right */}
      <div className="hidden md:flex items-center gap-4 p-5">
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3 
            className="text-lg font-semibold line-clamp-2 mb-2"
            style={{ color: isDark ? '#f3f4f6' : '#111827' }}
          >
            {document.title}
          </h3>
          
          {/* Uploader Info */}
          {/* -ml-[22px]: compensate for User icon (w-4=16px) + gap-1.5 (6px) so text left edge aligns with description */}
          <div className="mb-2 -ml-[22px]">
            <UploaderInfo 
              uploaderId={document.createdBy} 
              onProfileClick={onProfileClick}
            />
          </div>
          {/* Tags with Icons */}
          <div className="flex flex-wrap gap-2 mb-2">
            {/* Major Tag with Dynamic Icon */}
            <span 
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors"
              style={{
                backgroundColor: isDark ? 'rgba(49, 46, 129, 0.4)' : '#e0e7ff',
                color: isDark ? '#a5b4fc' : '#3730a3',
                borderColor: isDark ? '#3730a3' : '#c7d2fe'
              }}
            >
              <MajorIcon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.5} />
              <span>{formattedMajor}</span>
            </span>
            {/* Subject Tag with BookOpen Icon */}
            {formattedSubject && (
              <span 
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors"
                style={{
                  backgroundColor: isDark ? 'rgba(88, 28, 135, 0.4)' : '#f3e8ff',
                  color: isDark ? '#d8b4fe' : '#6b21a8',
                  borderColor: isDark ? '#6b21a8' : '#e9d5ff'
                }}
              >
                <BookOpen className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.5} />
                <span>{formattedSubject}</span>
              </span>
            )}
          </div>
 
          {/* Description */}
          <p className="text-base font-medium line-clamp-2 text-gray-600 dark:text-gray-400">
            {document.description}
          </p>
        </div>
 
        {/* Right: All Actions Horizontal */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <button
            onClick={handleOpenDocument}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium shadow-sm hover:shadow-md whitespace-nowrap bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
            aria-label="Mở tài liệu"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Mở tài liệu</span>
          </button>
 
          {isOwner && (
            <>
              <button
                onClick={() => onEdit(document)}
                className="p-2.5 rounded-lg transition-colors text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                aria-label="Sửa tài liệu"
                title="Sửa"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(document.id)}
                className="p-2.5 rounded-lg transition-colors text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                aria-label="Xóa tài liệu"
                title="Xóa"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
 
      {/* Mobile Layout: Optimized vertical stacking */}
      <div 
        className="md:hidden p-4"
        style={{
          backgroundColor: isDark ? '#1f2937' : '#ffffff',
          color: isDark ? '#f3f4f6' : '#111827'
        }}
      >
        <div className="flex gap-3 mb-3">
          {/* Title and Edit/Delete inline */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 
                className="flex-1 text-base font-semibold line-clamp-2"
                style={{ color: isDark ? '#f3f4f6' : '#111827' }}
              >
                {document.title}
              </h3>
              
              {/* Edit/Delete buttons inline on mobile */}
              {isOwner && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => onEdit(document)}
                    className="p-2 rounded-lg transition-colors min-h-[40px] min-w-[40px] text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
                    aria-label="Sửa"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(document.id)}
                    className="p-2 rounded-lg transition-colors min-h-[40px] min-w-[40px] text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30"
                    aria-label="Xóa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Uploader Info */}
            {/* -ml-[22px]: compensate for User icon (w-4=16px) + gap-1.5 (6px) so text left edge aligns with description */}
            <div className="mb-2 -ml-[22px]">
              <UploaderInfo 
                uploaderId={document.createdBy} 
                onProfileClick={onProfileClick}
              />
            </div>
            
            {/* Tags with Icons */}
            <div className="flex flex-wrap gap-1.5">
              {/* Major Tag with Dynamic Icon */}
              <span 
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-semibold border"
                style={{
                  backgroundColor: isDark ? 'rgba(49, 46, 129, 0.4)' : '#e0e7ff',
                  color: isDark ? '#a5b4fc' : '#3730a3',
                  borderColor: isDark ? '#3730a3' : '#c7d2fe'
                }}
              >
                <MajorIcon className="w-3 h-3 flex-shrink-0" strokeWidth={2.5} />
                <span>{formattedMajor}</span>
              </span>
              {/* Subject Tag with BookOpen Icon */}
              {formattedSubject && (
                <span 
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-semibold border"
                  style={{
                    backgroundColor: isDark ? 'rgba(88, 28, 135, 0.4)' : '#f3e8ff',
                    color: isDark ? '#d8b4fe' : '#6b21a8',
                    borderColor: isDark ? '#6b21a8' : '#e9d5ff'
                  }}
                >
                  <BookOpen className="w-3 h-3 flex-shrink-0" strokeWidth={2.5} />
                  <span>{formattedSubject}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Full-width Open button at bottom on mobile */}
        <button
          onClick={handleOpenDocument}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all duration-200 text-sm font-medium shadow-sm active:scale-[0.98] min-h-[44px] bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
          aria-label="Mở tài liệu"
        >
          <ExternalLink className="w-4 h-4" />
          <span>Mở tài liệu</span>
        </button>
      </div>
    </article>
  );
}


// Memoize DocumentCard to prevent unnecessary re-renders
export const DocumentCard = memo(
  DocumentCardComponent,
  (prevProps, nextProps) => {
    // Only re-render if these specific props change
    return (
      prevProps.document.id === nextProps.document.id &&
      prevProps.document.updatedAt === nextProps.document.updatedAt &&
      prevProps.currentUser.uid === nextProps.currentUser.uid &&
      prevProps.document.title === nextProps.document.title &&
      prevProps.document.description === nextProps.document.description
    );
  }
);

DocumentCard.displayName = 'DocumentCard';
