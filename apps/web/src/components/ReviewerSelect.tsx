import type { ReactElement } from 'react';
import type { Reviewer } from '../api/types';

interface Props {
  reviewers: Reviewer[];
  value: string;
  onChange: (reviewerId: string) => void;
}

export function ReviewerSelect({ reviewers, value, onChange }: Props): ReactElement {
  return (
    <div className="field">
      <label htmlFor="reviewer-select">Reviewer</label>
      <select
        id="reviewer-select"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {reviewers.map((reviewer) => (
          <option key={reviewer.id} value={reviewer.id}>
            {reviewer.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
