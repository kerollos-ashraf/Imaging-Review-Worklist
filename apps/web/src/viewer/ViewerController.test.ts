import { deferred } from '../testing/FakeStudyApi';
import type { Deferred } from '../testing/FakeStudyApi';
import { SupersededError, ViewerLoadError } from './types';
import type { ImageRenderer, RenderedImage, ViewerState, WindowLevel } from './types';
import { ViewerController } from './ViewerController';

/**
 * The controller's ordering rules, tested without WebGL. The fake loader
 * deliberately ignores the abort signal: bytes for an old study really do
 * arrive late here, which is the case the browser test cannot force.
 */

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  disconnected = false;
  constructor(readonly callback: () => void) {
    FakeResizeObserver.instances.push(this);
  }
  observe(): void {
    // Size changes are triggered manually through `callback`.
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

const RENDERED: RenderedImage = {
  info: { modality: 'OT', studyDate: '2026-10-07', rows: 2, columns: 2, minPixel: 0, maxPixel: 100 },
  windowLevel: { width: 100, center: 50 },
};

class FakeRenderer implements ImageRenderer {
  readonly calls: string[] = [];
  readonly shows: Deferred<RenderedImage>[] = [];
  show(): Promise<RenderedImage> {
    this.calls.push('show');
    const pending = deferred<RenderedImage>();
    this.shows.push(pending);
    return pending.promise;
  }
  clear(): void {
    this.calls.push('clear');
  }
  fit(): void {
    this.calls.push('fit');
  }
  reset(): WindowLevel | null {
    this.calls.push('reset');
    return RENDERED.windowLevel;
  }
  setWindowLevel(): void {
    this.calls.push('setWindowLevel');
  }
  resize(): void {
    this.calls.push('resize');
  }
  destroy(): void {
    this.calls.push('destroy');
  }
}

interface Harness {
  controller: ViewerController;
  renderer: FakeRenderer;
  states: ViewerState[];
  files: Map<string, Deferred<Blob>>;
  inspect: jest.Mock<undefined, [ArrayBuffer]>;
}

const FILE = { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as unknown as Blob;

function setup(): Harness {
  const renderer = new FakeRenderer();
  const states: ViewerState[] = [];
  const files = new Map<string, Deferred<Blob>>();
  const inspect = jest.fn<undefined, [ArrayBuffer]>();
  const controller = new ViewerController({
    element: document.createElement('div'),
    renderer,
    // Ignores the abort signal on purpose (see the file comment).
    loadFile: (studyId) => {
      const pending = deferred<Blob>();
      files.set(studyId, pending);
      return pending.promise;
    },
    inspect,
    describeError: (error) => (error instanceof Error ? error.message : 'unknown'),
    onState: (state) => states.push(state),
  });
  return { controller, renderer, states, files, inspect };
}

/** Lets every already-resolved promise continuation run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

async function deliverFile(harness: Harness, studyId: string): Promise<void> {
  harness.files.get(studyId)?.resolve(FILE);
  await settle();
}

function lastState(harness: Harness): ViewerState | undefined {
  return harness.states[harness.states.length - 1];
}

beforeEach(() => {
  FakeResizeObserver.instances = [];
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
});

describe('ViewerController', () => {
  it('goes loading then ready for a successful load', async () => {
    const harness = setup();
    void harness.controller.load('a');
    expect(lastState(harness)).toEqual({ kind: 'loading', studyId: 'a' });

    await deliverFile(harness, 'a');
    harness.renderer.shows[0]?.resolve(RENDERED);
    await settle();

    expect(lastState(harness)).toEqual({ kind: 'ready', studyId: 'a', ...RENDERED });
  });

  it('never publishes or draws a study whose bytes arrive after a newer load', async () => {
    const harness = setup();
    void harness.controller.load('a');
    void harness.controller.load('b');

    // B is ready first.
    await deliverFile(harness, 'b');
    harness.renderer.shows[0]?.resolve(RENDERED);
    await settle();
    expect(lastState(harness)).toMatchObject({ kind: 'ready', studyId: 'b' });
    const showsBefore = harness.renderer.shows.length;

    // A's bytes arrive late: they must not be inspected, drawn or published.
    await deliverFile(harness, 'a');
    expect(harness.renderer.shows).toHaveLength(showsBefore);
    expect(harness.inspect).toHaveBeenCalledTimes(1);
    expect(lastState(harness)).toMatchObject({ kind: 'ready', studyId: 'b' });
    expect(harness.states.some((s) => s.kind === 'ready' && s.studyId === 'a')).toBe(false);
  });

  it('ignores a decode that finishes after the user switched study', async () => {
    const harness = setup();
    void harness.controller.load('a');
    await deliverFile(harness, 'a');
    void harness.controller.load('b');

    // A's decode completes after B started.
    harness.renderer.shows[0]?.resolve(RENDERED);
    await settle();

    expect(lastState(harness)).toEqual({ kind: 'loading', studyId: 'b' });
  });

  it('clears the screen before every load and on failure', async () => {
    const harness = setup();
    void harness.controller.load('a');
    expect(harness.renderer.calls).toEqual(['clear']);

    await deliverFile(harness, 'a');
    harness.renderer.shows[0]?.reject(new Error('decode failed'));
    await settle();

    expect(harness.renderer.calls).toEqual(['clear', 'show', 'clear']);
    expect(lastState(harness)).toEqual({ kind: 'error', studyId: 'a', message: 'decode failed' });
  });

  it('reports an unsupported file without handing it to the renderer', async () => {
    const harness = setup();
    harness.inspect.mockImplementation(() => {
      throw new ViewerLoadError('unsupported', 'Only MONOCHROME2 is supported');
    });
    void harness.controller.load('a');
    await deliverFile(harness, 'a');

    expect(harness.renderer.shows).toHaveLength(0);
    expect(lastState(harness)).toEqual({
      kind: 'error',
      studyId: 'a',
      message: 'Only MONOCHROME2 is supported',
    });
  });

  it('recovers with the next study after an error', async () => {
    const harness = setup();
    void harness.controller.load('bad');
    harness.files.get('bad')?.reject(new Error('boom'));
    await settle();
    expect(lastState(harness)).toMatchObject({ kind: 'error', studyId: 'bad' });

    void harness.controller.load('good');
    await deliverFile(harness, 'good');
    harness.renderer.shows[0]?.resolve(RENDERED);
    await settle();
    expect(lastState(harness)).toMatchObject({ kind: 'ready', studyId: 'good' });
  });

  it('publishes nothing and draws nothing once disposed mid-load', async () => {
    const harness = setup();
    void harness.controller.load('a');
    harness.controller.dispose();
    const statesAtDispose = harness.states.length;

    await deliverFile(harness, 'a');

    expect(harness.states).toHaveLength(statesAtDispose);
    expect(harness.renderer.shows).toHaveLength(0);
    expect(harness.renderer.calls).toContain('destroy');
  });

  it('swallows a superseded decode silently', async () => {
    const harness = setup();
    void harness.controller.load('a');
    await deliverFile(harness, 'a');
    void harness.controller.load('b');
    harness.renderer.shows[0]?.reject(new SupersededError());
    await settle();

    expect(harness.states.some((s) => s.kind === 'error')).toBe(false);
  });

  it('disposes idempotently and stops following resizes', () => {
    const harness = setup();
    const observer = FakeResizeObserver.instances[0];

    observer?.callback();
    expect(harness.renderer.calls).toEqual(['resize']);

    harness.controller.dispose();
    harness.controller.dispose();
    expect(observer?.disconnected).toBe(true);
    expect(harness.renderer.calls.filter((call) => call === 'destroy')).toHaveLength(1);

    observer?.callback();
    expect(harness.renderer.calls.filter((call) => call === 'resize')).toHaveLength(1);
  });

  it('applies window/level and reset only while an image is shown', async () => {
    const harness = setup();
    harness.controller.setWindowLevel({ width: 10, center: 5 });
    harness.controller.fit();
    expect(harness.renderer.calls).toEqual([]);

    void harness.controller.load('a');
    await deliverFile(harness, 'a');
    harness.renderer.shows[0]?.resolve(RENDERED);
    await settle();

    harness.controller.setWindowLevel({ width: 10, center: 5 });
    expect(lastState(harness)).toMatchObject({ windowLevel: { width: 10, center: 5 } });
    harness.controller.reset();
    expect(lastState(harness)).toMatchObject({ windowLevel: RENDERED.windowLevel });
  });

  it('adjusts window/level relatively and keeps it within the slider bounds', async () => {
    const harness = setup();
    harness.controller.adjustWindowLevel(0.5, 0.5);
    expect(harness.renderer.calls).toEqual([]);

    void harness.controller.load('a');
    await deliverFile(harness, 'a');
    harness.renderer.shows[0]?.resolve(RENDERED);
    await settle();

    // Pixel range is 0..100, starting at width 100 / centre 50.
    harness.controller.adjustWindowLevel(0.2, -0.1);
    expect(lastState(harness)).toMatchObject({ windowLevel: { width: 120, center: 40 } });

    harness.controller.adjustWindowLevel(50, 50);
    expect(lastState(harness)).toMatchObject({ windowLevel: { width: 200, center: 150 } });

    harness.controller.adjustWindowLevel(-50, -50);
    expect(lastState(harness)).toMatchObject({ windowLevel: { width: 1, center: -50 } });
  });
});
