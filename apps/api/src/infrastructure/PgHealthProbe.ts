import type { Pool } from 'pg';
import type { HealthProbe } from '../domain/ports';

export class PgHealthProbe implements HealthProbe {
  constructor(private readonly pool: Pool) {}

  async check(): Promise<void> {
    await this.pool.query('SELECT 1');
  }
}
