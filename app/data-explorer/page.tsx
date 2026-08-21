import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DataExplorer } from '@/components/DataExplorer';
import { DevPageMenu } from '@/components/DevPageMenu';
import { loadDataExplorer } from '../../data-explorer/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Data Explorer | RockyGPT Dev',
  description: 'Development-only database and analytics explorer for RockyGPT.',
};

export default async function DataExplorerPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  let initialData;
  let loadError: unknown;
  try {
    initialData = await loadDataExplorer({ datasetKey: 'clubs' });
  } catch (error) {
    loadError = error;
  }

  if (!initialData) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-background/95 pb-24">
        <header className="border-b border-white/5 bg-background/85">
          <div className="container mx-auto flex h-20 max-w-5xl items-center px-6">
            <DevPageMenu title="Data Explorer" subtitle="Database records and analytics" />
          </div>
        </header>
        <main className="container mx-auto max-w-5xl px-6 py-10">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-200">
            <h1 className="font-semibold">The data explorer could not connect.</h1>
            <p className="mt-2 text-sm">
              {loadError instanceof Error
                ? loadError.message
                : 'An unexpected database error occurred.'}
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-background/95 pb-24">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-background/85 shadow-sm backdrop-blur-xl">
        <div className="container mx-auto flex h-20 max-w-7xl items-center px-6">
          <DevPageMenu title="Data Explorer" subtitle="Database records and analytics" />
        </div>
      </header>

      <main className="container mx-auto min-w-0 max-w-7xl px-6 py-10">
        <DataExplorer initialData={initialData} />
      </main>
    </div>
  );
}
