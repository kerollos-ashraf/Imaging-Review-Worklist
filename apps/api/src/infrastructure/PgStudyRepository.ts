import type { Pool } from 'pg';
import type { StudyReader, StudyWriter } from '../domain/ports';
import type {
  PageRequest,
  SortOrder,
  StatusCounts,
  Study,
  StudyFilter,
  StudyPage,
  StudyStatus,
} from '../domain/study';

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

/** Shared by the page query and the count query so both see the same rows. */
const LIST_WHERE = `
  WHERE ($1::study_status IS NULL OR status = $1::study_status)
    AND ($2::text IS NULL OR modality = $2::text)
    AND ($3::text IS NULL OR owner_id = $3::text)
    AND ($4::text IS NULL OR id ILIKE $4::text ESCAPE '!')`;

const ORDER_BY: Record<SortOrder, string> = {
  asc: 'created_at ASC, id ASC',
  desc: 'created_at DESC, id DESC',
};

/**
 * A LIKE pattern matching `text` anywhere, with its wildcards taken literally.
 * `!` is the escape character (declared in the query), which avoids the
 * backslash-in-a-string pitfalls of the default.
 */
function containsPattern(text: string): string {
  return `%${text.replace(/[!%_]/g, (char) => `!${char}`)}%`;
}

export class PgStudyRepository implements StudyReader, StudyWriter {
  constructor(private readonly pool: Pool) {}

  async list(filter: StudyFilter, page: PageRequest): Promise<StudyPage> {
    const conditions = [
      filter.status ?? null,
      filter.modality ?? null,
      filter.ownerId ?? null,
      filter.search === undefined ? null : containsPattern(filter.search),
    ];
    // The direction cannot be a bind parameter, so it comes from a fixed map.
    const orderBy = ORDER_BY[filter.order ?? 'asc'];
    const [rows, count] = await Promise.all([
      this.pool.query<StudyRow>(
        `SELECT ${STUDY_COLUMNS} FROM studies ${LIST_WHERE}
         ORDER BY ${orderBy}
         LIMIT $5 OFFSET $6`,
        [...conditions, page.pageSize, (page.page - 1) * page.pageSize],
      ),
      // One grouped count gives both the per-status breakdown and the total.
      this.pool.query<{ status: StudyStatus; count: string }>(
        `SELECT status, count(*) AS count FROM studies ${LIST_WHERE} GROUP BY status`,
        conditions,
      ),
    ]);
    const statusCounts: StatusCounts = { Unassigned: 0, InReview: 0, Completed: 0 };
    for (const row of count.rows) {
      statusCounts[row.status] = Number(row.count);
    }
    return {
      studies: rows.rows.map(mapStudyRow),
      total: statusCounts.Unassigned + statusCounts.InReview + statusCounts.Completed,
      statusCounts,
    };
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
