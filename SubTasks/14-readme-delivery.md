# 14: README and Final Delivery Checklist

**Goal:** Anyone can set up, run, reset and test from the README alone.

## README must contain
1. **Overview** and architecture diagram (layers from the index).
2. **Prerequisites:** Node (version), npm, Docker (Postgres 16) **or** a local Postgres 16 (set `DATABASE_URL` and `TEST_DATABASE_URL`), Chromium for Playwright (`npx playwright install chromium`).
3. **Exact commands:**
   ```
   npm install
   cp .env.example .env
   npm run db:up          # start Postgres via Docker Compose (skip if using a local Postgres)
   npm run db:migrate
   npm run db:seed
   npm run dev:api        # http://localhost:4000
   npm run dev:web        # http://localhost:5173
   npm run db:reset       # destructive: restores seed state
   npm run lint           # ESLint strict, --max-warnings 0
   npm run test:api       # Jest, --runInBand
   npm run test:web       # Jest + jsdom
   npm run test:e2e
   npm run test:contention
   npm test               # everything
   ```
4. **Behavior notes:** ordinary startup preserves data; error codes table; validation order.
5. **Seeded data table** (study ids, fixtures, statuses, owners).
6. **Safety notes:** synthetic data only, not for diagnostic use; no raw DICOM tags displayed or logged.
7. **Design decisions:** Repository/Service/DI, atomic conditional update for multi-process safety, Cornerstone3D choice. Redis was evaluated and deliberately not used.

## Final checklist (map to the task)
- [ ] 6+ seeded studies across all statuses and both reviewers; 3 fixtures as distinct study IDs
- [ ] List filters AND, <=100, `createdAt` then `id` ordering
- [ ] Claim/complete rules + exact codes (400/403/404/409/412) and validation order
- [ ] Note trimmed 1-1000; owner and note retained; version atomic
- [ ] File endpoint by fixed study id only; unknown 404
- [ ] Multi-process correctness (Postgres-level) + contention smoke test
- [ ] Persistence across restart; startup preserves data
- [ ] Drafts scoped by study id; 412 keeps draft and requires explicit action
- [ ] Out-of-order filter and study/image responses are ignored
- [ ] Duplicate pending mutations disabled; keyboard-usable labeled controls
- [ ] Viewer: real pixels, Fit/Reset, window/level, resize, loading + errors
- [ ] Only modality, study date and dimensions shown; no tag logging
- [ ] Close during load, switch during load, 5x close/reopen without leaks
- [ ] Tests: API (real DB), React (deferred), browser (real viewer), lifecycle
- [ ] Source, migrations, seed, `samples/` fixtures and tests included
