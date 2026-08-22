import { proxyData } from '@/lib/service-proxy';

export function GET(request: Request) {
  return proxyData(request, '/v1/shuttle');
}
