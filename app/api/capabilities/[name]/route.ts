/**
 * @module api/capabilities/[name]/route
 * The records one capability returns when nothing narrows it.
 *
 * Proxied to the brain rather than read from the data service directly,
 * because the brain runs the capability's own executor: the same request
 * translation and the same field projection a real turn would get. Reading the
 * underlying endpoint here would show data Rocky cannot actually reach.
 */
import { BRAIN_URL } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  try {
    const response = await fetch(
      `${BRAIN_URL}/v1/capabilities/${encodeURIComponent(name)}/records`,
      { cache: 'no-store' },
    );
    return Response.json(await response.json(), {
      status: response.ok ? 200 : response.status,
    });
  } catch {
    return Response.json({ error: 'The brain is not reachable.' }, { status: 502 });
  }
}
