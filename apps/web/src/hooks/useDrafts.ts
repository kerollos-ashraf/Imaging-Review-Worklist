import { useCallback, useEffect, useMemo, useState } from 'react';

export interface DraftStore {
  get: (studyId: string) => string;
  set: (studyId: string, text: string) => void;
  clear: (studyId: string) => void;
  /** Ids of the studies that currently hold a non-empty draft. */
  ids: ReadonlySet<string>;
}

/**
 * Review-note drafts keyed by study id. Held in page memory only: switching
 * studies never moves text between them and a reload intentionally clears it.
 * Because a reload would lose them, the browser is asked to confirm leaving
 * the page while any draft exists.
 */
export function useDrafts(): DraftStore {
  const [drafts, setDrafts] = useState<ReadonlyMap<string, string>>(new Map());

  const get = useCallback((studyId: string) => drafts.get(studyId) ?? '', [drafts]);

  const set = useCallback((studyId: string, text: string) => {
    setDrafts((current) => new Map(current).set(studyId, text));
  }, []);

  const clear = useCallback((studyId: string) => {
    setDrafts((current) => {
      const next = new Map(current);
      next.delete(studyId);
      return next;
    });
  }, []);

  const ids = useMemo(
    () => new Set([...drafts].filter(([, text]) => text.trim() !== '').map(([id]) => id)),
    [drafts],
  );

  const hasDrafts = ids.size > 0;
  useEffect(() => {
    if (!hasDrafts) {
      return undefined;
    }
    const confirmLeave = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', confirmLeave);
    return () => {
      window.removeEventListener('beforeunload', confirmLeave);
    };
  }, [hasDrafts]);

  return { get, set, clear, ids };
}
