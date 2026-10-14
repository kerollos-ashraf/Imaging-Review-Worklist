import { Suspense, lazy, useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { FIRST_PAGE, NO_FILTERS } from '../api/types';
import type { PageRequest, Reviewer, Study, StudyFilters } from '../api/types';
import { useDrafts } from '../hooks/useDrafts';
import type { DraftStore } from '../hooks/useDrafts';
import { useStudyDetail } from '../hooks/useStudyDetail';
import type { StudyDetailResult } from '../hooks/useStudyDetail';
import { useStudyList } from '../hooks/useStudyList';
import type { StudyListResult } from '../hooks/useStudyList';
import { useStudyMutations } from '../hooks/useStudyMutations';
import type { StudyMutations } from '../hooks/useStudyMutations';
import { ErrorBoundary } from './ErrorBoundary';
import { Filters } from './Filters';
import { StudyDetail } from './StudyDetail';
import { Worklist } from './Worklist';

// The viewer pulls in the DICOM rendering stack, so it is loaded on demand
// instead of being part of the initial worklist bundle.
const ViewerPanel = lazy(() =>
  import('../viewer/ViewerPanel').then((module) => ({ default: module.ViewerPanel })),
);

function ViewerArea({ studyId }: { studyId: string | null }): ReactElement {
  return (
    <ErrorBoundary
      resetKey={studyId}
      fallback={(retry) => (
        <section aria-label="Image viewer" className="viewer-slot">
          <div role="alert" className="banner error">
            <p>The image viewer ran into a problem. The worklist is not affected.</p>
            <button type="button" onClick={retry}>
              Reload viewer
            </button>
          </div>
        </section>
      )}
    >
      <Suspense
        fallback={
          <p role="status" className="muted">
            Loading viewer...
          </p>
        }
      >
        <ViewerPanel studyId={studyId} />
      </Suspense>
    </ErrorBoundary>
  );
}

interface Props {
  reviewerId: string;
  reviewers: Reviewer[];
}

interface WorkspaceState {
  filters: StudyFilters;
  setFilters: (filters: StudyFilters) => void;
  paging: PageRequest;
  setPaging: (paging: PageRequest) => void;
  selectedId: string | null;
  setSelectedId: (studyId: string) => void;
  drafts: DraftStore;
  list: StudyListResult;
  detail: StudyDetailResult;
  mutations: StudyMutations;
}

/** Wires the list, the selected study, drafts and mutations together. */
function useWorkspace(reviewerId: string): WorkspaceState {
  const [filters, setAppliedFilters] = useState<StudyFilters>(NO_FILTERS);
  const [paging, setPaging] = useState<PageRequest>(FIRST_PAGE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // New filters describe a different result set, so paging starts over.
  const setFilters = useCallback((next: StudyFilters) => {
    setAppliedFilters(next);
    setPaging((current) => ({ ...current, page: 1 }));
  }, []);
  const drafts = useDrafts();
  const list = useStudyList(filters, paging);
  const detail = useStudyDetail(selectedId);
  const { replaceStudy, reload } = list;
  const { applyStudy, retry } = detail;

  const onStudyUpdated = useCallback(
    (study: Study) => {
      replaceStudy(study);
      applyStudy(study);
    },
    [replaceStudy, applyStudy],
  );
  const onRefreshNeeded = useCallback(() => {
    retry();
    reload();
  }, [retry, reload]);

  const study = detail.state.kind === 'ready' ? detail.state.study : null;
  const mutations = useStudyMutations({
    study,
    reviewerId,
    drafts,
    onStudyUpdated,
    onRefreshNeeded,
  });
  return {
    filters,
    setFilters,
    paging,
    setPaging,
    selectedId,
    setSelectedId,
    drafts,
    list,
    detail,
    mutations,
  };
}

export function Workspace({ reviewerId, reviewers }: Props): ReactElement {
  const workspace = useWorkspace(reviewerId);
  const { filters, selectedId, drafts, list, detail } = workspace;

  return (
    <div className="workspace">
      <section aria-label="Worklist" className="panel">
        <h2>Worklist</h2>
        <Filters
          applied={filters}
          reviewers={reviewers}
          reviewerId={reviewerId}
          onApply={workspace.setFilters}
        />
        <Worklist
          state={list.state}
          selectedId={selectedId}
          reviewerId={reviewerId}
          draftIds={drafts.ids}
          paging={workspace.paging}
          onPageChange={workspace.setPaging}
          onSelect={workspace.setSelectedId}
          onRetry={list.reload}
        />
      </section>
      <section aria-label="Study detail" className="panel">
        <h2>Study</h2>
        <StudyDetail
          state={detail.state}
          reviewerId={reviewerId}
          draft={selectedId === null ? '' : drafts.get(selectedId)}
          onDraftChange={drafts.set}
          mutations={workspace.mutations}
          onRetry={detail.retry}
        />
        <ViewerArea studyId={selectedId} />
      </section>
    </div>
  );
}
