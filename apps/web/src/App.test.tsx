import { act, screen, within } from '@testing-library/react';
import { ApiError, NetworkError } from './api/StudyApi';
import { detailPanel, openApp, openStudy } from './testing/appHarness';
import { makeStudy } from './testing/FakeStudyApi';

// The real viewer is covered by the Playwright tests; here it is a no-op.
jest.mock('./viewer/ViewerPanel', () => ({ ViewerPanel: (): null => null }));

const STUDY_A = makeStudy({ id: 'study-a', status: 'InReview', ownerId: 'reviewer-a', version: 2 });
const STUDY_B = makeStudy({ id: 'study-b', status: 'InReview', ownerId: 'reviewer-a', version: 5 });
const UNASSIGNED = makeStudy({ id: 'study-u' });
const OTHERS = makeStudy({ id: 'study-o', status: 'InReview', ownerId: 'reviewer-b', version: 2 });

describe('worklist filtering', () => {
  it('ignores a delayed response from an older filter', async () => {
    const { api, user } = await openApp([STUDY_A, UNASSIGNED]);

    await user.selectOptions(screen.getByLabelText('Status'), 'Unassigned');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await user.selectOptions(screen.getByLabelText('Status'), 'InReview');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(api.listCalls).toHaveLength(3);

    // The newer request (InReview) answers first, then the stale Unassigned one.
    await act(async () => {
      api.listCalls[2]?.result.resolve([STUDY_A]);
      await Promise.resolve();
    });
    await act(async () => {
      api.listCalls[1]?.result.resolve([UNASSIGNED]);
      await Promise.resolve();
    });

    const table = screen.getByRole('table', { name: 'Studies' });
    expect(within(table).getByRole('button', { name: 'study-a' })).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'study-u' })).not.toBeInTheDocument();
  });

  it('shows the empty state when nothing matches', async () => {
    await openApp([]);
    expect(screen.getByText('No studies match the current filters.')).toBeInTheDocument();
  });
});

describe('drafts', () => {
  it('keeps each study draft separate and restores it on return', async () => {
    const harness = await openApp([STUDY_A, STUDY_B]);
    const { user } = harness;

    await openStudy(harness, STUDY_A);
    await user.type(await screen.findByLabelText('Review note'), 'note for A');

    await openStudy(harness, STUDY_B);
    const noteForB = await screen.findByLabelText('Review note');
    expect(noteForB).toHaveValue('');
    await user.type(noteForB, 'note for B');

    await openStudy(harness, STUDY_A);
    expect(await screen.findByLabelText('Review note')).toHaveValue('note for A');

    await openStudy(harness, STUDY_B);
    expect(await screen.findByLabelText('Review note')).toHaveValue('note for B');
  });

  it('keeps the draft and requires acknowledgement after a stale completion', async () => {
    const harness = await openApp([STUDY_A]);
    const { api, user } = harness;
    await openStudy(harness, STUDY_A);

    await user.type(await screen.findByLabelText('Review note'), 'my findings');
    await user.click(screen.getByRole('button', { name: 'Complete review' }));
    expect(api.completeCalls).toHaveLength(1);
    expect(api.completeCalls[0]?.args.input.expectedVersion).toBe(2);

    const current = makeStudy({ ...STUDY_A, version: 3 });
    await act(async () => {
      api.completeCalls[0]?.result.reject(
        new ApiError(412, 'STALE_VERSION', 'The study was changed.', current),
      );
      await Promise.resolve();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('This study changed');
    expect(screen.getByLabelText('Review note')).toHaveValue('my findings');
    expect(within(detailPanel()).getByText('3')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Complete review' });
    expect(submit).toBeDisabled();

    // Nothing is sent until the user explicitly acknowledges.
    await user.click(submit);
    expect(api.completeCalls).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Review current state and continue' }));
    await user.click(screen.getByRole('button', { name: 'Complete review' }));
    expect(api.completeCalls).toHaveLength(2);
    expect(api.completeCalls[1]?.args.input).toMatchObject({
      expectedVersion: 3,
      reviewNote: 'my findings',
    });
  });

  it('keeps the note when the network fails', async () => {
    const harness = await openApp([STUDY_A]);
    const { api, user } = harness;
    await openStudy(harness, STUDY_A);

    await user.type(await screen.findByLabelText('Review note'), 'keep me');
    await user.click(screen.getByRole('button', { name: 'Complete review' }));
    await act(async () => {
      api.completeCalls[0]?.result.reject(new NetworkError());
      await Promise.resolve();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
    expect(screen.getByLabelText('Review note')).toHaveValue('keep me');
    expect(screen.getByRole('button', { name: 'Complete review' })).toBeEnabled();
  });
});

describe('study detail', () => {
  it('ignores a delayed detail response for a study that is no longer selected', async () => {
    const { api, user } = await openApp([STUDY_A, STUDY_B]);

    await user.click(screen.getByRole('button', { name: 'study-a' }));
    await user.click(screen.getByRole('button', { name: 'study-b' }));
    const callA = api.lastGet('study-a');
    const callB = api.lastGet('study-b');

    await act(async () => {
      callB.result.resolve(STUDY_B);
      await Promise.resolve();
    });
    await act(async () => {
      callA.result.resolve(STUDY_A);
      await Promise.resolve();
    });

    const panel = detailPanel();
    expect(within(panel).getByText('study-b')).toBeInTheDocument();
    expect(within(panel).queryByText('study-a')).not.toBeInTheDocument();
  });

  it('sends a claim only once when the button is clicked twice quickly', async () => {
    const harness = await openApp([UNASSIGNED]);
    const { api, user } = harness;
    await openStudy(harness, UNASSIGNED);

    const claim = await screen.findByRole('button', { name: 'Claim study' });
    await user.dblClick(claim);

    expect(api.claimCalls).toHaveLength(1);
    expect(api.claimCalls[0]?.args.input).toEqual({
      reviewerId: 'reviewer-a',
      expectedVersion: 1,
    });
    expect(screen.getByRole('button', { name: 'Claiming...' })).toBeDisabled();
  });

  it('lets anyone view an Unassigned study but only the owner complete', async () => {
    const harness = await openApp([UNASSIGNED, OTHERS]);

    await openStudy(harness, UNASSIGNED);
    expect(await screen.findByRole('button', { name: 'Claim study' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Review note')).not.toBeInTheDocument();

    await openStudy(harness, OTHERS);
    expect(await screen.findByText(/being reviewed by reviewer-b/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Review note')).not.toBeInTheDocument();
  });
});
