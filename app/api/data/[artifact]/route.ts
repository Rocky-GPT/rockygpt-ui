import {
  isReleaseArtifactKey,
  loadReleaseArtifact,
} from '@rockygpt/data/data-v2/release-artifacts';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  context: { params: Promise<{ artifact: string }> }
) {
  const { artifact } = await context.params;
  if (!isReleaseArtifactKey(artifact)) {
    return Response.json({ error: 'Unknown data artifact.' }, { status: 404 });
  }

  try {
    const loaded = await loadReleaseArtifact(artifact);
    const etag = loaded.contentHash ? `"${loaded.contentHash}"` : undefined;
    const headers: Record<string, string> = {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      'X-RockyGPT-Release': loaded.releaseVersion,
      'X-RockyGPT-Data-Source': loaded.source,
    };
    if (etag) headers.ETag = etag;
    if (loaded.activatedAt) headers['Last-Modified'] = new Date(loaded.activatedAt).toUTCString();
    if (etag && req.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers });
    }
    return Response.json(loaded.payload, { headers });
  } catch (error) {
    console.error('Unable to load release artifact:', error instanceof Error ? error.message : String(error));
    return Response.json({ error: 'Data artifact unavailable.' }, { status: 503 });
  }
}
