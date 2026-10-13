# 06: API Tests (Real Database)

**Goal:** Prove ownership, concurrency and persistence against real Postgres (no DB mocks).

## Setup
- Jest (`ts-jest`, `testEnvironment: 'node'`, run with `--runInBand`) + supertest against `createApp()` with a real `pg` pool on `TEST_DATABASE_URL`.
- Use `globalSetup` to migrate the test DB once; `afterAll` closes the pool; run with `--detectOpenHandles` in CI to catch leaked connections.
- `beforeEach`: truncate + reseed a known fixture set (helper `resetDb()`).

## Test cases
**List / read**
- Status filter, modality filter, both together (AND).
- Ordering `createdAt ASC` then `id ASC` (use the tie rows); max 100 (insert 120, expect 100).
- Response contains no file path or DICOM tag fields.

**Claim**
- Unassigned -> InReview, owner set, version +1.
- Claim already-claimed => 409 `INVALID_STATE`.
- Stale `expectedVersion` => 412 `STALE_VERSION` with current record.
- Missing version / unknown reviewer / bad body => 400.
- Unknown study => 404.
- **Concurrent:** `Promise.all` of two claims (A and B) from the same version, repeated e.g. 25 times on fresh rows. Each round: exactly one 200 and one 412.

**Complete**
- Owner + current version + valid note => 200, Completed, note trimmed, owner retained, version +1.
- Non-owner with current version => 403 `NOT_OWNER`, no field changed.
- Non-owner with stale version => 412 (order check).
- Not InReview => 409.
- Note invalid: empty, whitespace-only, 1001 chars => 400; exactly 1000 OK; leading/trailing spaces trimmed.
- Failed/stale completion: row snapshot before == after.
- Completed is terminal: second complete / claim => 409.

**File**
- Valid fixture bytes equal the file on disk; unknown study 404; traversal-like ids 404.
- Corrupt fixture is served as bytes (200); the viewer is what rejects it.

**Persistence**
- Claim + complete, **close the app and pool, create a new app/pool**, GET shows the same owner, note and version.
- Startup (migrate + seed) twice does not reset modified data.

## Acceptance criteria
- [ ] All cases above exist and pass on a clean `db:reset`.
