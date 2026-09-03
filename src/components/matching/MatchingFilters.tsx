import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Filter, RefreshCw } from 'lucide-react';
import { MatchingFilters as FiltersType } from '../../hooks/useMatchingFilters';
import { STUDY_GOALS, ZODIAC_SIGNS } from '../../utils/constants';

interface MatchingFiltersProps {
  filters: FiltersType;
  onFiltersChange: (filters: Partial<FiltersType>) => void;
  onReset: () => void;
  mode: 'lover' | 'study' | 'quick' | 'hobby';
  showFilters: boolean;
  onToggle: () => void;
}

/**
 * MatchingFilters component renders filter UI with show/hide animation
 * 
 * @param {FiltersType} filters - Current filter values
 * @param {Function} onFiltersChange - Callback when filters change
 * @param {Function} onReset - Callback to reset all filters
 * @param {string} mode - Current matching mode
 * @param {boolean} showFilters - Whether filters are visible
 * @param {Function} onToggle - Callback to toggle filter visibility
 * 
 * @example
 * ```tsx
 * <MatchingFilters
 *   filters={filters}
 *   onFiltersChange={(newFilters) => setFilters({ ...filters, ...newFilters })}
 *   onReset={() => setFilters(initialFilters)}
 *   mode="lover"
 *   showFilters={true}
 *   onToggle={() => setShowFilters(!showFilters)}
 * />
 * ```
 */
export const MatchingFilters: React.FC<MatchingFiltersProps> = ({
  filters,
  onFiltersChange,
  onReset,
  mode,
  showFilters,
  onToggle,
}) => {
  // Count active filters
  const activeFilterCount = [
    filters.gender,
    filters.major,
    filters.academicYear,
    filters.interest,
    filters.zodiac,
    filters.minAge,
    filters.maxAge,
    filters.seniority,
    ...filters.studyGoals,
  ].filter(Boolean).length;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={onToggle}
          className={`flex-1 flex items-center justify-between py-3 px-4 rounded-[14px] border transition-all duration-300 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-md ${
            showFilters 
              ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400' 
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <div className="flex items-center gap-2.5 font-bold text-[15px]">
            <Filter className="w-4 h-4" />
            Bộ lọc
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 bg-indigo-500 text-white text-xs rounded-full font-bold">
                {activeFilterCount}
              </span>
            )}
          </div>
          <span className="text-[13px] font-semibold text-indigo-500">
            {showFilters ? 'Ẩn bớt' : 'Tùy chỉnh'}
          </span>
        </button>
        
        {/* Clear Filters Button */}
        <button
          onClick={onReset}
          className="p-3 rounded-[14px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all duration-500 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-md hover:rotate-180"
          title="Làm mới bộ lọc"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 bg-white dark:bg-transparent rounded-b-[20px]" style={{ colorScheme: 'light' }}>
              {/* Gender Filter (lover & hobby modes) */}
              {(mode === 'lover' || mode === 'hobby') && (
                <div className="space-y-1.5">
                  <label className="text-base font-bold text-gray-700 ml-1">Giới tính</label>
                  <select
                    value={filters.gender}
                    onChange={(e) => onFiltersChange({ gender: e.target.value })}
                    className="w-full p-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-[14px] text-base font-medium text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all hover:bg-gray-50 dark:hover:bg-gray-700"
                    style={{ colorScheme: 'light' }}
                  >
                    <option value="">Tất cả</option>
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                    <option value="other">Khác</option>
                  </select>
                </div>
              )}

              {/* Major Filter */}
              <div className="space-y-1.5">
                <label className="text-base font-bold text-gray-700 ml-1">Ngành học</label>
                <input
                  type="text"
                  placeholder="Ví dụ: CNTT"
                  value={filters.major}
                  onChange={(e) => onFiltersChange({ major: e.target.value })}
                  className="w-full p-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-base text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  style={{ colorScheme: 'light' }}
                />
              </div>

              {/* Academic Year Filter */}
              <div className="space-y-1.5">
                <label className="text-base font-bold text-gray-700 ml-1">Niên khóa</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 2021-2025"
                  value={filters.academicYear}
                  onChange={(e) => onFiltersChange({ academicYear: e.target.value })}
                  className="w-full p-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-[14px] text-base font-medium text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all hover:bg-gray-50 dark:hover:bg-gray-700"
                  style={{ colorScheme: 'light' }}
                />
              </div>

              {/* Seniority Filter - Segmented Control */}
              <div className="space-y-2 col-span-1 md:col-span-2 pt-1 pb-1">
                <label className="text-base font-bold text-gray-700 ml-1">Khóa trên/dưới</label>
                <div className="flex p-1.5 bg-gray-100 dark:bg-gray-700 rounded-[16px] border border-gray-200 dark:border-gray-600 shadow-inner w-full">
                  <button
                    type="button"
                    onClick={() => onFiltersChange({ seniority: '' })}
                    className={`flex-1 py-2.5 px-2 rounded-[12px] text-[13px] sm:text-sm font-bold transition-all duration-300 relative ${
                      filters.seniority === '' 
                        ? 'bg-white text-indigo-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)]' 
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                    }`}
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => onFiltersChange({ seniority: 'same' })}
                    className={`flex-1 py-2.5 px-2 rounded-[12px] text-[13px] sm:text-sm font-bold transition-all duration-300 relative ${
                      filters.seniority === 'same' 
                        ? 'bg-white text-indigo-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)]' 
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                    }`}
                  >
                    Cùng khóa
                  </button>
                  <button
                    type="button"
                    onClick={() => onFiltersChange({ seniority: 'senior' })}
                    className={`flex-1 py-2.5 px-2 rounded-[12px] text-[13px] sm:text-sm font-bold transition-all duration-300 relative ${
                      filters.seniority === 'senior' 
                        ? 'bg-white text-indigo-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)]' 
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                    }`}
                  >
                    Khóa trên
                  </button>
                  <button
                    type="button"
                    onClick={() => onFiltersChange({ seniority: 'junior' })}
                    className={`flex-1 py-2.5 px-2 rounded-[12px] text-[13px] sm:text-sm font-bold transition-all duration-300 relative ${
                      filters.seniority === 'junior' 
                        ? 'bg-white text-indigo-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)]' 
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                    }`}
                  >
                    Khóa dưới
                  </button>
                </div>
              </div>

              {/* Zodiac Filter (lover mode) */}
              {mode === 'lover' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-base font-bold text-gray-700 ml-1">Cung hoàng đạo</label>
                    <select
                      value={filters.zodiac}
                      onChange={(e) => onFiltersChange({ zodiac: e.target.value })}
                      className="w-full p-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-base text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                      style={{ colorScheme: 'light' }}
                    >
                      <option value="">Tất cả</option>
                      {ZODIAC_SIGNS.map(sign => (
                        <option key={sign} value={sign}>{sign}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-base font-bold text-gray-700 ml-1">Độ tuổi</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        placeholder="Từ"
                        value={filters.minAge}
                        onChange={(e) => onFiltersChange({ minAge: e.target.value })}
                        className="w-1/2 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-base text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                        style={{ colorScheme: 'light' }}
                      />
                      <input
                        type="number"
                        placeholder="Đến"
                        value={filters.maxAge}
                        onChange={(e) => onFiltersChange({ maxAge: e.target.value })}
                        className="w-1/2 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-base text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                        style={{ colorScheme: 'light' }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Interest Filter (lover & hobby modes) */}
              {(mode === 'lover' || mode === 'hobby') && (
                <div className="space-y-1.5">
                  <label className="text-base font-bold text-gray-700 ml-1">Sở thích</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Đá bóng"
                    value={filters.interest}
                    onChange={(e) => onFiltersChange({ interest: e.target.value })}
                    className="w-full p-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-base text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                    style={{ colorScheme: 'light' }}
                  />
                </div>
              )}

              {/* Study Goals Filter (study mode) */}
              {mode === 'study' && (
                <div className="col-span-1 md:col-span-2 space-y-2.5 pt-2">
                  <label className="text-base font-bold text-gray-700 ml-1">Mục tiêu học tập</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {STUDY_GOALS.map((goal) => (
                      <label 
                        key={goal} 
                        className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={filters.studyGoals.includes(goal)}
                          onChange={(e) => {
                            const newGoals = e.target.checked
                              ? [...filters.studyGoals, goal]
                              : filters.studyGoals.filter(g => g !== goal);
                            onFiltersChange({ studyGoals: newGoals });
                          }}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 font-medium">{goal}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
