import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CapabilityExplorer } from '@/components/CapabilityExplorer';
import { DevPageMenu } from '@/components/DevPageMenu';
import { BRAIN_URL } from '@/lib/services';
import type { Capability } from '@/components/CapabilityExplorer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Capability Explorer | RockyGPT Dev',
  description: 'What Rocky can look up, exactly as the planner is shown it.',
};

export default async function CapabilityExplorerPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  let capabilities: Capability[] | undefined;
  let loadError: unknown;
  try {
    const response = await fetch(`${BRAIN_URL}/v1/capabilities`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`The brain answered ${response.status}.`);
    capabilities = ((await response.json()) as { capabilities: Capability[] }).capabilities;
  } catch (error) {
    loadError = error;
  }

  if (!capabilities) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-background/95 pb-24">
        <header className="border-b border-white/5 bg-background/85">
          <div className="container mx-auto flex h-20 max-w-5xl items-center px-6">
            <DevPageMenu title="Capability Explorer" subtitle="What Rocky can look up" />
          </div>
        </header>
        <main className="container mx-auto max-w-5xl px-6 py-10">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-200">
            <h1 className="font-semibold">The capability explorer could not connect.</h1>
            <p className="mt-2 text-sm">
              {loadError instanceof Error ? loadError.message : 'The brain is not reachable.'}
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
          <DevPageMenu title="Capability Explorer" subtitle="What Rocky can look up" />
        </div>
      </header>

      <main className="container mx-auto min-w-0 max-w-7xl px-6 py-10">
        <CapabilityExplorer capabilities={capabilities} />
      </main>
    </div>
  );
}
