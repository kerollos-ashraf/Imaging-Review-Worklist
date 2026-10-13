import { Pool } from 'pg';

export type PoolErrorListener = (error: Error) => void;

/**
 * Bounded timeouts keep a slow or unreachable database from hanging requests.
 * The error listener matters: without one, an error on an idle client (for
 * example the server restarting) is an unhandled event that kills the process.
 */
export function createPool(connectionString: string, onError?: PoolErrorListener): Pool {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
  });
  pool.on('error', (error) => {
    onError?.(error);
  });
  return pool;
}
