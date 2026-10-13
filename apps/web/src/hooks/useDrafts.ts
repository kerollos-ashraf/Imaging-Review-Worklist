import { useCallback, useState } from 'react';

export interface DraftStore {
  get: (studyId: string) => string;
  set: (studyId: string, text: string) => void;
  clear: (studyId: string) => void;
}

/**
 * Review-note drafts keyed by study id. Held in page memory only: switching
 * studies never moves text between them and a reload intentionally clears it.
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

  return { get, set, clear };
}
