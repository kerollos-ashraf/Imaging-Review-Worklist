import request from 'supertest';
import type { Test } from 'supertest';
import { buildContainerForTest, createTestContext, resetData } from './helpers';
import type { TestContext } from './helpers';
import { seedDatabase } from '../src/seedData';

interface StudyBody {
  id: string;
  status: string;
  ownerId: string | null;
  reviewNote: string | null;
  version: number;
}

interface ErrorBody {
  error: { code: string; message: string; current?: StudyBody };
}

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

function claim(id: string, body: object): Test {
  return request(ctx.app).post(`/api/studies/${id}/claim`).send(body);
}

function complete(id: string, body: object): Test {
  return request(ctx.app).post(`/api/studies/${id}/complete`).send(body);
}

async function snapshot(id: string): Promise<StudyBody> {
  const res = await request(ctx.app).get(`/api/studies/${id}`).expect(200);
  return res.body as StudyBody;
}

async function insertUnassigned(id: string): Promise<void> {
  await ctx.pool.query(
    `INSERT INTO studies (id, modality, created_at, dicom_file_ref)
     VALUES ($1, 'OT', now(), 'gradient.dcm')`,
    [id],
  );
}

describe('claim', () => {
  it('moves Unassigned to InReview, assigns the owner and advances the version', async () => {
    const res = await claim('study-001', { reviewerId: 'reviewer-a', expectedVersion: 1 }).expect(200);
    expect(res.body).toMatchObject({
      id: 'study-001',
      status: 'InReview',
      ownerId: 'reviewer-a',
      version: 2,
    });
  });

  it('returns 409 INVALID_STATE for a study that is not Unassigned', async () => {
    const res = await claim('study-003', { reviewerId: 'reviewer-b', expectedVersion: 2 }).expect(409);
    expect((res.body as ErrorBody).error.code).toBe('INVALID_STATE');
  });

  it('returns 412 STALE_VERSION with the current record', async () => {
    const res = await claim('study-001', { reviewerId: 'reviewer-a', expectedVersion: 5 }).expect(412);
    const { error } = res.body as ErrorBody;
    expect(error.code).toBe('STALE_VERSION');
    expect(error.current).toMatchObject({ id: 'study-001', version: 1, status: 'Unassigned' });
  });

  it.each([
    ['missing version', { reviewerId: 'reviewer-a' }],
    ['non-integer version', { reviewerId: 'reviewer-a', expectedVersion: 1.5 }],
    ['string version', { reviewerId: 'reviewer-a', expectedVersion: '1' }],
    ['zero version', { reviewerId: 'reviewer-a', expectedVersion: 0 }],
    ['missing reviewer', { expectedVersion: 1 }],
    ['unknown reviewer', { reviewerId: 'reviewer-x', expectedVersion: 1 }],
  ])('returns 400 INVALID_INPUT for %s', async (_name, body) => {
    const res = await claim('study-001', body).expect(400);
    expect((res.body as ErrorBody).error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await request(ctx.app)
      .post('/api/studies/study-001/claim')
      .set('Content-Type', 'application/json')
      .send('{not json')
      .expect(400);
    expect((res.body as ErrorBody).error.code).toBe('INVALID_INPUT');
  });

  it('returns 404 for an unknown study', async () => {
    await claim('missing', { reviewerId: 'reviewer-a', expectedVersion: 1 }).expect(404);
  });

  it('applies input validation before the study lookup', async () => {
    await claim('missing', { reviewerId: 'reviewer-a' }).expect(400);
  });

  it('applies the existence check before the version check', async () => {
    await claim('missing', { reviewerId: 'reviewer-a', expectedVersion: 99 }).expect(404);
  });
});

describe('concurrent claims', () => {
  it('produces exactly one success and one STALE_VERSION per contested study', async () => {
    for (let round = 0; round < 25; round += 1) {
      const id = `race-${round}`;
      await insertUnassigned(id);
      const [a, b] = await Promise.all([
        claim(id, { reviewerId: 'reviewer-a', expectedVersion: 1 }),
        claim(id, { reviewerId: 'reviewer-b', expectedVersion: 1 }),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 412]);

      const winner = a.status === 200 ? 'reviewer-a' : 'reviewer-b';
      const loser = a.status === 200 ? b : a;
      expect((loser.body as ErrorBody).error.code).toBe('STALE_VERSION');
      expect((loser.body as ErrorBody).error.current).toMatchObject({
        ownerId: winner,
        version: 2,
      });
      expect(await snapshot(id)).toMatchObject({ ownerId: winner, version: 2 });
    }
  });
});

describe('complete', () => {
  it('lets the owner complete with a trimmed note and retains owner and note', async () => {
    const res = await complete('study-003', {
      reviewerId: 'reviewer-a',
      expectedVersion: 2,
      reviewNote: '  Looks fine.  ',
    }).expect(200);
    expect(res.body).toMatchObject({
      status: 'Completed',
      ownerId: 'reviewer-a',
      reviewNote: 'Looks fine.',
      version: 3,
    });
  });

  it('returns 403 NOT_OWNER and changes nothing for another reviewers study', async () => {
    const before = await snapshot('study-003');
    const res = await complete('study-003', {
      reviewerId: 'reviewer-b',
      expectedVersion: 2,
      reviewNote: 'Not mine',
    }).expect(403);
    expect((res.body as ErrorBody).error.code).toBe('NOT_OWNER');
    expect(await snapshot('study-003')).toEqual(before);
  });

  it('returns 412 before 403 when a non-owner sends a stale version', async () => {
    const res = await complete('study-003', {
      reviewerId: 'reviewer-b',
      expectedVersion: 1,
      reviewNote: 'Stale',
    }).expect(412);
    expect((res.body as ErrorBody).error.code).toBe('STALE_VERSION');
  });

  it('returns 412 and changes nothing for a stale owner completion', async () => {
    const before = await snapshot('study-003');
    const res = await complete('study-003', {
      reviewerId: 'reviewer-a',
      expectedVersion: 1,
      reviewNote: 'Stale',
    }).expect(412);
    expect((res.body as ErrorBody).error.current).toEqual(before);
    expect(await snapshot('study-003')).toEqual(before);
  });

  it('returns 409 INVALID_STATE for an Unassigned study', async () => {
    const res = await complete('study-001', {
      reviewerId: 'reviewer-a',
      expectedVersion: 1,
      reviewNote: 'Too early',
    }).expect(409);
    expect((res.body as ErrorBody).error.code).toBe('INVALID_STATE');
  });

  it.each([
    ['empty note', ''],
    ['whitespace-only note', '   \n\t '],
    ['note over 1000 characters', 'x'.repeat(1001)],
    ['non-string note', 42],
  ])('returns 400 and changes nothing for %s', async (_name, reviewNote) => {
    const before = await snapshot('study-003');
    const res = await complete('study-003', {
      reviewerId: 'reviewer-a',
      expectedVersion: 2,
      reviewNote,
    }).expect(400);
    expect((res.body as ErrorBody).error.code).toBe('INVALID_INPUT');
    expect(await snapshot('study-003')).toEqual(before);
  });

  it('rejects a missing note', async () => {
    await complete('study-003', { reviewerId: 'reviewer-a', expectedVersion: 2 }).expect(400);
  });

  it('accepts a note of exactly 1000 characters', async () => {
    const note = 'y'.repeat(1000);
    const res = await complete('study-003', {
      reviewerId: 'reviewer-a',
      expectedVersion: 2,
      reviewNote: note,
    }).expect(200);
    expect((res.body as StudyBody).reviewNote).toBe(note);
  });

  it('treats Completed as terminal', async () => {
    await claim('study-005', { reviewerId: 'reviewer-a', expectedVersion: 3 }).expect(409);
    await complete('study-005', {
      reviewerId: 'reviewer-a',
      expectedVersion: 3,
      reviewNote: 'Again',
    }).expect(409);
  });

  it('runs claim then complete end to end', async () => {
    const claimed = await claim('study-002', { reviewerId: 'reviewer-b', expectedVersion: 1 }).expect(200);
    const version = (claimed.body as StudyBody).version;
    const done = await complete('study-002', {
      reviewerId: 'reviewer-b',
      expectedVersion: version,
      reviewNote: 'Checked',
    }).expect(200);
    expect(done.body).toMatchObject({ status: 'Completed', version: 3, ownerId: 'reviewer-b' });
  });

  it('accepts exactly one of two simultaneous completions by the owner', async () => {
    for (let round = 0; round < 10; round += 1) {
      const id = `double-${round}`;
      await insertUnassigned(id);
      await claim(id, { reviewerId: 'reviewer-a', expectedVersion: 1 }).expect(200);

      const [first, second] = await Promise.all([
        complete(id, { reviewerId: 'reviewer-a', expectedVersion: 2, reviewNote: 'first tab' }),
        complete(id, { reviewerId: 'reviewer-a', expectedVersion: 2, reviewNote: 'second tab' }),
      ]);
      expect([first.status, second.status].sort()).toEqual([200, 412]);

      const winner = first.status === 200 ? 'first tab' : 'second tab';
      const loser = first.status === 200 ? second : first;
      expect((loser.body as ErrorBody).error.code).toBe('STALE_VERSION');
      // The losing note must not overwrite the winning one.
      expect(await snapshot(id)).toMatchObject({
        status: 'Completed',
        reviewNote: winner,
        version: 3,
      });
    }
  });

  it('sets nosniff on responses and no-store on the file', async () => {
    const res = await request(ctx.app).get('/api/studies/study-001/file').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('private, no-store');
  });
});

describe('persistence', () => {
  it('keeps owner, note and version after the application restarts', async () => {
    await claim('study-001', { reviewerId: 'reviewer-a', expectedVersion: 1 }).expect(200);
    await complete('study-001', {
      reviewerId: 'reviewer-a',
      expectedVersion: 2,
      reviewNote: 'Persist me',
    }).expect(200);

    const restarted = buildContainerForTest();
    try {
      const res = await request(restarted.app).get('/api/studies/study-001').expect(200);
      expect(res.body).toMatchObject({
        status: 'Completed',
        ownerId: 'reviewer-a',
        reviewNote: 'Persist me',
        version: 3,
      });
    } finally {
      await restarted.pool.end();
    }
  });

  it('does not overwrite modified data when the seed runs again', async () => {
    await claim('study-001', { reviewerId: 'reviewer-b', expectedVersion: 1 }).expect(200);
    await seedDatabase(ctx.pool);
    expect(await snapshot('study-001')).toMatchObject({
      status: 'InReview',
      ownerId: 'reviewer-b',
      version: 2,
    });
  });
});
