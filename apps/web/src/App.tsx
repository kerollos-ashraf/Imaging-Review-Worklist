import { useState } from 'react';
import type { ReactElement } from 'react';
import { ReviewerSelect } from './components/ReviewerSelect';
import { Workspace } from './components/Workspace';
import { useReviewers } from './hooks/useReviewers';
import { loadReviewerPreference, saveReviewerPreference } from './storage/reviewerPreference';

export function App(): ReactElement {
  const reviewers = useReviewers();
  const [chosen, setChosen] = useState<string | null>(loadReviewerPreference);

  let body: ReactElement;
  if (reviewers.kind === 'loading') {
    body = (
      <p role="status" className="muted">
        Loading reviewers...
      </p>
    );
  } else if (reviewers.kind === 'error') {
    body = (
      <p role="alert" className="banner error">
        {reviewers.message}
      </p>
    );
  } else {
    const known = reviewers.reviewers.map((reviewer) => reviewer.id);
    const reviewerId = chosen !== null && known.includes(chosen) ? chosen : (known[0] ?? '');
    body = (
      <>
        <ReviewerSelect
          reviewers={reviewers.reviewers}
          value={reviewerId}
          onChange={(id) => {
            saveReviewerPreference(id);
            setChosen(id);
          }}
        />
        <Workspace reviewerId={reviewerId} />
      </>
    );
  }

  return (
    <main>
      <h1>Imaging Review Worklist</h1>
      <p className="muted">Synthetic data for software testing. Not for diagnostic use.</p>
      {body}
    </main>
  );
}
