/** @jest-environment node */
import { ApiError, HttpStudyApi, NetworkError } from './StudyApi';
import { FIRST_PAGE, NO_FILTERS } from './types';

type FetchArgs = Parameters<typeof fetch>;

function apiReturning(response: () => Response | Promise<Response>): {
  api: HttpStudyApi;
  calls: FetchArgs[];
} {
  const calls: FetchArgs[] = [];
  const api = new HttpStudyApi('', (...args: FetchArgs) => {
    calls.push(args);
    return Promise.resolve(response());
  });
  return { api, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HttpStudyApi', () => {
  it('sends only the filters that are set', async () => {
    const { api, calls } = apiReturning(() => json([]));
    await api.listStudies(NO_FILTERS, FIRST_PAGE);
    await api.listStudies({ ...NO_FILTERS, status: 'InReview', modality: ' OT ' }, FIRST_PAGE);
    await api.listStudies(
      { ...NO_FILTERS, ownerId: 'reviewer-a', search: ' Study 1 ', order: 'desc' },
      { page: 3, pageSize: 25 },
    );

    expect(calls[0]?.[0]).toBe('/api/studies?page=1&pageSize=10');
    expect(calls[1]?.[0]).toBe('/api/studies?status=InReview&modality=OT&page=1&pageSize=10');
    expect(calls[2]?.[0]).toBe(
      '/api/studies?ownerId=reviewer-a&search=Study+1&order=desc&page=3&pageSize=25',
    );
  });

  it('reads the page from the body and the total from the header', async () => {
    const { api } = apiReturning(
      () =>
        new Response(JSON.stringify([{ id: 's1' }, { id: 's2' }]), {
          headers: { 'Content-Type': 'application/json', 'X-Total-Count': '57' },
        }),
    );
    const page = await api.listStudies(NO_FILTERS, FIRST_PAGE);
    expect(page.studies.map((study) => study.id)).toEqual(['s1', 's2']);
    expect(page.total).toBe(57);
  });

  it('reads the all-pages status breakdown from its header', async () => {
    const { api } = apiReturning(
      () =>
        new Response(JSON.stringify([{ id: 's1', status: 'Unassigned' }]), {
          headers: {
            'X-Total-Count': '100',
            'X-Status-Counts': '{"Unassigned":40,"InReview":39,"Completed":21}',
          },
        }),
    );
    const page = await api.listStudies(NO_FILTERS, FIRST_PAGE);
    expect(page.statusCounts).toEqual({ Unassigned: 40, InReview: 39, Completed: 21 });
  });

  it.each([
    ['is missing', undefined],
    ['is not JSON', 'nonsense'],
  ])('counts the page itself when the status header %s', async (_name, header) => {
    const { api } = apiReturning(
      () =>
        new Response(
          JSON.stringify([
            { id: 's1', status: 'Unassigned' },
            { id: 's2', status: 'Completed' },
            { id: 's3', status: 'Completed' },
          ]),
          { headers: header === undefined ? {} : { 'X-Status-Counts': header } },
        ),
    );
    const page = await api.listStudies(NO_FILTERS, FIRST_PAGE);
    expect(page.statusCounts).toEqual({ Unassigned: 1, InReview: 0, Completed: 2 });
  });

  it('falls back to the page length when the total header is missing', async () => {
    const { api } = apiReturning(() => json([{ id: 's1' }]));
    expect((await api.listStudies(NO_FILTERS, FIRST_PAGE)).total).toBe(1);
  });

  it('encodes the study id in the path', async () => {
    const { api, calls } = apiReturning(() => json({}));
    await api.getStudy('a/b c');
    expect(calls[0]?.[0]).toBe('/api/studies/a%2Fb%20c');
  });

  it('posts mutations as JSON', async () => {
    const { api, calls } = apiReturning(() => json({}));
    await api.complete('s1', { reviewerId: 'reviewer-a', expectedVersion: 2, reviewNote: 'ok' });

    const init = calls[0]?.[1];
    expect(calls[0]?.[0]).toBe('/api/studies/s1/complete');
    expect(init?.method).toBe('POST');
    expect(typeof init?.body).toBe('string');
    expect(JSON.parse(init?.body as string)).toEqual({
      reviewerId: 'reviewer-a',
      expectedVersion: 2,
      reviewNote: 'ok',
    });
  });

  it('maps a 412 body to an ApiError carrying the current record', async () => {
    const current = { id: 's1', version: 3 };
    const { api } = apiReturning(() =>
      json({ error: { code: 'STALE_VERSION', message: 'changed', current } }, 412),
    );

    const error = await api
      .claim('s1', { reviewerId: 'reviewer-a', expectedVersion: 1 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 412, code: 'STALE_VERSION', message: 'changed', current });
  });

  it('falls back to a generic error when the body is not JSON', async () => {
    const { api } = apiReturning(() => new Response('<html>', { status: 502 }));
    const error = await api.getStudy('s1').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 502, code: 'UNKNOWN' });
  });

  it('turns a transport failure into a NetworkError', async () => {
    const api = new HttpStudyApi('', () => Promise.reject(new TypeError('fetch failed')));
    await expect(api.listReviewers()).rejects.toBeInstanceOf(NetworkError);
  });

  it('lets an abort pass through untouched so callers can ignore it', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const api = new HttpStudyApi('', () => Promise.reject(abort));
    await expect(api.listReviewers()).rejects.toBe(abort);
  });

  it('returns the study file as a blob', async () => {
    const { api, calls } = apiReturning(() => new Response(new Uint8Array([1, 2, 3])));
    const blob = await api.getStudyFile('s1');
    expect(blob.size).toBe(3);
    expect(calls[0]?.[0]).toBe('/api/studies/s1/file');
  });
});
