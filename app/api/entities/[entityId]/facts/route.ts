import { proxyBrain } from '@/lib/service-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entityId)) {
    return Response.json({ error: 'Invalid entity identifier' }, { status: 400 });
  }
  const input = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ['dataset_version', 'identity_hash']) {
    const value = input.get(key);
    if (value) query.set(key, value);
  }
  return proxyBrain(request, `/v1/entities/${entityId}/facts?${query}`);
}
