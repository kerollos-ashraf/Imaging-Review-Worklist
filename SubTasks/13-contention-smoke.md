# 13: Two-Process Contention Smoke Test

**Goal:** A repeatable script proving that two separate API processes sharing one Postgres give exactly one winner per contested claim.

## Script: `apps/api/scripts/contention-smoke.ts` (`npm run test:contention`)
1. Reset the test database (migrate + seed).
2. Spawn **two** API child processes on separate ports (default `4101` and `4102`, overridable via env), both pointing at the same `DATABASE_URL`.
3. Poll `GET /health` on both until ready (bounded retries, no fixed sleeps).
4. For N rounds (default 20; each on a distinct Unassigned study, or reset between rounds):
   - Read the study's current `version` from process A.
   - Fire `claim` as `reviewer-a` to port 4101 and `claim` as `reviewer-b` to port 4102 **at the same moment** (`Promise.all`).
   - Assert exactly one `200` and exactly one `412 STALE_VERSION` (the 412 carries the current record).
   - Read back via **both** ports: same owner (the winner), version incremented exactly once.
5. In `finally`: kill both child processes and close pools; exit non-zero on any failed assertion, timeout or unexpected status.
6. Print a short summary (rounds, winners per reviewer). Never print note text or DICOM data.

## Acceptance criteria
- [ ] One command runs it from a clean database and it is repeatable back to back.
- [ ] Child processes are always cleaned up, even on failure or Ctrl+C.
- [ ] No in-process lock exists anywhere in the API; the test passes only because of the DB-level conditional update.
