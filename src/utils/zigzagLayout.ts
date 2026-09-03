/**
 * Utility functions for zigzag layout pattern in matching tabs
 * 
 * This module provides helper functions to manage the zigzag layout pattern
 * for the 4 matching tabs in TVU Connect, including height calculations,
 * pattern generation, and lock state management.
 */

/**
 * Returns the zigzag pattern for tab heights on desktop
 * 
 * Pattern: Tab 1 (Tìm người yêu) - low, Tab 2 (Kết nối nhanh) - high,
 *          Tab 3 (Bạn cùng học) - high, Tab 4 (Sở thích chung) - low
 * 
 * @returns Array of height classes following the zigzag pattern: ['h-48', 'h-56', 'h-56', 'h-48']
 * 
 * @example
 * const pattern = getZigzagPattern();
 * logger.log(pattern); // ['h-48', 'h-56', 'h-56', 'h-48']
 */
export function getZigzagPattern(): Array<'h-48' | 'h-56'> {
  return ['h-48', 'h-56', 'h-56', 'h-48'];
}

/**
 * Calculates the appropriate tab height based on viewport and tab index
 * 
 * For mobile viewports (< 768px), returns 'h-auto' for responsive behavior.
 * For desktop viewports (>= 768px), applies the zigzag pattern:
 * - Tab 0 and Tab 3: 'h-48' (low)
 * - Tab 1 and Tab 2: 'h-56' (high)
 * 
 * @param tabIndex - The index of the tab (0-3)
 * @param viewport - The viewport type: 'mobile' (< 768px) or 'desktop' (>= 768px)
 * @returns The appropriate height class for the tab
 * 
 * @example
 * // Mobile viewport
 * calculateTabHeight(0, 'mobile'); // 'h-auto'
 * 
 * // Desktop viewport
 * calculateTabHeight(0, 'desktop'); // 'h-48' (Tab 1 - low)
 * calculateTabHeight(1, 'desktop'); // 'h-56' (Tab 2 - high)
 * calculateTabHeight(2, 'desktop'); // 'h-56' (Tab 3 - high)
 * calculateTabHeight(3, 'desktop'); // 'h-48' (Tab 4 - low)
 */
export function calculateTabHeight(
  tabIndex: number,
  viewport: 'mobile' | 'desktop'
): 'h-auto' | 'h-48' | 'h-56' {
  // Mobile: all tabs use auto height for responsive behavior
  if (viewport === 'mobile') {
    return 'h-auto';
  }
  
  // Desktop: apply zigzag pattern
  // Tab 0 (Tìm người yêu) and Tab 3 (Sở thích chung) - low (h-48)
  if (tabIndex === 0 || tabIndex === 3) {
    return 'h-48';
  }
  
  // Tab 1 (Kết nối nhanh) and Tab 2 (Bạn cùng học) - high (h-56)
  if (tabIndex === 1 || tabIndex === 2) {
    return 'h-56';
  }
  
  // Fallback to h-48 for any unexpected index
  return 'h-48';
}

/**
 * Returns the desktop padding class for a given matching tab
 * 
 * After the padding synchronization fix, all tabs use uniform 'p-5' padding
 * to ensure balanced visual spacing on desktop. Previously:
 * - 'lover' had 'pt-2 pb-5' (unbalanced - icon too close to top)
 * - 'study' had 'pt-5 pb-1' (unbalanced - content too close to bottom)
 * - 'hobby' had 'pt-8 pb-1' (unbalanced - content too close to bottom)
 * - 'quick' had 'p-5' (already balanced)
 * 
 * @param tabId - The tab identifier
 * @returns The balanced padding class for desktop view
 * 
 * @example
 * getTabDesktopPadding('lover'); // 'p-5' (synchronized)
 * getTabDesktopPadding('study'); // 'p-5' (synchronized)
 * getTabDesktopPadding('hobby'); // 'p-5' (synchronized)
 * getTabDesktopPadding('quick'); // 'p-5' (unchanged)
 */
export function getTabDesktopPadding(
  tabId: 'lover' | 'quick' | 'study' | 'hobby'
): string {
  // After fix: all tabs use uniform p-5 padding for synchronized visual balance
  return 'p-5';
}

/**
 * Determines if a tab should be locked based on profile completion status
 * 
 * All tabs are locked if the user's profile is incomplete.
 * All tabs are unlocked if the user's profile is complete.
 * 
 * @param tabId - The ID of the tab ('lover', 'quick', 'study', or 'hobby')
 * @param isProfileComplete - Whether the user's profile is complete
 * @returns true if the tab should be locked, false otherwise
 * 
 * @example
 * // Profile incomplete - all tabs locked
 * isTabLocked('lover', false); // true
 * isTabLocked('quick', false); // true
 * 
 * // Profile complete - all tabs unlocked
 * isTabLocked('lover', true); // false
 * isTabLocked('quick', true); // false
 */
export function isTabLocked(
  tabId: 'lover' | 'quick' | 'study' | 'hobby',
  isProfileComplete: boolean
): boolean {
  // Simple logic: all tabs are locked if profile is incomplete
  return !isProfileComplete;
}
