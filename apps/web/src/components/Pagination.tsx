import type { ReactElement } from 'react';
import { PAGE_SIZE_OPTIONS } from '../api/types';
import type { PageRequest } from '../api/types';

interface Props {
  /** The page whose rows are on screen (not one that is still being fetched). */
  paging: PageRequest;
  /** Studies matching the filters across all pages. */
  total: number;
  /** Rows on the page being shown. */
  shown: number;
  /** A new page is being fetched; the controls stay in place but inert. */
  busy: boolean;
  onChange: (paging: PageRequest) => void;
}

function rangeText(paging: PageRequest, total: number, shown: number): string {
  if (shown === 0) {
    return `No studies on this page (${total} in total)`;
  }
  const first = (paging.page - 1) * paging.pageSize + 1;
  return `Showing ${first}–${first + shown - 1} of ${total}`;
}

/** Page controls for a list the server pages; this component never slices data itself. */
export function Pagination({ paging, total, shown, busy, onChange }: Props): ReactElement {
  const pageCount = Math.max(1, Math.ceil(total / paging.pageSize));
  const goTo = (page: number): void => {
    onChange({ ...paging, page });
  };

  return (
    <nav className="pagination" aria-label="Pagination">
      <p className="pagination-range">{rangeText(paging, total, shown)}</p>
      <div className="pagination-size">
        <label htmlFor="page-size">Rows per page</label>
        <select
          id="page-size"
          value={paging.pageSize}
          onChange={(event) => {
            // A different page size changes what "page 3" means, so start over.
            onChange({ page: 1, pageSize: Number(event.target.value) });
          }}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
      <div className="pagination-buttons">
        <button
          type="button"
          disabled={busy || paging.page <= 1}
          onClick={() => {
            goTo(paging.page - 1);
          }}
        >
          Previous
        </button>
        <span className="pagination-page" aria-current="page">
          Page {paging.page} of {pageCount}
        </span>
        <button
          type="button"
          disabled={busy || paging.page >= pageCount}
          onClick={() => {
            goTo(paging.page + 1);
          }}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
