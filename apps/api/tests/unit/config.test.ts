import { loadConfig } from '../../src/config';

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://localhost/db' });
    expect(config).toMatchObject({
      port: 4000,
      webOrigin: 'http://localhost:5173',
      logLevel: 'info',
    });
    expect(config.fixturesDir.endsWith('samples')).toBe(true);
  });

  it('fails fast when DATABASE_URL is missing', () => {
    expect(() => loadConfig({})).toThrow('DATABASE_URL is required');
  });

  it.each(['abc', '70000', '-1', '1.5'])('rejects PORT=%s', (port) => {
    expect(() => loadConfig({ DATABASE_URL: 'x', PORT: port })).toThrow('Invalid configuration');
  });

  it('rejects an unknown log level', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x', LOG_LEVEL: 'loud' })).toThrow(
      'Invalid configuration',
    );
  });
});
