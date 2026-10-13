# Imaging Review Worklist: Subtasks Index

> **Status: all phases delivered.** These files are the original plan. Where the implementation refined it (Zod validation, the `ImageRenderer` split in the viewer, service unit tests with fakes instead of an in-memory repository), the [README](../README.md) is the authoritative description.

Stack: **TypeScript everywhere**, **Express** (API), **React + Vite** (web), **PostgreSQL**, **Cornerstone3D** (DICOM viewer + loader), **Jest** (API/React tests), **Playwright** (browser tests), **ESLint strict**.

> **Redis decision:** evaluated and deliberately **not used**. The list is capped at 100 rows, the dataset is tiny, and correctness already comes from atomic Postgres updates. A cache would add invalidation risk across two API processes for no measurable gain.

## Architecture

```
HTTP (Express routes)
   -> Controller        (parse + validate input, map to DTO, HTTP status)
      -> Service        (business rules, validation ORDER, error codes)
         -> Repository  (interface; Postgres implementation, atomic SQL)
         -> FileResolver(interface; fixed studyId -> samples/ file mapping)
```

### Design rules (apply to every subtask)
| Principle | How it is applied here |
|---|---|
| **S**ingle responsibility | Controller never touches SQL; repository never decides HTTP codes; service never reads `req`. |
| **O**pen/closed | New filters/rules are added by extending validators/query builder, not by editing callers. |
| **L**iskov | `PgStudyRepository` and `InMemoryStudyRepository` (unit tests) are interchangeable behind `StudyReader`/`StudyWriter`. |
| **I**nterface segregation | Small interfaces: `StudyReader`, `StudyWriter`, `StudyFileResolver`, `ReviewerDirectory`. |
| **D**ependency inversion | Services depend on interfaces; one composition root (`container.ts`) wires concrete classes. |

Patterns: **Repository**, **Service layer**, **Dependency Injection (composition root)**, **DTO/Mapper**, **Custom error hierarchy**.

### Hard rules from the task
1. **Postgres is the only source of correctness.**
2. Concurrency safety = atomic conditional `UPDATE ... WHERE id=$1 AND version=$2 AND status=...`, **not** in-process locks.
3. Validation order: **input -> study exists -> expectedVersion -> status -> ownership**.
4. Never accept a filesystem path from the caller. Never expose or log raw DICOM tags.
5. Use an established viewer/loader; **no custom DICOM parser**.
6. Tests use **controlled deferred promises**, not sleeps.
7. **Jest** for API and React tests; Playwright runner for browser tests. **ESLint strict** with `--max-warnings 0` must pass before a subtask is done.
8. Fixtures live in `samples/` (`gradient.dcm`, `checkerboard.dcm`, `corrupt.dcm`) and are used as supplied.

## Delivery phases

| Phase | Scope | Subtasks |
|---|---|---|
| **1** | Database schema, migrations, seed data, API validation | [01](01-project-setup.md), [02](02-database-migrations-seed.md), [05](05-http-api-layer.md) (routes + validation), [04](04-service-layer.md) (input rules) |
| **2** | Atomic claim/complete, ownership checks, real-DB concurrency tests | [03](03-domain-and-repository.md), [04](04-service-layer.md), [06](06-api-tests.md) |
| **3** | React worklist, filters, study details, draft recovery | [07](07-web-foundation-worklist.md), [08](08-web-detail-claim-complete.md) |
| **4** | Real DICOM viewer integration and fixture handling | [09](09-dicom-viewer.md) |
| **5** | React race tests, browser viewer tests, lifecycle tests | [10](10-react-tests.md), [11](11-browser-viewer-tests.md), [12](12-viewer-lifecycle-test.md) |
| **6** | Two-process contention smoke, README, final end-to-end verification | [13](13-contention-smoke.md), [14](14-readme-delivery.md) |

Build 01 -> 14 in numeric order; each file lists its acceptance criteria.

## Subtask list

| # | File | Goal |
|---|---|---|
| 01 | [01-project-setup.md](01-project-setup.md) | Monorepo, tooling, strict ESLint, Docker Postgres, env |
| 02 | [02-database-migrations-seed.md](02-database-migrations-seed.md) | Schema, migrations, seed, reset |
| 03 | [03-domain-and-repository.md](03-domain-and-repository.md) | Entities, interfaces, atomic Postgres repository |
| 04 | [04-service-layer.md](04-service-layer.md) | Business rules, error codes, validation order |
| 05 | [05-http-api-layer.md](05-http-api-layer.md) | Express routes, controllers, errors, file endpoint, reviewers, health |
| 06 | [06-api-tests.md](06-api-tests.md) | Real-DB API tests: concurrency, ownership, staleness, persistence |
| 07 | [07-web-foundation-worklist.md](07-web-foundation-worklist.md) | API client, reviewer select, filters, list, race safety |
| 08 | [08-web-detail-claim-complete.md](08-web-detail-claim-complete.md) | Detail panel, claim, completion form, drafts, 412 |
| 09 | [09-dicom-viewer.md](09-dicom-viewer.md) | Cornerstone3D viewer component and lifecycle |
| 10 | [10-react-tests.md](10-react-tests.md) | Out-of-order, draft switching, stale completion |
| 11 | [11-browser-viewer-tests.md](11-browser-viewer-tests.md) | Playwright real-viewer tests |
| 12 | [12-viewer-lifecycle-test.md](12-viewer-lifecycle-test.md) | Delayed load, close, 5x reopen, no leaks |
| 13 | [13-contention-smoke.md](13-contention-smoke.md) | Two API processes, separate ports, one winner |
| 14 | [14-readme-delivery.md](14-readme-delivery.md) | README, final checklist |

## Requirement traceability

| Task requirement | Subtask |
|---|---|
| 01 Worklist and API | 02, 03, 04, 05 |
| 02 Ownership and failure rules | 03, 04, 05, 06, 13 |
| 03 React behavior | 07, 08, 10 |
| 04 Viewer and fixtures | 02 (seed), 09, 11, 12 |
| 05 Required tests | 06, 10, 11, 12, 13 |
| Deliverables / README | 14 |
