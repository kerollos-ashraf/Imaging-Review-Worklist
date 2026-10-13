import type { ReactElement } from 'react';
import type { Study } from '../api/types';
import type { DetailState } from '../hooks/useStudyDetail';
import type { StudyMutations } from '../hooks/useStudyMutations';
import { CompletionForm } from './CompletionForm';

interface Props {
  state: DetailState;
  reviewerId: string;
  draft: string;
  onDraftChange: (studyId: string, text: string) => void;
  mutations: StudyMutations;
  onRetry: () => void;
}

function Summary({ study }: { study: Study }): ReactElement {
  return (
    <dl className="summary">
      <dt>Study</dt>
      <dd>{study.id}</dd>
      <dt>Modality</dt>
      <dd>{study.modality}</dd>
      <dt>Status</dt>
      <dd>
        <span className={`badge ${study.status}`}>{study.status}</span>
      </dd>
      <dt>Owner</dt>
      <dd>{study.ownerId ?? 'Nobody yet'}</dd>
      <dt>Version</dt>
      <dd>{study.version}</dd>
    </dl>
  );
}

function ActionArea({
  study,
  reviewerId,
  draft,
  onDraftChange,
  mutations,
}: Omit<Props, 'state' | 'onRetry'> & { study: Study }): ReactElement {
  // Includes a mutation still in flight for another study: only one runs at a time.
  const { busy } = mutations;
  if (study.status === 'Unassigned') {
    return (
      <button
        type="button"
        onClick={() => {
          void mutations.claim();
        }}
        disabled={busy || mutations.needsAcknowledge}
        aria-busy={mutations.pending === 'claim'}
      >
        {mutations.pending === 'claim' ? 'Claiming...' : 'Claim study'}
      </button>
    );
  }
  if (study.status === 'Completed') {
    return (
      <section aria-label="Completed review">
        <h3>Review note</h3>
        <p className="note">{study.reviewNote}</p>
      </section>
    );
  }
  if (study.ownerId !== reviewerId) {
    return (
      <p className="muted">
        This study is being reviewed by {study.ownerId}. Only the owner can complete it.
      </p>
    );
  }
  return (
    <CompletionForm
      note={draft}
      onNoteChange={(text) => {
        onDraftChange(study.id, text);
      }}
      onSubmit={(note) => {
        void mutations.complete(note);
      }}
      pending={mutations.pending === 'complete'}
      locked={mutations.needsAcknowledge || busy}
    />
  );
}

function FeedbackBanner({ mutations }: { mutations: StudyMutations }): ReactElement | null {
  const { feedback } = mutations;
  if (feedback === null) {
    return null;
  }
  const isProblem = feedback.kind !== 'success';
  return (
    <div role={isProblem ? 'alert' : 'status'} className={`banner ${feedback.kind}`}>
      <p>{feedback.text}</p>
      {mutations.needsAcknowledge && (
        <button type="button" onClick={mutations.acknowledge}>
          Review current state and continue
        </button>
      )}
    </div>
  );
}

export function StudyDetail(props: Props): ReactElement {
  const { state, mutations, onRetry } = props;
  if (state.kind === 'none') {
    return <p className="muted">Select a study to see its details.</p>;
  }
  if (state.kind === 'loading') {
    return (
      <p role="status" className="muted">
        Loading study {state.studyId}...
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <div role="alert" className="banner error">
        <p>{state.message}</p>
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  return (
    <div>
      <Summary study={state.study} />
      <FeedbackBanner mutations={mutations} />
      <ActionArea {...props} study={state.study} />
    </div>
  );
}
