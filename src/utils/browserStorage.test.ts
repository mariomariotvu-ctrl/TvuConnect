import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeLocalStorage } from './browserStorage';

afterEach(() => vi.restoreAllMocks());
describe('optional startup preferences', () => {
  it('does not throw when a WebView refuses storage reads or writes', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(safeLocalStorage.getItem('theme')).toBeNull();
    expect(() => safeLocalStorage.setItem('theme', 'light')).not.toThrow();
  });
  it('can initialize quota tracking even when storage access throws', async () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const { quotaManager } = await import('./quotaManager');
    expect(() => quotaManager.checkStoredQuota()).not.toThrow();
  });
});
