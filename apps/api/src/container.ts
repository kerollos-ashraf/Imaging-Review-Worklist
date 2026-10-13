import type { Express } from 'express';
import pino from 'pino';
import type { Logger } from 'pino';
import type { Pool } from 'pg';
import { createApp } from './app';
import type { AppConfig } from './config';
import { createPool } from './infrastructure/db';
import { PgHealthProbe } from './infrastructure/PgHealthProbe';
import { PgReviewerDirectory } from './infrastructure/PgReviewerDirectory';
import { PgStudyFileResolver } from './infrastructure/PgStudyFileResolver';
import { PgStudyRepository } from './infrastructure/PgStudyRepository';
import { StudyService } from './services/StudyService';

export interface Container {
  app: Express;
  pool: Pool;
  logger: Logger;
}

/** Composition root: the only place that instantiates concrete classes. */
export function buildContainer(config: AppConfig, pool?: Pool): Container {
  const logger = pino({ level: config.logLevel });
  const resolvedPool =
    pool ??
    createPool(config.databaseUrl, (error) => {
      logger.error({ name: error.name }, 'idle database client error');
    });
  const repository = new PgStudyRepository(resolvedPool);
  const reviewers = new PgReviewerDirectory(resolvedPool);
  const studyService = new StudyService(
    repository,
    repository,
    reviewers,
    new PgStudyFileResolver(resolvedPool, config.fixturesDir),
  );
  const app = createApp({
    studyService,
    reviewers,
    health: new PgHealthProbe(resolvedPool),
    logger,
    webOrigin: config.webOrigin,
  });
  return { app, pool: resolvedPool, logger };
}
