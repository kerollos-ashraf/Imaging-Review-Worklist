import { screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ApiError } from './api/StudyApi';
import { detailPanel, openApp, openStudy, settle } from './testing/appHarness';
import { makeStudy } from './testing/FakeStudyApi';

// A stand-in viewer that fails while rendering one specific study.
jest.mock('./viewer/ViewerPanel', () => ({
  ViewerPanel: ({ studyId }: { studyId: string | null }): ReactElement | null => {
    if (studyId === 'study-boom') {
      throw new Error('viewer exploded');
    }
    return studyId === null ? null : <p>viewer for {studyId}</p>;
  },
}));

const STUDY_A = makeStudy({ id: 'study-a', status: 'InReview', ownerId: 'reviewer-a', version: 2 });
const STUDY_B = makeStudy({ id: 'study-b', status: 'InReview', ownerId: 'reviewer-a', version: 5 });
const UNASSIGNED = makeStudy({ id: 'study-u' });
const BOOM = makeStudy({ id: 'study-boom' });

describe('stale completion while the user is elsewhere', () => {
  it('still requires acknowledgement when the user comes back to the study', async () => {
    const harness = await openApp([STUDY_A, STUDY_B]);
    const { api, user } = harness;

    await openStudy(harness, STUDY_A);
    await user.type(await screen.findByLabelText('Review note'), 'note for A');
    await user.click(screen.getByRole('button', { name: 'Complete review' }));

    // The user moves to B before the server answers, then A comes back as 412.
    await openStudy(harness, STUDY_B);
    const current = makeStudy({ ...STUDY_A, version: 3 });
    await settle(() => {
      api.completeCalls[0]?.result.reject(new ApiError(412, 'STALE_VERSION', 'changed', current));
    });

    // B is untouched: no conflict banner, its own (empty) draft.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Review note')).toHaveValue('');

    // Back on A: the conflict is shown, the draft is intact, submit is locked.
    await openStudy(harness, current);
    expect(await screen.findByRole('alert')).toHaveTextContent('This study changed');
    expect(screen.getByLabelText('Review note')).toHaveValue('note for A');
    expect(screen.getByRole('button', { name: 'Complete review' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Review current state and continue' }));
    await user.click(screen.getByRole('button', { name: 'Complete review' }));
    expect(api.completeCalls).toHaveLength(2);
    expect(api.completeCalls[1]?.args.input.expectedVersion).toBe(3);
  });

  it('blocks a second mutation on another study while one is in flight', async () => {
    const harness = await openApp([STUDY_A, UNASSIGNED]);
    const { api, user } = harness;

    await openStudy(harness, STUDY_A);
    await user.type(await screen.findByLabelText('Review note'), 'working');
    await user.click(screen.getByRole('button', { name: 'Complete review' }));

    await openStudy(harness, UNASSIGNED);
    expect(await screen.findByRole('button', { name: 'Claim study' })).toBeDisabled();
    expect(api.claimCalls).toHaveLength(0);
  });
});

describe('filtered worklist after a mutation', () => {
  it('drops a claimed study from a list filtered on Unassigned', async () => {
    const harness = await openApp([UNASSIGNED, STUDY_A]);
    const { api, user } = harness;

    await user.selectOptions(screen.getByLabelText('Status'), 'Unassigned');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await settle(() => api.listCalls[1]?.result.resolve([UNASSIGNED]));

    await openStudy(harness, UNASSIGNED);
    await user.click(await screen.findByRole('button', { name: 'Claim study' }));
    await settle(() => {
      api.claimCalls[0]?.result.resolve(
        makeStudy({ id: 'study-u', status: 'InReview', ownerId: 'reviewer-a', version: 2 }),
      );
    });

    expect(await screen.findByRole('status')).toHaveTextContent('Study claimed.');
    expect(screen.getByText('No studies match the current filters.')).toBeInTheDocument();
    // The detail panel still shows the study the user just claimed.
    expect(within(detailPanel()).getByText('InReview')).toBeInTheDocument();
  });
});

describe('viewer failure containment', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    // React logs caught render errors; keep the test output readable.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('keeps the worklist working when the viewer throws, and recovers on the next study', async () => {
    const harness = await openApp([BOOM, STUDY_A]);

    await openStudy(harness, BOOM);
    expect(await screen.findByText(/image viewer ran into a problem/i)).toBeInTheDocument();

    // The worklist and the detail panel are unaffected.
    expect(screen.getByRole('table', { name: 'Studies' })).toBeInTheDocument();
    expect(within(detailPanel()).getByRole('button', { name: 'Claim study' })).toBeEnabled();

    await openStudy(harness, STUDY_A);
    expect(await screen.findByText('viewer for study-a')).toBeInTheDocument();
    expect(screen.queryByText(/image viewer ran into a problem/i)).not.toBeInTheDocument();
  });
});
