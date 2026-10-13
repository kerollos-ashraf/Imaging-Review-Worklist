import { useState } from 'react';
import type { ReactElement } from 'react';
import { DicomViewer } from './DicomViewer';

/** Adds an explicit open/close toggle around the viewer (closing disposes it). */
export function ViewerPanel({ studyId }: { studyId: string | null }): ReactElement {
  const [open, setOpen] = useState(true);

  if (studyId === null) {
    return (
      <section aria-label="Image viewer" className="viewer-slot">
        <p className="muted">The image viewer opens when a study is selected.</p>
      </section>
    );
  }
  return (
    <section aria-label="Image viewer" className="viewer-slot">
      <div className="viewer-header">
        <h3>Image</h3>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen((value) => !value);
          }}
        >
          {open ? 'Close viewer' : 'Open viewer'}
        </button>
      </div>
      {open && <DicomViewer studyId={studyId} />}
    </section>
  );
}
