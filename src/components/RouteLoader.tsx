import { Suspense } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface RouteLoaderProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  minHeight?: string;
}

/**
 * RouteLoader wraps lazy-loaded routes with Suspense + ErrorBoundary
 * ErrorBoundary bắt lỗi chunk load fail (sau lazyWithRetry timeout)
 * để tránh app treo vĩnh viễn khi mạng yếu hoặc chunk bị lỗi
 */
export function RouteLoader({ 
  children, 
  fallback, 
  minHeight = 'min-h-screen' 
}: RouteLoaderProps) {
  return (
    <ErrorBoundary>
      <Suspense fallback={fallback || <RouteLoadingFallback minHeight={minHeight} />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

/**
 * Default loading fallback - pure skeleton, no useState/useEffect to save a render cycle
 * Shows immediately without any delay or flash
 */
function RouteLoadingFallback({ minHeight }: { minHeight: string }) {
  return (
    <div className={`flex items-center justify-center w-full ${minHeight}`}>
      <div className="flex flex-col items-center gap-3">
        {/* Premium spinner matching brand colors */}
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-indigo-100 dark:border-indigo-900/40" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-600 dark:border-t-indigo-400 animate-spin" />
        </div>
        <p className="text-sm font-semibold text-gray-400 dark:text-gray-500 animate-pulse">Đang tải...</p>
      </div>
    </div>
  );
}

/**
 * Compact loading fallback for smaller components
 */
export function CompactRouteLoader({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<CompactLoadingFallback />}>
      {children}
    </Suspense>
  );
}

function CompactLoadingFallback() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400" />
    </div>
  );
}

/**
 * Inline loading fallback for inline components
 */
export function InlineRouteLoader({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<InlineLoadingFallback />}>
      {children}
    </Suspense>
  );
}

function InlineLoadingFallback() {
  return (
    <div className="inline-flex items-center gap-2">
      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600 dark:border-indigo-400" />
      <span className="text-sm text-gray-600 dark:text-gray-400">Đang tải...</span>
    </div>
  );
}
