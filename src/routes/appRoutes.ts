import type { View } from '../types';

export type MatchingMode = 'lover' | 'study' | 'quick' | 'hobby';
export type ExploreTab = 'map' | 'people' | 'list' | 'food' | 'ai' | 'rental';

export interface AppRoute {
  view: View;
  chatUid?: string;
  matchingMode?: MatchingMode;
  exploreTab?: ExploreTab;
}

const MATCHING_MODES = new Set<MatchingMode>(['lover', 'study', 'quick', 'hobby']);
const EXPLORE_TABS = new Set<ExploreTab>(['map', 'people', 'list', 'food', 'ai', 'rental']);

export const VIEW_PATHS: Record<Exclude<View, 'chat'>, string> = {
  home: '/',
  profile: '/profile',
  matching: '/connect',
  students: '/friends',
  results: '/match-result',
  conversations: '/messages',
  settings: '/settings',
  posts: '/community',
  explore: '/explore',
  documents: '/library',
};

const trimPath = (pathname: string) => {
  const normalized = pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '');
  return normalized || '/';
};

export function resolveAppRoute(pathname: string): AppRoute {
  const path = trimPath(pathname);
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);

  if (path === '/') return { view: 'home' };
  if (path === '/profile') return { view: 'profile' };
  if (path === '/friends') return { view: 'students' };
  if (path === '/match-result') return { view: 'results' };
  if (path === '/settings') return { view: 'settings' };
  if (path === '/community') return { view: 'posts' };
  if (path === '/library') return { view: 'documents' };

  if (parts[0] === 'messages') {
    return parts[1]
      ? { view: 'chat', chatUid: parts[1] }
      : { view: 'conversations' };
  }

  if (parts[0] === 'connect') {
    const mode = parts[1] as MatchingMode | undefined;
    return {
      view: 'matching',
      matchingMode: mode && MATCHING_MODES.has(mode) ? mode : 'quick',
    };
  }

  if (parts[0] === 'explore') {
    const tab = parts[1] as ExploreTab | undefined;
    return {
      view: 'explore',
      exploreTab: tab && EXPLORE_TABS.has(tab) ? tab : 'list',
    };
  }

  return { view: 'home' };
}

/** Return the one canonical URL for a pathname, including invalid variants. */
export function canonicalAppPath(pathname: string): string {
  const path = trimPath(pathname);
  const route = resolveAppRoute(path);

  if (route.view === 'chat' && route.chatUid) return pathForChat(route.chatUid);
  if (route.view === 'matching') return pathForMatching(route.matchingMode ?? 'quick');
  if (route.view === 'explore') return pathForExplore(route.exploreTab ?? 'list');

  const canonical = pathForView(route.view);
  const knownStaticPaths = new Set(Object.values(VIEW_PATHS));
  return knownStaticPaths.has(path) ? canonical : '/';
}

export function pathForView(view: View): string {
  if (view === 'chat') return VIEW_PATHS.conversations;
  return VIEW_PATHS[view];
}

export function pathForChat(uid: string): string {
  return `/messages/${encodeURIComponent(uid)}`;
}

export function pathForMatching(mode: MatchingMode): string {
  return `/connect/${mode}`;
}

export function pathForExplore(tab: ExploreTab): string {
  return `/explore/${tab}`;
}

/** Convert links produced by older releases without keeping hash routing alive. */
export function migrateLegacyHash(hash: string): string | null {
  if (!hash || hash === '#') return null;

  const chatMatch = hash.match(/^#chat\?with=([^&]+)/);
  if (chatMatch?.[1]) return pathForChat(decodeURIComponent(chatMatch[1]));

  const legacyView = hash.slice(1) as View;
  const validViews = new Set<View>([
    'home', 'profile', 'matching', 'students', 'results', 'chat',
    'conversations', 'settings', 'posts', 'explore', 'documents',
  ]);

  return validViews.has(legacyView) ? pathForView(legacyView) : null;
}
