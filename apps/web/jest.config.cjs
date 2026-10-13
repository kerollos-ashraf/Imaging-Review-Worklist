/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  // Five small suites: more workers only add start-up cost, and on Windows a
  // surplus jsdom worker can be slow enough to exit that Jest force-kills it.
  // `--detectOpenHandles` reports no leaked handles.
  maxWorkers: 2,
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.tsx', '**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  // The files excluded below need a real browser with WebGL. They are covered
  // by the Playwright suite (e2e/), which drives the real Cornerstone viewer.
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/testing/**',
    '!src/viewer/CornerstoneRenderer.ts',
    '!src/viewer/cornerstoneInit.ts',
    '!src/viewer/imageMetadata.ts',
    '!src/viewer/DicomViewer.tsx',
    '!src/viewer/ViewerPanel.tsx',
  ],
  coverageThreshold: {
    global: { statements: 80, branches: 60, functions: 75, lines: 80 },
  },
};
