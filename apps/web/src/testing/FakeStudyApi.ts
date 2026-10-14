import type { StudyApi } from '../api/StudyApi';
import type {
  CompleteInput,
  MutationInput,
  PageRequest,
  Reviewer,
  Study,
  StudyFilters,
  StudyPage,
} from '../api/types';
import { countByStatus } from '../api/types';

/** A promise the test resolves or rejects explicitly, in whatever order it likes. */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export interface PendingCall<TArgs, TResult> {
  args: TArgs;
  result: Deferred<TResult>;
}

/** A list request: the filters in `args`, the requested page alongside. */
/** What a test may answer a list request with. */
export type PageAnswer = Pick<StudyPage, 'studies' | 'total'> & Partial<StudyPage>;

export interface ListCall extends PendingCall<StudyFilters, Study[] | PageAnswer> {
  paging: PageRequest;
}

export const REVIEWERS: Reviewer[] = [
  { id: 'reviewer-a', displayName: 'Reviewer A' },
  { id: 'reviewer-b', displayName: 'Reviewer B' },
];

/**
 * Records every call and hands back controllable promises, so tests decide
 * exactly when and in which order responses arrive. No timers are involved.
 */
export class FakeStudyApi implements StudyApi {
  readonly listCalls: ListCall[] = [];
  readonly getCalls: PendingCall<string, Study>[] = [];
  readonly claimCalls: PendingCall<{ id: string; input: MutationInput }, Study>[] = [];
  readonly completeCalls: PendingCall<{ id: string; input: CompleteInput }, Study>[] = [];

  listReviewers(): Promise<Reviewer[]> {
    return Promise.resolve(REVIEWERS);
  }

  listStudies(filters: StudyFilters, paging: PageRequest): Promise<StudyPage> {
    const result = deferred<Study[] | PageAnswer>();
    this.listCalls.push({ args: filters, paging, result });
    // Resolving with a plain array means "this is the whole result set". A page
    // answer may leave the status breakdown out, in which case the page is counted.
    return result.promise.then((value) => {
      const page = Array.isArray(value) ? { studies: value, total: value.length } : value;
      return { ...page, statusCounts: page.statusCounts ?? countByStatus(page.studies) };
    });
  }

  getStudy(id: string): Promise<Study> {
    const result = deferred<Study>();
    this.getCalls.push({ args: id, result });
    return result.promise;
  }

  getStudyFile(): Promise<Blob> {
    return Promise.reject(new Error('The viewer is stubbed in component tests'));
  }

  claim(id: string, input: MutationInput): Promise<Study> {
    const result = deferred<Study>();
    this.claimCalls.push({ args: { id, input }, result });
    return result.promise;
  }

  complete(id: string, input: CompleteInput): Promise<Study> {
    const result = deferred<Study>();
    this.completeCalls.push({ args: { id, input }, result });
    return result.promise;
  }

  /** The most recent pending call of a kind, for the test to settle. */
  lastGet(id: string): PendingCall<string, Study> {
    const call = [...this.getCalls].reverse().find((candidate) => candidate.args === id);
    if (!call) {
      throw new Error(`No pending getStudy call for ${id}`);
    }
    return call;
  }
}

export function makeStudy(overrides: Partial<Study> & { id: string }): Study {
  return {
    modality: 'OT',
    createdAt: '2026-01-10T08:00:00.000Z',
    status: 'Unassigned',
    ownerId: null,
    reviewNote: null,
    version: 1,
    ...overrides,
  };
}
