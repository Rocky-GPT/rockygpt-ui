import { proxyData } from '@/lib/service-proxy';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return proxyData(request, `/v1/menu/browse${new URL(request.url).search}`);
}
