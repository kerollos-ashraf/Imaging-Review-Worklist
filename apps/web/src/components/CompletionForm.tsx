import type { FormEvent, KeyboardEvent, ReactElement } from 'react';
import { REVIEW_NOTE_MAX_LENGTH } from '../api/types';

interface Props {
  note: string;
  onNoteChange: (text: string) => void;
  onSubmit: (note: string) => void;
  pending: boolean;
  /** After a 412 the form stays locked until the user acknowledges. */
  locked: boolean;
}

function counterClass(length: number): string {
  if (length > REVIEW_NOTE_MAX_LENGTH) {
    return 'counter over';
  }
  return length > REVIEW_NOTE_MAX_LENGTH * 0.9 ? 'counter near' : 'counter';
}

/** Character count as text (announced with the field) and as a thin progress bar. */
function NoteMeter({ length }: { length: number }): ReactElement {
  const tooLong = length > REVIEW_NOTE_MAX_LENGTH;
  return (
    <div className="form-meta">
      <p id="review-note-help" className={counterClass(length)}>
        {length} / {REVIEW_NOTE_MAX_LENGTH} characters
        {length === 0 ? ' (a note is required)' : ''}
        {tooLong ? ' (too long)' : ''}
      </p>
      <div className="meter" aria-hidden="true">
        <div
          className={counterClass(length)}
          style={{ width: `${Math.min(100, (length / REVIEW_NOTE_MAX_LENGTH) * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function CompletionForm({
  note,
  onNoteChange,
  onSubmit,
  pending,
  locked,
}: Props): ReactElement {
  const length = note.trim().length;
  const tooLong = length > REVIEW_NOTE_MAX_LENGTH;
  const canSubmit = length >= 1 && !tooLong && !pending && !locked;

  function submit(): void {
    if (canSubmit) {
      onSubmit(note.trim());
    }
  }

  function onFormSubmit(event: FormEvent): void {
    event.preventDefault();
    submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={onFormSubmit} aria-label="Complete review" className="completion-form">
      <div className="field">
        <label htmlFor="review-note">Review note</label>
        <textarea
          id="review-note"
          rows={6}
          value={note}
          placeholder="Describe what you reviewed and what you found."
          aria-describedby="review-note-help"
          aria-invalid={tooLong}
          onChange={(event) => {
            onNoteChange(event.target.value);
          }}
          onKeyDown={onKeyDown}
        />
        <NoteMeter length={length} />
      </div>
      <div className="form-actions">
        <button type="submit" className="primary" disabled={!canSubmit} aria-busy={pending}>
          {pending ? 'Completing...' : 'Complete review'}
        </button>
        <span className="hint">
          <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to submit. Your draft stays with this study.
        </span>
      </div>
    </form>
  );
}
