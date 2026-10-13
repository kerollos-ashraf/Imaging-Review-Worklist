import type { Pool } from 'pg';
import type { StudyReader, StudyWriter } from '../domain/ports';
import { MAX_LIST_RESULTS } from '../domain/study';
import type { Study, StudyFilter, StudyStatus } from '../domain/study';

export interface StudyRow {
  id: string;
  modality: string;
  created_at: Date;
  status: StudyStatus;
  owner_id: string | null;
  review_note: string | null;
  version: number;
}

export const STUDY_COLUMNS = 'id, modality, created_at, status, owner_id, review_note, version';

export function mapStudyRow(row: StudyRow): Study {
  return {
    id: row.id,
    modality: row.modality,
    createdAt: row.created_at.toISOString(),
    status: row.status,
    ownerId: row.owner_id,
    reviewNote: row.review_note,
    version: row.version,
  };
}

export class PgStudyRepository implements StudyReader, StudyWriter {
  constructor(private readonly pool: Pool) {}

  async list(filter: StudyFilter): Promise<Study[]> {
    const result = await this.pool.query<StudyRow>(
      `SELECT ${STUDY_COLUMNS} FROM studies
       WHERE ($1::study_status IS NULL OR status = $1::study_status)
         AND ($2::text IS NULL OR modality = $2::text)
       ORDER BY created_at ASC, id ASC
       LIMIT $3`,
      [filter.status ?? null, filter.modality ?? null, MAX_LIST_RESULTS],
    );
    return result.rows.map(mapStudyRow);
  }

  async findById(id: string): Promise<Study | null> {
    const result = await this.pool.query<StudyRow>(
      `SELECT ${STUDY_COLUMNS} FROM studies WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? mapStudyRow(row) : null;
  }

  async claim(id: string, reviewerId: string, expectedVersion: number): Promise<Study | null> {
    const result = await this.pool.query<StudyRow>(
      `UPDATE studies
          SET status = 'InReview', owner_id = $2, version = version + 1
        WHERE id = $1 AND version = $3 AND status = 'Unassigned'
        RETURNING ${STUDY_COLUMNS}`,
      [id, reviewerId, expectedVersion],
    );
    const row = result.rows[0];
    return row ? mapStudyRow(row) : null;
  }

  async complete(
    id: string,
    reviewerId: string,
    expectedVersion: number,
    reviewNote: string,
  ): Promise<Study | null> {
    const result = await this.pool.query<StudyRow>(
      `UPDATE studies
          SET status = 'Completed', review_note = $4, version = version + 1
        WHERE id = $1 AND version = $3 AND status = 'InReview' AND owner_id = $2
        RETURNING ${STUDY_COLUMNS}`,
      [id, reviewerId, expectedVersion, reviewNote],
    );
    const row = result.rows[0];
    return row ? mapStudyRow(row) : null;
  }
}
