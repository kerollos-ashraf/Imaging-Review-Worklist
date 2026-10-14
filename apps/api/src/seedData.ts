import type { Pool } from 'pg';

/**
 * Non-destructive seed: every row uses ON CONFLICT DO NOTHING, so running it on a
 * database that already holds claimed or completed studies leaves them untouched.
 * Valid fixtures report modality OT in their DICOM header; the corrupt study has
 * no readable header, so its catalog modality is arbitrary.
 */
interface SeedStudy {
  id: string;
  modality: string;
  createdAt: string;
  status: 'Unassigned' | 'InReview' | 'Completed';
  ownerId: string | null;
  reviewNote: string | null;
  version: number;
  file: string;
}

const REVIEWERS = [
  { id: 'reviewer-a', displayName: 'Reviewer A' },
  { id: 'reviewer-b', displayName: 'Reviewer B' },
];

const CORE_STUDIES: SeedStudy[] = [
  { id: 'study-001', modality: 'OT', createdAt: '2026-01-10T08:00:00Z', status: 'Unassigned', ownerId: null, reviewNote: null, version: 1, file: 'gradient.dcm' },
  { id: 'study-002', modality: 'OT', createdAt: '2026-01-10T08:00:00Z', status: 'Unassigned', ownerId: null, reviewNote: null, version: 1, file: 'checkerboard.dcm' },
  { id: 'study-003', modality: 'OT', createdAt: '2026-01-11T09:30:00Z', status: 'InReview', ownerId: 'reviewer-a', reviewNote: null, version: 2, file: 'gradient.dcm' },
  { id: 'study-004', modality: 'OT', createdAt: '2026-01-12T10:15:00Z', status: 'InReview', ownerId: 'reviewer-b', reviewNote: null, version: 2, file: 'checkerboard.dcm' },
  { id: 'study-005', modality: 'OT', createdAt: '2026-01-13T11:00:00Z', status: 'Completed', ownerId: 'reviewer-a', reviewNote: 'Gradient reviewed; no findings.', version: 3, file: 'gradient.dcm' },
  { id: 'study-006', modality: 'OT', createdAt: '2026-01-14T12:45:00Z', status: 'Completed', ownerId: 'reviewer-b', reviewNote: 'Checkerboard reviewed; pattern as expected.', version: 3, file: 'checkerboard.dcm' },
  { id: 'study-007', modality: 'CT', createdAt: '2026-01-15T14:00:00Z', status: 'Unassigned', ownerId: null, reviewNote: null, version: 1, file: 'corrupt.dcm' },
];

/** The hand-written studies: one per fixture and status combination the tests rely on. */
export const CORE_STUDY_COUNT = CORE_STUDIES.length;

/** How many studies an ordinary seed creates, so the worklist needs paging. */
export const DEFAULT_STUDY_COUNT = 100;

const HOUR_MS = 60 * 60 * 1000;
const FIRST_GENERATED_AT = Date.parse('2026-01-16T08:00:00Z');

/**
 * A deterministic study for position `number` (8, 9, ...). Each one is created
 * six hours after the previous, so they always sort after the core studies.
 * The status cycles so every page shows a realistic mix: two Unassigned, one
 * InReview per reviewer, one Completed.
 */
function generatedStudy(number: number): SeedStudy {
  const id = `study-${String(number).padStart(3, '0')}`;
  const reviewer = number % 2 === 0 ? 'reviewer-a' : 'reviewer-b';
  const base = {
    id,
    modality: 'OT',
    createdAt: new Date(
      FIRST_GENERATED_AT + (number - CORE_STUDY_COUNT - 1) * 6 * HOUR_MS,
    ).toISOString(),
    file: number % 2 === 0 ? 'gradient.dcm' : 'checkerboard.dcm',
  };
  switch (number % 5) {
    case 2:
      return { ...base, status: 'InReview', ownerId: 'reviewer-a', reviewNote: null, version: 2 };
    case 3:
      return { ...base, status: 'InReview', ownerId: 'reviewer-b', reviewNote: null, version: 2 };
    case 4:
      return {
        ...base,
        status: 'Completed',
        ownerId: reviewer,
        reviewNote: `Synthetic review note for ${id}.`,
        version: 3,
      };
    default:
      return { ...base, status: 'Unassigned', ownerId: null, reviewNote: null, version: 1 };
  }
}

/** The first `count` seed studies: the core ones, then generated ones. */
export function seedStudies(count: number): SeedStudy[] {
  const generated = Array.from({ length: Math.max(0, count - CORE_STUDY_COUNT) }, (_, index) =>
    generatedStudy(CORE_STUDY_COUNT + index + 1),
  );
  return [...CORE_STUDIES.slice(0, count), ...generated];
}

export async function seedDatabase(pool: Pool, studyCount = DEFAULT_STUDY_COUNT): Promise<void> {
  for (const reviewer of REVIEWERS) {
    await pool.query(
      'INSERT INTO reviewers (id, display_name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
      [reviewer.id, reviewer.displayName],
    );
  }
  for (const study of seedStudies(studyCount)) {
    await pool.query(
      `INSERT INTO studies
         (id, modality, created_at, status, owner_id, review_note, version, dicom_file_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        study.id,
        study.modality,
        study.createdAt,
        study.status,
        study.ownerId,
        study.reviewNote,
        study.version,
        study.file,
      ],
    );
  }
}
