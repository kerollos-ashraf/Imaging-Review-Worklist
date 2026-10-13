import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { AppError } from '../../errors/AppError';

interface BodyParserError {
  type?: unknown;
}

function isMalformedBody(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    ((err as BodyParserError).type === 'entity.parse.failed' ||
      (err as BodyParserError).type === 'entity.too.large')
  );
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  // Express identifies error middleware by its four-argument signature.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: unknown, req, res, _next) => {
    if (err instanceof AppError) {
      res.status(err.status).json({
        error: { code: err.code, message: err.message, ...err.details },
      });
      return;
    }
    if (isMalformedBody(err)) {
      res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: 'Request body is not valid JSON' } });
      return;
    }
    // Server-side only: name, message and stack are enough to debug. The request
    // body and the driver's `detail` field are deliberately left out because they
    // can carry review notes. The client always gets a generic message.
    const error = err instanceof Error ? err : new Error('Non-error value thrown');
    logger.error(
      { method: req.method, path: req.path, name: error.name, stack: error.stack },
      error.message,
    );
    if (res.headersSent) {
      res.end();
      return;
    }
    res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  };
}
