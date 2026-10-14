import type { ReactElement } from 'react';
import type { StudyStatus } from '../api/types';

// Labels differ from the raw status values on purpose: they read as steps.
const STEPS: readonly { status: StudyStatus; label: string }[] = [
  { status: 'Unassigned', label: 'Waiting' },
  { status: 'InReview', label: 'In review' },
  { status: 'Completed', label: 'Done' },
];

type StepState = 'done' | 'current' | 'todo';

/**
 * A step is filled once it is behind the study. The last step has nothing
 * after it, so reaching it means the review is finished and it is filled too,
 * rather than shown as an open step still in progress.
 */
function stepState(index: number, currentIndex: number): StepState {
  const isLast = index === STEPS.length - 1;
  if (index < currentIndex || (index === currentIndex && isLast)) {
    return 'done';
  }
  return index === currentIndex ? 'current' : 'todo';
}

/** Shows where a study is in its one-way lifecycle. */
export function ReviewProgress({ status }: { status: StudyStatus }): ReactElement {
  const currentIndex = STEPS.findIndex((step) => step.status === status);
  return (
    <ol className="progress" aria-label="Review progress">
      {STEPS.map((step, index) => {
        const state = stepState(index, currentIndex);
        const reached = index === currentIndex;
        return (
          <li
            key={step.status}
            className={`progress-step ${state}${reached ? ' reached' : ''}`}
            aria-current={reached ? 'step' : undefined}
          >
            <span className="progress-marker" aria-hidden="true" />
            <span className="progress-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
