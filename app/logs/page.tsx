import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LogsDashboard } from '@/components/LogsDashboard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Logs | RockyGPT Dev',
  description: 'Live student chat logs, invoked tools, and latency telemetry for RockyGPT.',
};

export default function LogsPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <div className="min-h-screen overflow-x-hidden bg-background/95 pb-24">
      <LogsDashboard />
    </div>
  );
}
