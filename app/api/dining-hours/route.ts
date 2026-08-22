import { proxyData } from '@/lib/service-proxy';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const query = new URL(request.url).search;
  return proxyData(request, `/v1/dining-hours${query}`);
}
