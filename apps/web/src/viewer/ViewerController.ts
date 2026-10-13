import { instrumentation } from './instrumentation';
import type {
  FileLoader,
  ImageRenderer,
  ReadyState,
  ViewerState,
  WindowLevel,
} from './types';

export interface ViewerDependencies {
  /** The element whose size the viewer follows. */
  element: Element;
  renderer: ImageRenderer;
  loadFile: FileLoader;
  /** Throws when the file cannot be displayed (corrupt or unsupported). */
  inspect: (bytes: ArrayBuffer) => void;
  describeError: (error: unknown) => string;
  onState: (state: ViewerState) => void;
}

/**
 * Coordinates loading for one viewer instance. It knows nothing about the
 * rendering library: drawing is delegated to an ImageRenderer.
 *
 * Concurrency rule: every `load` takes a new token and clears the screen first.
 * Any step that finishes for an older token (or after `dispose`) returns without
 * publishing state, so only the latest request can ever become visible.
 */
export class ViewerController {
  private abort: AbortController | null = null;
  private token = 0;
  private disposed = false;
  private latestReady: ReadyState | null = null;
  private readonly stopObservingResize: () => void;

  constructor(private readonly deps: ViewerDependencies) {
    instrumentation.instanceCreated();
    this.stopObservingResize = instrumentation.trackResizeObserver(deps.element, () => {
      if (!this.disposed) {
        this.deps.renderer.resize();
      }
    });
  }

  async load(studyId: string): Promise<void> {
    if (this.disposed) {
      return;
    }
    const token = (this.token += 1);
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;

    // Drop whatever is on screen so a slow or failed load can never leave
    // another study's image visible.
    this.latestReady = null;
    this.deps.renderer.clear();
    this.emit({ kind: 'loading', studyId });

    try {
      const file = await this.deps.loadFile(studyId, abort.signal);
      if (this.isStale(token)) {
        return;
      }
      this.deps.inspect(await file.arrayBuffer());
      if (this.isStale(token)) {
        return;
      }
      const rendered = await this.deps.renderer.show(file);
      if (this.isStale(token)) {
        return;
      }
      this.latestReady = { kind: 'ready', studyId, ...rendered };
      this.emit(this.latestReady);
    } catch (error) {
      if (this.isStale(token)) {
        return;
      }
      this.deps.renderer.clear();
      this.emit({ kind: 'error', studyId, message: this.deps.describeError(error) });
    }
  }

  fit(): void {
    if (this.latestReady && !this.disposed) {
      this.deps.renderer.fit();
    }
  }

  reset(): void {
    if (!this.latestReady || this.disposed) {
      return;
    }
    const initial = this.deps.renderer.reset();
    if (initial) {
      this.publishWindowLevel(initial);
    }
  }

  setWindowLevel(windowLevel: WindowLevel): void {
    if (!this.latestReady || this.disposed) {
      return;
    }
    this.deps.renderer.setWindowLevel(windowLevel);
    this.publishWindowLevel(windowLevel);
  }

  /** Idempotent. After this, no state is published and nothing can be drawn. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.token += 1;
    this.abort?.abort();
    this.abort = null;
    this.latestReady = null;
    this.stopObservingResize();
    this.deps.renderer.destroy();
    instrumentation.instanceDisposed();
  }

  private isStale(token: number): boolean {
    return this.disposed || token !== this.token;
  }

  private publishWindowLevel(windowLevel: WindowLevel): void {
    if (this.latestReady) {
      this.latestReady = { ...this.latestReady, windowLevel };
      this.emit(this.latestReady);
    }
  }

  private emit(state: ViewerState): void {
    if (this.disposed) {
      return;
    }
    instrumentation.publishState(state.kind, 'studyId' in state ? state.studyId : null);
    this.deps.onState(state);
  }
}
