import { lazy, ComponentType } from 'react';

/**
 * Wrapper for lazy loading with retry mechanism
 * Handles network errors and stale chunk references (e.g. after a new deployment)
 */
function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>,
  chunkName: string
) {
  return lazy(async () => {
    const sessionKey = `page-refreshed-${chunkName}`;
    const pageHasAlreadyBeenForceRefreshed = window.sessionStorage.getItem(sessionKey) === 'true';

    try {
      const component = await componentImport();
      window.sessionStorage.setItem(sessionKey, 'false');
      return component;
    } catch (error) {
      if (!pageHasAlreadyBeenForceRefreshed) {
        window.sessionStorage.setItem(sessionKey, 'true');
        // Force refresh để lấy chunk mới sau khi deploy
        window.location.reload();
        // Trả về Promise chờ reload — timeout 3s để tránh treo vĩnh viễn
        // nếu reload bị chặn (popup blocker, v.v.)
        return new Promise<{ default: T }>((_, reject) => {
          setTimeout(() => reject(new Error(`Chunk ${chunkName} failed to load after refresh`)), 3000);
        });
      }
      
      // Đã thử refresh rồi vẫn lỗi → throw để ErrorBoundary bắt
      console.error(`Failed to load chunk: ${chunkName}`, error);
      throw error;
    }
  });
}

/**
 * Lazy-loaded route components for code splitting
 * Each component is loaded on-demand to reduce initial bundle size
 */

// Main feature routes
export const LazyMatching = lazyWithRetry(() => 
  import(/* webpackChunkName: "matching" */ '../components/Matching').then(module => ({ default: module.Matching })),
  'matching'
);

export const LazyChat = lazyWithRetry(() => 
  import(/* webpackChunkName: "chat" */ '../components/Chat').then(module => ({ default: module.Chat })),
  'chat'
);

export const LazyConversationsList = lazyWithRetry(() => 
  import(/* webpackChunkName: "conversations" */ '../components/ConversationsList').then(module => ({ default: module.ConversationsList })),
  'conversations'
);

export const LazyMapView = lazyWithRetry(() => 
  import(/* webpackChunkName: "map" */ '../components/MapView').then(module => ({ default: module.MapView })),
  'map'
);

export const LazyDocumentRepository = lazyWithRetry(() => 
  import(/* webpackChunkName: "documents" */ '../components/DocumentRepository').then(module => ({ default: module.DocumentRepository })),
  'documents'
);

export const LazyPostsList = lazyWithRetry(() => 
  import(/* webpackChunkName: "posts" */ '../components/PostsList').then(module => ({ default: module.PostsList })),
  'posts'
);

export const LazySettings = lazyWithRetry(() => 
  import(/* webpackChunkName: "settings" */ '../components/Settings').then(module => ({ default: module.Settings })),
  'settings'
);

// Additional feature routes
export const LazyAIAssistant = lazyWithRetry(() => 
  import(/* webpackChunkName: "ai" */ '../components/AIAssistant').then(module => ({ default: module.AIAssistant })),
  'ai'
);

export const LazyOnboardingTour = lazyWithRetry(() => 
  import(/* webpackChunkName: "onboarding" */ '../components/OnboardingTour').then(module => ({ default: module.default })),
  'onboarding'
);

// Note: Profile component removed - not implemented in performance optimization
// export const LazyProfile = lazy(() => 
//   import(/* webpackChunkName: "profile" */ '../components/Profile')
// );

export const LazyProfileForm = lazyWithRetry(() => 
  import(/* webpackChunkName: "profile-form" */ '../components/ProfileForm').then(module => ({ default: module.ProfileForm })),
  'profile-form'
);

// Preload ProfileForm chunk ngay khi module này được import
// Vì ProfileForm là tab hay dùng, preload sớm tránh delay lần đầu
if (typeof window !== 'undefined') {
  const preloadTimer = setTimeout(() => {
    import(/* webpackChunkName: "profile-form" */ '../components/ProfileForm').catch(() => {});
  }, 2000);
  // Clean up không cần thiết vì timer chỉ chạy 1 lần khi app khởi động
}

export const LazyProfileCard = lazyWithRetry(() => 
  import(/* webpackChunkName: "profile-card" */ '../components/ProfileCard').then(module => ({ default: module.ProfileCard })),
  'profile-card'
);

export const LazyCommentSection = lazyWithRetry(() => 
  import(/* webpackChunkName: "comments" */ '../components/CommentSection').then(module => ({ default: module.CommentSection })),
  'comments'
);
