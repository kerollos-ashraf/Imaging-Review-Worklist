# 07: Web Foundation and Worklist

**Goal:** API client, reviewer selection, filters and a worklist that is immune to out-of-order responses.

## Structure
```
apps/web/src/
  api/studiesApi.ts        typed client (injected fetch for tests); ApiError {status, code, current?}
  hooks/useStudyList.ts    list + filters + request ordering
  state/DraftStore.ts      Map<studyId, string> (see 08)
  components/ReviewerSelect.tsx, Filters.tsx, Worklist.tsx, StatusBadge.tsx
  App.tsx
```

## Requirements
- **Reviewer selection:** labeled `<select>` populated from `/api/reviewers`; selection kept in React state and persisted in `sessionStorage` (wrapped in try/catch). Review-note drafts are **not** persisted: page-session memory only.
- **Filters:** labeled status select (All/Unassigned/InReview/Completed) and modality select/input. Changing a filter triggers a list fetch with query params.
- **Worklist:** shows id, modality, createdAt, status, owner. Rows are keyboard-selectable (`button`/`role="option"` with focus styles, Enter/Space).
- **States:** loading (`role="status"`), empty ("No studies match"), error (`role="alert"` with Retry).
- **Out-of-order protection:** each fetch gets an incrementing request id (or `AbortController`); only the response whose id equals the latest **applies**. Aborted requests never set state.
- Selecting a study stores `selectedStudyId` (consumed by 08 and 09).
- Client is dependency-injected (`StudyApi` interface) so tests can pass controllable deferred responses.

## Acceptance criteria
- [ ] Filter A (slow) then filter B (fast): final list is B's, even if A resolves last.
- [ ] All controls have visible labels and are reachable/operable by keyboard.
- [ ] No fetch is made inside render; unmounting cancels in-flight requests.
