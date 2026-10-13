# 12: Viewer Lifecycle Test (Delayed Load, Close, Reopen)

**Goal:** Prove no stale image, no reopen after close, and no leak across 5 close/reopen cycles.

## Mechanism for a controlled delay
- Playwright `page.route('**/api/studies/*/file', ...)`: hold the request in a per-study gate (a promise the test releases explicitly). No sleeps; the test decides when each response is fulfilled.
- Observability via `window.__viewerDebug` (from 09): `activeInstances`, `activeListeners`, `activeObservers`, `currentStudyId`, `state`.

## Scenarios
1. **Switch while loading**
   - Select study A (file request held). Select study B (held). Release **B**, then **A** (A late).
   - Expect canvas = B's pixels (checksum equals B's reference), `currentStudyId === B`; A's late bytes never replace it.
2. **Close during pending load**
   - Select A (held), click **Close viewer**, release A.
   - Expect viewer stays closed (no canvas in container, `state === 'idle'/'closed'`, `activeInstances === 0`), no console errors about disposed containers.
3. **Five close/reopen cycles**
   - Record baseline counts after first ready render: `L0` listeners, `O0` observers, `I0` instances.
   - Repeat 5x: close -> assert counts 0 -> reopen -> wait ready.
   - After each reopen: `activeInstances === I0`, `activeListeners === L0`, `activeObservers === O0`; exactly one canvas in the container; image matches the expected study.
4. **Close/reopen with a delayed load in the middle of the cycles** (mix of 2 and 3) to catch stale attachments.
5. **Corrupt -> close -> reopen valid**: no leftover error state.

## Acceptance criteria
- [ ] All counts are asserted (not just visually checked).
- [ ] Test fails if `dispose()` forgets to disconnect the ResizeObserver or remove a listener (verify by temporarily commenting it out).
- [ ] Deterministic: zero `waitForTimeout`.
