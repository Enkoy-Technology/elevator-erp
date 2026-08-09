/**
 * Isolated Jest project for document-pdf.pdf-smoke.spec.ts only.
 *
 * puppeteer (22+) ships ESM-only with no CJS build. TypeScript always
 * downlevels a dynamic `import()` to a `require()` call under a CommonJS
 * `module` target (verified directly with `tsc`), so there is no way to
 * reach puppeteer's real ESM entry point from ts-jest's normal CommonJS
 * transform — Jest's own module loader can't parse `export * from ...`
 * syntax the way plain Node's `require(esm)` support can. Jest's
 * experimental native-ESM mode (`useESM` + `extensionsToTreatAsEsm`, run
 * with `NODE_OPTIONS=--experimental-vm-modules`, wired via the root `test`
 * script) preserves the real dynamic import instead, so puppeteer loads for
 * real — which is the point of this one spec: prove the pipeline actually
 * renders through headless Chromium, not that its imports can be mocked
 * away.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  displayName: 'pdf-smoke',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: 'document-pdf\\.pdf-smoke\\.spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.jest-esm.json', useESM: true }],
  },
  testEnvironment: 'node',
  clearMocks: true,
  testTimeout: 30_000,
};
