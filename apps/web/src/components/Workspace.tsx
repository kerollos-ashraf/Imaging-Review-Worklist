import { Suspense, lazy, useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import type { Study, StudyFilters } from '../api/types';
import { useDrafts } from '../hooks/useDrafts';
import { useStudyDetail } from '../hooks/useStudyDetail';
import { useStudyList } from '../hooks/useStudyList';
import { useStudyMutations } from '../hooks/useStudyMutations';
import { ErrorBoundary } from './ErrorBoundary';
import { Filters } from './Filters';
import { StudyDetail } from './StudyDetail';
import { Worklist } from './Worklist';

// The viewer pulls in the DICOM rendering stack, so it is loaded on demand
// instead of being part of the initial worklist bundle.
const ViewerPanel = lazy(() =>
  import('../viewer/ViewerPanel').then((module) => ({ default: module.ViewerPanel })),
);

const NO_FILTERS: StudyFilters = { status: '', modality: '' };

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

export function Workspace({ reviewerId }: { reviewerId: string }): ReactElement {
  const [filters, setFilters] = useState<StudyFilters>(NO_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const drafts = useDrafts();
  const list = useStudyList(filters);
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

  return (
    <div className="workspace">
      <section aria-label="Worklist" className="panel">
        <h2>Worklist</h2>
        <Filters applied={filters} onApply={setFilters} />
        <Worklist
          state={list.state}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRetry={reload}
        />
      </section>
      <section aria-label="Study detail" className="panel">
        <h2>Study</h2>
        <StudyDetail
          state={detail.state}
          reviewerId={reviewerId}
          draft={selectedId === null ? '' : drafts.get(selectedId)}
          onDraftChange={drafts.set}
          mutations={mutations}
          onRetry={retry}
        />
        <ViewerArea studyId={selectedId} />
      </section>
    </div>
  );
}
