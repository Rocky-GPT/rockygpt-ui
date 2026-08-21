import path from 'node:path';
import type { NextConfig } from 'next';
import { buildSecurityHeaders } from './lib/security-headers';

/**
 * The brain and data packages are sibling checkouts rather than files inside
 * this app, so Turbopack is told the workspace starts one level up. Without
 * it, resolution stops at this directory and every @rockygpt/* import fails.
 * The same setting is correct whether the siblings are workspace folders or
 * separate repositories.
 */
const workspaceRoot = path.resolve(process.cwd(), '..');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
  // The packages ship TypeScript sources rather than a build artifact, so
  // Next compiles them alongside the app.
  transpilePackages: ['@rockygpt/brain', '@rockygpt/data'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
