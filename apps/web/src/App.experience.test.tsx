import { screen, within } from '@testing-library/react';
import { openApp, openStudy, settle } from './testing/appHarness';
import { NO_FILTERS } from './api/types';
import { makeStudy } from './testing/FakeStudyApi';

jest.mock('./viewer/ViewerPanel', () => ({ ViewerPanel: (): null => null }));

const MINE = makeStudy({ id: 'study-a', status: 'InReview', ownerId: 'reviewer-a', version: 2 });
const THEIRS = makeStudy({ id: 'study-o', status: 'InReview', ownerId: 'reviewer-b', version: 2 });
const OPEN = makeStudy({ id: 'study-u' });
const DONE = makeStudy({
  id: 'study-d',
  status: 'Completed',
  ownerId: 'reviewer-a',
  reviewNote: 'All good',
  version: 3,
});

function studiesTable(): HTMLElement {
  return screen.getByRole('table', { name: 'Studies' });
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('theme', () => {
  it('toggles between light and dark and remembers the choice', async () => {
    const { user } = await openApp([OPEN]);
    expect(document.documentElement.dataset.theme).toBe('light');

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('imaging.theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('starts from the saved theme', async () => {
    window.localStorage.setItem('imaging.theme', 'dark');
    await openApp([OPEN]);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('filter bar', () => {
  const OLD = makeStudy({ id: 'study-old', createdAt: '2026-01-01T08:00:00.000Z' });
  const NEW = makeStudy({ id: 'study-new', createdAt: '2026-03-01T08:00:00.000Z' });

  function shownIds(): (string | null)[] {
    return within(studiesTable())
      .getAllByRole('button', { name: /^study-/ })
      .map((button) => button.textContent);
  }

  it('asks the server for the oldest first by default and shows its order as is', async () => {
    const { api } = await openApp([OLD, NEW]);
    expect(api.listCalls[0]?.args).toEqual(NO_FILTERS);
    expect(shownIds()).toEqual(['study-old', 'study-new']);
    expect(screen.getByLabelText('Sort by created')).toHaveValue('asc');
    // Sorting lives in the filter bar only; the column header is plain text.
    expect(
      within(screen.getByRole('columnheader', { name: 'Created' })).queryByRole('button'),
    ).not.toBeInTheDocument();
  });

  it('sorts newest first from the filter bar', async () => {
    const { api, user } = await openApp([OLD, NEW]);

    await user.selectOptions(screen.getByLabelText('Sort by created'), 'Newest first');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(api.listCalls[1]?.args).toMatchObject({ order: 'desc' });

    await settle(() => api.listCalls[1]?.result.resolve([NEW, OLD]));
    expect(shownIds()).toEqual(['study-new', 'study-old']);
  });

  it('filters by owner, marking the current reviewer in the list', async () => {
    const { api, user } = await openApp([OLD, NEW]);
    const owner = screen.getByLabelText('Owner');
    expect(within(owner).getByRole('option', { name: 'Reviewer A (you)' })).toBeInTheDocument();

    await user.selectOptions(owner, 'reviewer-b');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(api.listCalls[1]?.args).toMatchObject({ ownerId: 'reviewer-b' });
  });

  it('searches by study name when Enter is pressed, trimming the text', async () => {
    const { api, user } = await openApp([OLD, NEW]);

    await user.type(screen.getByLabelText('Study name'), '  New {Enter}');
    expect(api.listCalls).toHaveLength(2);
    expect(api.listCalls[1]?.args).toMatchObject({ search: 'New' });
  });

  it('does not request anything while the user is still typing', async () => {
    const { api, user } = await openApp([OLD, NEW]);
    await user.type(screen.getByLabelText('Study name'), 'stud');
    await user.selectOptions(screen.getByLabelText('Owner'), 'reviewer-a');
    expect(api.listCalls).toHaveLength(1);
  });

  it('combines every filter in one request and clears them all at once', async () => {
    const { api, user } = await openApp([OLD, NEW]);

    await user.type(screen.getByLabelText('Study name'), 'old');
    await user.selectOptions(screen.getByLabelText('Status'), 'InReview');
    await user.type(screen.getByLabelText('Modality'), 'OT');
    await user.selectOptions(screen.getByLabelText('Owner'), 'reviewer-a');
    await user.selectOptions(screen.getByLabelText('Sort by created'), 'desc');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(api.listCalls[1]?.args).toEqual({
      search: 'old',
      status: 'InReview',
      modality: 'OT',
      ownerId: 'reviewer-a',
      order: 'desc',
    });

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(api.listCalls[2]?.args).toEqual(NO_FILTERS);
    expect(screen.getByLabelText('Study name')).toHaveValue('');
    expect(screen.getByLabelText('Owner')).toHaveValue('');
    expect(screen.getByLabelText('Sort by created')).toHaveValue('asc');
  });

  it('keeps a changed study listed while it still matches the name search', async () => {
    const mine = makeStudy({ id: 'study-u' });
    const harness = await openApp([mine]);
    const { api, user } = harness;

    // The search text is upper case; matching ignores case, as the server does.
    await user.type(screen.getByLabelText('Study name'), 'STUDY-U{Enter}');
    await settle(() => api.listCalls[1]?.result.resolve([mine]));
    await openStudy(harness, mine);
    await user.click(await screen.findByRole('button', { name: 'Claim study' }));
    await settle(() => {
      api.claimCalls[0]?.result.resolve(
        makeStudy({ id: 'study-u', status: 'InReview', ownerId: 'reviewer-a', version: 2 }),
      );
    });
    // Still matches the name search (case-insensitively), so it stays listed.
    expect(shownIds()).toEqual(['study-u']);
  });
});

describe('worklist', () => {
  it('summarises the shown studies by status', async () => {
    await openApp([OPEN, MINE, THEIRS, DONE]);
    const summary = screen.getByRole('list', { name: 'All matching studies by status' });
    expect(within(summary).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '1Unassigned',
      '2InReview',
      '1Completed',
    ]);
  });

  it('marks the studies owned by the current reviewer', async () => {
    await openApp([MINE, THEIRS]);
    const rows = within(studiesTable()).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('reviewer-aYou');
    expect(rows[1]).not.toHaveTextContent('You');
  });

  it('moves between studies with the arrow, Home and End keys', async () => {
    const { user } = await openApp([OPEN, MINE, DONE]);
    const first = screen.getByRole('button', { name: 'study-u' });
    const last = screen.getByRole('button', { name: 'study-d' });
    first.focus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'study-a' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(last).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(last).toHaveFocus();
    await user.keyboard('{Home}');
    expect(first).toHaveFocus();
  });

  it('flags a study that holds an unsent draft', async () => {
    const harness = await openApp([MINE, OPEN]);
    await openStudy(harness, MINE);
    expect(within(studiesTable()).queryByText('Draft')).not.toBeInTheDocument();

    await harness.user.type(await screen.findByLabelText('Review note'), 'half a thought');
    const row = screen.getByRole('button', { name: 'study-a' }).closest('tr');
    expect(row).toHaveTextContent('Draft');

    await harness.user.clear(screen.getByLabelText('Review note'));
    expect(within(studiesTable()).queryByText('Draft')).not.toBeInTheDocument();
  });
});

describe('study detail', () => {
  it('shows where the study is in its lifecycle', async () => {
    const harness = await openApp([MINE]);
    await openStudy(harness, MINE);

    const progress = await screen.findByRole('list', { name: 'Review progress' });
    const current = within(progress)
      .getAllByRole('listitem')
      .find((item) => item.getAttribute('aria-current') === 'step');
    expect(current).toHaveTextContent('In review');
    // The step being worked on is open; the one behind it is filled.
    expect(current).toHaveClass('current');
    expect(within(progress).getByText('Waiting').closest('li')).toHaveClass('done');
    expect(within(progress).getByText('Done').closest('li')).toHaveClass('todo');
  });

  it('fills every step, including the last, once the review is completed', async () => {
    const harness = await openApp([DONE]);
    await openStudy(harness, DONE);

    const progress = await screen.findByRole('list', { name: 'Review progress' });
    const steps = within(progress).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    for (const step of steps) {
      expect(step).toHaveClass('done');
      expect(step).not.toHaveClass('current');
    }
    // "Done" is still announced as the current step and emphasised.
    const last = within(progress).getByText('Done').closest('li');
    expect(last).toHaveAttribute('aria-current', 'step');
    expect(last).toHaveClass('reached');
  });

  it('shows only the first step as open for an unclaimed study', async () => {
    const harness = await openApp([OPEN]);
    await openStudy(harness, OPEN);

    const progress = await screen.findByRole('list', { name: 'Review progress' });
    expect(within(progress).getByText('Waiting').closest('li')).toHaveClass('current');
    expect(within(progress).getByText('In review').closest('li')).toHaveClass('todo');
  });

  it('shows the retained note for a completed study', async () => {
    const harness = await openApp([DONE]);
    await openStudy(harness, DONE);
    expect(await screen.findByText('All good')).toBeInTheDocument();
    expect(screen.queryByLabelText('Review note')).not.toBeInTheDocument();
  });

  it('submits the note with Ctrl+Enter', async () => {
    const harness = await openApp([MINE]);
    const { api, user } = harness;
    await openStudy(harness, MINE);

    await user.type(await screen.findByLabelText('Review note'), 'done{Control>}{Enter}{/Control}');
    expect(api.completeCalls).toHaveLength(1);
    expect(api.completeCalls[0]?.args.input.reviewNote).toBe('done');
  });

  it('does not submit an empty note with Ctrl+Enter', async () => {
    const harness = await openApp([MINE]);
    await openStudy(harness, MINE);

    await harness.user.type(await screen.findByLabelText('Review note'), '{Control>}{Enter}{/Control}');
    expect(harness.api.completeCalls).toHaveLength(0);
  });

  it('warns when the note is too long and blocks submitting', async () => {
    const harness = await openApp([MINE]);
    await openStudy(harness, MINE);

    const note = await screen.findByLabelText('Review note');
    await harness.user.click(note);
    await harness.user.paste('x'.repeat(1001));
    expect(note).toHaveAccessibleDescription(/1001 \/ 1000 characters \(too long\)/);
    expect(screen.getByRole('button', { name: 'Complete review' })).toBeDisabled();
  });
});

describe('leaving the page with drafts', () => {
  function leaveIsBlocked(): boolean {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('asks for confirmation only while a draft exists', async () => {
    const harness = await openApp([MINE]);
    await openStudy(harness, MINE);
    expect(leaveIsBlocked()).toBe(false);

    await harness.user.type(await screen.findByLabelText('Review note'), 'unsent');
    expect(leaveIsBlocked()).toBe(true);

    await harness.user.clear(screen.getByLabelText('Review note'));
    expect(leaveIsBlocked()).toBe(false);
  });
});
