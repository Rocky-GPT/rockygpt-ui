import type { NextConfig } from 'next';
import { buildSecurityHeaders } from './lib/security-headers';

/**
 * The brain and data packages arrive as ordinary dependencies, so nothing here
 * needs to teach Next about sibling directories. An earlier arrangement had
 * them as folders next to this app and pointed Turbopack and file tracing one
 * level up to find them; with a tracing root outside the project, the deployed
 * bundle omitted node_modules and every database-backed route failed at
 * runtime on a module that resolved perfectly well during the build.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The packages ship compiled JavaScript, so there is nothing to transpile.
  serverExternalPackages: ['pg'],
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
