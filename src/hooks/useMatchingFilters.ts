import { useState, useCallback } from 'react';
import { logger } from '@/utils/logger';

/**
 * Filter state interface for matching system
 */
export interface MatchingFilters {
  gender: string;
  major: string;
  academicYear: string;
  interest: string;
  zodiac: string;
  minAge: string;
  maxAge: string;
  studyGoals: string[];
  seniority: '' | 'same' | 'senior' | 'junior';
}

/**
 * Return type for useMatchingFilters hook
 */
export interface UseMatchingFiltersReturn {
  filters: MatchingFilters;
  setFilters: (filters: Partial<MatchingFilters>) => void;
  resetFilters: () => void;
  hasActiveFilters: () => boolean;
}

/**
 * Initial filter state
 */
const initialFilters: MatchingFilters = {
  gender: '',
  major: '',
  academicYear: '',
  interest: '',
  zodiac: '',
  minAge: '',
  maxAge: '',
  studyGoals: [],
  seniority: '',
};

/**
 * Custom hook for managing matching filters state
 * 
 * @returns {UseMatchingFiltersReturn} Filter state and management functions
 * 
 * @example
 * ```tsx
 * const { filters, setFilters, resetFilters, hasActiveFilters } = useMatchingFilters();
 * 
 * // Update filters
 * setFilters({ gender: 'female', major: 'CNTT' });
 * 
 * // Check if any filters are active
 * if (hasActiveFilters()) {
 *   logger.log('Filters applied');
 * }
 * 
 * // Reset all filters
 * resetFilters();
 * ```
 */
export const useMatchingFilters = (): UseMatchingFiltersReturn => {
  const [filters, setFiltersState] = useState<MatchingFilters>(initialFilters);

  /**
   * Update filters with partial values
   */
  const setFilters = useCallback((newFilters: Partial<MatchingFilters>) => {
    setFiltersState(prev => ({
      ...prev,
      ...newFilters,
    }));
  }, []);

  /**
   * Reset all filters to initial state
   */
  const resetFilters = useCallback(() => {
    setFiltersState(initialFilters);
  }, []);

  /**
   * Check if any filters are currently active
   * @returns {boolean} True if at least one filter has a non-empty value
   */
  const hasActiveFilters = useCallback((): boolean => {
    return (
      filters.gender !== '' ||
      filters.major !== '' ||
      filters.academicYear !== '' ||
      filters.interest !== '' ||
      filters.zodiac !== '' ||
      filters.minAge !== '' ||
      filters.maxAge !== '' ||
      filters.studyGoals.length > 0 ||
      filters.seniority !== ''
    );
  }, [filters]);

  return {
    filters,
    setFilters,
    resetFilters,
    hasActiveFilters,
  };
};
