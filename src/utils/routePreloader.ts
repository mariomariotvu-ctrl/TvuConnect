import { logger } from './logger';
/**
 * Route Preloader
 * Preloads route components on hover/focus to improve perceived performance
 */

type RoutePreloadMap = {
  [key: string]: () => Promise<any>;
};

// Map of route names to their dynamic imports
const preloadMap: RoutePreloadMap = {
  profile: () => import('../components/ProfileForm'),
  matching: () => import('../components/Matching'),
  chat: () => import('../components/Chat'),
  conversations: () => import('../components/ConversationsList'),
  map: () => import('../components/MapView'),
  documents: () => import('../components/DocumentRepository'),
  posts: () => import('../components/PostsList'),
  settings: () => import('../components/Settings'),
  ai: () => import('../components/AIAssistant'),
  comments: () => import('../components/CommentSection'),
};

// Track which routes have been preloaded
const preloadedRoutes = new Set<string>();

/**
 * Preload a route component
 * @param routeName - Name of the route to preload
 * @returns Promise that resolves when the route is loaded
 */
export function preloadRoute(routeName: string): Promise<any> | undefined {
  // Skip if already preloaded
  if (preloadedRoutes.has(routeName)) {
    return Promise.resolve();
  }

  const preloadFn = preloadMap[routeName];
  if (!preloadFn) {
    logger.warn(`[RoutePreloader] Unknown route: ${routeName}`);
    return undefined;
  }

  // Mark as preloaded and execute
  preloadedRoutes.add(routeName);
  return preloadFn().catch(error => {
    console.error(`[RoutePreloader] Failed to preload ${routeName}:`, error);
    // Remove from preloaded set so it can be retried
    preloadedRoutes.delete(routeName);
  });
}

/**
 * Preload multiple routes
 * @param routeNames - Array of route names to preload
 */
export function preloadRoutes(routeNames: string[]): Promise<any[]> {
  return Promise.all(
    routeNames.map(name => preloadRoute(name)).filter(Boolean)
  );
}

/**
 * Create preload handlers for a route
 * Usage: <button {...createPreloadHandlers('matching')}>Tìm bạn</button>
 */
export function createPreloadHandlers(routeName: string) {
  return {
    onMouseEnter: () => preloadRoute(routeName),
    onFocus: () => preloadRoute(routeName),
    onTouchStart: () => preloadRoute(routeName),
  };
}

/**
 * Preload critical routes on idle
 * Should be called after initial page load
 */
export function preloadCriticalRoutes() {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      preloadRoutes(['matching', 'chat', 'posts', 'profile', 'conversations', 'map', 'documents', 'settings', 'ai', 'comments']);
    }, { timeout: 2000 });
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(() => {
      preloadRoutes(['matching', 'chat', 'posts', 'profile', 'conversations', 'map', 'documents', 'settings', 'ai', 'comments']);
    }, 2000);
  }
}

/**
 * Reset preloaded routes (useful for testing)
 */
export function resetPreloadedRoutes() {
  preloadedRoutes.clear();
}
