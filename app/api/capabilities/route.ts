/**
 * @module api/capabilities/route
 * The brain's registry, passed through unchanged.
 *
 * Deliberately a proxy and not a copy. The registry decides what the planner
 * may plan and what can actually run; a second list kept in the UI would be
 * a second thing to keep in step, and the first time it drifted the explorer
 * would be describing lookups Rocky no longer has.
 */
import { BRAIN_URL } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await fetch(`${BRAIN_URL}/v1/capabilities`, { cache: 'no-store' });
    if (!response.ok) {
      return Response.json(
        { error: `The brain answered HTTP ${response.status}.` },
        { status: 502 },
      );
    }
    return Response.json(await response.json());
  } catch {
    return Response.json({ error: 'The brain is not reachable.' }, { status: 502 });
  }
}
