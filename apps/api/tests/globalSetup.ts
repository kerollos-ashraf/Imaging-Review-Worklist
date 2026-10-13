import path from 'node:path';
import dotenv from 'dotenv';
import { runMigrations } from '../src/infrastructure/migrate';

/** Applies migrations to the test database once, before any suite runs. */
export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL is required to run API tests');
  }
  await runMigrations(databaseUrl);
}
