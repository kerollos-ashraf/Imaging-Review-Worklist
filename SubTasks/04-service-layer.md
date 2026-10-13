# 04: Service Layer (Business Rules)

**Goal:** One place that enforces the ownership and failure rules in the exact required order.

## `StudyService`
Dependencies (constructor-injected interfaces): `StudyReader`, `StudyWriter`, `ReviewerDirectory`, `StudyFileResolver`.

### Methods
- `listStudies(filter)`
- `getStudy(id)`: throws `NotFoundError`.
- `claim({ studyId, reviewerId, expectedVersion })`
- `complete({ studyId, reviewerId, expectedVersion, reviewNote })`
- `resolveFile(studyId)`: throws `NotFoundError` for unknown study.

### Validation order (strict)
1. **Input** (400): `reviewerId` is a non-empty string and **exists in reviewers**; `expectedVersion` is present and is an integer >= 1; `reviewNote` (complete only) trimmed has 1-1000 chars. Unknown reviewer, missing version and invalid note are all **400**.
2. **Study exists** (404).
3. **expectedVersion matches** (412 `STALE_VERSION`, body carries the **current** record).
4. **Allowed status**: claim requires `Unassigned`, complete requires `InReview` (409 `INVALID_STATE`).
5. **Ownership** (complete only): `ownerId === reviewerId` (403 `NOT_OWNER`).

Then perform the atomic write. If the write returns 0 rows (a concurrent change landed between read and write), **re-read and re-run steps 2-5** to return the correct error, normally 412 `STALE_VERSION` with the fresh record.

### Notes
- Completing someone else's `InReview` study **with the current version** = 403. With a stale version = 412 (version is checked first).
- Store the trimmed note.
- `Completed` is terminal: any claim/complete on it => 409.

## Errors (`apps/api/src/errors`)
```ts
abstract class AppError extends Error { status: number; code: string; }
ValidationError(400,'INVALID_INPUT') | NotFoundError(404,'NOT_FOUND')
StaleVersionError(412,'STALE_VERSION', current: Study)
InvalidStateError(409,'INVALID_STATE') | NotOwnerError(403,'NOT_OWNER')
```
Each has a stable `code` and a **safe** message (no SQL, no paths, no stack).

## Acceptance criteria
- [ ] Unit tests with `InMemoryStudyRepository` cover each branch and the order (e.g. invalid input beats 404; 404 beats 412; 412 beats 409; 409 beats 403).
- [ ] The service has no `express` or `pg` imports.
- [ ] Failed/stale completion changes no field (verified in 06).
