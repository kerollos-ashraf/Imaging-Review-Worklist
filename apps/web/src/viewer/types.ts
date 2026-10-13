export interface ImageInfo {
  modality: string;
  studyDate: string;
  rows: number;
  columns: number;
  minPixel: number;
  maxPixel: number;
}

export interface WindowLevel {
  width: number;
  center: number;
}

export interface RenderedImage {
  info: ImageInfo;
  windowLevel: WindowLevel;
}

export type ViewerState =
  | { kind: 'idle' }
  | { kind: 'loading'; studyId: string }
  | { kind: 'error'; studyId: string; message: string }
  | { kind: 'ready'; studyId: string; info: ImageInfo; windowLevel: WindowLevel };

export type ReadyState = Extract<ViewerState, { kind: 'ready' }>;

export type FileLoader = (studyId: string, signal: AbortSignal) => Promise<Blob>;

/**
 * The drawing surface the controller depends on. The production implementation
 * wraps Cornerstone3D; tests substitute a fake, which keeps the load-ordering
 * logic testable without WebGL.
 */
export interface ImageRenderer {
  /**
   * Decodes and draws the image. Rejects when it cannot be decoded, and with
   * `SupersededError` when `clear` or `destroy` ran before it finished.
   */
  show(file: Blob): Promise<RenderedImage>;
  /** Removes whatever is on screen, frees it and cancels any `show` in flight. */
  clear(): void;
  fit(): void;
  /** Restores the initial presentation and returns its window/level. */
  reset(): WindowLevel | null;
  setWindowLevel(windowLevel: WindowLevel): void;
  resize(): void;
  destroy(): void;
}

/** A `show` call was overtaken by a newer one; never shown to the user. */
export class SupersededError extends Error {
  constructor() {
    super('Image load superseded');
    this.name = 'SupersededError';
  }
}

export type ViewerLoadFailure = 'corrupt' | 'unsupported';

/** The file was downloaded but cannot be displayed by this viewer. */
export class ViewerLoadError extends Error {
  constructor(
    readonly failure: ViewerLoadFailure,
    message: string,
  ) {
    super(message);
    this.name = 'ViewerLoadError';
  }
}
