# 02: Database, Migrations, Seed, Reset

**Goal:** Versioned schema in Postgres, deterministic seed, and a reset path that is separate from normal startup.

## Schema (migration `001_init`)
```sql
CREATE TABLE reviewers (
  id           text PRIMARY KEY,           -- 'reviewer-a', 'reviewer-b'
  display_name text NOT NULL
);

CREATE TYPE study_status AS ENUM ('Unassigned','InReview','Completed');

CREATE TABLE studies (
  id            text PRIMARY KEY,
  modality      text NOT NULL,
  created_at    timestamptz NOT NULL,
  status        study_status NOT NULL DEFAULT 'Unassigned',
  owner_id      text REFERENCES reviewers(id),
  review_note   text,
  version       integer NOT NULL DEFAULT 1,
  dicom_file_ref text NOT NULL,            -- fixed key, e.g. 'gradient.dcm'; NEVER a caller path
  CONSTRAINT owner_required CHECK (
    (status = 'Unassigned' AND owner_id IS NULL) OR
    (status <> 'Unassigned' AND owner_id IS NOT NULL)),
  CONSTRAINT note_on_complete CHECK (
    (status = 'Completed' AND review_note IS NOT NULL
       AND char_length(review_note) BETWEEN 1 AND 1000)
    OR (status <> 'Completed' AND review_note IS NULL))
);
CREATE INDEX studies_list_idx ON studies (created_at, id);
CREATE INDEX studies_filter_idx ON studies (status, modality);
```
DB-level `CHECK`s act as a safety net behind the service rules.

## Seed (idempotent, `ON CONFLICT DO NOTHING`)
- Reviewers: `reviewer-a`, `reviewer-b`.
- At least 6 studies, distinct IDs, mix of statuses and owners:

| id | file | status | owner |
|---|---|---|---|
| study-001 | gradient.dcm | Unassigned | - |
| study-002 | checkerboard.dcm | Unassigned | - |
| study-003 | gradient.dcm | InReview | reviewer-a |
| study-004 | checkerboard.dcm | InReview | reviewer-b |
| study-005 | gradient.dcm | Completed | reviewer-a (+ note) |
| study-006 | checkerboard.dcm | Completed | reviewer-b (+ note) |
| study-007 | corrupt.dcm | Unassigned | - |

- Use a mix of modalities (e.g. `CT`, `MR`, `CR`) and varied `created_at`, including at least one tie on `created_at` to prove the `id` tiebreak.
- The three fixture files must each be mapped to at least one **distinct study ID** (valid fixtures keep distinct DICOM IDs; do not collapse them).

## Commands
- `db:migrate`: run pending migrations (safe to repeat).
- `db:seed`: insert seed rows only where missing; **never overwrite** existing rows.
- `db:reset`: drop and recreate schema, migrate, seed. Explicit and manual only.
- **Normal API startup runs neither reset nor seed-overwrite.** At most it may run `migrate` and the non-destructive seed.

## Acceptance criteria
- [ ] Fresh DB -> migrate -> seed produces >= 6 studies covering all 3 statuses and both reviewers.
- [ ] Re-running migrate and seed leaves data unchanged (claim a study, rerun, state is preserved).
- [ ] `db:reset` restores the seed state.
- [ ] Tie-break data exists for the `created_at` then `id` ordering.
