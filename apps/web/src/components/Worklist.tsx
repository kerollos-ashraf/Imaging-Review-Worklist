import type { ReactElement } from 'react';
import type { ListState } from '../hooks/useStudyList';

interface Props {
  state: ListState;
  selectedId: string | null;
  onSelect: (studyId: string) => void;
  onRetry: () => void;
}

export function Worklist({ state, selectedId, onSelect, onRetry }: Props): ReactElement {
  if (state.kind === 'loading') {
    return (
      <p role="status" className="muted">
        Loading studies...
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
  if (state.studies.length === 0) {
    return <p className="muted">No studies match the current filters.</p>;
  }
  return (
    <table className="worklist" aria-label="Studies">
      <thead>
        <tr>
          <th scope="col">Study</th>
          <th scope="col">Modality</th>
          <th scope="col">Created</th>
          <th scope="col">Status</th>
          <th scope="col">Owner</th>
        </tr>
      </thead>
      <tbody>
        {state.studies.map((study) => (
          <tr key={study.id} className={study.id === selectedId ? 'selected' : undefined}>
            <th scope="row">
              <button
                type="button"
                aria-pressed={study.id === selectedId}
                onClick={() => {
                  onSelect(study.id);
                }}
              >
                {study.id}
              </button>
            </th>
            <td>{study.modality}</td>
            <td>{new Date(study.createdAt).toLocaleString()}</td>
            <td>
              <span className={`badge ${study.status}`}>{study.status}</span>
            </td>
            <td>{study.ownerId ?? 'Unassigned'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
