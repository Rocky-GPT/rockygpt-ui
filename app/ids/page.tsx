import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DevPageMenu } from '@/components/DevPageMenu';
import { EntityRegistryView } from '@/components/EntityRegistryView';
import { buildEntityRegistry } from '@rockygpt/data/data-v2/entity-registry';
import { getRuntimePool } from '@rockygpt/data/db/runtime-pool';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'IDs | RockyGPT Dev',
  description: 'Development-only view of the entities a question can resolve to.',
};

export default async function IdsPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  const pool = getRuntimePool();
  let registry;
  let loadError: string | undefined;

  if (!pool) {
    loadError = 'DATABASE_URL is not configured, so there is no active dataset to read.';
  } else {
    try {
      const active = await pool.query<{ id: string; version: string }>(
        `SELECT id::text, version FROM rockygpt_v2.dataset_versions WHERE status = 'active' LIMIT 1`
      );
      const dataset = active.rows[0];
      if (!dataset) loadError = 'No active dataset version.';
      else registry = await buildEntityRegistry(pool, dataset.id, dataset.version);
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'An unexpected database error occurred.';
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-background/95 pb-24">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-background/85 shadow-sm backdrop-blur-xl">
        <div className="container mx-auto flex h-20 max-w-5xl items-center px-6">
          <DevPageMenu title="IDs" subtitle="Things a question can resolve to" />
        </div>
      </header>

      <main className="container mx-auto min-w-0 max-w-5xl space-y-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">IDs</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Every entity in the active dataset, by its stable record key. Lookups today match the
            words in a question against the words in a record, which is how the vocabulary came to
            search a name the data does not contain. These are what a question could resolve to
            instead.
          </p>
          {registry && (
            <p className="mt-2 text-xs text-muted-foreground">
              Dataset <strong>{registry.datasetVersion}</strong>. Read-only: nothing routes through
              this yet. Keys are derived from names upstream, so they are stable within a dataset
              but change if a name changes.
            </p>
          )}
        </div>

        {loadError ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-200">
            <h2 className="font-semibold">The registry could not be read.</h2>
            <p className="mt-2 text-sm">{loadError}</p>
          </div>
        ) : (
          registry && <EntityRegistryView registry={registry} />
        )}
      </main>
    </div>
  );
}
