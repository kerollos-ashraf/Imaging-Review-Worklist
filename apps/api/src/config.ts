import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const REPO_ROOT = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.join(REPO_ROOT, '.env'), quiet: true });

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  databaseUrl: string;
  port: number;
  fixturesDir: string;
  webOrigin: string;
  logLevel: LogLevel;
}

const envSchema = z.object({
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required' })
    .min(1, 'DATABASE_URL is required'),
  PORT: z.coerce
    .number({ invalid_type_error: 'PORT must be a number' })
    .int('PORT must be an integer')
    .min(0, 'PORT must be between 0 and 65535')
    .max(65535, 'PORT must be between 0 and 65535')
    .default(4000),
  FIXTURES_DIR: z.string().min(1).default('samples'),
  WEB_ORIGIN: z.string().url('WEB_ORIGIN must be a URL').default('http://localhost:5173'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

/** Validates the environment once at startup so a bad value fails fast and clearly. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  return {
    databaseUrl: parsed.data.DATABASE_URL,
    port: parsed.data.PORT,
    fixturesDir: path.resolve(REPO_ROOT, parsed.data.FIXTURES_DIR),
    webOrigin: parsed.data.WEB_ORIGIN,
    logLevel: parsed.data.LOG_LEVEL,
  };
}
