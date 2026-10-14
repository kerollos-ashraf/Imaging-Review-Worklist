import type { ReactElement } from 'react';
import type { StudyStatus } from '../api/types';

/** Status as a pill. Colour is never the only cue: the status name is the text. */
export function StatusBadge({ status }: { status: StudyStatus }): ReactElement {
  return (
    <span className={`badge ${status}`}>
      <span className="badge-dot" aria-hidden="true" />
      {status}
    </span>
  );
}
