import React from 'react';
import { FilterState } from '../types/documentLink';
import { GraduationCap, Stethoscope, Briefcase, BookOpen } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface FilterPanelProps {
  filters: FilterState;
  onFilterChange: (filterType: string, value: string | null) => void;
  availableSubjects: string[];
}

// Major groups with icons
const MAJOR_GROUPS = [
  {
    group: 'Y - Dược (Khối Sức khỏe)',
    icon: Stethoscope,
    color: 'text-red-600 dark:text-red-400',
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
    icon: GraduationCap,
    color: 'text-blue-600 dark:text-blue-400',
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
    icon: Briefcase,
    color: 'text-green-600 dark:text-green-400',
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
    icon: BookOpen,
    color: 'text-purple-600 dark:text-purple-400',
    majors: [
      { id: 'su-pham-tieu-hoc', label: 'Sư phạm tiểu học' },
      { id: 'su-pham-mam-non', label: 'Sư phạm mầm non' },
      { id: 'ngon-ngu-anh', label: 'Ngôn ngữ Anh' },
      { id: 'ngon-ngu-trung', label: 'Ngôn ngữ Trung Quốc' },
      { id: 'ngon-ngu-khmer', label: 'Ngôn ngữ Khmer' }
    ]
  }
];

// Flatten all majors for easy lookup
const ALL_MAJORS = MAJOR_GROUPS.flatMap(group => group.majors);

export function FilterPanel({ filters, onFilterChange }: FilterPanelProps) {
  const { theme } = useTheme();
  // Get current major group for icon display
  const currentMajorGroup = MAJOR_GROUPS.find(group => 
    group.majors.some(m => m.id === filters.major_id)
  );

  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();

    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  return (
    <div 
      className="rounded-xl shadow-sm p-3 md:p-4 mb-4 md:mb-5 border border-gray-100 dark:border-gray-700 transition-colors"
      style={{
        backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff'
      }}
    >
      {/* Compact Header with Filter */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Enhanced Icon with 3D effect and animation - Smaller on mobile */}
        <div className="relative group flex-shrink-0">
          {/* Glow effect background */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-400 via-blue-400 to-indigo-400 dark:from-purple-200 dark:via-blue-200 dark:to-indigo-200 rounded-xl blur-sm opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>
          
          {/* Icon container with gradient background */}
          <div className="relative p-1.5 md:p-2.5 bg-gradient-to-br from-purple-500 via-blue-600 to-indigo-600 dark:from-purple-300 dark:via-blue-400 dark:to-indigo-400 rounded-xl shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 border border-white/30 dark:border-white/70">
            {/* Animated sparkles - slowed down */}
            <div className="absolute -top-0.5 -right-0.5 w-1 md:w-1.5 h-1 md:h-1.5 bg-yellow-300 dark:bg-yellow-100 rounded-full animate-pulse" style={{ animationDuration: '3s' }}></div>
            <div className="absolute -bottom-0.5 -left-0.5 w-0.5 md:w-1 h-0.5 md:h-1 bg-blue-300 dark:bg-blue-100 rounded-full animate-pulse" style={{ animationDelay: '0.5s', animationDuration: '4s' }}></div>
            
            {/* Graduation cap icon */}
            <GraduationCap className="w-4 h-4 md:w-5 md:h-5 text-white dark:text-gray-900 relative z-10 drop-shadow-md" strokeWidth={2.5} />
            
            {/* Shine effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </div>
        </div>
 
        {/* Dropdown Filter - Takes remaining space */}
        <div className="flex-1 relative">
          {currentMajorGroup && filters.major_id && (
            <div className="absolute left-2 md:left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
              <currentMajorGroup.icon className={`w-3.5 h-3.5 md:w-4 md:h-4 ${currentMajorGroup.color}`} />
            </div>
          )}
          <select
            value={filters.major_id || ''}
            onChange={(e) => onFilterChange('major_id', e.target.value || null)}
            className={`w-full ${filters.major_id ? 'pl-8 md:pl-10' : 'pl-2 md:pl-3'} pr-8 md:pr-9 py-2 md:py-2.5 border-2 rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 font-medium appearance-none cursor-pointer shadow-sm text-gray-900 dark:text-gray-100 ${filters.major_id ? 'border-purple-300 dark:border-purple-500' : 'border-gray-200 dark:border-gray-600'}`}
            style={{
              backgroundColor: theme === 'dark' ? '#111827' : '#ffffff',
              color: theme === 'dark' ? '#f3f4f6' : '#111827',
              borderColor: filters.major_id 
                ? (theme === 'dark' ? '#a855f7' : '#d8b4fe') 
                : (theme === 'dark' ? '#4b5563' : '#e5e7eb'),
            }}
          >
            <option value="" style={{ backgroundColor: theme === 'dark' ? '#111827' : '#ffffff', color: theme === 'dark' ? '#f3f4f6' : '#111827' }}>🎓 Chọn ngành học</option>
            {MAJOR_GROUPS.map((group) => (
              <optgroup key={group.group} label={`━━ ${group.group} ━━`} style={{ backgroundColor: theme === 'dark' ? '#111827' : '#ffffff', color: theme === 'dark' ? '#f3f4f6' : '#111827' }}>
                {group.majors.map((major) => (
                  <option key={major.id} value={major.id} style={{ backgroundColor: theme === 'dark' ? '#111827' : '#ffffff', color: theme === 'dark' ? '#f3f4f6' : '#111827' }}>
                    {major.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {/* Custom dropdown arrow */}
          <div className="absolute right-2 md:right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className={`w-3.5 h-3.5 md:w-4 md:h-4 transition-colors ${filters.major_id ? 'text-purple-500 dark:text-purple-400 max-md:text-purple-500 max-md:dark:text-purple-400' : 'text-gray-400 dark:text-gray-400 max-md:text-gray-400 max-md:dark:text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Clear Filter Button - Only show when filter is active */}
        {filters.major_id && (
          <button
            onClick={() => onFilterChange('major_id', null)}
            className="flex-shrink-0 p-1.5 md:p-2 rounded-lg transition-all duration-200 group bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-red-900/30 dark:hover:text-red-400 max-md:bg-gray-100 max-md:text-gray-500 max-md:hover:bg-red-100 max-md:hover:text-red-600 max-md:dark:bg-gray-700 max-md:dark:text-gray-400 max-md:dark:hover:bg-red-900/30 max-md:dark:hover:text-red-400"
            title="Xóa bộ lọc"
          >
            <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Active Filter Tag - Compact display below */}
      {filters.major_id && (
        <div className="mt-2 md:mt-3 flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 max-md:text-gray-600 max-md:dark:text-gray-300">Đang xem:</span>
          <div className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-0.5 md:py-1 rounded-full text-xs font-semibold border bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900 dark:text-purple-100 dark:border-purple-700 max-md:bg-purple-100 max-md:text-purple-800 max-md:border-purple-300 max-md:dark:bg-purple-900 max-md:dark:text-purple-100 max-md:dark:border-purple-700">
            {currentMajorGroup && <currentMajorGroup.icon className="w-2.5 h-2.5 md:w-3 md:h-3" />}
            <span className="truncate max-w-[200px]">{ALL_MAJORS.find(m => m.id === filters.major_id)?.label}</span>
          </div>
        </div>
      )}
    </div>
  );
}
