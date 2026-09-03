/**
 * Pure TypeScript helpers under `web/src/lib`.
 *
 * `web/` had no test runner at all, which is why its only shared logic — the
 * money and date formatters every table renders through — was unverified.
 * This is deliberately NOT a component-test setup: node environment, no
 * jsdom, no testing-library, no new dependencies. It runs the pure functions
 * and nothing else. Reach for a proper renderer the day a component actually
 * needs one.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  displayName: 'web',
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: 'web/src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  testEnvironment: 'node',
  clearMocks: true,
};
