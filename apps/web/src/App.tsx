import { useState } from 'react';
import type { ReactElement } from 'react';
import { ReviewerSelect } from './components/ReviewerSelect';
import { ThemeToggle } from './components/ThemeToggle';
import { Workspace } from './components/Workspace';
import { useReviewers } from './hooks/useReviewers';
import type { ReviewersState } from './hooks/useReviewers';
import { useTheme } from './hooks/useTheme';
import { loadReviewerPreference, saveReviewerPreference } from './storage/reviewerPreference';

function resolveReviewer(state: ReviewersState, chosen: string | null): string | null {
  if (state.kind !== 'ready') {
    return null;
  }
  const known = state.reviewers.map((reviewer) => reviewer.id);
  return chosen !== null && known.includes(chosen) ? chosen : (known[0] ?? null);
}

function Body({
  state,
  reviewerId,
}: {
  state: ReviewersState;
  reviewerId: string | null;
}): ReactElement {
  if (state.kind === 'loading') {
    return (
      <p role="status" className="muted">
        Loading reviewers...
      </p>
    );
  }
  if (state.kind === 'error' || reviewerId === null) {
    return (
      <p role="alert" className="banner error">
        {state.kind === 'error' ? state.message : 'No reviewers are configured.'}
      </p>
    );
  }
  return <Workspace reviewerId={reviewerId} reviewers={state.reviewers} />;
}

export function App(): ReactElement {
  const reviewers = useReviewers();
  const { theme, toggle } = useTheme();
  const [chosen, setChosen] = useState<string | null>(loadReviewerPreference);
  const reviewerId = resolveReviewer(reviewers, chosen);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to worklist
      </a>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>Imaging Review Worklist</h1>
            <p className="brand-note">Synthetic data for software testing. Not for diagnostic use.</p>
          </div>
        </div>
        <div className="header-tools">
          {reviewers.kind === 'ready' && reviewerId !== null && (
            <ReviewerSelect
              reviewers={reviewers.reviewers}
              value={reviewerId}
              onChange={(id) => {
                saveReviewerPreference(id);
                setChosen(id);
              }}
            />
          )}
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </header>
      <main id="main">
        <Body state={reviewers} reviewerId={reviewerId} />
      </main>
    </>
  );
}
