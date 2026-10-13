# 08: Study Detail, Claim, Completion Form, Drafts, 412 Recovery

**Goal:** Safe mutations and drafts that never leak between studies.

## Detail panel
- Fetch `GET /api/studies/:id` on selection. Same race rule as 07: **a delayed response for a non-active study is ignored** (compare with current `selectedStudyId`, plus abort).
- Show metadata, status, owner, version, note if Completed.
- Unclaimed studies are viewable (viewer from 09 loads regardless of status/owner).

## Claim
- "Claim study" button: enabled only when `status === 'Unassigned'`.
- Sends `{reviewerId: currentReviewer, expectedVersion: study.version}`.
- While pending: button disabled + `aria-busy`; duplicate submissions blocked by an `inFlight` ref guard (not only the disabled attribute).
- On success: update detail + list row, show success message (`role="status"`).

## Completion form
- Visible only/enabled only when `status === 'InReview'` **and** `ownerId === currentReviewer`. Otherwise show a reason ("Owned by reviewer-b", "Claim this study first", "Completed").
- Labeled `<textarea>` with live counter (trimmed length 1-1000); inline validation message; submit disabled when invalid or pending.
- **Drafts:** `DraftStore` is a `Map<studyId, string>` held at app level (survives study switches, not reloads). Textarea value is always `drafts.get(selectedStudyId) ?? ''`. Switching A -> B shows B's own draft (or empty); returning to A restores A's.
- Draft is cleared for a study **only after a confirmed successful completion**.

## Error handling
| Case | Behavior |
|---|---|
| Network error / 5xx | Show error, **keep draft**, allow manual retry |
| 400 | Show message, keep draft |
| 403 / 409 | Show message, refresh detail, keep draft |
| **412 STALE_VERSION** | Replace detail with `error.current`, show a banner "This study changed; review the current state", **keep draft**, and set `needsAcknowledge = true`. Submit stays disabled until the user clicks an explicit "Review current state and continue" action. No automatic resubmission. |

- A mutation response is applied only if its `studyId` is still the selected one (otherwise just update the list row); the draft for the other study stays untouched.

## Acceptance criteria
- [ ] Type in A, switch to B: B's textarea empty; back to A: text restored.
- [ ] Stale completion on A (user switched to B and back, or response arrives late) does not alter B's draft.
- [ ] After 412, no request is sent until the acknowledge action.
- [ ] Pending state prevents a second request (verified by call count).
