import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig } from '../src/config';
import { createPool } from '../src/infrastructure/db';
import { seedDatabase } from '../src/seedData';

/** Destructive: drops every table, re-runs migrations and re-seeds. Manual use only. */
async function main(): Promise<void> {
  const { databaseUrl } = loadConfig();
  const pool = createPool(databaseUrl);
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  } finally {
    await pool.end();
  }

  const migrate = spawnSync('npm', ['run', 'migrate'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (migrate.status !== 0) {
    throw new Error('migrate failed');
  }

  const seedPool = createPool(databaseUrl);
  try {
    await seedDatabase(seedPool);
  } finally {
    await seedPool.end();
  }
  process.stdout.write('Database reset to seed state.\n');
}

main().catch((error: unknown) => {
  process.stderr.write(`Reset failed: ${error instanceof Error ? error.message : 'unknown'}\n`);
  process.exit(1);
});
