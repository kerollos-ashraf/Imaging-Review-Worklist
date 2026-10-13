import { Enums, RenderingEngine, cache, imageLoader } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { ensureCornerstone } from './cornerstoneInit';
import { readImageInfo } from './imageMetadata';
import { instrumentation } from './instrumentation';
import { SupersededError } from './types';
import type { ImageRenderer, RenderedImage, WindowLevel } from './types';

interface LoadedImage {
  imageId: string;
  objectUrl: string;
}

const VIEWPORT_ID = 'viewer-viewport';
let engineCounter = 0;

/**
 * Cornerstone3D implementation of ImageRenderer: one rendering engine and one
 * stack viewport inside `element`.
 *
 * `generation` advances on every `clear`/`destroy`. A `show` that finishes an
 * async step under an older generation frees what it loaded and rejects with
 * SupersededError, so it can never draw over a newer image.
 */
export class CornerstoneRenderer implements ImageRenderer {
  private readonly engineId = `viewer-engine-${(engineCounter += 1)}`;
  private engine: RenderingEngine | null = null;
  private viewport: Types.IStackViewport | null = null;
  private current: LoadedImage | null = null;
  private initialWindowLevel: WindowLevel | null = null;
  private generation = 0;
  private destroyed = false;
  private readonly removeRenderListener: () => void;

  constructor(private readonly element: HTMLDivElement) {
    this.removeRenderListener = instrumentation.trackListener(
      element,
      Enums.Events.IMAGE_RENDERED,
      () => {
        instrumentation.rendered();
      },
    );
  }

  async show(file: Blob): Promise<RenderedImage> {
    const generation = this.generation;
    const objectUrl = URL.createObjectURL(file);
    const image: LoadedImage = { objectUrl, imageId: `wadouri:${objectUrl}` };
    try {
      await ensureCornerstone();
      // Load explicitly first: StackViewport.setStack swallows decode failures,
      // so a broken file would otherwise look like a successful load.
      await imageLoader.loadAndCacheImage(image.imageId);
      this.assertCurrent(generation);

      const viewport = this.ensureViewport();
      await viewport.setStack([image.imageId]);
      this.assertCurrent(generation);
      viewport.render();
    } catch (error) {
      this.release(image);
      throw error;
    }
    this.current = image;
    const info = readImageInfo(image.imageId);
    const windowLevel = this.readWindowLevel(info.minPixel, info.maxPixel);
    this.initialWindowLevel = windowLevel;
    return { info, windowLevel };
  }

  clear(): void {
    this.generation += 1;
    this.initialWindowLevel = null;
    if (this.viewport && this.engine) {
      this.engine.disableElement(VIEWPORT_ID);
    }
    this.viewport = null;
    if (this.current) {
      this.release(this.current);
      this.current = null;
    }
  }

  fit(): void {
    this.viewport?.resetCamera();
    this.viewport?.render();
  }

  reset(): WindowLevel | null {
    const viewport = this.viewport;
    const initial = this.initialWindowLevel;
    if (!viewport || !initial) {
      return null;
    }
    viewport.resetProperties();
    viewport.resetCamera();
    this.setWindowLevel(initial);
    return initial;
  }

  setWindowLevel(windowLevel: WindowLevel): void {
    const viewport = this.viewport;
    if (!viewport) {
      return;
    }
    viewport.setProperties({
      voiRange: {
        lower: windowLevel.center - windowLevel.width / 2,
        upper: windowLevel.center + windowLevel.width / 2,
      },
    });
    viewport.render();
  }

  resize(): void {
    if (!this.destroyed) {
      this.engine?.resize(true, false);
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.clear();
    this.removeRenderListener();
    this.engine?.destroy();
    this.engine = null;
  }

  private assertCurrent(generation: number): void {
    if (this.destroyed || generation !== this.generation) {
      throw new SupersededError();
    }
  }

  private ensureViewport(): Types.IStackViewport {
    if (this.viewport) {
      return this.viewport;
    }
    const engine = this.engine ?? new RenderingEngine(this.engineId);
    engine.enableElement({
      viewportId: VIEWPORT_ID,
      type: Enums.ViewportType.STACK,
      element: this.element,
      defaultOptions: { background: [0, 0, 0] },
    });
    this.engine = engine;
    this.viewport = engine.getViewport(VIEWPORT_ID) as Types.IStackViewport;
    return this.viewport;
  }

  private readWindowLevel(minPixel: number, maxPixel: number): WindowLevel {
    const voi = this.viewport?.getProperties().voiRange;
    const lower = voi?.lower ?? minPixel;
    const upper = voi?.upper ?? maxPixel;
    return { width: Math.max(1, upper - lower), center: (upper + lower) / 2 };
  }

  private release(image: LoadedImage): void {
    try {
      cache.removeImageLoadObject(image.imageId, { force: true });
    } catch {
      // Cache cleanup must never be able to break loading; cornerstone evicts
      // the entry through its own cache limit if removal fails.
    }
    URL.revokeObjectURL(image.objectUrl);
  }
}
