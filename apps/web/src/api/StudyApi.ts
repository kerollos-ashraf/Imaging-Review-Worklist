import type {
  CompleteInput,
  MutationInput,
  PageRequest,
  Reviewer,
  StatusCounts,
  Study,
  StudyFilters,
  StudyPage,
} from './types';
import { countByStatus } from './types';

/** Transport-independent contract so components and tests can inject a fake. */
export interface StudyApi {
  listReviewers(signal?: AbortSignal): Promise<Reviewer[]>;
  listStudies(filters: StudyFilters, paging: PageRequest, signal?: AbortSignal): Promise<StudyPage>;
  getStudy(id: string, signal?: AbortSignal): Promise<Study>;
  /** Raw bytes of the study image; decoding is the viewer's job. */
  getStudyFile(id: string, signal?: AbortSignal): Promise<Blob>;
  claim(id: string, input: MutationInput): Promise<Study>;
  complete(id: string, input: CompleteInput): Promise<Study>;
}

/** The server answered with an error body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly current?: Study,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The request never produced a response (offline, aborted by the network, etc). */
export class NetworkError extends Error {
  constructor(message = 'Network error. Check your connection and try again.') {
    super(message);
    this.name = 'NetworkError';
  }
}

function withSignal(signal: AbortSignal | undefined): RequestInit {
  return signal === undefined ? {} : { signal };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; current?: Study };
}

/** Falls back to counting the page itself if the header is missing or unreadable. */
function parseStatusCounts(header: string | null, studies: Study[]): StatusCounts {
  const fallback = countByStatus(studies);
  if (header === null) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(header) as Partial<Record<string, unknown>>;
    const read = (key: keyof StatusCounts): number =>
      typeof parsed[key] === 'number' ? parsed[key] : fallback[key];
    return {
      Unassigned: read('Unassigned'),
      InReview: read('InReview'),
      Completed: read('Completed'),
    };
  } catch {
    return fallback;
  }
}

export class HttpStudyApi implements StudyApi {
  constructor(
    private readonly baseUrl = '',
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  listReviewers(signal?: AbortSignal): Promise<Reviewer[]> {
    return this.request<Reviewer[]>('/api/reviewers', withSignal(signal));
  }

  async listStudies(
    filters: StudyFilters,
    paging: PageRequest,
    signal?: AbortSignal,
  ): Promise<StudyPage> {
    const params = new URLSearchParams();
    if (filters.status !== '') {
      params.set('status', filters.status);
    }
    const optional: [string, string][] = [
      ['modality', filters.modality.trim()],
      ['ownerId', filters.ownerId],
      ['search', filters.search.trim()],
      // Ascending is the API default, so it is left out of the URL.
      ['order', filters.order === 'desc' ? 'desc' : ''],
    ];
    for (const [key, value] of optional) {
      if (value !== '') {
        params.set(key, value);
      }
    }
    params.set('page', String(paging.page));
    params.set('pageSize', String(paging.pageSize));
    const response = await this.send(`/api/studies?${params.toString()}`, withSignal(signal));
    const studies = (await response.json()) as Study[];
    // The body is the page; the size of the whole result set is in a header.
    const total = Number(response.headers.get('X-Total-Count'));
    return {
      studies,
      total: Number.isFinite(total) && total > 0 ? total : studies.length,
      statusCounts: parseStatusCounts(response.headers.get('X-Status-Counts'), studies),
    };
  }

  getStudy(id: string, signal?: AbortSignal): Promise<Study> {
    return this.request<Study>(`/api/studies/${encodeURIComponent(id)}`, withSignal(signal));
  }

  async getStudyFile(id: string, signal?: AbortSignal): Promise<Blob> {
    const response = await this.send(`/api/studies/${encodeURIComponent(id)}/file`, withSignal(signal));
    return response.blob();
  }

  claim(id: string, input: MutationInput): Promise<Study> {
    return this.post<Study>(`/api/studies/${encodeURIComponent(id)}/claim`, input);
  }

  complete(id: string, input: CompleteInput): Promise<Study> {
    return this.post<Study>(`/api/studies/${encodeURIComponent(id)}/complete`, input);
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.send(path, init);
    return (await response.json()) as T;
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, init);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      throw new NetworkError();
    }
    if (!response.ok) {
      throw await this.toApiError(response);
    }
    return response;
  }

  private async toApiError(response: Response): Promise<ApiError> {
    let envelope: ErrorEnvelope = {};
    try {
      envelope = (await response.json()) as ErrorEnvelope;
    } catch {
      // Non-JSON error body: fall back to the generic message below.
    }
    const info = envelope.error;
    return new ApiError(
      response.status,
      info?.code ?? 'UNKNOWN',
      info?.message ?? `Request failed with status ${response.status}`,
      info?.current,
    );
  }
}
