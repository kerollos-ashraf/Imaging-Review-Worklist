/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  globalSetup: '<rootDir>/tests/globalSetup.ts',
  testTimeout: 20000,
  // server.ts is the process entry point (exercised by the contention smoke
  // test, which spawns it); seedData.ts is static fixture data.
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/seedData.ts'],
  coverageThreshold: {
    global: { statements: 90, branches: 75, functions: 90, lines: 90 },
  },
};
