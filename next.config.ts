import os from 'node:os';
import type { NextConfig } from 'next';
import { buildSecurityHeaders } from './lib/security-headers';

/**
 * The addresses this machine answers to on the local network.
 *
 * `next dev` serves any host but blocks cross-origin requests for its own dev
 * assets, and the origin it judges is the one the page was loaded from. Open
 * the app on a phone at `http://192.168.1.14:3000` and the html arrives while
 * every `/_next/static/chunk` is refused with a 403 — which does not look like
 * a permission error, it looks like a blank page, because nothing hydrates and
 * the entrance animations leave the whole page at `opacity-0`.
 *
 * Read from the interfaces rather than written down, so it survives the
 * router handing this machine a different address tomorrow. Only this
 * machine's own addresses: a subnet wildcard would re-open the dev server to
 * every other device on the network, which is the thing the block is for.
 * Development only — the block does not run in a production build.
 */
function localNetworkHosts(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .flatMap((details) =>
      details && !details.internal && details.family === 'IPv4' ? details.address : []
    );
}

/**
 * Brain and campus data arrive over HTTP, so Next needs no sibling tracing,
 * transpilation, or database-driver exceptions.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: localNetworkHosts(),
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
