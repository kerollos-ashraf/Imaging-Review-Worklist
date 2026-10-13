import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from '@playwright/test';

dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true });

const API_PORT = 4100;
const WEB_PORT = 5174;
const testDatabaseUrl = process.env['TEST_DATABASE_URL'] ?? '';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // One worker: the specs share one database and one pair of servers.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  globalSetup: './e2e/globalSetup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 1280, height: 900 },
    launchOptions: {
      // Software GL so the real WebGL viewer also runs on machines without a GPU.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: [
    {
      command: 'npm run dev -w apps/api',
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { DATABASE_URL: testDatabaseUrl, PORT: String(API_PORT), LOG_LEVEL: 'warn' },
    },
    {
      command: 'npm run dev -w apps/web',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        WEB_PORT: String(WEB_PORT),
        API_URL: `http://localhost:${API_PORT}`,
        VIEWER_DEBUG: '1',
      },
    },
  ],
});
