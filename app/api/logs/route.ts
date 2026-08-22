import { proxyBrain } from '@/lib/service-proxy';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') return Response.json({ error: 'not found' }, { status: 404 });
  return proxyBrain(request, `/v1/admin/logs${new URL(request.url).search}`, true);
}
