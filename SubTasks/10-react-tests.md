# 10: React Tests (Jest + Testing Library)

Config: `ts-jest`, `testEnvironment: 'jest-environment-jsdom'`, `@testing-library/jest-dom` in `setupFilesAfterEach`. Never use `jest.useFakeTimers()` to order responses; use the deferred helper below.

**Goal:** Deterministic UI race tests using controlled deferred promises (no `setTimeout`/sleep timing).

## Helper
```ts
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
```
Inject a fake `StudyApi` whose methods return those promises; tests resolve them in the order they choose. The viewer is replaced by a stub component in these tests (the real viewer is covered in 11/12).

## Tests
1. **Out-of-order filter results**
   - Select filter A -> request A pending; select filter B -> request B pending.
   - Resolve **B first**, then **A**. Expect list shows B's rows only; A's rows never appear.
2. **Switching studies with a draft**
   - Select study A, type "note for A". Select study B: textarea empty (not A's text).
   - Type "note for B". Back to A: shows "note for A". Back to B: "note for B".
3. **Stale completion preserves the draft**
   - InReview study owned by current reviewer, type a note, submit -> deferred pending.
   - Resolve with 412 + `current` (new version/status). Expect: detail updated to current, draft still present, banner shown, **Submit disabled** and **no new request** until the explicit acknowledge button is clicked; after acknowledge, submit works with the new version.
4. **Late detail response** for a previously selected study does not replace the active study.
5. **Network error** keeps the note, shows an error, allows retry.
6. **Duplicate pending mutation**: double-click Claim/Submit -> API called once.
7. **Permissions**: other reviewer's InReview study shows no completion form; Unassigned study is viewable and shows Claim.

## Acceptance criteria
- [ ] No test uses real timers or arbitrary waits (only `await act` + `findBy*` on deterministic resolution).
- [ ] Tests fail if the request-id/active-study guard in 07/08 is removed (sanity-check by temporarily removing it).
