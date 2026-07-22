import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The API workspace at the repo root has its own lockfile; pin tracing here.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
