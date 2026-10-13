import { loadConfig } from './config';
import { buildContainer } from './container';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig();
const { app, pool, logger } = buildContainer(config);

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, 'API listening');
});

let shuttingDown = false;

/** Stops accepting connections, lets in-flight requests finish, then closes the pool. */
function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  // If a connection never closes, exit anyway instead of hanging forever.
  const forceExit = setTimeout(() => {
    logger.error('shutdown timed out; forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(() => {
    void pool.end().finally(() => {
      process.exit(0);
    });
  });
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('unhandledRejection', (reason) => {
  logger.error({ name: reason instanceof Error ? reason.name : 'unknown' }, 'unhandled rejection');
});
