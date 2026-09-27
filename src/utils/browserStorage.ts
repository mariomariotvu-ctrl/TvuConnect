/** Optional preferences must not prevent boot/login in storage-restricted WebViews. */
export const safeLocalStorage = {
  getItem(key: string): string | null {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string): void {
    try { window.localStorage.setItem(key, value); } catch { /* Keep current in-memory UI state. */ }
  },
  removeItem(key: string): void {
    try { window.localStorage.removeItem(key); } catch { /* Optional preference. */ }
  },
};
