import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  CHECKERBOARD,
  GRADIENT,
  debugSnapshot,
  openApp,
  selectStudy,
  stage,
  stageHash,
  waitForViewer,
} from './helpers';

interface Gate {
  /** Resolves once the browser's request has reached the interceptor. */
  reached: Promise<void>;
  /** Lets the held response through. */
  release: () => void;
  /** Resolves once the interceptor has finished with the request. */
  done: Promise<void>;
}

interface InternalGate extends Gate {
  markReached: () => void;
  markDone: () => void;
  held: Promise<void>;
}

function createGate(): InternalGate {
  let markReached!: () => void;
  let markDone!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    markReached = resolve;
  });
  const done = new Promise<void>((resolve) => {
    markDone = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { reached, done, held, release, markReached, markDone };
}

/**
 * Holds the file response of chosen studies until the test releases it, which
 * gives the test full control over "late" responses without any sleeping.
 */
async function installGates(page: Page): Promise<(studyId: string) => Gate> {
  const gates = new Map<string, InternalGate>();
  await page.route('**/api/studies/*/file', async (route) => {
    const studyId = new URL(route.request().url()).pathname.split('/')[3] ?? '';
    const gate = gates.get(studyId);
    if (!gate) {
      await route.continue();
      return;
    }
    gates.delete(studyId);
    gate.markReached();
    await gate.held;
    try {
      await route.continue();
    } catch {
      // The page aborted the request (study switched or viewer closed).
    }
    gate.markDone();
  });

  return (studyId: string): Gate => {
    const gate = createGate();
    gates.set(studyId, gate);
    return gate;
  };
}

test.describe('viewer lifecycle', () => {
  let pageErrors: string[];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    await openApp(page);
  });

  test('a late response for a previous study never replaces the current image', async ({
    page,
  }) => {
    // Reference pixels for the study that should end up on screen.
    await selectStudy(page, CHECKERBOARD);
    await waitForViewer(page, 'ready', CHECKERBOARD);
    const expected = await stageHash(page);
    await selectStudy(page, GRADIENT);
    await waitForViewer(page, 'ready', GRADIENT);

    const hold = await installGates(page);
    const slowCheckerboard = hold(CHECKERBOARD);
    const lateGradient = hold(GRADIENT);

    await selectStudy(page, CHECKERBOARD);
    await slowCheckerboard.reached;
    await selectStudy(page, GRADIENT);
    await lateGradient.reached;
    // The user moves on to the checkerboard again before anything answered.
    const finalCheckerboard = hold(CHECKERBOARD);
    await selectStudy(page, CHECKERBOARD);
    await finalCheckerboard.reached;
    await waitForViewer(page, 'loading', CHECKERBOARD);

    // The gradient answers late, after the user already moved on.
    lateGradient.release();
    await lateGradient.done;
    expect((await debugSnapshot(page)).currentStudyId).toBe(CHECKERBOARD);
    expect((await debugSnapshot(page)).state).toBe('loading');

    slowCheckerboard.release();
    await slowCheckerboard.done;
    finalCheckerboard.release();
    await finalCheckerboard.done;
    await waitForViewer(page, 'ready', CHECKERBOARD);
    expect(await stageHash(page)).toBe(expected);
    expect(pageErrors).toEqual([]);
  });

  test('closing during a pending load does not reopen or attach an image', async ({ page }) => {
    await selectStudy(page, GRADIENT);
    await waitForViewer(page, 'ready', GRADIENT);

    const hold = await installGates(page);
    const pending = hold(CHECKERBOARD);
    await selectStudy(page, CHECKERBOARD);
    await pending.reached;
    await waitForViewer(page, 'loading', CHECKERBOARD);

    await page.getByRole('button', { name: 'Close viewer' }).click();
    await expect(page.getByTestId('viewer-canvas')).toHaveCount(0);
    expect(await debugSnapshot(page)).toMatchObject({
      activeInstances: 0,
      activeListeners: 0,
      activeObservers: 0,
      state: 'idle',
    });

    pending.release();
    await pending.done;

    await expect(page.getByTestId('viewer-canvas')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open viewer' })).toBeVisible();
    expect(await debugSnapshot(page)).toMatchObject({ activeInstances: 0, state: 'idle' });
    expect(pageErrors).toEqual([]);
  });

  test('five close/reopen cycles accumulate no listeners, observers or instances', async ({
    page,
  }) => {
    await selectStudy(page, GRADIENT);
    await waitForViewer(page, 'ready', GRADIENT);
    const baseline = await debugSnapshot(page);
    expect(baseline.activeInstances).toBe(1);
    expect(baseline.activeListeners).toBeGreaterThan(0);
    expect(baseline.activeObservers).toBeGreaterThan(0);
    const reference = await stageHash(page);

    for (let cycle = 0; cycle < 5; cycle += 1) {
      await page.getByRole('button', { name: 'Close viewer' }).click();
      expect(await debugSnapshot(page)).toMatchObject({
        activeInstances: 0,
        activeListeners: 0,
        activeObservers: 0,
      });
      await page.getByRole('button', { name: 'Open viewer' }).click();
      await waitForViewer(page, 'ready', GRADIENT);

      const after = await debugSnapshot(page);
      expect(after.activeInstances).toBe(baseline.activeInstances);
      expect(after.activeListeners).toBe(baseline.activeListeners);
      expect(after.activeObservers).toBe(baseline.activeObservers);
      await expect(stage(page).locator('canvas')).toHaveCount(1);
      expect(await stageHash(page)).toBe(reference);
    }
    expect(pageErrors).toEqual([]);
  });

  test('reopening after an abandoned delayed load ends on exactly one fresh viewer', async ({
    page,
  }) => {
    await selectStudy(page, GRADIENT);
    await waitForViewer(page, 'ready', GRADIENT);
    const baseline = await debugSnapshot(page);

    await page.getByRole('button', { name: 'Close viewer' }).click();
    const hold = await installGates(page);
    const slow = hold(GRADIENT);
    await page.getByRole('button', { name: 'Open viewer' }).click();
    await slow.reached;
    await page.getByRole('button', { name: 'Close viewer' }).click();
    slow.release();
    await slow.done;
    expect((await debugSnapshot(page)).activeInstances).toBe(0);

    await page.getByRole('button', { name: 'Open viewer' }).click();
    await waitForViewer(page, 'ready', GRADIENT);
    const after = await debugSnapshot(page);
    expect(after.activeInstances).toBe(baseline.activeInstances);
    expect(after.activeListeners).toBe(baseline.activeListeners);
    expect(after.activeObservers).toBe(baseline.activeObservers);
    await expect(stage(page).locator('canvas')).toHaveCount(1);
    expect(pageErrors).toEqual([]);
  });
});
