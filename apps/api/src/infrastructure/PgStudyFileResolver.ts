import path from 'node:path';
import type { Pool } from 'pg';
import type { StudyFileResolver } from '../domain/ports';

/** Only these file names can ever be served; the DB value is a key, not a path. */
export const ALLOWED_FIXTURES: ReadonlySet<string> = new Set([
  'gradient.dcm',
  'checkerboard.dcm',
  'corrupt.dcm',
]);

export class PgStudyFileResolver implements StudyFileResolver {
  constructor(
    private readonly pool: Pool,
    private readonly fixturesDir: string,
  ) {}

  async resolve(studyId: string): Promise<string | null> {
    const result = await this.pool.query<{ dicom_file_ref: string }>(
      'SELECT dicom_file_ref FROM studies WHERE id = $1',
      [studyId],
    );
    const ref = result.rows[0]?.dicom_file_ref;
    if (ref === undefined || !ALLOWED_FIXTURES.has(ref)) {
      return null;
    }
    return path.join(this.fixturesDir, ref);
  }
}
