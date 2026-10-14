import request from 'supertest';
import type { Response, Test } from 'supertest';
import { createTestContext } from './helpers';
import type { TestContext } from './helpers';
import { CORE_STUDY_COUNT, DEFAULT_STUDY_COUNT, seedDatabase, seedStudies } from '../src/seedData';

let ctx: TestContext;

beforeAll(() => {
  ctx = createTestContext();
});

// These tests run against the full default seed, as `npm run db:seed` creates it.
beforeEach(async () => {
  await ctx.pool.query('TRUNCATE studies, reviewers');
  await seedDatabase(ctx.pool);
});

afterAll(async () => {
  await ctx.pool.end();
});

function ids(res: Response): string[] {
  return (res.body as { id: string }[]).map((study) => study.id);
}

function list(query: Record<string, string | number> = {}): Test {
  return request(ctx.app).get('/api/studies').query(query);
}

function studyId(number: number): string {
  return `study-${String(number).padStart(3, '0')}`;
}

describe('default seed', () => {
  it('creates 100 distinct studies, starting with the hand-written ones', async () => {
    expect(DEFAULT_STUDY_COUNT).toBe(100);
    const seeded = seedStudies(DEFAULT_STUDY_COUNT);
    expect(new Set(seeded.map((study) => study.id)).size).toBe(100);

    const res = await list().expect(200);
    expect(ids(res)).toEqual(Array.from({ length: 100 }, (_, index) => studyId(index + 1)));
  });

  it('covers every status, both reviewers and all three fixtures', async () => {
    const { rows } = await ctx.pool.query<{ status: string; owner_id: string | null; file: string }>(
      'SELECT status, owner_id, dicom_file_ref AS file FROM studies',
    );
    expect(new Set(rows.map((row) => row.status))).toEqual(
      new Set(['Unassigned', 'InReview', 'Completed']),
    );
    expect(new Set(rows.map((row) => row.owner_id))).toEqual(
      new Set([null, 'reviewer-a', 'reviewer-b']),
    );
    expect(new Set(rows.map((row) => row.file))).toEqual(
      new Set(['gradient.dcm', 'checkerboard.dcm', 'corrupt.dcm']),
    );
  });

  it('leaves existing rows alone when it runs again', async () => {
    await request(ctx.app)
      .post('/api/studies/study-050/claim')
      .send({ reviewerId: 'reviewer-a', expectedVersion: 1 })
      .expect(200);

    await seedDatabase(ctx.pool);

    const res = await request(ctx.app).get('/api/studies/study-050').expect(200);
    expect(res.body).toMatchObject({ status: 'InReview', ownerId: 'reviewer-a', version: 2 });
    expect((await list()).headers['x-total-count']).toBe('100');
  });

  it('serves a valid fixture for a generated study', async () => {
    await request(ctx.app).get('/api/studies/study-064/file').expect(200);
  });
});

describe('pagination', () => {
  it('returns up to 100 studies and the total when no paging is requested', async () => {
    const res = await list().expect(200);
    expect(res.body).toHaveLength(100);
    expect(res.headers).toMatchObject({
      'x-total-count': '100',
      'x-page': '1',
      'x-page-size': '100',
    });
  });

  it('returns the requested page in order, as a plain array', async () => {
    const first = await list({ page: 1, pageSize: 10 }).expect(200);
    const second = await list({ page: 2, pageSize: 10 }).expect(200);

    expect(Array.isArray(first.body)).toBe(true);
    expect(ids(first)).toEqual(Array.from({ length: 10 }, (_, i) => studyId(i + 1)));
    expect(ids(second)).toEqual(Array.from({ length: 10 }, (_, i) => studyId(i + 11)));
    expect(second.headers).toMatchObject({
      'x-total-count': '100',
      'x-page': '2',
      'x-page-size': '10',
    });
  });

  it('walks every page without repeating or skipping a study', async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 4; page += 1) {
      seen.push(...ids(await list({ page, pageSize: 30 }).expect(200)));
    }
    expect(seen).toHaveLength(100);
    expect(new Set(seen).size).toBe(100);
  });

  it('returns a short last page and an empty page beyond it, still with the total', async () => {
    const last = await list({ page: 4, pageSize: 30 }).expect(200);
    expect(last.body).toHaveLength(10);

    const beyond = await list({ page: 99, pageSize: 30 }).expect(200);
    expect(beyond.body).toEqual([]);
    expect(beyond.headers['x-total-count']).toBe('100');
  });

  it('counts and pages the filtered set, not the whole table', async () => {
    const all = await list({ ownerId: 'reviewer-a' }).expect(200);
    const total = Number(all.headers['x-total-count']);
    expect(total).toBeGreaterThan(10);
    expect(total).toBeLessThan(100);
    expect(all.body).toHaveLength(total);

    const page = await list({ ownerId: 'reviewer-a', page: 2, pageSize: 5 }).expect(200);
    expect(page.headers['x-total-count']).toBe(String(total));
    expect(ids(page)).toEqual(ids(all).slice(5, 10));
  });

  function statusCounts(res: Response): Record<string, number> {
    return JSON.parse(String(res.headers['x-status-counts'])) as Record<string, number>;
  }

  it('reports the status breakdown of every matching study, not just the page', async () => {
    const { rows } = await ctx.pool.query<{ status: string; count: string }>(
      'SELECT status, count(*) AS count FROM studies GROUP BY status',
    );
    const expected = Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));

    const firstPage = await list({ page: 1, pageSize: 10 }).expect(200);
    const lastPage = await list({ page: 10, pageSize: 10 }).expect(200);
    expect(statusCounts(firstPage)).toEqual(expected);
    expect(statusCounts(lastPage)).toEqual(expected);

    const sum = Object.values(statusCounts(firstPage)).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
    expect(String(sum)).toBe(firstPage.headers['x-total-count']);
  });

  it('breaks down only the studies that match the filters', async () => {
    const mine = await list({ ownerId: 'reviewer-a', pageSize: 5 }).expect(200);
    const counts = statusCounts(mine);
    // An owned study is never Unassigned.
    expect(counts.Unassigned).toBe(0);
    expect((counts.InReview ?? 0) + (counts.Completed ?? 0)).toBe(
      Number(mine.headers['x-total-count']),
    );

    const completed = await list({ status: 'Completed', pageSize: 5 }).expect(200);
    expect(statusCounts(completed)).toMatchObject({ Unassigned: 0, InReview: 0 });
    expect(statusCounts(completed).Completed).toBe(Number(completed.headers['x-total-count']));
  });

  it('reports zeros for every status when nothing matches', async () => {
    const res = await list({ search: 'no-such-study' }).expect(200);
    expect(res.body).toEqual([]);
    expect(statusCounts(res)).toEqual({ Unassigned: 0, InReview: 0, Completed: 0 });
  });

  it('pages newest first when asked', async () => {
    const res = await list({ order: 'desc', page: 1, pageSize: 3 }).expect(200);
    expect(ids(res)).toEqual(['study-100', 'study-099', 'study-098']);
  });

  it('keeps the core studies first in the default order', async () => {
    const res = await list({ page: 1, pageSize: CORE_STUDY_COUNT }).expect(200);
    expect(ids(res)).toEqual(Array.from({ length: CORE_STUDY_COUNT }, (_, i) => studyId(i + 1)));
  });

  it.each([
    ['page 0', { page: 0 }],
    ['a negative page', { page: -1 }],
    ['a fractional page', { page: 1.5 }],
    ['a non-numeric page', { page: 'two' }],
    ['pageSize 0', { pageSize: 0 }],
    ['a pageSize above 100', { pageSize: 101 }],
    ['a non-numeric pageSize', { pageSize: 'many' }],
  ])('rejects %s with 400 INVALID_INPUT', async (_name, query) => {
    const res = await list(query).expect(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_INPUT');
  });

  it('exposes the paging headers to browsers on the web origin', async () => {
    const res = await list({ pageSize: 1 }).set('Origin', 'http://localhost:5173').expect(200);
    expect(res.headers['access-control-expose-headers']).toContain('X-Total-Count');
  });
});
