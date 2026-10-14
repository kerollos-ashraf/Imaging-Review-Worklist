import { useState } from 'react';
import type { FormEvent, ReactElement, ReactNode } from 'react';
import { NO_FILTERS, STATUS_OPTIONS } from '../api/types';
import type { Reviewer, StudyFilters } from '../api/types';

interface Props {
  applied: StudyFilters;
  reviewers: Reviewer[];
  reviewerId: string;
  onApply: (filters: StudyFilters) => void;
}

interface SelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}

function SelectField({ id, label, value, onChange, children }: SelectProps): ReactElement {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {children}
      </select>
    </div>
  );
}

interface TextProps {
  id: string;
  label: string;
  type: 'text' | 'search';
  value: string;
  maxLength: number;
  placeholder: string;
  onChange: (value: string) => void;
}

function TextField({ id, label, onChange, ...input }: TextProps): ReactElement {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        {...input}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

/**
 * The form edits a draft; nothing is requested until "Apply filters" (or Enter).
 * If the applied filters are ever changed from outside the form, the draft is
 * brought back in line with them.
 */
function useFilterDraft(applied: StudyFilters): {
  draft: StudyFilters;
  change: (patch: Partial<StudyFilters>) => void;
} {
  const [draft, setDraft] = useState(applied);
  const [syncedWith, setSyncedWith] = useState(applied);
  if (syncedWith !== applied) {
    setSyncedWith(applied);
    setDraft(applied);
  }
  const change = (patch: Partial<StudyFilters>): void => {
    setDraft((current) => ({ ...current, ...patch }));
  };
  return { draft, change };
}

interface FieldsProps {
  draft: StudyFilters;
  change: (patch: Partial<StudyFilters>) => void;
}

/** What to look for: name, status and modality. */
function MatchFields({ draft, change }: FieldsProps): ReactElement {
  return (
    <>
      <TextField
        id="search-filter"
        label="Study name"
        type="search"
        value={draft.search}
        maxLength={64}
        placeholder="Search, e.g. study-003"
        onChange={(search) => {
          change({ search });
        }}
      />
      <SelectField
        id="status-filter"
        label="Status"
        value={draft.status}
        onChange={(status) => {
          change({ status: status as StudyFilters['status'] });
        }}
      >
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </SelectField>
      <TextField
        id="modality-filter"
        label="Modality"
        type="text"
        value={draft.modality}
        maxLength={16}
        placeholder="e.g. OT"
        onChange={(modality) => {
          change({ modality });
        }}
      />
    </>
  );
}

/** Whose studies, and in which order. */
function OwnerAndOrderFields({
  draft,
  change,
  reviewers,
  reviewerId,
}: FieldsProps & Pick<Props, 'reviewers' | 'reviewerId'>): ReactElement {
  return (
    <>
      <SelectField
        id="owner-filter"
        label="Owner"
        value={draft.ownerId}
        onChange={(ownerId) => {
          change({ ownerId });
        }}
      >
        <option value="">All owners</option>
        {reviewers.map((reviewer) => (
          <option key={reviewer.id} value={reviewer.id}>
            {reviewer.displayName}
            {reviewer.id === reviewerId ? ' (you)' : ''}
          </option>
        ))}
      </SelectField>
      <SelectField
        id="order-filter"
        label="Sort by created"
        value={draft.order}
        onChange={(order) => {
          change({ order: order === 'desc' ? 'desc' : 'asc' });
        }}
      >
        <option value="asc">Oldest first</option>
        <option value="desc">Newest first</option>
      </SelectField>
    </>
  );
}

export function Filters({ applied, reviewers, reviewerId, onApply }: Props): ReactElement {
  const { draft, change } = useFilterDraft(applied);

  function submit(event: FormEvent): void {
    event.preventDefault();
    onApply({ ...draft, modality: draft.modality.trim(), search: draft.search.trim() });
  }

  return (
    <form className="filters" onSubmit={submit} aria-label="Worklist filters">
      <MatchFields draft={draft} change={change} />
      <OwnerAndOrderFields
        draft={draft}
        change={change}
        reviewers={reviewers}
        reviewerId={reviewerId}
      />
      <div className="actions">
        <button type="submit" className="primary">
          Apply filters
        </button>
        <button
          type="button"
          onClick={() => {
            onApply(NO_FILTERS);
          }}
        >
          Clear
        </button>
      </div>
    </form>
  );
}
