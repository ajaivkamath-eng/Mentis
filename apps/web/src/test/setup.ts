/**
 * jsdom shims for component tests.
 *
 * Framer Motion (WAAPI + IntersectionObserver), Radix (ResizeObserver,
 * pointer capture) and our theme layer (matchMedia) all need browser APIs that
 * jsdom does not implement. Stubbing them here keeps the tests focused on
 * behaviour instead of environment plumbing.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

if (!window.localStorage || typeof window.localStorage.clear !== 'function') {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() { return store.size; },
    },
  });
}

afterEach(() => cleanup());

/* matchMedia — theme resolution + media queries */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

/* ResizeObserver — Radix popper/scroll areas */
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, 'ResizeObserver', { writable: true, value: RO });
Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: RO });

/* IntersectionObserver — whileInView entrances */
class IO {
  root = null;
  rootMargin = '';
  thresholds = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
Object.defineProperty(globalThis, 'IntersectionObserver', { writable: true, value: IO });

/* Element.animate — Framer Motion's WAAPI fallback path.
   jsdom ships the method in newer versions (hence the runtime guard) but with a
   narrower return type than the DOM lib, so the stub is cast rather than typed. */
if (!Element.prototype.animate) {
  Element.prototype.animate = (() => ({
    cancel: () => {},
    finish: () => {},
    play: () => {},
    pause: () => {},
    reverse: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    finished: Promise.resolve(),
    onfinish: null,
    playState: 'finished',
    currentTime: 0,
    startTime: 0,
    id: '',
    effect: null,
    pending: false,
    replaceState: 'active',
    timeline: null,
  })) as unknown as Element['animate'];
}

Object.defineProperty(window, 'scrollTo', { writable: true, value: vi.fn() });
Object.defineProperty(window, 'requestAnimationFrame', {
  writable: true,
  value: (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number,
});

/* Radix needs these to exist on the element prototype. */
if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
if (!HTMLElement.prototype.hasPointerCapture) HTMLElement.prototype.hasPointerCapture = () => false;
if (!HTMLElement.prototype.setPointerCapture) HTMLElement.prototype.setPointerCapture = () => {};
if (!HTMLElement.prototype.releasePointerCapture) HTMLElement.prototype.releasePointerCapture = () => {};
