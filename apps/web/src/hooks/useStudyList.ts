import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../api/ApiContext';
import { isAbortError } from '../api/StudyApi';
import type { PageRequest, Study, StudyFilters, StudyPage } from '../api/types';

/** A page as received, tagged with the request that produced it. */
export interface LoadedPage extends StudyPage {
  paging: PageRequest;
}

export type ListState =
  /** `previous` is the last page shown, kept on screen while the next one loads. */
  | { kind: 'loading'; previous: LoadedPage | null }
  | { kind: 'error'; message: string }
  | ({ kind: 'ready' } & LoadedPage);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not load studies.';
}

/** Mirrors the server's filter rules for a single study. */
function matchesFilters(study: Study, filters: StudyFilters): boolean {
  const modality = filters.modality.trim();
  const search = filters.search.trim().toLowerCase();
  return (
    (filters.status === '' || study.status === filters.status) &&
    (modality === '' || study.modality === modality) &&
    (filters.ownerId === '' || study.ownerId === filters.ownerId) &&
    (search === '' || study.id.toLowerCase().includes(search))
  );
}

/** What stays visible when a new request starts. */
function carryOver(current: ListState): LoadedPage | null {
  if (current.kind === 'ready') {
    return {
      studies: current.studies,
      total: current.total,
      statusCounts: current.statusCounts,
      paging: current.paging,
    };
  }
  return current.kind === 'loading' ? current.previous : null;
}

/**
 * The page after one of its studies changed, without refetching.
 *
 * A changed study may no longer belong in a filtered list (for example a claimed
 * study while filtering on Unassigned), so it is dropped rather than kept as a
 * row that contradicts the filter. The all-pages status breakdown follows: the
 * study leaves its old status and, if it still matches, joins the new one.
 */
function withChange(page: LoadedPage, study: Study, stillMatches: boolean): LoadedPage {
  const previous = page.studies.find((row) => row.id === study.id);
  if (!previous) {
    return page;
  }
  const statusCounts = { ...page.statusCounts };
  statusCounts[previous.status] = Math.max(0, statusCounts[previous.status] - 1);
  if (stillMatches) {
    statusCounts[study.status] += 1;
    const studies = page.studies.map((row) => (row.id === study.id ? study : row));
    return { ...page, studies, statusCounts };
  }
  return {
    ...page,
    studies: page.studies.filter((row) => row.id !== study.id),
    total: Math.max(0, page.total - 1),
    statusCounts,
  };
}

export interface StudyListResult {
  state: ListState;
  reload: () => void;
  /** Applies a fresher copy of one study (after a mutation or a 412). */
  replaceStudy: (study: Study) => void;
}

/**
 * Loads one page of the list for the applied filters; the server does the
 * filtering, ordering and paging. Each effect run owns its own `cancelled`
 * flag, so a response for an older filter or page can never overwrite the
 * current one, regardless of arrival order.
 */
export function useStudyList(filters: StudyFilters, paging: PageRequest): StudyListResult {
  const api = useApi();
  const [state, setState] = useState<ListState>({ kind: 'loading', previous: null });
  const [reloadToken, setReloadToken] = useState(0);
  const { status, modality, ownerId, search, order } = filters;
  const { page, pageSize } = paging;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState((current) => ({ kind: 'loading', previous: carryOver(current) }));
    api
      .listStudies(
        { status, modality, ownerId, search, order },
        { page, pageSize },
        controller.signal,
      )
      .then((result) => {
        if (!cancelled) {
          setState({ kind: 'ready', ...result, paging: { page, pageSize } });
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
  }, [api, status, modality, ownerId, search, order, page, pageSize, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const replaceStudy = useCallback(
    (study: Study) => {
      const stillMatches = matchesFilters(study, { status, modality, ownerId, search, order });
      setState((current) =>
        current.kind === 'ready' ? { ...current, ...withChange(current, study, stillMatches) } : current,
      );
    },
    [status, modality, ownerId, search, order],
  );

  return { state, reload, replaceStudy };
}
