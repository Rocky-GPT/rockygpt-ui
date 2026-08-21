import { getRepositoryV2 } from '@rockygpt/data/data-v2/repositories/index';

export const dynamic = 'force-dynamic';

/**
 * Readiness probe (PROB-016): can this instance actually serve chat? It
 * checks the required dependencies — repository/database with an active
 * dataset, and the rate limiter — within a bounded budget. Liveness stays on
 * /api/health. Responses expose failure categories only, never connection or
 * error details.
 */

const PROBE_TIMEOUT_MS = 3_000;

function bounded<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('probe timeout')), PROBE_TIMEOUT_MS)
    ),
  ]);
}

export async function GET() {
  const failing: string[] = [];

  try {
    await bounded(getRepositoryV2().getDatasetContext());
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    failing.push(/no active dataset/i.test(message) ? 'dataset' : 'database');
  }

  if (failing.length) {
    return Response.json(
      { status: 'unready', failing, timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
  return Response.json({ status: 'ready', timestamp: new Date().toISOString() });
}
