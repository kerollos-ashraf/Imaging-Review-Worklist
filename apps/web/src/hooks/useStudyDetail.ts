import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../api/ApiContext';
import { isAbortError } from '../api/StudyApi';
import type { Study } from '../api/types';

export type DetailState =
  | { kind: 'none' }
  | { kind: 'loading'; studyId: string }
  | { kind: 'error'; studyId: string; message: string }
  | { kind: 'ready'; study: Study };

export interface StudyDetailResult {
  state: DetailState;
  /** Replaces the shown record, but only while that study is still the active one. */
  applyStudy: (study: Study) => void;
  retry: () => void;
}

/**
 * Loads the selected study. A response for a study that is no longer selected is
 * discarded by the effect cleanup, so a slow earlier response cannot win.
 */
export function useStudyDetail(selectedId: string | null): StudyDetailResult {
  const api = useApi();
  const [state, setState] = useState<DetailState>({ kind: 'none' });
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (selectedId === null) {
      setState({ kind: 'none' });
      return undefined;
    }
    let cancelled = false;
    const controller = new AbortController();
    setState({ kind: 'loading', studyId: selectedId });
    api
      .getStudy(selectedId, controller.signal)
      .then((study) => {
        if (!cancelled) {
          setState({ kind: 'ready', study });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled && !isAbortError(error)) {
          const message = error instanceof Error ? error.message : 'Could not load the study.';
          setState({ kind: 'error', studyId: selectedId, message });
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [api, selectedId, retryToken]);

  const applyStudy = useCallback((study: Study) => {
    setState((current) =>
      current.kind === 'ready' && current.study.id === study.id
        ? { kind: 'ready', study }
        : current,
    );
  }, []);

  const retry = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

  return { state, applyStudy, retry };
}
