import { proxyBrain } from '@/lib/service-proxy';

export function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') return Response.json({ error: 'not found' }, { status: 404 });
  return proxyBrain(request, '/v1/admin/logs/feedback', true);
}
