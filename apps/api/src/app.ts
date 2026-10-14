import cors from 'cors';
import express from 'express';
import type { Express, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { StudyController } from './http/controllers/StudyController';
import { createErrorHandler, notFoundHandler } from './http/middleware/errorHandler';
import type { HealthProbe, ReviewerDirectory } from './domain/ports';
import type { StudyService } from './services/StudyService';

export interface AppDependencies {
  studyService: StudyService;
  reviewers: ReviewerDirectory;
  health: HealthProbe;
  logger: Logger;
  webOrigin: string;
}

/** Baseline response hardening without pulling in a dependency for three headers. */
const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
};

/** Request log: method, path and status only. Never bodies, queries or notes. */
function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    res.on('finish', () => {
      logger.info({ method: req.method, path: req.path, status: res.statusCode });
    });
    next();
  };
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  const controller = new StudyController(deps.studyService, deps.reviewers);

  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(
    cors({
      origin: deps.webOrigin,
      // Lets a browser on another origin read the paging headers.
      exposedHeaders: ['X-Total-Count', 'X-Status-Counts', 'X-Page', 'X-Page-Size'],
    }),
  );
  app.use(express.json({ limit: '16kb' }));
  app.use(requestLogger(deps.logger));

  app.get('/health', async (_req, res) => {
    await deps.health.check();
    res.json({ status: 'ok' });
  });
  app.get('/api/reviewers', controller.listReviewers);
  app.get('/api/studies', controller.list);
  app.get('/api/studies/:id', controller.get);
  app.get('/api/studies/:id/file', controller.file);
  app.post('/api/studies/:id/claim', controller.claim);
  app.post('/api/studies/:id/complete', controller.complete);

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));
  return app;
}
