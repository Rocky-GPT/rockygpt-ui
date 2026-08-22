import { brainUrl } from '@/lib/brain-api';
import { DATA_URL } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks = await Promise.allSettled([
    fetch(`${brainUrl()}/health`, { signal: AbortSignal.timeout(3_000), cache: 'no-store' }),
    fetch(`${DATA_URL}/readiness`, { signal: AbortSignal.timeout(3_000), cache: 'no-store' }),
  ]);
  const failing: string[] = [];
  if (checks[0].status === 'rejected' || !checks[0].value.ok) failing.push('brain');
  if (checks[1].status === 'rejected' || !checks[1].value.ok) failing.push('data');
  return Response.json(
    {
      status: failing.length ? 'unready' : 'ready',
      ...(failing.length ? { failing } : {}),
      timestamp: new Date().toISOString(),
    },
    { status: failing.length ? 503 : 200 }
  );
}
