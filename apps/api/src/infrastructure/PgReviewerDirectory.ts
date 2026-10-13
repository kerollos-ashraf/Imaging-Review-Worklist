import type { Pool } from 'pg';
import type { ReviewerDirectory } from '../domain/ports';
import type { Reviewer } from '../domain/study';

export class PgReviewerDirectory implements ReviewerDirectory {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<Reviewer[]> {
    const result = await this.pool.query<{ id: string; display_name: string }>(
      'SELECT id, display_name FROM reviewers ORDER BY id',
    );
    return result.rows.map((row) => ({ id: row.id, displayName: row.display_name }));
  }

  async exists(reviewerId: string): Promise<boolean> {
    const result = await this.pool.query('SELECT 1 FROM reviewers WHERE id = $1', [reviewerId]);
    return result.rowCount === 1;
  }
}
