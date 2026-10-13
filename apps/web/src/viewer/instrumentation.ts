/**
 * Counts live viewer resources so tests can prove nothing leaks across
 * close/reopen cycles. Every listener and observer the viewer creates goes
 * through these helpers, which keeps the numbers trustworthy.
 *
 * The counters are published on `window.__viewerDebug` only when the build
 * defines `__VIEWER_DEBUG__` as true (dev server and test builds).
 */
declare const __VIEWER_DEBUG__: boolean | undefined;

export interface ViewerDebugSnapshot {
  activeInstances: number;
  activeListeners: number;
  activeObservers: number;
  currentStudyId: string | null;
  state: string;
  /** Increments each time cornerstone finishes rendering an image. */
  renderCount: number;
}

declare global {
  interface Window {
    __viewerDebug?: ViewerDebugSnapshot;
  }
}

const counters: ViewerDebugSnapshot = {
  activeInstances: 0,
  activeListeners: 0,
  activeObservers: 0,
  currentStudyId: null,
  state: 'idle',
  renderCount: 0,
};

const debugEnabled = typeof __VIEWER_DEBUG__ !== 'undefined' && __VIEWER_DEBUG__;

if (debugEnabled && typeof window !== 'undefined') {
  Object.defineProperty(window, '__viewerDebug', {
    configurable: true,
    get: (): ViewerDebugSnapshot => ({ ...counters }),
  });
}

export const instrumentation = {
  instanceCreated(): void {
    counters.activeInstances += 1;
  },

  instanceDisposed(): void {
    counters.activeInstances -= 1;
    if (counters.activeInstances === 0) {
      counters.currentStudyId = null;
      counters.state = 'idle';
    }
  },

  publishState(state: string, studyId: string | null): void {
    counters.state = state;
    counters.currentStudyId = studyId;
  },

  rendered(): void {
    counters.renderCount += 1;
  },

  /** Adds an event listener and returns a function that removes it. */
  trackListener(target: EventTarget, type: string, handler: EventListener): () => void {
    target.addEventListener(type, handler);
    counters.activeListeners += 1;
    let removed = false;
    return () => {
      if (!removed) {
        removed = true;
        target.removeEventListener(type, handler);
        counters.activeListeners -= 1;
      }
    };
  },

  /** Starts observing and returns a function that disconnects the observer. */
  trackResizeObserver(element: Element, onResize: () => void): () => void {
    const observer = new ResizeObserver(onResize);
    observer.observe(element);
    counters.activeObservers += 1;
    let disconnected = false;
    return () => {
      if (!disconnected) {
        disconnected = true;
        observer.disconnect();
        counters.activeObservers -= 1;
      }
    };
  },
};
