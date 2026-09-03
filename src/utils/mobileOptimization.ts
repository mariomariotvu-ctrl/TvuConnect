// Mobile optimization utilities

/**
 * Detect if user is on mobile device
 */
export const isMobileDevice = (): boolean => {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
};

/**
 * Detect if user is on low-end device
 */
export const isLowEndDevice = (): boolean => {
  // Check for low memory or slow CPU
  const memory = (navigator as any).deviceMemory;
  const cores = navigator.hardwareConcurrency;
  
  return (memory && memory < 4) || (cores && cores < 4);
};

/**
 * Throttle function - limit execution rate
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();

    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    } else {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        func(...args);
      }, delay - (now - lastCall));
    }
  };
};

/**
 * Debounce function - delay execution until after delay
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

/**
 * Check if user prefers reduced motion
 */
export const prefersReducedMotion = (): boolean => {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Get optimal animation settings for device
 */
export const getAnimationSettings = () => {
  const isMobile = isMobileDevice();
  const isLowEnd = isLowEndDevice();
  const reducedMotion = prefersReducedMotion();

  return {
    shouldAnimate: !reducedMotion && !isLowEnd,
    duration: isMobile ? 200 : 300,
    easing: 'ease-out',
    reducedAnimations: isMobile || isLowEnd || reducedMotion
  };
};

/**
 * Passive event listener options for better scroll performance
 */
export const passiveEventOptions = {
  passive: true,
  capture: false
};

/**
 * Request idle callback with fallback
 */
export const requestIdleCallback = (callback: () => void, timeout = 2000) => {
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout });
  } else {
    return setTimeout(callback, 1);
  }
};

/**
 * Cancel idle callback with fallback
 */
export const cancelIdleCallback = (id: number) => {
  if ('cancelIdleCallback' in window) {
    window.cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
};

/**
 * Optimize images for mobile
 */
export const getOptimizedImageSize = (originalSize: number): number => {
  const isMobile = isMobileDevice();
  const isLowEnd = isLowEndDevice();

  if (isLowEnd) return Math.min(originalSize, 300);
  if (isMobile) return Math.min(originalSize, 400);
  return originalSize;
};

/**
 * Get optimal batch size for data loading
 */
export const getOptimalBatchSize = (defaultSize: number): number => {
  const isMobile = isMobileDevice();
  const isLowEnd = isLowEndDevice();

  if (isLowEnd) return Math.floor(defaultSize * 0.5);
  if (isMobile) return Math.floor(defaultSize * 0.75);
  return defaultSize;
};

/**
 * Check if connection is slow
 */
export const isSlowConnection = (): boolean => {
  const connection = (navigator as any).connection;
  if (!connection) return false;

  const slowTypes = ['slow-2g', '2g', '3g'];
  return slowTypes.includes(connection.effectiveType) || connection.saveData;
};

/**
 * Get network-aware settings
 */
export const getNetworkSettings = () => {
  const slow = isSlowConnection();

  return {
    enableRealtime: !slow,
    batchSize: slow ? 5 : 10,
    imageQuality: slow ? 60 : 80,
    prefetchEnabled: !slow
  };
};
