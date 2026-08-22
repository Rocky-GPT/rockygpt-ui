import { proxyBrain } from '@/lib/service-proxy';

export function POST(request: Request) {
  return proxyBrain(request, '/v1/feedback');
}
