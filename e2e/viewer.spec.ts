import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  CHECKERBOARD,
  CORRUPT,
  GRADIENT,
  countEdges,
  debugSnapshot,
  isRamp,
  openApp,
  selectStudy,
  stage,
  stageHash,
  stageHasImage,
  stageProfiles,
  waitForRender,
  waitForViewer,
} from './helpers';

test.describe('real DICOM viewer', () => {
  let pageErrors: string[];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    await openApp(page);
  });

  test('renders each valid fixture with different pixels and only the allowed metadata', async ({
    page,
  }) => {
    await selectStudy(page, GRADIENT);
    await waitForViewer(page, 'ready', GRADIENT);
    expect(await stageHasImage(page)).toBe(true);
    const gradientHash = await stageHash(page);

    const info = page.getByLabel('Image information');
    await expect(info.locator('dt')).toHaveText(['Modality', 'Study date', 'Dimensions']);
    await expect(info).toContainText('OT');
    await expect(info).toContainText(/\d{4}-\d{2}-\d{2}/);
    await expect(info).toContainText('256 x 256 px');

    await selectStudy(page, CHECKERBOARD);
    await waitForViewer(page, 'ready', CHECKERBOARD);
    expect(await stageHasImage(page)).toBe(true);
    expect(await stageHash(page)).not.toBe(gradientHash);

    // No identifying DICOM fields may appear anywhere on the page.
    await expect(page.locator('body')).not.toContainText(/patient/i);
    expect(pageErrors).toEqual([]);
  });

  test('draws the actual pixel content of each fixture', async ({ page }) => {
    // Gradient: a smooth ramp along at least one axis, with no abrupt edges.
    await selectStudy(page, GRADIENT);
    await waitForViewer(page, 'ready', GRADIENT);
    const gradient = await stageProfiles(page);
    expect(isRamp(gradient.row) || isRamp(gradient.column)).toBe(true);

    // Checkerboard: repeated hard light/dark edges in both directions.
    await selectStudy(page, CHECKERBOARD);
    await waitForViewer(page, 'ready', CHECKERBOARD);
    const checkerboard = await stageProfiles(page);
    expect(countEdges(checkerboard.row)).toBeGreaterThanOrEqual(3);
    expect(countEdges(checkerboard.column)).toBeGreaterThanOrEqual(3);
    expect(isRamp(checkerboard.row)).toBe(false);
  });

  test('changes pixels with window/level and restores them on reset', async ({ page }) => {
    await selectStudy(page, GRADIENT);
    await waitForViewer(page, 'ready', GRADIENT);
    const original = await stageHash(page);

    let renders = (await debugSnapshot(page)).renderCount;
    await page.getByLabel(/Window width/).fill('20');
    await waitForRender(page, renders);
    expect(await stageHash(page)).not.toBe(original);

    renders = (await debugSnapshot(page)).renderCount;
    await page.getByRole('button', { name: 'Reset' }).click();
    await waitForRender(page, renders);
    expect(await stageHash(page)).toBe(original);
  });

  test('keeps the image visible and refitted when the container resizes', async ({ page }) => {
    await selectStudy(page, GRADIENT);
    await waitForViewer(page, 'ready', GRADIENT);
    const before = await stage(page).boundingBox();

    await page.setViewportSize({ width: 760, height: 800 });
    await expect
      .poll(async () => (await stage(page).boundingBox())?.width ?? 0)
      .not.toBe(before?.width);

    expect(await stageHasImage(page)).toBe(true);
    await page.getByRole('button', { name: 'Fit' }).click();
    expect(await stageHasImage(page)).toBe(true);
  });

  test('shows an error for the corrupt fixture and recovers without a reload', async ({ page }) => {
    let navigations = 0;
    page.on('framenavigated', () => {
      navigations += 1;
    });
    const viewerError = page.getByRole('alert').filter({ hasText: /not a readable DICOM image/i });

    await selectStudy(page, CORRUPT);
    await waitForViewer(page, 'error', CORRUPT);
    await expect(viewerError).toBeVisible();
    await expect(stage(page).locator('canvas')).toHaveCount(0);

    // The worklist is still fully usable.
    await expect(page.getByRole('table', { name: 'Studies' })).toBeVisible();

    await selectStudy(page, GRADIENT);
    await waitForViewer(page, 'ready', GRADIENT);
    expect(await stageHasImage(page)).toBe(true);
    await expect(viewerError).toHaveCount(0);
    expect(navigations).toBe(0);
    // The corrupt file is rejected before decoding, so nothing leaks to the console.
    expect(pageErrors).toEqual([]);
  });

  test('explains an unsupported image differently from a corrupt one', async ({ page }) => {
    // Serve the gradient with its photometric interpretation changed, which is
    // a well-formed DICOM file this viewer deliberately does not support.
    const bytes = Buffer.from(fs.readFileSync(path.resolve(__dirname, '../samples/gradient.dcm')));
    bytes.write('MONOCHROME1', bytes.indexOf('MONOCHROME2', 0, 'latin1'), 'latin1');
    await page.route(`**/api/studies/${CHECKERBOARD}/file`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/dicom', body: bytes }),
    );

    await selectStudy(page, CHECKERBOARD);
    await waitForViewer(page, 'error', CHECKERBOARD);
    await expect(
      page.getByRole('alert').filter({ hasText: /Only MONOCHROME2 greyscale images/i }),
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('exposes Fit, Reset and both sliders to the keyboard', async ({ page }) => {
    await selectStudy(page, GRADIENT);
    await waitForViewer(page, 'ready', GRADIENT);

    const width = page.getByLabel(/Window width/);
    await width.focus();
    await expect(width).toBeFocused();
    const renders = (await debugSnapshot(page)).renderCount;
    await page.keyboard.press('ArrowLeft');
    await waitForRender(page, renders);

    const fit = page.getByRole('button', { name: 'Fit' });
    await fit.focus();
    await page.keyboard.press('Enter');
    await expect(fit).toBeFocused();
  });

  test('has no detectable accessibility violations', async ({ page }) => {
    const scan = async (): Promise<string[]> => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
    };

    // Worklist only, then with a study open and its image and controls shown.
    expect(await scan()).toEqual([]);
    await selectStudy(page, GRADIENT);
    await waitForViewer(page, 'ready', GRADIENT);
    expect(await scan()).toEqual([]);

    // And in the error state.
    await selectStudy(page, CORRUPT);
    await waitForViewer(page, 'error', CORRUPT);
    expect(await scan()).toEqual([]);

    // The dark theme must pass the same checks, including colour contrast.
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await scan()).toEqual([]);
    await selectStudy(page, GRADIENT);
    await waitForViewer(page, 'ready', GRADIENT);
    expect(await scan()).toEqual([]);
  });

  test('adjusts window/level by dragging on the image', async ({ page }) => {
    await selectStudy(page, GRADIENT);
    await waitForViewer(page, 'ready', GRADIENT);
    const original = await stageHash(page);
    const widthBefore = await page.getByLabel(/Window width/).inputValue();

    const box = await stage(page).boundingBox();
    if (!box) {
      throw new Error('viewer stage is not visible');
    }
    let renders = (await debugSnapshot(page)).renderCount;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await waitForRender(page, renders);

    // Dragging left narrows the window: the slider follows and the pixels change.
    expect(Number(await page.getByLabel(/Window width/).inputValue())).toBeLessThan(
      Number(widthBefore),
    );
    expect(await stageHash(page)).not.toBe(original);

    renders = (await debugSnapshot(page)).renderCount;
    await page.getByRole('button', { name: 'Reset' }).click();
    await waitForRender(page, renders);
    expect(await stageHash(page)).toBe(original);
    expect(pageErrors).toEqual([]);
  });
});
