/** @type {import('jest').Config} */
module.exports = {
  displayName: 'unit',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // Runs under jest.pdf-smoke.config.js instead: it needs real Chromium and
  // a dynamic `import()` of puppeteer, which is pure ESM (no CJS build as of
  // puppeteer 22+) and can't be `require`d through ts-jest's CommonJS
  // transform the way every other spec in this project can.
  testPathIgnorePatterns: ['/node_modules/', 'document-pdf\\.pdf-smoke\\.spec\\.ts$'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!database/migrations/**'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  clearMocks: true,
};
