import { proxyBrain } from '@/lib/service-proxy';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return proxyBrain(request, '/v1/menu');
}
