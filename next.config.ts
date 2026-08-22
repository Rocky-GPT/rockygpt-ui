import type { NextConfig } from 'next';
import { buildSecurityHeaders } from './lib/security-headers';

/**
 * Brain and campus data arrive over HTTP, so Next needs no sibling tracing,
 * transpilation, or database-driver exceptions.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
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
