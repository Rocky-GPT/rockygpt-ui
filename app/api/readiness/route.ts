/**
 * @module app/api/readiness/route
 * Whether this deployment can actually serve.
 *
 * Two things stop it, and they are not the same thing: a service that is down,
 * and a service this deployment was never told the address of. Reporting both
 * as "data is failing" is what let an unset `DATA_URL` look like an outage —
 * so `misconfigured` names the one a deploy fixes and a restart does not.
 *
 * The campus data service is no longer among them. Every production route now
 * reads campus data from the brain, so an unreachable data service can no
 * longer stop this deployment serving and must not hold readiness down. Only
 * `/api/dev/*` still calls it, and those 404 outside development. The shape
 * below keeps room for more than one service because the distinction above is
 * the point, not the count.
 */

import { brainAddress } from '@/lib/services';

export const dynamic = 'force-dynamic';

async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/readiness`, {
      signal: AbortSignal.timeout(3_000),
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const services = { brain: brainAddress() };
  const misconfigured = Object.entries(services)
    .filter(([, address]) => address.url === null)
    .map(([name, address]) => ({ service: name, problem: address.problem }));

  const checked = await Promise.all(
    Object.entries(services).map(async ([name, address]) =>
      address.url === null ? [name, false] : [name, await reachable(address.url)]
    )
  );
  const failing = checked
    .filter(([, ok]) => !ok)
    .map(([name]) => name as string)
    .filter((name) => !misconfigured.some((entry) => entry.service === name));

  const unready = failing.length > 0 || misconfigured.length > 0;
  return Response.json(
    {
      status: unready ? 'unready' : 'ready',
      ...(failing.length ? { failing } : {}),
      ...(misconfigured.length ? { misconfigured } : {}),
      timestamp: new Date().toISOString(),
    },
    { status: unready ? 503 : 200 }
  );
}
