import type { NextConfig } from 'next';

// Next dev's Fast Refresh ships an `eval`-based webpack bundle; production
// builds don't need it, so only relax the CSP for it in dev.
const isProd = process.env.NODE_ENV === 'production';
const scriptSrc = isProd
  ? "'self' 'unsafe-inline'"
  : "'self' 'unsafe-inline' 'unsafe-eval'";

// Same origin resolution as src/lib/api.ts, so connect-src covers exactly the
// API this build actually talks to instead of a blanket https://*.
const apiOrigin = (() => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002/v1';
  try {
    return new URL(apiUrl).origin;
  } catch {
    return 'http://localhost:3002';
  }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin}`,
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The API workspace at the repo root has its own lockfile; pin tracing here.
  outputFileTracingRoot: __dirname,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
