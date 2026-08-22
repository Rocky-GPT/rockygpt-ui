import { proxyData } from '@/lib/service-proxy';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') return Response.json({ error: 'not found' }, { status: 404 });
  return proxyData(request, `/v1/dev/data-explorer${new URL(request.url).search}`);
}
