import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../api/ApiContext';
import { ApiError, NetworkError } from '../api/StudyApi';
import type { Study } from '../api/types';
import type { DraftStore } from './useDrafts';

export type Feedback =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'conflict'; text: string };

type MutationKind = 'claim' | 'complete';
type Pending = MutationKind | null;

interface Entry {
  pending: Pending;
  feedback: Feedback | null;
  needsAcknowledge: boolean;
}

type Entries = ReadonlyMap<string, Entry>;

export interface StudyMutations {
  /** The action in flight for the active study, if any. */
  pending: Pending;
  /** True while any mutation is in flight, including one for another study. */
  busy: boolean;
  feedback: Feedback | null;
  /** True after a 412: nothing can be submitted until the user acknowledges. */
  needsAcknowledge: boolean;
  claim: () => Promise<void>;
  complete: (reviewNote: string) => Promise<void>;
  acknowledge: () => void;
}

interface Options {
  study: Study | null;
  reviewerId: string;
  drafts: DraftStore;
  /** Called with every fresher copy of a study (success or 412 current record). */
  onStudyUpdated: (study: Study) => void;
  /** Called when the server rejected the action without sending a record. */
  onRefreshNeeded: () => void;
}

const IDLE: Entry = { pending: null, feedback: null, needsAcknowledge: false };

interface Failure {
  patch: Partial<Entry>;
  /** The server's current record, present on a 412. */
  current: Study | undefined;
  refresh: boolean;
}

/** Pure mapping from a rejected request to what the UI should do about it. */
function classifyFailure(error: unknown): Failure {
  if (error instanceof ApiError && error.status === 412 && error.current) {
    return {
      current: error.current,
      refresh: false,
      patch: {
        pending: null,
        needsAcknowledge: true,
        feedback: {
          kind: 'conflict',
          text: 'This study changed while you were working. The current state is shown and your note was kept.',
        },
      },
    };
  }
  let text = 'Something went wrong. Your note was kept.';
  if (error instanceof NetworkError) {
    text = 'Network error. Your note was kept; try again when you are back online.';
  } else if (error instanceof ApiError) {
    text = error.message;
  }
  const refresh = error instanceof ApiError && (error.status === 403 || error.status === 409);
  return {
    current: undefined,
    refresh,
    patch: { pending: null, feedback: { kind: 'error', text } },
  };
}

/** An entry is worth keeping for a study the user is not looking at. */
function mustSurvive(entry: Entry): boolean {
  return entry.needsAcknowledge || entry.pending !== null;
}

type Patch = (studyId: string, next: Partial<Entry>) => void;

/**
 * Mutation state per study. A 412 is remembered for its study even if the user
 * has switched away, so the acknowledgement is still required when they return.
 * Ordinary messages for a study that is no longer active are dropped.
 */
function useMutationEntries(activeStudyId: string | null): {
  view: Entry;
  busy: boolean;
  patch: Patch;
} {
  const [entries, setEntries] = useState<Entries>(new Map());
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeStudyId;

  const patch = useCallback<Patch>((studyId, next) => {
    setEntries((current) => {
      const merged = { ...(current.get(studyId) ?? IDLE), ...next };
      const updated = new Map(current);
      if (activeRef.current === studyId || mustSurvive(merged)) {
        updated.set(studyId, merged);
      } else {
        updated.delete(studyId);
      }
      return updated;
    });
  }, []);

  // Leaving a study discards its transient messages (success, plain errors).
  useEffect(() => {
    setEntries((current) => {
      const kept = [...current].filter(([id, entry]) => id === activeStudyId || mustSurvive(entry));
      return kept.length === current.size ? current : new Map(kept);
    });
  }, [activeStudyId]);

  const view = (activeStudyId === null ? undefined : entries.get(activeStudyId)) ?? IDLE;
  const busy = [...entries.values()].some((entry) => entry.pending !== null);
  return { view, busy, patch };
}

/** Runs one request at a time and reports its outcome through patch. */
function useMutationRunner(
  options: Pick<Options, 'drafts' | 'onStudyUpdated' | 'onRefreshNeeded'>,
  patch: Patch,
): (kind: MutationKind, target: Study, call: () => Promise<Study>) => Promise<void> {
  const { drafts, onStudyUpdated, onRefreshNeeded } = options;
  // A ref, not state: it must flip synchronously so a double click cannot
  // slip a second request through before React re-renders.
  const inFlight = useRef(false);

  return useCallback(
    async (kind, target, call) => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      patch(target.id, { pending: kind, feedback: null });
      try {
        onStudyUpdated(await call());
        if (kind === 'complete') {
          drafts.clear(target.id);
        }
        const text = kind === 'claim' ? 'Study claimed.' : 'Review completed.';
        patch(target.id, { pending: null, feedback: { kind: 'success', text } });
      } catch (error) {
        const failure = classifyFailure(error);
        if (failure.current) {
          onStudyUpdated(failure.current);
        }
        if (failure.refresh) {
          onRefreshNeeded();
        }
        patch(target.id, failure.patch);
      } finally {
        inFlight.current = false;
      }
    },
    [drafts, onRefreshNeeded, onStudyUpdated, patch],
  );
}

export function useStudyMutations(options: Options): StudyMutations {
  const { study, reviewerId } = options;
  const api = useApi();
  const activeStudyId = study?.id ?? null;
  const { view, busy, patch } = useMutationEntries(activeStudyId);
  const run = useMutationRunner(options, patch);

  const claim = useCallback(async () => {
    if (study !== null) {
      await run('claim', study, () =>
        api.claim(study.id, { reviewerId, expectedVersion: study.version }),
      );
    }
  }, [api, reviewerId, run, study]);

  const complete = useCallback(
    async (reviewNote: string) => {
      if (study !== null) {
        await run('complete', study, () =>
          api.complete(study.id, { reviewerId, expectedVersion: study.version, reviewNote }),
        );
      }
    },
    [api, reviewerId, run, study],
  );

  const acknowledge = useCallback(() => {
    if (activeStudyId !== null) {
      patch(activeStudyId, { needsAcknowledge: false, feedback: null });
    }
  }, [activeStudyId, patch]);

  return {
    pending: view.pending,
    busy,
    feedback: view.feedback,
    needsAcknowledge: view.needsAcknowledge,
    claim,
    complete,
    acknowledge,
  };
}
