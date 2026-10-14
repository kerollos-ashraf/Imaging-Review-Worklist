import { screen, within } from '@testing-library/react';
import { FIRST_PAGE, NO_FILTERS } from './api/types';
import type { Study } from './api/types';
import { openApp, openStudy, settle } from './testing/appHarness';
import { makeStudy } from './testing/FakeStudyApi';

jest.mock('./viewer/ViewerPanel', () => ({ ViewerPanel: (): null => null }));

/** Ten studies numbered from `first`, as one server page would hold. */
function pageOfStudies(first: number, count = 10): Study[] {
  return Array.from({ length: count }, (_, index) =>
    makeStudy({ id: `study-${String(first + index).padStart(3, '0')}` }),
  );
}

function shownIds(): (string | null)[] {
  return within(screen.getByRole('table', { name: 'Studies' }))
    .getAllByRole('button', { name: /^study-/ })
    .map((button) => button.textContent);
}

function pagination(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Pagination' });
}

describe('worklist pagination', () => {
  it('asks the server for the first page and shows where it is', async () => {
    const { api } = await openApp([]);
    expect(api.listCalls[0]?.paging).toEqual(FIRST_PAGE);

    await settle(() => undefined);
    // Nothing matched: no page controls.
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  function openFirstPage(total = 25): ReturnType<typeof openApp> {
    return openApp({ studies: pageOfStudies(1), total });
  }

  it('shows the range, the page count and disables Previous on the first page', async () => {
    await openFirstPage();
    const nav = pagination();
    expect(nav).toHaveTextContent('Showing 1–10 of 25');
    expect(nav).toHaveTextContent('Page 1 of 3');
    expect(within(nav).getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(within(nav).getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('requests the next page from the server and keeps the old rows until it arrives', async () => {
    const { api, user } = await openFirstPage();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    const call = api.listCalls[1];
    expect(call?.paging).toEqual({ page: 2, pageSize: 10 });
    expect(call?.args).toEqual(NO_FILTERS);

    // Still showing page 1, marked busy, with the controls inert but in place.
    expect(shownIds()[0]).toBe('study-001');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await settle(() => call?.result.resolve({ studies: pageOfStudies(11), total: 25 }));
    expect(shownIds()[0]).toBe('study-011');
    expect(pagination()).toHaveTextContent('Showing 11–20 of 25');
    expect(pagination()).toHaveTextContent('Page 2 of 3');
  });

  it('disables Next on the last, shorter page', async () => {
    const { api, user } = await openFirstPage();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await settle(() => api.listCalls[1]?.result.resolve({ studies: pageOfStudies(11), total: 25 }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await settle(() => {
      api.listCalls[2]?.result.resolve({ studies: pageOfStudies(21, 5), total: 25 });
    });

    expect(pagination()).toHaveTextContent('Showing 21–25 of 25');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  it('goes back to page 1 when the filters change', async () => {
    const { api, user } = await openFirstPage();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await settle(() => api.listCalls[1]?.result.resolve({ studies: pageOfStudies(11), total: 25 }));

    await user.selectOptions(screen.getByLabelText('Status'), 'InReview');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));

    const call = api.listCalls[api.listCalls.length - 1];
    expect(call?.args).toMatchObject({ status: 'InReview' });
    expect(call?.paging).toEqual({ page: 1, pageSize: 10 });
  });

  it('restarts from page 1 with the new size when rows per page changes', async () => {
    const { api, user } = await openFirstPage(120);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await settle(() => api.listCalls[1]?.result.resolve({ studies: pageOfStudies(11), total: 120 }));

    await user.selectOptions(screen.getByLabelText('Rows per page'), '50');
    expect(api.listCalls[2]?.paging).toEqual({ page: 1, pageSize: 50 });

    await settle(() => {
      api.listCalls[2]?.result.resolve({ studies: pageOfStudies(1, 50), total: 120 });
    });
    expect(pagination()).toHaveTextContent('Showing 1–50 of 120');
    expect(pagination()).toHaveTextContent('Page 1 of 3');
  });

  it('ignores a page that answers after the user already moved to another', async () => {
    const { api, user } = await openFirstPage(40);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const pageTwo = api.listCalls[1];
    // Page 2 has not answered yet; the user changes the page size instead.
    await user.selectOptions(screen.getByLabelText('Rows per page'), '25');
    const resized = api.listCalls[2];

    await settle(() => resized?.result.resolve({ studies: pageOfStudies(1, 25), total: 40 }));
    await settle(() => pageTwo?.result.resolve({ studies: pageOfStudies(11), total: 40 }));

    expect(shownIds()).toHaveLength(25);
    expect(shownIds()[0]).toBe('study-001');
    expect(pagination()).toHaveTextContent('Showing 1–25 of 40');
  });

  function chips(): (string | null)[] {
    return within(screen.getByRole('list', { name: 'All matching studies by status' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
  }

  it('shows the status totals for every matching study, not just the rows on the page', async () => {
    // The page holds ten Unassigned rows, but the server reports the whole set.
    const { api, user } = await openApp({
      studies: pageOfStudies(1),
      total: 100,
      statusCounts: { Unassigned: 40, InReview: 39, Completed: 21 },
    });
    expect(chips()).toEqual(['40Unassigned', '39InReview', '21Completed']);

    // Another page of the same result set shows the same totals.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await settle(() => {
      api.listCalls[1]?.result.resolve({
        studies: pageOfStudies(11),
        total: 100,
        statusCounts: { Unassigned: 40, InReview: 39, Completed: 21 },
      });
    });
    expect(chips()).toEqual(['40Unassigned', '39InReview', '21Completed']);
  });

  it('moves a study between the status totals when it is claimed', async () => {
    const open = makeStudy({ id: 'study-u' });
    const harness = await openApp({
      studies: [open, ...pageOfStudies(2, 9)],
      total: 100,
      statusCounts: { Unassigned: 40, InReview: 39, Completed: 21 },
    });

    await openStudy(harness, open);
    await harness.user.click(await screen.findByRole('button', { name: 'Claim study' }));
    await settle(() => {
      harness.api.claimCalls[0]?.result.resolve(
        makeStudy({ id: 'study-u', status: 'InReview', ownerId: 'reviewer-a', version: 2 }),
      );
    });

    expect(chips()).toEqual(['39Unassigned', '40InReview', '21Completed']);
    expect(pagination()).toHaveTextContent('Showing 1\u201310 of 100');
  });

  it('lowers the total when a study leaves the filtered list', async () => {
    const harness = await openApp([]);
    const { api, user } = harness;
    const open = makeStudy({ id: 'study-u' });

    await user.selectOptions(screen.getByLabelText('Status'), 'Unassigned');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await settle(() => {
      api.listCalls[1]?.result.resolve({ studies: [open, ...pageOfStudies(2, 9)], total: 31 });
    });
    expect(pagination()).toHaveTextContent('Showing 1–10 of 31');

    await openStudy(harness, open);
    await user.click(await screen.findByRole('button', { name: 'Claim study' }));
    await settle(() => {
      api.claimCalls[0]?.result.resolve(
        makeStudy({ id: 'study-u', status: 'InReview', ownerId: 'reviewer-a', version: 2 }),
      );
    });

    expect(shownIds()).not.toContain('study-u');
    expect(chips()).toEqual(['9Unassigned', '0InReview', '0Completed']);
    expect(pagination()).toHaveTextContent('Showing 1–9 of 30');
  });
});
