import { proxyData } from '@/lib/service-proxy';

const ARTIFACTS = new Set(['calendar', 'clubs', 'courses', 'events', 'hours', 'programs']);

export async function GET(request: Request, context: { params: Promise<{ artifact: string }> }) {
  const { artifact } = await context.params;
  if (!ARTIFACTS.has(artifact)) return Response.json({ error: 'Unknown data artifact.' }, { status: 404 });
  return proxyData(request, `/v1/data/${encodeURIComponent(artifact)}`);
}
