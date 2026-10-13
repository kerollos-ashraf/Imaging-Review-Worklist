import { loadConfig } from '../src/config';
import { createPool } from '../src/infrastructure/db';
import { seedDatabase } from '../src/seedData';

async function main(): Promise<void> {
  const pool = createPool(loadConfig().databaseUrl);
  try {
    await seedDatabase(pool);
    process.stdout.write('Seed complete (existing rows were left untouched).\n');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : 'unknown'}\n`);
  process.exit(1);
});
