import path from 'node:path';
import dotenv from 'dotenv';
import type { Express } from 'express';
import type { Pool } from 'pg';
import { buildContainer } from '../src/container';
import { createPool } from '../src/infrastructure/db';
import { seedDatabase } from '../src/seedData';

dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

export interface TestContext {
  app: Express;
  pool: Pool;
}

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is required to run API tests');
  }
  return url;
}

/** Builds a fresh application with its own pool, as a restarted process would. */
export function buildContainerForTest(): TestContext {
  const pool = createPool(testDatabaseUrl());
  const { app } = buildContainer(
    {
      databaseUrl: testDatabaseUrl(),
      port: 0,
      fixturesDir: path.resolve(__dirname, '../../../samples'),
      webOrigin: 'http://localhost:5173',
      logLevel: 'silent',
    },
    pool,
  );
  return { app, pool };
}

export function createTestContext(): TestContext {
  return buildContainerForTest();
}

/** Restores the known seed state so every test starts from the same rows. */
export async function resetData(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE studies, reviewers');
  await seedDatabase(pool);
}
