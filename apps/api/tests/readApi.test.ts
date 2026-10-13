import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { createTestContext, resetData } from './helpers';
import type { TestContext } from './helpers';

let ctx: TestContext;

beforeAll(() => {
  ctx = createTestContext();
});

beforeEach(async () => {
  await resetData(ctx.pool);
});

afterAll(async () => {
  await ctx.pool.end();
});

describe('GET /api/studies', () => {
  it('returns seeded studies ordered by createdAt then id', async () => {
    const res = await request(ctx.app).get('/api/studies').expect(200);
    const body = res.body as { id: string; createdAt: string }[];
    expect(body.length).toBeGreaterThanOrEqual(6);
    const sorted = [...body].sort((a, b) =>
      a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
    );
    expect(body.map((s) => s.id)).toEqual(sorted.map((s) => s.id));
    expect(body[0]?.id).toBe('study-001');
    expect(body[1]?.id).toBe('study-002');
  });

  it('seeds all three statuses and both reviewers', async () => {
    const res = await request(ctx.app).get('/api/studies').expect(200);
    const body = res.body as { status: string; ownerId: string | null }[];
    expect(new Set(body.map((s) => s.status))).toEqual(
      new Set(['Unassigned', 'InReview', 'Completed']),
    );
    const owners = new Set(body.map((s) => s.ownerId).filter((o) => o !== null));
    expect(owners).toEqual(new Set(['reviewer-a', 'reviewer-b']));
  });

  it('combines status and modality filters with AND', async () => {
    const res = await request(ctx.app)
      .get('/api/studies')
      .query({ status: 'Unassigned', modality: 'CT' })
      .expect(200);
    expect((res.body as { id: string }[]).map((s) => s.id)).toEqual(['study-007']);
  });

  it('returns at most 100 studies', async () => {
    await ctx.pool.query(
      `INSERT INTO studies (id, modality, created_at, dicom_file_ref)
       SELECT 'bulk-' || lpad(n::text, 3, '0'), 'OT', now(), 'gradient.dcm'
       FROM generate_series(1, 120) AS n`,
    );
    const res = await request(ctx.app).get('/api/studies').expect(200);
    expect(res.body).toHaveLength(100);
  });

  it('rejects an invalid status with 400 INVALID_INPUT', async () => {
    const res = await request(ctx.app).get('/api/studies').query({ status: 'Nope' }).expect(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_INPUT');
  });

  it('does not expose file references or DICOM tags', async () => {
    const res = await request(ctx.app).get('/api/studies').expect(200);
    const keys = Object.keys((res.body as object[])[0] ?? {}).sort();
    expect(keys).toEqual(
      ['createdAt', 'id', 'modality', 'ownerId', 'reviewNote', 'status', 'version'].sort(),
    );
  });
});

describe('GET /api/studies/:id', () => {
  it('returns the study with ownership and version', async () => {
    const res = await request(ctx.app).get('/api/studies/study-003').expect(200);
    expect(res.body).toMatchObject({
      id: 'study-003',
      status: 'InReview',
      ownerId: 'reviewer-a',
      version: 2,
    });
  });

  it('returns 404 for an unknown study', async () => {
    const res = await request(ctx.app).get('/api/studies/missing').expect(404);
    expect((res.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/studies/:id/file', () => {
  it('serves the mapped fixture bytes', async () => {
    const res = await request(ctx.app)
      .get('/api/studies/study-001/file')
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => {
          cb(null, Buffer.concat(chunks));
        });
      })
      .expect(200);
    const expected = fs.readFileSync(path.resolve(__dirname, '../../../samples/gradient.dcm'));
    expect((res.body as Buffer).equals(expected)).toBe(true);
  });

  it('serves the corrupt fixture bytes without error', async () => {
    await request(ctx.app).get('/api/studies/study-007/file').expect(200);
  });

  it('returns 404 for unknown and traversal-like ids', async () => {
    await request(ctx.app).get('/api/studies/unknown/file').expect(404);
    await request(ctx.app).get('/api/studies/..%2F..%2Fpackage.json/file').expect(404);
  });
});

describe('support endpoints', () => {
  it('lists the two seeded reviewers', async () => {
    const res = await request(ctx.app).get('/api/reviewers').expect(200);
    expect((res.body as { id: string }[]).map((r) => r.id)).toEqual(['reviewer-a', 'reviewer-b']);
  });

  it('reports health', async () => {
    await request(ctx.app).get('/health').expect(200, { status: 'ok' });
  });
});
