/**
 * Two projects: `unit` (the whole suite, CommonJS via ts-jest — unchanged
 * behavior) and `pdf-smoke` (one real-Chromium spec that needs native ESM
 * to load puppeteer; see jest.pdf-smoke.config.js). `jest`/`pnpm test`
 * runs both; a path argument (`pnpm test foo.spec.ts`) still filters
 * across both projects the normal Jest way.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  projects: ['<rootDir>/jest.unit.config.js', '<rootDir>/jest.pdf-smoke.config.js'],
};
