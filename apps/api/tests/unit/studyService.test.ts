import type { StudyFileResolver, StudyReader, StudyWriter } from '../../src/domain/ports';
import type { Study } from '../../src/domain/study';
import {
  InvalidStateError,
  NotFoundError,
  NotOwnerError,
  StaleVersionError,
  ValidationError,
} from '../../src/errors/AppError';
import { StudyService } from '../../src/services/StudyService';

/**
 * Pure unit tests: the service runs against in-memory fakes, which makes it
 * possible to force races (a write that matches no row) that a real database
 * only produces under precise timing.
 */

function study(overrides: Partial<Study> = {}): Study {
  return {
    id: 's1',
    modality: 'OT',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'Unassigned',
    ownerId: null,
    reviewNote: null,
    version: 1,
    ...overrides,
  };
}

interface Fakes {
  service: StudyService;
  reads: Study[];
  claimMock: jest.Mock<Promise<Study | null>, [string, string, number]>;
  completeMock: jest.Mock<Promise<Study | null>, [string, string, number, string]>;
  reviewerExists: jest.Mock<Promise<boolean>, [string]>;
}

/** `reads` is consumed in order; the last entry repeats for any further read. */
function build(reads: (Study | null)[]): Fakes {
  const queue = [...reads];
  const served: Study[] = [];
  const reader: StudyReader = {
    list: () =>
      Promise.resolve({
        studies: [],
        total: 0,
        statusCounts: { Unassigned: 0, InReview: 0, Completed: 0 },
      }),
    findById: () => {
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next) {
        served.push(next);
      }
      return Promise.resolve(next ?? null);
    },
  };
  const claimMock = jest.fn<Promise<Study | null>, [string, string, number]>();
  const completeMock = jest.fn<Promise<Study | null>, [string, string, number, string]>();
  const writer: StudyWriter = { claim: claimMock, complete: completeMock };
  const reviewerExists = jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true);
  const files: StudyFileResolver = { resolve: () => Promise.resolve(null) };
  const service = new StudyService(
    reader,
    writer,
    { list: () => Promise.resolve([]), exists: reviewerExists },
    files,
  );
  return { service, reads: served, claimMock, completeMock, reviewerExists };
}

const CLAIM = { reviewerId: 'reviewer-a', expectedVersion: 1 };

describe('StudyService validation order', () => {
  it('rejects invalid input before looking anything up', async () => {
    const { service, reviewerExists, reads } = build([null]);
    await expect(service.claim('s1', { reviewerId: 'reviewer-a' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(reviewerExists).not.toHaveBeenCalled();
    expect(reads).toHaveLength(0);
  });

  it('rejects a non-object body with a clear message', async () => {
    const { service } = build([study()]);
    await expect(service.claim('s1', undefined)).rejects.toThrow('Request body must be a JSON object');
    await expect(service.claim('s1', [])).rejects.toThrow('Request body must be a JSON object');
  });

  it('treats an unknown reviewer as invalid input, before the study lookup', async () => {
    const { service, reviewerExists, claimMock } = build([null]);
    reviewerExists.mockResolvedValue(false);
    await expect(service.claim('missing', CLAIM)).rejects.toBeInstanceOf(ValidationError);
    expect(claimMock).not.toHaveBeenCalled();
  });

  it('reports a missing study before a stale version', async () => {
    const { service } = build([null]);
    await expect(
      service.claim('missing', { ...CLAIM, expectedVersion: 99 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('reports a stale version before an invalid state', async () => {
    const current = study({ status: 'Completed', ownerId: 'reviewer-b', version: 3 });
    const { service } = build([current]);
    const error = await service.claim('s1', CLAIM).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StaleVersionError);
    expect((error as StaleVersionError).current).toEqual(current);
  });

  it('reports an invalid state before ownership', async () => {
    const { service } = build([study({ status: 'Unassigned', version: 1 })]);
    await expect(
      service.complete('s1', { ...CLAIM, reviewerId: 'reviewer-b', reviewNote: 'x' }),
    ).rejects.toBeInstanceOf(InvalidStateError);
  });

  it('rejects completion by a non-owner at the current version', async () => {
    const { service, completeMock } = build([
      study({ status: 'InReview', ownerId: 'reviewer-a', version: 2 }),
    ]);
    await expect(
      service.complete('s1', { reviewerId: 'reviewer-b', expectedVersion: 2, reviewNote: 'x' }),
    ).rejects.toBeInstanceOf(NotOwnerError);
    expect(completeMock).not.toHaveBeenCalled();
  });
});

describe('StudyService writes', () => {
  it('passes the trimmed note to the writer', async () => {
    const inReview = study({ status: 'InReview', ownerId: 'reviewer-a', version: 2 });
    const { service, completeMock } = build([inReview]);
    completeMock.mockResolvedValue({ ...inReview, status: 'Completed', version: 3 });
    await service.complete('s1', {
      reviewerId: 'reviewer-a',
      expectedVersion: 2,
      reviewNote: '  done  ',
    });
    expect(completeMock).toHaveBeenCalledWith('s1', 'reviewer-a', 2, 'done');
  });

  it('classifies a lost race from fresh state when the write matches no row', async () => {
    // First read looks claimable; the write loses; the re-read shows the winner.
    const taken = study({ status: 'InReview', ownerId: 'reviewer-b', version: 2 });
    const { service, claimMock } = build([study(), taken]);
    claimMock.mockResolvedValue(null);

    const error = await service.claim('s1', CLAIM).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StaleVersionError);
    expect((error as StaleVersionError).current).toEqual(taken);
    expect(claimMock).toHaveBeenCalledTimes(1);
  });

  it('never loops: two fruitless writes end as STALE_VERSION with the current record', async () => {
    const { service, claimMock } = build([study()]);
    claimMock.mockResolvedValue(null);
    await expect(service.claim('s1', CLAIM)).rejects.toBeInstanceOf(StaleVersionError);
    expect(claimMock).toHaveBeenCalledTimes(2);
  });
});
