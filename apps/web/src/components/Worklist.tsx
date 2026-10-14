import type { KeyboardEvent, ReactElement } from 'react';
import { STATUS_OPTIONS } from '../api/types';
import type { PageRequest, StatusCounts, Study } from '../api/types';
import type { ListState, LoadedPage } from '../hooks/useStudyList';
import { Pagination } from './Pagination';
import { StatusBadge } from './StatusBadge';

interface Props {
  state: ListState;
  selectedId: string | null;
  reviewerId: string;
  /** Studies that hold an unsent review note. */
  draftIds: ReadonlySet<string>;
  paging: PageRequest;
  onPageChange: (paging: PageRequest) => void;
  onSelect: (studyId: string) => void;
  onRetry: () => void;
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Up/Down move between studies; Home/End jump to the first and last. */
function moveFocus(event: KeyboardEvent<HTMLButtonElement>): void {
  const buttons = [
    ...(event.currentTarget
      .closest('tbody')
      ?.querySelectorAll<HTMLButtonElement>('button[data-study]') ?? []),
  ];
  const index = buttons.indexOf(event.currentTarget);
  const targets: Record<string, number> = {
    ArrowDown: index + 1,
    ArrowUp: index - 1,
    Home: 0,
    End: buttons.length - 1,
  };
  const target = buttons[targets[event.key] ?? -1];
  if (target) {
    event.preventDefault();
    target.focus();
  }
}

/** Totals for everything matching the filters, across all pages (counted by the server). */
function Summary({ counts }: { counts: StatusCounts }): ReactElement {
  return (
    <ul className="summary-chips" aria-label="All matching studies by status">
      {STATUS_OPTIONS.map((status) => (
        <li key={status} className={`chip ${status}`}>
          <span className="chip-count">{counts[status]}</span>
          <span className="chip-label">{status}</span>
        </li>
      ))}
    </ul>
  );
}

function OwnerCell({ study, reviewerId }: { study: Study; reviewerId: string }): ReactElement {
  if (study.ownerId === null) {
    return <span className="muted">Nobody yet</span>;
  }
  return (
    <span className={study.ownerId === reviewerId ? 'owner mine' : 'owner'}>
      {study.ownerId}
      {study.ownerId === reviewerId && <span className="tag">You</span>}
    </span>
  );
}

function Row({
  study,
  selected,
  hasDraft,
  reviewerId,
  onSelect,
}: {
  study: Study;
  selected: boolean;
  hasDraft: boolean;
  reviewerId: string;
  onSelect: (studyId: string) => void;
}): ReactElement {
  return (
    <tr className={selected ? 'selected' : undefined}>
      <th scope="row">
        <button
          type="button"
          className="row-button"
          data-study={study.id}
          aria-pressed={selected}
          onKeyDown={moveFocus}
          onClick={() => {
            onSelect(study.id);
          }}
        >
          {study.id}
        </button>
        {hasDraft && <span className="tag draft">Draft</span>}
      </th>
      <td>{study.modality}</td>
      <td>
        <time dateTime={study.createdAt}>{DATE_FORMAT.format(new Date(study.createdAt))}</time>
      </td>
      <td>
        <StatusBadge status={study.status} />
      </td>
      <td>
        <OwnerCell study={study} reviewerId={reviewerId} />
      </td>
    </tr>
  );
}

function LoadingRows(): ReactElement {
  return (
    <div role="status" className="skeleton-list">
      <span className="visually-hidden">Loading studies...</span>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="skeleton" aria-hidden="true" />
      ))}
    </div>
  );
}

function StudiesTable({ studies, rowProps }: { studies: Study[]; rowProps: Props }): ReactElement {
  return (
    // Focusable so keyboard users can scroll the table sideways on narrow screens.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className="table-scroll" role="region" aria-label="Studies table" tabIndex={0}>
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
          {studies.map((study) => (
            <Row
              key={study.id}
              study={study}
              selected={study.id === rowProps.selectedId}
              hasDraft={rowProps.draftIds.has(study.id)}
              reviewerId={rowProps.reviewerId}
              onSelect={rowProps.onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Listing({
  page,
  busy,
  props,
}: {
  page: LoadedPage;
  busy: boolean;
  props: Props;
}): ReactElement {
  return (
    <div className={busy ? 'listing refreshing' : 'listing'} aria-busy={busy}>
      {page.studies.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No studies match the current filters.</p>
          <p className="muted">Change or clear the filters to see more of the worklist.</p>
        </div>
      ) : (
        <>
          <Summary counts={page.statusCounts} />
          <StudiesTable studies={page.studies} rowProps={props} />
        </>
      )}
      {(page.total > 0 || page.paging.page > 1) && (
        <Pagination
          paging={page.paging}
          total={page.total}
          shown={page.studies.length}
          busy={busy}
          onChange={props.onPageChange}
        />
      )}
    </div>
  );
}

export function Worklist(props: Props): ReactElement {
  const { state, onRetry } = props;
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
  if (state.kind === 'ready') {
    return <Listing page={state} busy={false} props={props} />;
  }
  // While the next page or filter loads, the last one stays on screen (dimmed)
  // so the table and the page controls do not jump or lose keyboard focus.
  return state.previous === null ? (
    <LoadingRows />
  ) : (
    <Listing page={state.previous} busy props={props} />
  );
}
