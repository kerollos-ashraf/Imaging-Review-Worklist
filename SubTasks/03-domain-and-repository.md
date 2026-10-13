# 03: Domain Entities and Repository Layer

**Goal:** Typed entities, small interfaces, and a Postgres repository whose writes are atomic.

## Entities / types (`apps/api/src/domain`)
```ts
type StudyStatus = 'Unassigned' | 'InReview' | 'Completed';

interface Study {
  id: string; modality: string; createdAt: string; status: StudyStatus;
  ownerId: string | null; reviewNote: string | null; version: number;
}
// dicomFileRef is internal: kept in a separate StudyRecord, never in the public Study DTO.
interface StudyFilter { status?: StudyStatus; modality?: string; }
```

## Interfaces (Interface Segregation)
```ts
interface StudyReader {
  list(filter: StudyFilter): Promise<Study[]>;           // AND, max 100, createdAt ASC, id ASC
  findById(id: string): Promise<Study | null>;
}
interface StudyWriter {
  // Both return the updated Study, or null if the conditional update matched 0 rows.
  claim(id: string, reviewerId: string, expectedVersion: number): Promise<Study | null>;
  complete(id: string, reviewerId: string, expectedVersion: number, note: string): Promise<Study | null>;
}
interface ReviewerDirectory { exists(reviewerId: string): Promise<boolean>; }
interface StudyFileResolver { resolve(studyId: string): Promise<string | null>; } // absolute path from fixed mapping
```

## Postgres implementation (`PgStudyRepository`)
- `list`: parameterized query, `WHERE ($1::study_status IS NULL OR status=$1) AND ($2::text IS NULL OR modality=$2) ORDER BY created_at ASC, id ASC LIMIT 100`.
- `claim` (single atomic statement):
  ```sql
  UPDATE studies SET status='InReview', owner_id=$2, version=version+1
  WHERE id=$1 AND version=$3 AND status='Unassigned'
  RETURNING ...;
  ```
- `complete`:
  ```sql
  UPDATE studies SET status='Completed', review_note=$4, version=version+1
  WHERE id=$1 AND version=$3 AND status='InReview' AND owner_id=$2
  RETURNING ...;
  ```
- Atomicity: each write is a **single conditional UPDATE** (no read-modify-write), so `expectedVersion` is compared against the stored integer version inside the same statement. Version is exposed as a number.
- 0 rows returned => **repository does not decide why**. The service re-reads and classifies (stale / invalid state / not owner).
- Row mapper: `snake_case` -> `camelCase`, `timestamptz` -> ISO string. Single place, no leaking of `dicom_file_ref`.
- `PgStudyFileResolver`: loads `dicom_file_ref` by study id, maps via an **allowlist** (`gradient.dcm`, `checkerboard.dcm`, `corrupt.dcm`) joined to `FIXTURES_DIR`. Reject anything outside the allowlist.
- Connection pool injected (no global singleton in repository code).

## Acceptance criteria
- [ ] Repository classes only import `pg` types and domain types (no Express).
- [ ] Two concurrent `claim` calls from the same version: exactly one returns a row.
- [ ] Version increments by exactly 1 per successful write, in the same statement as the state change.
- [ ] No string-concatenated SQL.
- [ ] `InMemoryStudyRepository` exists for pure unit tests of the service (LSP check).
