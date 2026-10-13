import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../api/ApiContext';
import { isAbortError } from '../api/StudyApi';
import type { Study, StudyFilters } from '../api/types';

export type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; studies: Study[] };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not load studies.';
}

export interface StudyListResult {
  state: ListState;
  reload: () => void;
  /** Applies a fresher copy of one study (after a mutation or a 412). */
  replaceStudy: (study: Study) => void;
}

/**
 * Loads the list for the applied filters. Each effect run owns its own
 * `cancelled` flag, so a response from an older filter can never overwrite
 * the list for the current one, regardless of arrival order.
 */
export function useStudyList(filters: StudyFilters): StudyListResult {
  const api = useApi();
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const { status, modality } = filters;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState({ kind: 'loading' });
    api
      .listStudies({ status, modality }, controller.signal)
      .then((studies) => {
        if (!cancelled) {
          setState({ kind: 'ready', studies });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled && !isAbortError(error)) {
          setState({ kind: 'error', message: messageOf(error) });
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [api, status, modality, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const replaceStudy = useCallback(
    (study: Study) => {
      // A changed study may no longer belong in a filtered list (for example a
      // claimed study while filtering on Unassigned), so it is dropped, not kept
      // as a row that contradicts the filter.
      const stillMatches =
        (status === '' || study.status === status) &&
        (modality.trim() === '' || study.modality === modality.trim());
      setState((current) => {
        if (current.kind !== 'ready') {
          return current;
        }
        const studies = stillMatches
          ? current.studies.map((row) => (row.id === study.id ? study : row))
          : current.studies.filter((row) => row.id !== study.id);
        return { kind: 'ready', studies };
      });
    },
    [status, modality],
  );

  return { state, reload, replaceStudy };
}
