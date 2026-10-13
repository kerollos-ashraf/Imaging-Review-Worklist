import type {
  CompleteInput,
  MutationInput,
  Reviewer,
  Study,
  StudyFilters,
} from './types';

/** Transport-independent contract so components and tests can inject a fake. */
export interface StudyApi {
  listReviewers(signal?: AbortSignal): Promise<Reviewer[]>;
  listStudies(filters: StudyFilters, signal?: AbortSignal): Promise<Study[]>;
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

export class HttpStudyApi implements StudyApi {
  constructor(
    private readonly baseUrl = '',
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  listReviewers(signal?: AbortSignal): Promise<Reviewer[]> {
    return this.request<Reviewer[]>('/api/reviewers', withSignal(signal));
  }

  listStudies(filters: StudyFilters, signal?: AbortSignal): Promise<Study[]> {
    const params = new URLSearchParams();
    if (filters.status !== '') {
      params.set('status', filters.status);
    }
    const modality = filters.modality.trim();
    if (modality !== '') {
      params.set('modality', modality);
    }
    const query = params.toString();
    return this.request<Study[]>(`/api/studies${query === '' ? '' : `?${query}`}`, withSignal(signal));
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
