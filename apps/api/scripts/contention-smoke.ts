import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import path from 'node:path';
import { loadConfig } from '../src/config';
import { createPool } from '../src/infrastructure/db';
import { runMigrations } from '../src/infrastructure/migrate';
import { seedDatabase } from '../src/seedData';

/**
 * Two separate API processes, one shared Postgres, one contested claim per
 * round. Correctness must come from the database, not from either process.
 */

interface StudyBody {
  ownerId: string | null;
  version: number;
  status: string;
}

interface Outcome {
  status: number;
  body: { error?: { code?: string; current?: StudyBody } };
}

interface RoundResult {
  winner: string;
  loser: Outcome;
}

const API_DIR = path.resolve(__dirname, '..');
const PORTS: [number, number] = [
  Number(process.env.CONTENTION_PORT_A ?? 4101),
  Number(process.env.CONTENTION_PORT_B ?? 4102),
];
const ROUNDS = Number(process.env.CONTENTION_ROUNDS ?? 20);
const REVIEWERS: [string, string] = ['reviewer-a', 'reviewer-b'];

function baseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function resolveDatabaseUrl(): string {
  // Loading config also loads the root .env file.
  loadConfig({ DATABASE_URL: 'unused' });
  const url = process.env.CONTENTION_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('Set TEST_DATABASE_URL (or CONTENTION_DATABASE_URL) to run the smoke test');
  }
  return url;
}

async function prepareDatabase(databaseUrl: string): Promise<void> {
  await runMigrations(databaseUrl);
  const pool = createPool(databaseUrl);
  try {
    await pool.query('TRUNCATE studies, reviewers');
    await seedDatabase(pool);
    for (let round = 0; round < ROUNDS; round += 1) {
      await pool.query(
        `INSERT INTO studies (id, modality, created_at, dicom_file_ref)
         VALUES ($1, 'OT', now(), 'gradient.dcm')`,
        [`contention-${round}`],
      );
    }
  } finally {
    await pool.end();
  }
}

function startApi(port: number, databaseUrl: string): ChildProcess {
  const tsxCli = require.resolve('tsx/cli');
  return spawn(process.execPath, [tsxCli, path.join(API_DIR, 'src/server.ts')], {
    cwd: API_DIR,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, DATABASE_URL: databaseUrl, PORT: String(port), LOG_LEVEL: 'silent' },
  });
}

async function waitForHealth(port: number, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`API on port ${port} exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl(port)}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Not listening yet; retry until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`API on port ${port} did not become healthy in time`);
}

async function claim(
  port: number,
  studyId: string,
  reviewerId: string,
  expectedVersion: number,
): Promise<Outcome> {
  const response = await fetch(`${baseUrl(port)}/api/studies/${studyId}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewerId, expectedVersion }),
  });
  return { status: response.status, body: (await response.json()) as Outcome['body'] };
}

async function readStudy(port: number, studyId: string): Promise<StudyBody> {
  const response = await fetch(`${baseUrl(port)}/api/studies/${studyId}`);
  return (await response.json()) as StudyBody;
}

function judge(
  studyId: string,
  outcomes: [Outcome, Outcome],
  reviewers: [string, string],
): RoundResult {
  const [outcomeA, outcomeB] = outcomes;
  const statuses = [outcomeA.status, outcomeB.status].sort();
  assert(
    statuses[0] === 200 && statuses[1] === 412,
    `${studyId}: expected one 200 and one 412, got ${statuses.join(' and ')}`,
  );
  const aWon = outcomeA.status === 200;
  return {
    winner: aWon ? reviewers[0] : reviewers[1],
    loser: aWon ? outcomeB : outcomeA,
  };
}

function assertLoserCarriesWinner(studyId: string, result: RoundResult): void {
  const error = result.loser.body.error;
  assert(error?.code === 'STALE_VERSION', `${studyId}: loser was not STALE_VERSION`);
  assert(
    error?.current?.ownerId === result.winner && error.current.version === 2,
    `${studyId}: 412 did not carry the winner's record`,
  );
}

async function assertSameEverywhere(studyId: string, winner: string): Promise<void> {
  for (const port of PORTS) {
    const after = await readStudy(port, studyId);
    assert(after.ownerId === winner, `${studyId}: owner differs on port ${port}`);
    assert(after.version === 2, `${studyId}: version is ${after.version} on port ${port}`);
  }
}

async function runRound(round: number, wins: Record<string, number>): Promise<void> {
  const studyId = `contention-${round}`;
  const before = await readStudy(PORTS[0], studyId);
  assert(before.status === 'Unassigned' && before.version === 1, `${studyId} is not fresh`);

  // Alternate which reviewer hits which process so neither side is favoured.
  const reviewers: [string, string] =
    round % 2 === 0 ? [REVIEWERS[0], REVIEWERS[1]] : [REVIEWERS[1], REVIEWERS[0]];
  const outcomes = await Promise.all([
    claim(PORTS[0], studyId, reviewers[0], before.version),
    claim(PORTS[1], studyId, reviewers[1], before.version),
  ]);

  const result = judge(studyId, [outcomes[0], outcomes[1]], reviewers);
  assertLoserCarriesWinner(studyId, result);
  await assertSameEverywhere(studyId, result.winner);
  wins[result.winner] = (wins[result.winner] ?? 0) + 1;
}

function waitForExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => {
      resolve();
    });
  });
}

/**
 * Kills one API process outright and starts a new one on the same port, then
 * checks that every contested study still has the same owner and version.
 */
async function assertSurvivesRestart(
  servers: { port: number; child: ChildProcess }[],
  databaseUrl: string,
): Promise<void> {
  const target = servers[0];
  if (!target) {
    throw new Error('no API process to restart');
  }
  const before: StudyBody[] = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    before.push(await readStudy(target.port, `contention-${round}`));
  }

  target.child.kill();
  await waitForExit(target.child);
  target.child = startApi(target.port, databaseUrl);
  await waitForHealth(target.port, target.child);

  for (let round = 0; round < ROUNDS; round += 1) {
    const after = await readStudy(target.port, `contention-${round}`);
    const expected = before[round];
    assert(
      after.ownerId === expected?.ownerId &&
        after.version === expected.version &&
        after.status === expected.status,
      `contention-${round}: state changed across a process restart`,
    );
  }
}

async function main(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  const servers: { port: number; child: ChildProcess }[] = [];
  const stopAll = (): void => {
    for (const { child } of servers) {
      child.kill();
    }
  };
  process.on('SIGINT', () => {
    stopAll();
    process.exit(130);
  });

  try {
    await prepareDatabase(databaseUrl);
    for (const port of PORTS) {
      servers.push({ port, child: startApi(port, databaseUrl) });
    }
    await Promise.all(servers.map(({ port, child }) => waitForHealth(port, child)));

    const wins: Record<string, number> = {};
    for (let round = 0; round < ROUNDS; round += 1) {
      await runRound(round, wins);
    }
    await assertSurvivesRestart(servers, databaseUrl);
    process.stdout.write(
      `Contention smoke passed: ${ROUNDS} rounds, one winner each, state intact after a process restart. Wins: ${JSON.stringify(wins)}\n`,
    );
  } finally {
    stopAll();
  }
}

main().then(
  () => {
    process.exit(0);
  },
  (error: unknown) => {
    process.stderr.write(
      `Contention smoke FAILED: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    process.exit(1);
  },
);
