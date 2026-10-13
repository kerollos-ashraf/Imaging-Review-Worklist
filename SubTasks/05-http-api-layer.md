# 05: HTTP API Layer (Express)

**Goal:** Thin controllers and routes that map HTTP to the service and errors to the contract.

## Structure
```
apps/api/src/
  app.ts                 createApp(deps) -> Express (no listen; testable)
  server.ts              reads env, builds container, listen(PORT)
  container.ts           composition root (the ONLY place that news concrete classes)
  http/routes/studies.routes.ts
  http/controllers/StudyController.ts
  http/schemas.ts        zod schemas
  http/middleware/errorHandler.ts, notFound.ts
```

## Endpoints
| Method | Path | Success | Notes |
|---|---|---|---|
| GET | `/api/studies?status=&modality=` | 200 `Study[]` | Invalid `status` value => 400 |
| GET | `/api/studies/:id` | 200 `Study` | 404 if unknown |
| POST | `/api/studies/:id/claim` | 200 `Study` | body `{reviewerId, expectedVersion}` |
| POST | `/api/studies/:id/complete` | 200 `Study` | body `{reviewerId, expectedVersion, reviewNote}` |
| GET | `/api/studies/:id/file` | 200 bytes | `Content-Type: application/dicom`; 404 if unknown study |

## Rules
- **Response DTO** = `id, modality, createdAt, status, ownerId, reviewNote, version`. No file path, no DICOM tags.
- Error body: `{ "error": { "code": "STALE_VERSION", "message": "...", "current": { ...Study } } }` (`current` only on 412).
- zod parse failures => `400 INVALID_INPUT`. Malformed JSON => 400. Unknown routes => 404 with the same error shape.
- File endpoint: id is only used as a lookup key into the fixed mapping. Use `res.sendFile` / stream from the resolved absolute path. Add a test that `../` or encoded path tricks in `:id` return 404.
- Controllers are class-based with injected `StudyService`; no business logic in them.
- Request logging must not include bodies containing notes (log method, path, status, id only).
- Add `GET /api/reviewers` (the two seeded reviewers, so the UI has no hardcoded reviewer records) and `GET /health` (`{"status":"ok"}`, also checks DB connectivity). Neither needs auth or extra infrastructure.
- Validation runs **before** any study lookup: missing values, wrong types, malformed JSON and unknown reviewer IDs all return `400 INVALID_INPUT` with a safe, field-specific message (e.g. `expectedVersion must be a positive integer`).
- CORS: allow the Vite dev origin only.

## Acceptance criteria
- [ ] Every status/code in the task's failure table is produced by a real request.
- [ ] 412 response contains the current record.
- [ ] `createApp` can be started twice on two ports in two separate processes (needed for 13).
- [ ] No endpoint accepts a path or filename from the caller.
