import { createHash } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { PNG } from 'pngjs';

export const GRADIENT = 'study-001';
export const CHECKERBOARD = 'study-002';
export const CORRUPT = 'study-007';

export interface ViewerDebug {
  activeInstances: number;
  activeListeners: number;
  activeObservers: number;
  currentStudyId: string | null;
  state: string;
  renderCount: number;
}

type DebugWindow = Window & { __viewerDebug?: ViewerDebug };

export async function debugSnapshot(page: Page): Promise<ViewerDebug> {
  return page.evaluate(() => {
    const debug = (window as DebugWindow).__viewerDebug;
    if (!debug) {
      throw new Error('window.__viewerDebug is missing; run against a VIEWER_DEBUG build');
    }
    return debug;
  });
}

export async function waitForViewer(
  page: Page,
  state: 'ready' | 'error' | 'loading' | 'idle',
  studyId: string | null,
): Promise<void> {
  await page.waitForFunction(
    ([wantedState, wantedStudy]) => {
      const debug = (window as DebugWindow).__viewerDebug;
      return debug?.state === wantedState && debug.currentStudyId === wantedStudy;
    },
    [state, studyId] as const,
  );
}

/** Resolves once cornerstone has drawn at least one more frame than `previous`. */
export async function waitForRender(page: Page, previous: number): Promise<void> {
  await page.waitForFunction((count) => {
    const debug = (window as DebugWindow).__viewerDebug;
    return (debug?.renderCount ?? 0) > count;
  }, previous);
}

export function stage(page: Page): Locator {
  return page.getByTestId('viewer-canvas');
}

/**
 * A hash of the pixels the viewer actually drew. It reads the viewer's own
 * canvas rather than a page screenshot, because a screenshot's edge pixels
 * depend on scroll position and sub-pixel layout, which are not image content.
 */
export async function stageHash(page: Page): Promise<string> {
  const dataUrl = await stage(page)
    .locator('canvas')
    .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL('image/png'));
  return createHash('sha1').update(dataUrl).digest('hex');
}

/** True when the screenshot contains real image content, not a flat colour. */
export async function stageHasImage(page: Page): Promise<boolean> {
  const png = PNG.sync.read(await stage(page).screenshot());
  let min = 255;
  let max = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const luminance = png.data[i] ?? 0;
    min = Math.min(min, luminance);
    max = Math.max(max, luminance);
  }
  return max - min > 40;
}

export interface StageProfiles {
  /** Luminance along the horizontal centre line of the displayed image. */
  row: number[];
  /** Luminance along the vertical centre line of the displayed image. */
  column: number[];
}

/**
 * Samples the rendered pixels along both centre lines of the image area (the
 * central square of the stage, slightly inset to stay clear of the edges).
 */
export async function stageProfiles(page: Page): Promise<StageProfiles> {
  const png = PNG.sync.read(await stage(page).screenshot());
  const side = Math.floor(Math.min(png.width, png.height) * 0.9);
  const left = Math.floor((png.width - side) / 2);
  const top = Math.floor((png.height - side) / 2);
  const centreX = Math.floor(png.width / 2);
  const centreY = Math.floor(png.height / 2);
  const at = (x: number, y: number): number => png.data[(y * png.width + x) * 4] ?? 0;
  return {
    row: Array.from({ length: side }, (_, i) => at(left + i, centreY)),
    column: Array.from({ length: side }, (_, i) => at(centreX, top + i)),
  };
}

/** A smooth ramp: values only move one way and cover a wide range. */
export function isRamp(profile: number[]): boolean {
  const tolerance = 3;
  let rising = true;
  let falling = true;
  for (let i = 1; i < profile.length; i += 1) {
    const delta = (profile[i] ?? 0) - (profile[i - 1] ?? 0);
    rising &&= delta >= -tolerance;
    falling &&= delta <= tolerance;
  }
  const range = Math.max(...profile) - Math.min(...profile);
  return (rising || falling) && range > 100;
}

/** Number of abrupt light/dark edges along a line. */
export function countEdges(profile: number[]): number {
  let edges = 0;
  let previous = (profile[0] ?? 0) > 127;
  for (const value of profile) {
    const bright = value > 127;
    if (bright !== previous) {
      edges += 1;
      previous = bright;
    }
  }
  return edges;
}

export async function selectStudy(page: Page, studyId: string): Promise<void> {
  await page.getByRole('button', { name: studyId, exact: true }).click();
}

export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('table', { name: 'Studies' })).toBeVisible();
}
