import type { FormEvent , ReactElement } from 'react';
import { REVIEW_NOTE_MAX_LENGTH } from '../api/types';

interface Props {
  note: string;
  onNoteChange: (text: string) => void;
  onSubmit: (note: string) => void;
  pending: boolean;
  /** After a 412 the form stays locked until the user acknowledges. */
  locked: boolean;
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
  const valid = length >= 1 && !tooLong;

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (valid && !pending && !locked) {
      onSubmit(note.trim());
    }
  }

  return (
    <form onSubmit={submit} aria-label="Complete review">
      <div className="field">
        <label htmlFor="review-note">Review note</label>
        <textarea
          id="review-note"
          rows={5}
          value={note}
          aria-describedby="review-note-help"
          aria-invalid={tooLong}
          onChange={(event) => {
            onNoteChange(event.target.value);
          }}
        />
        <p id="review-note-help" className={tooLong ? 'error-text' : 'muted'}>
          {length} / {REVIEW_NOTE_MAX_LENGTH} characters
          {length === 0 ? ' (a note is required)' : ''}
        </p>
      </div>
      <button type="submit" disabled={!valid || pending || locked} aria-busy={pending}>
        {pending ? 'Completing...' : 'Complete review'}
      </button>
    </form>
  );
}
