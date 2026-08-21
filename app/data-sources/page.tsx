import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DataSourceList } from '@/components/DataSourceList';
import { DevPageMenu } from '@/components/DevPageMenu';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Data Sources | RockyGPT Dev',
  description: 'Development-only status page for RockyGPT data collectors.',
};

export default async function DataSourcesPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  const { getScrapeSourceStatuses, STATIC_DATA_NOT_SCRAPED } =
    await import('@rockygpt/data/data-v2/scrape-status');
  const sources = getScrapeSourceStatuses();
  const freshCount = sources.filter((source) => source.freshnessStatus === 'fresh').length;
  const staleCount = sources.filter((source) => source.freshnessStatus === 'stale').length;
  const unknownCount = sources.filter((source) => source.freshnessStatus === 'unknown').length;
  const manualCount = sources.filter((source) => source.freshnessStatus === 'manual').length;
  const summary = [
    `${sources.length} sources`,
    `${freshCount} fresh`,
    `${staleCount} stale`,
    ...(unknownCount ? [`${unknownCount} unknown`] : []),
    ...(manualCount ? [`${manualCount} manual`] : []),
  ].join(' · ');

  return (
    <div className="min-h-screen bg-background/95 pb-24">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-background/85 shadow-sm backdrop-blur-xl">
        <div className="container mx-auto flex h-20 max-w-5xl items-center px-6">
          <DevPageMenu title="Data Sources" subtitle="Collection status" />
        </div>
      </header>

      <main className="container mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Scraped data</h1>
          <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
        </div>

        <DataSourceList sources={sources} />

        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Not scraped: {STATIC_DATA_NOT_SCRAPED.map((item) => item.title.toLowerCase()).join(', ')}.
          “Estimated” means the raw file time is being used because collector provenance is
          unavailable.
        </p>
      </main>
    </div>
  );
}
