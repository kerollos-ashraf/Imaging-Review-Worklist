import type { ReactElement } from 'react';
import type { Study } from '../api/types';
import type { DetailState } from '../hooks/useStudyDetail';
import type { StudyMutations } from '../hooks/useStudyMutations';
import { CompletionForm } from './CompletionForm';
import { ReviewProgress } from './ReviewProgress';
import { StatusBadge } from './StatusBadge';

interface Props {
  state: DetailState;
  reviewerId: string;
  draft: string;
  onDraftChange: (studyId: string, text: string) => void;
  mutations: StudyMutations;
  onRetry: () => void;
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function Summary({ study, reviewerId }: { study: Study; reviewerId: string }): ReactElement {
  const ownedByMe = study.ownerId === reviewerId;
  return (
    <div className="detail-summary">
      <div className="detail-title">
        <h3>{study.id}</h3>
        <StatusBadge status={study.status} />
      </div>
      <ReviewProgress status={study.status} />
      <dl className="facts">
        <div>
          <dt>Modality</dt>
          <dd>{study.modality}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>
            {study.ownerId ?? 'Nobody yet'}
            {ownedByMe && <span className="tag">You</span>}
          </dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>
            <time dateTime={study.createdAt}>{DATE_FORMAT.format(new Date(study.createdAt))}</time>
          </dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{study.version}</dd>
        </div>
      </dl>
    </div>
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
      <div className="action-card">
        <p className="muted">Claim this study to start reviewing it. Nobody else can claim it after you.</p>
        <button
          type="button"
          className="primary"
          onClick={() => {
            void mutations.claim();
          }}
          disabled={busy || mutations.needsAcknowledge}
          aria-busy={mutations.pending === 'claim'}
        >
          {mutations.pending === 'claim' ? 'Claiming...' : 'Claim study'}
        </button>
      </div>
    );
  }
  if (study.status === 'Completed') {
    return (
      <section aria-label="Completed review" className="action-card">
        <h4>Review note</h4>
        <p className="note">{study.reviewNote}</p>
      </section>
    );
  }
  if (study.ownerId !== reviewerId) {
    return (
      <div className="action-card">
        <p className="muted">
          This study is being reviewed by {study.ownerId}. Only the owner can complete it.
        </p>
      </div>
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
    return (
      <div className="empty-state">
        <p className="empty-title">No study selected</p>
        <p className="muted">Select a study to see its details.</p>
      </div>
    );
  }
  if (state.kind === 'loading') {
    return (
      <div role="status" className="skeleton-list">
        <span className="visually-hidden">Loading study {state.studyId}...</span>
        <div className="skeleton tall" aria-hidden="true" />
        <div className="skeleton" aria-hidden="true" />
      </div>
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
    <div className="detail">
      <Summary study={state.study} reviewerId={props.reviewerId} />
      <FeedbackBanner mutations={mutations} />
      <ActionArea {...props} study={state.study} />
    </div>
  );
}
