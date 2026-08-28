import { proxyBrain } from '@/lib/service-proxy';

export function GET(request: Request) {
  return proxyBrain(request, '/v1/shuttle');
}
