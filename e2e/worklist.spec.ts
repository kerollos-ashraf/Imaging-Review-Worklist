import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { openApp } from './helpers';

/**
 * The worklist against the real API and the default seed of 100 studies:
 * filtering, ordering and paging all happen on the server.
 */

function studyButtons(page: Page): Locator {
  return page.getByRole('table', { name: 'Studies' }).getByRole('button', { name: /^study-/ });
}

async function shownIds(page: Page): Promise<string[]> {
  return studyButtons(page).allInnerTexts();
}

function numbered(first: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `study-${String(first + i).padStart(3, '0')}`);
}

test.describe('worklist paging and filters', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('pages through the 100 seeded studies ten at a time', async ({ page }) => {
    const pagination = page.getByRole('navigation', { name: 'Pagination' });
    await expect(pagination).toContainText('Showing 1–10 of 100');
    await expect(pagination).toContainText('Page 1 of 10');
    expect(await shownIds(page)).toEqual(numbered(1, 10));
    await expect(pagination.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await pagination.getByRole('button', { name: 'Next' }).click();
    await expect(pagination).toContainText('Showing 11–20 of 100');
    expect(await shownIds(page)).toEqual(numbered(11, 10));

    await pagination.getByRole('button', { name: 'Previous' }).click();
    await expect(pagination).toContainText('Page 1 of 10');
    expect(await shownIds(page)).toEqual(numbered(1, 10));
  });

  test('shows status totals for all 100 studies on every page', async ({ page }) => {
    const chips = page.getByRole('list', { name: 'All matching studies by status' });
    // The seed holds 40 Unassigned, 39 InReview and 21 Completed studies.
    const totals = ['40Unassigned', '39InReview', '21Completed'];
    await expect(chips.getByRole('listitem')).toHaveText(totals);

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('Page 2');
    await expect(chips.getByRole('listitem')).toHaveText(totals);

    // With a filter, the totals describe the filtered set.
    await page.getByLabel('Status', { exact: true }).selectOption('Completed');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(chips.getByRole('listitem')).toHaveText([
      '0Unassigned',
      '0InReview',
      '21Completed',
    ]);
  });

  test('only requests the rows of the current page from the server', async ({ page }) => {
    const request = page.waitForRequest((r) => r.url().includes('/api/studies?') && r.url().includes('page=2'));
    const response = page.waitForResponse((r) => r.url().includes('page=2'));
    await page.getByRole('button', { name: 'Next' }).click();

    expect(new URL((await request).url()).searchParams.get('pageSize')).toBe('10');
    const answer = await response;
    expect((await answer.json()) as unknown[]).toHaveLength(10);
    expect(answer.headers()['x-total-count']).toBe('100');
  });

  test('changes the page size and reaches the last page', async ({ page }) => {
    const pagination = page.getByRole('navigation', { name: 'Pagination' });
    await page.getByLabel('Rows per page').selectOption('50');
    await expect(pagination).toContainText('Showing 1–50 of 100');
    await expect(studyButtons(page)).toHaveCount(50);

    await pagination.getByRole('button', { name: 'Next' }).click();
    await expect(pagination).toContainText('Showing 51–100 of 100');
    await expect(pagination.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect((await shownIds(page)).at(-1)).toBe('study-100');
  });

  test('sorts newest first on the server and pages that order', async ({ page }) => {
    await page.getByLabel('Sort by created').selectOption('desc');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(studyButtons(page).first()).toHaveText('study-100');
    expect(await shownIds(page)).toEqual(numbered(91, 10).reverse());
  });

  test('searches and filters by owner, returning to page 1 with a new total', async ({ page }) => {
    const pagination = page.getByRole('navigation', { name: 'Pagination' });
    await pagination.getByRole('button', { name: 'Next' }).click();
    await expect(pagination).toContainText('Page 2 of 10');

    await page.getByLabel('Study name').fill('STUDY-09');
    await page.getByLabel('Study name').press('Enter');
    await expect(pagination).toContainText('Showing 1–10 of 10');
    await expect(pagination).toContainText('Page 1 of 1');
    expect(await shownIds(page)).toEqual(numbered(90, 10));

    await page.getByLabel('Owner').selectOption('reviewer-b');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    // Of study-090..099, the seed gives reviewer-b exactly these three.
    await expect(pagination).toContainText('Showing 1–3 of 3');
    expect(await shownIds(page)).toEqual(['study-093', 'study-098', 'study-099']);

    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(pagination).toContainText('Showing 1–10 of 100');
  });
});

test.describe('completed review note', () => {
  // study-022 is seeded InReview for reviewer-a and is not used by any other test.
  const STUDY = 'study-022';
  const longNote = (
    'A sentence of ordinary words that should wrap at the spaces. '.repeat(8) +
    'unbroken' +
    '5'.repeat(600)
  ).slice(0, 1000);

  for (const width of [1280, 420]) {
    test(`a maximum-length note wraps inside its card at ${width}px`, async ({ page, request }) => {
      const current = await request.get(`/api/studies/${STUDY}`);
      const study = (await current.json()) as { status: string; version: number };
      if (study.status === 'InReview') {
        const completed = await request.post(`/api/studies/${STUDY}/complete`, {
          data: { reviewerId: 'reviewer-a', expectedVersion: study.version, reviewNote: longNote },
        });
        expect(completed.status()).toBe(200);
      }

      await page.setViewportSize({ width, height: 900 });
      await openApp(page);
      await page.getByLabel('Study name').fill(STUDY);
      await page.getByLabel('Study name').press('Enter');
      await page.getByRole('button', { name: STUDY, exact: true }).click();

      const card = page.getByRole('region', { name: 'Completed review' });
      await expect(card).toContainText('unbroken5555');

      const layout = await card.evaluate((element) => {
        const note = element.querySelector('.note');
        const panel = element.closest('.panel');
        if (!note || !panel) {
          throw new Error('note or panel not found');
        }
        const right = (node: Element): number => node.getBoundingClientRect().right;
        return {
          noteInsideCard: right(note) <= right(element) + 0.5,
          cardInsidePanel: right(element) <= right(panel) + 0.5,
          pageScrollsSideways:
            document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      expect(layout).toEqual({
        noteInsideCard: true,
        cardInsidePanel: true,
        pageScrollsSideways: false,
      });
    });
  }
});
