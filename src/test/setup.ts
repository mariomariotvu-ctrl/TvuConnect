import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Node may expose an incomplete experimental Storage global. A deterministic
// in-memory implementation keeps browser cache tests isolated per worker.
const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(String(key)) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(String(key)); },
    setItem: (key, value) => { values.set(String(key), String(value)); },
  };
};

const localStorageMock = createMemoryStorage();
const sessionStorageMock = createMemoryStorage();
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorageMock });
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: sessionStorageMock });
}
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageMock });
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: sessionStorageMock });

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  if (typeof document !== 'undefined') cleanup();
});
