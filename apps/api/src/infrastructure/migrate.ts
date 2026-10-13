import { spawn } from 'node:child_process';
import path from 'node:path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

/**
 * Applies any pending migrations. Safe to call repeatedly.
 *
 * Runs the node-pg-migrate CLI in a child process, the same entry point as
 * `npm run db:migrate`, so tests and scripts migrate exactly as an operator does.
 */
export function runMigrations(databaseUrl: string): Promise<void> {
  const cli = require.resolve('node-pg-migrate/bin/node-pg-migrate');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'up', '-m', MIGRATIONS_DIR], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Migrations failed (exit code ${code ?? 'unknown'}): ${stderr.trim()}`));
      }
    });
  });
}
