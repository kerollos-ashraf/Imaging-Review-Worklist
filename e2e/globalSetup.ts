import path from 'node:path';
import dotenv from 'dotenv';
import { createPool } from '../apps/api/src/infrastructure/db';
import { runMigrations } from '../apps/api/src/infrastructure/migrate';
import { seedDatabase } from '../apps/api/src/seedData';

/** Puts the test database into the known seed state before the browser runs. */
export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is required for the browser tests');
  }
  await runMigrations(url);
  const pool = createPool(url);
  try {
    await pool.query('TRUNCATE studies, reviewers');
    await seedDatabase(pool);
  } finally {
    await pool.end();
  }
}
