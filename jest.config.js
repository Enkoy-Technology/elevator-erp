/**
 * Three projects: `unit` (the whole API suite, CommonJS via ts-jest),
 * `web` (the pure helpers under web/src/lib, which had no runner at all
 * until the shared date formatter needed one), and `pdf-smoke` (one
 * real-Chromium spec that needs native ESM to load puppeteer; see
 * jest.pdf-smoke.config.js). `jest`/`pnpm test` runs all three; a path argument (`pnpm test foo.spec.ts`) still filters
 * across both projects the normal Jest way.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  projects: [
    '<rootDir>/jest.unit.config.js',
    '<rootDir>/jest.web.config.js',
    '<rootDir>/jest.pdf-smoke.config.js',
  ],
};
