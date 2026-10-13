import { useState } from 'react';
import type { FormEvent , ReactElement } from 'react';
import { STATUS_OPTIONS } from '../api/types';
import type { StudyFilters, StudyStatus } from '../api/types';

interface Props {
  applied: StudyFilters;
  onApply: (filters: StudyFilters) => void;
}

export function Filters({ applied, onApply }: Props): ReactElement {
  const [status, setStatus] = useState<StudyFilters['status']>(applied.status);
  const [modality, setModality] = useState(applied.modality);

  function submit(event: FormEvent): void {
    event.preventDefault();
    onApply({ status, modality: modality.trim() });
  }

  function clear(): void {
    setStatus('');
    setModality('');
    onApply({ status: '', modality: '' });
  }

  return (
    <form className="filters" onSubmit={submit} aria-label="Worklist filters">
      <div className="field">
        <label htmlFor="status-filter">Status</label>
        <select
          id="status-filter"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as StudyStatus | '');
          }}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="modality-filter">Modality</label>
        <input
          id="modality-filter"
          type="text"
          value={modality}
          maxLength={16}
          placeholder="e.g. OT"
          onChange={(event) => {
            setModality(event.target.value);
          }}
        />
      </div>
      <div className="actions">
        <button type="submit">Apply filters</button>
        <button type="button" onClick={clear}>
          Clear
        </button>
      </div>
    </form>
  );
}
