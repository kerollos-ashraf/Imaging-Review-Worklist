# Imaging Review Worklist

A small worklist for two reviewers (`reviewer-a`, `reviewer-b`). Each study can be claimed once, opened as a real DICOM image, and completed with a note.

> **Synthetic data for software testing only. Not for diagnostic use.**

Stack: Node.js + TypeScript + Express, React + Vite + TypeScript, PostgreSQL, Cornerstone3D (DICOM viewer and loader), Jest, Playwright, strict ESLint.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 or newer (developed on 22) | includes npm |
| Docker | with Compose v2 | runs PostgreSQL 16. Not needed if you bring your own Postgres 16 |
| Chromium for Playwright | installed once, see below | only for the browser tests |

## Setup

```bash
npm install
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
npm run db:up                   # starts PostgreSQL in Docker (port 5433)
npm run db:migrate
npm run db:seed
npx playwright install chromium # once, for the browser tests
```

`docker compose` creates two databases on first start: `imaging` (the app) and `imaging_test` (automated tests).
If your Postgres volume already existed before `imaging_test` was added, create it once with:
`docker compose exec postgres createdb -U imaging imaging_test`.

**Using your own PostgreSQL instead of Docker:** skip `db:up`, create two databases, and set `DATABASE_URL` and `TEST_DATABASE_URL` in `.env`.

## Start

Run the API and the web app in two terminals:

```bash
npm run dev:api    # http://localhost:4000   (GET /health to check)
npm run dev:web    # http://localhost:5173
```

Open http://localhost:5173, pick a reviewer, select a study, claim it and complete it with a note.

Ordinary startup **preserves existing data**: the API never seeds or resets on boot, and `db:migrate` / `db:seed` are safe to repeat (the seed uses `ON CONFLICT DO NOTHING`).

## Reset

```bash
npm run db:reset   # DESTRUCTIVE: drops the schema, re-migrates, re-seeds the app database
```

## Test

| Command | What it runs | Needs |
|---|---|---|
| `npm run lint` | ESLint strict, `--max-warnings 0` | - |
| `npm run typecheck` | `tsc --noEmit` for API and web | - |
| `npm run test:api` | Jest against a real Postgres: concurrent claims and completions, ownership, stale versions, note rules, restart persistence. Plus service and config unit tests. Enforces coverage thresholds | `db:up` |
| `npm run test:web` | Jest + Testing Library with deferred promises: out-of-order filters, draft switching, stale completion (including after navigating away), viewer failure containment. Plus viewer-controller, DICOM-inspection and API-client unit tests. Enforces coverage thresholds | - |
| `npm run test:e2e` | Playwright with the real viewer: pixel content of each fixture, window/level, resize, corrupt and unsupported files, close/reopen lifecycle, accessibility scan (axe, WCAG 2.1 AA) | `db:up`, Chromium |
| `npm run test:contention` | Two API processes (ports 4101 and 4102) on one database, 20 contested claims, then one process is killed and restarted to prove state survives | `db:up` |
| `npm test` | everything above, in order | `db:up`, Chromium |

Tests use `TEST_DATABASE_URL`; they never touch your app database. The browser tests start their own API (port 4100) and web server (port 5174).
The contention rounds and ports can be changed with `CONTENTION_ROUNDS`, `CONTENTION_PORT_A` and `CONTENTION_PORT_B`.

The same steps run in CI on every push and pull request: [.github/workflows/ci.yml](.github/workflows/ci.yml).

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/studies` | Optional filters combined with AND (see below), at most 100 results, ordered by `createdAt` then `id` |
| GET | `/api/studies/{id}` | Metadata, ownership and version. No raw DICOM tags |
| POST | `/api/studies/{id}/claim` | `{ reviewerId, expectedVersion }`: Unassigned -> InReview |
| POST | `/api/studies/{id}/complete` | `{ reviewerId, expectedVersion, reviewNote }`: InReview -> Completed |
| GET | `/api/studies/{id}/file` | DICOM bytes for a known study (the corrupt fixture is served as-is) |
| GET | `/api/reviewers` | The two seeded reviewers |
| GET | `/health` | Process and database liveness |

A study has `id`, `modality`, `createdAt`, `status`, `ownerId`, `reviewNote` and an integer `version`.

### List filters

All are optional query parameters. `status` and `modality` are the two the brief asks for; the rest are additions and leave the default behaviour unchanged.

| Parameter | Meaning |
|---|---|
| `status` | `Unassigned`, `InReview` or `Completed` |
| `modality` | Exact match, 1-16 letters or digits |
| `ownerId` | Studies owned by that reviewer. An owner with no studies gives an empty list |
| `search` | 1-64 characters matched anywhere in the study id, ignoring case. `%` and `_` are taken literally |
| `order` | `asc` (default, oldest first) or `desc` (newest first). The id tie-break follows the same direction |
| `page` | 1-based page number, default `1` |
| `pageSize` | Rows per page, 1 to 100, default `100` |

Paging is done by the database (`LIMIT`/`OFFSET` after filtering and ordering). The response body is always a plain array of studies, never more than 100, exactly as the brief describes; the paging details are response headers:

| Header | Meaning |
|---|---|
| `X-Total-Count` | Studies matching the filters across all pages |
| `X-Status-Counts` | The same matching studies by status, as JSON, for example `{"Unassigned":40,"InReview":39,"Completed":21}`. The values sum to the total |
| `X-Page`, `X-Page-Size` | The page that was returned |

A page beyond the last one returns an empty array with the same total.

### Validation order and errors

Checks run in this order: **input -> study exists -> expectedVersion -> status -> ownership**.

| Situation | HTTP | Code |
|---|---|---|
| Invalid input, unknown reviewer, missing/invalid `expectedVersion`, note not 1-1000 chars after trim, malformed JSON | 400 | `INVALID_INPUT` |
| Unknown study (also for the file endpoint) | 404 | `NOT_FOUND` |
| Stale `expectedVersion` (body includes `current`) | 412 | `STALE_VERSION` |
| Claim of a non-Unassigned study, completion of a non-InReview study | 409 | `INVALID_STATE` |
| Completing another reviewer's InReview study with the current version | 403 | `NOT_OWNER` |

Error bodies look like `{ "error": { "code": "...", "message": "..." } }`.

## Seed data

`npm run db:seed` creates **100 studies** and the two reviewers. It is deterministic and never overwrites existing rows.

The first seven are hand-written so that every fixture and status is covered:

| Study | Fixture | Status | Owner |
|---|---|---|---|
| study-001 | gradient.dcm | Unassigned | - |
| study-002 | checkerboard.dcm | Unassigned | - |
| study-003 | gradient.dcm | InReview | reviewer-a |
| study-004 | checkerboard.dcm | InReview | reviewer-b |
| study-005 | gradient.dcm | Completed | reviewer-a |
| study-006 | checkerboard.dcm | Completed | reviewer-b |
| study-007 | corrupt.dcm | Unassigned | - |

`study-008` to `study-100` are generated: each is created six hours after the previous one, alternates between the two valid fixtures, and cycles through the statuses (two Unassigned, one InReview per reviewer, one Completed) so every page shows a realistic mix.

Fixtures live in [samples/](samples/). The database stores only a fixed file key per study; the server resolves it through an allowlist, never from caller input.

## Interface

- **Themes:** light and dark, following the system preference until the user picks one (remembered in `localStorage`). Both pass an automated WCAG 2.1 AA scan.
- **Filter bar:** search by study name, filter by status, modality and owner, and sort by created date (oldest or newest first). Nothing is requested until "Apply filters" or Enter; "Clear" resets everything.
- **Paging:** ten studies per page by default (10, 25 or 50), with Previous/Next, the range shown ("Showing 11-20 of 100") and the page count. While the next page loads, the current one stays on screen, dimmed, so nothing jumps and keyboard focus is kept. Changing a filter returns to page 1.
- **Worklist:** status totals for everything matching the filters across all pages (counted by the server), a "You" tag on your own studies, a "Draft" tag on studies with an unsent note, and Up/Down/Home/End to move between studies.
- **Study panel:** a three-step progress indicator, key facts as cards, and a note form with a live character meter and `Ctrl+Enter` to submit. The browser asks before leaving the page while a draft exists.
- **Viewer:** drag on the image to change window (horizontal) and level (vertical); the sliders stay in sync and remain the keyboard route. Fit and Reset sit in a toolbar with the three allowed metadata fields.
- **Small screens:** the two panels stack, the table scrolls inside its panel, and motion is disabled when the system asks for reduced motion.

## Design decisions

- **Layers:** controller -> service -> repository, wired in one composition root ([container.ts](apps/api/src/container.ts)). ESLint's built-in `no-restricted-imports` enforces the layering per folder (for example services cannot import infrastructure, Express or `pg`).
- **Multi-process safety:** every mutation is a single conditional `UPDATE ... WHERE id AND version AND status [AND owner]` that advances `version` in the same statement. There is no in-process lock, so two API processes sharing one database stay correct. If the update matches no row, the service re-reads and returns the precise error.
- **Validation with Zod:** request bodies, query filters and environment variables are parsed by Zod schemas ([validation.ts](apps/api/src/services/validation.ts), [config.ts](apps/api/src/config.ts)). The first problem becomes a field-specific `400 INVALID_INPUT`; a bad environment fails at startup.
- **API hardening:** bounded connection and statement timeouts, an idle-client error handler, `nosniff` and frame headers, `no-store` on image bytes, a 16 kB body limit, and a shutdown that drains requests with a forced-exit timeout. Unexpected errors are logged server-side (name, message, stack) but never returned to the client.
- **No Redis.** It was evaluated and deliberately left out: the list is capped at 100 rows and correctness already comes from atomic Postgres updates, so a cache would only add cross-process invalidation risk.
- **UI race safety:** each fetch effect owns a `cancelled` flag and an `AbortController`, so a late response can never replace the current list or study. Drafts are a `Map<studyId, text>` in page memory.
- **412 handling:** the draft is kept and submitting is locked until the user explicitly acknowledges. The conflict is remembered per study, so it still applies if the user switched to another study while the request was in flight. Only one mutation runs at a time.
- **Filtered list:** a study that stops matching the active filter after a mutation is removed from the list instead of lingering with a contradictory status.
- **Viewer:**
  - Cornerstone3D is pinned to **4.22.13**.
  - [ViewerController](apps/web/src/viewer/ViewerController.ts) holds the load-ordering rules and depends only on an `ImageRenderer` interface; [CornerstoneRenderer](apps/web/src/viewer/CornerstoneRenderer.ts) is the one class that touches Cornerstone. That split is what makes the ordering rules unit-testable without WebGL.
  - Every load carries a token and clears the screen first, so a late result can never draw or publish state.
  - Files are checked with `dicom-parser` before decoding ([dicomInspection.ts](apps/web/src/viewer/dicomInspection.ts)), so the user is told whether a file is **corrupt** or merely **unsupported** (compressed, not MONOCHROME2, multi-frame).
  - `dispose()` aborts requests, disconnects the ResizeObserver, removes listeners, destroys the engine and revokes blob URLs.
  - The viewer is lazy-loaded and wrapped in an error boundary: the worklist's initial bundle is about 50 kB gzipped, and a viewer crash cannot take the worklist down.
  - Only modality, study date and dimensions are read from the DICOM metadata; no other tag is read, shown or logged.
- **Debug counters:** `window.__viewerDebug` (instances, listeners, observers, render count) exists only in dev and test builds (`VIEWER_DEBUG=1`); production builds omit it.

## Known notes

- **Dependency audit:** `npm audit` reports no critical issues. What remains has no compatible fix:
  - `js-yaml` 3.x (high), pulled in by Cornerstone3D (through vtk.js and its XML builder) and by Jest coverage tooling (dev only). Its consumers require the 3.x API.
  - Cornerstone3D 4.x transitive packages (moderate): no patched 4.x release, and 5.x has a different viewport API.
- The checkerboard fixture is a binary image, so window/level assertions use the gradient.
- Reviewer selection is kept in `sessionStorage`; review-note drafts are intentionally not persisted across reloads.

## Project layout

```
apps/api         Express API: src/{domain,errors,services,infrastructure,http}, migrations, scripts, tests
apps/web         React app: src/{api,hooks,components,viewer,testing}, Jest tests next to the code
e2e              Playwright specs (viewer + lifecycle + accessibility)
.github          CI workflow
samples          gradient.dcm, checkerboard.dcm, corrupt.dcm
docker           Postgres init script
SubTasks         Planning documents for each delivery phase
```
