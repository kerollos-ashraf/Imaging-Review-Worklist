import type { Study } from '../domain/study';

export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;

  /** Extra data that is safe to return to the client (for example the current record). */
  get details(): Record<string, unknown> | undefined {
    return undefined;
  }
}

export class ValidationError extends AppError {
  readonly status = 400;
  readonly code = 'INVALID_INPUT';
}

export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = 'NOT_FOUND';
}

export class StaleVersionError extends AppError {
  readonly status = 412;
  readonly code = 'STALE_VERSION';

  constructor(readonly current: Study) {
    super('The study was changed by someone else. Review the current state and try again.');
  }

  override get details(): Record<string, unknown> {
    return { current: this.current };
  }
}

export class InvalidStateError extends AppError {
  readonly status = 409;
  readonly code = 'INVALID_STATE';
}

export class NotOwnerError extends AppError {
  readonly status = 403;
  readonly code = 'NOT_OWNER';
}
