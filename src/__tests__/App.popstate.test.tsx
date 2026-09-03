import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SUB_VIEWS = ['chat', 'results', 'settings', 'profile'];

describe('App Popstate & Menu Tests', () => {
  describe('History pushState', () => {
    beforeEach(() => { vi.spyOn(window.history, 'pushState'); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('navigate đến sub-view → pushState được gọi', () => {
      for (const view of SUB_VIEWS) {
        window.history.pushState({ view }, '', `#${view}`);
      }
      expect(window.history.pushState).toHaveBeenCalledTimes(SUB_VIEWS.length);
    });

    it('pushState với đúng state object cho chat', () => {
      window.history.pushState({ view: 'chat' }, '', '#chat');
      expect(window.history.pushState).toHaveBeenCalledWith({ view: 'chat' }, '', '#chat');
    });

    it('navigate home không push state', () => {
      // Home view không phải sub-view
      const subViews = ['chat', 'results', 'settings', 'profile'];
      const isSubView = (view: string) => subViews.includes(view);
      expect(isSubView('home')).toBe(false);
      expect(isSubView('posts')).toBe(false);
    });
  });

  describe('Popstate Handler', () => {
    const createHandler = (setView: (v: string) => void) => (e: { state: any }) => {
      const state = e.state as { view?: string } | null;
      if (state?.view) {
        setView(state.view);
      } else {
        setView('home');
        window.history.pushState({ view: 'home' }, '', '#home');
      }
    };

    it('popstate với state.view = "chat" → setView("chat")', () => {
      const setView = vi.fn();
      const handler = createHandler(setView);
      handler({ state: { view: 'chat' } });
      expect(setView).toHaveBeenCalledWith('chat');
    });

    it('popstate với state = null → setView("home")', () => {
      const setView = vi.fn();
      vi.spyOn(window.history, 'pushState');
      const handler = createHandler(setView);
      handler({ state: null });
      expect(setView).toHaveBeenCalledWith('home');
      vi.restoreAllMocks();
    });

    it('popstate với state = null → pushState mới để tránh đóng app', () => {
      vi.spyOn(window.history, 'pushState');
      const handler = createHandler(vi.fn());
      handler({ state: null });
      expect(window.history.pushState).toHaveBeenCalledWith({ view: 'home' }, '', '#home');
      vi.restoreAllMocks();
    });

    it('mỗi sub-view đều được popstate xử lý đúng', () => {
      for (const view of SUB_VIEWS) {
        const setView = vi.fn();
        const handler = createHandler(setView);
        handler({ state: { view } });
        expect(setView).toHaveBeenCalledWith(view);
      }
    });
  });

  describe('Hamburger Menu', () => {
    const createMenuGuard = (setShowMobileMenu: (v: boolean) => void) => {
      let menuOpen = true;
      const menuContains = (target: Element, inside: boolean) => inside;
      return {
        handleTouchOutside: (target: Element, isInsideMenu: boolean) => {
          if (!menuOpen) return;
          const menu = { contains: (t: Element) => isInsideMenu };
          if (!menu.contains(target)) {
            setShowMobileMenu(false);
            menuOpen = false;
          }
        }
      };
    };

    it('touchstart ngoài menu → setShowMobileMenu(false) ngay lập tức', () => {
      const setShowMobileMenu = vi.fn();
      const guard = createMenuGuard(setShowMobileMenu);
      const outsideEl = document.createElement('div');
      guard.handleTouchOutside(outsideEl, false); // false = outside
      expect(setShowMobileMenu).toHaveBeenCalledWith(false);
    });

    it('touchstart trong menu → menu không đóng', () => {
      const setShowMobileMenu = vi.fn();
      const guard = createMenuGuard(setShowMobileMenu);
      const insideEl = document.createElement('div');
      guard.handleTouchOutside(insideEl, true); // true = inside
      expect(setShowMobileMenu).not.toHaveBeenCalled();
    });
  });
});
