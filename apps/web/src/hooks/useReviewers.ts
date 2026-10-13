import { useEffect, useState } from 'react';
import { useApi } from '../api/ApiContext';
import { isAbortError } from '../api/StudyApi';
import type { Reviewer } from '../api/types';

export type ReviewersState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; reviewers: Reviewer[] };

export function useReviewers(): ReviewersState {
  const api = useApi();
  const [state, setState] = useState<ReviewersState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    api
      .listReviewers(controller.signal)
      .then((reviewers) => {
        if (!cancelled) {
          setState({ kind: 'ready', reviewers });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled && !isAbortError(error)) {
          const message = error instanceof Error ? error.message : 'Could not load reviewers.';
          setState({ kind: 'error', message });
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [api]);

  return state;
}
