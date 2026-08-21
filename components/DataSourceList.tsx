'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, ExternalLink, X } from 'lucide-react';
import type { FreshnessStatus, ScrapeSourceStatus, TimestampBasis } from '@rockygpt/data/data-v2/scrape-status';
import { useAccessibleDialog } from '@/components/useAccessibleDialog';

const EASTERN_DATE_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

function formatTimestamp(value: string | null): string {
  return value ? EASTERN_DATE_TIME.format(new Date(value)) : 'Unknown';
}

function formatHours(hours: number): string {
  if (hours < 48) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 60) return `${Math.round(days)}d`;
  return `${Math.round(days / 30)}mo`;
}

function timestampBasisLabel(basis: TimestampBasis): string {
  switch (basis) {
    case 'collector-provenance':
      return 'Verified';
    case 'embedded-timestamp':
      return 'Recorded';
    case 'file-modified-estimate':
      return 'Estimated';
    case 'missing':
      return 'Unknown';
  }
}

function statusStyles(status: FreshnessStatus): string {
  switch (status) {
    case 'fresh':
      return 'bg-emerald-500/10 text-emerald-300';
    case 'stale':
      return 'bg-amber-500/10 text-amber-300';
    case 'unknown':
      return 'bg-red-500/10 text-red-300';
    case 'manual':
      return 'bg-sky-500/10 text-sky-300';
  }
}

function statusLabel(status: FreshnessStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

interface DataSourceListProps {
  sources: ScrapeSourceStatus[];
}

export function DataSourceList({ sources }: DataSourceListProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedId) ?? null,
    [selectedId, sources]
  );
  const closeDialog = useCallback(() => setSelectedId(null), []);
  const dialogRef = useAccessibleDialog(Boolean(selectedSource), closeDialog);

  useEffect(() => {
    if (!selectedSource) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedSource]);

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-border bg-muted/15">
        <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(0,1fr)_auto] gap-4 border-b border-border px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid">
          <span>Data</span>
          <span>Method</span>
          <span>Last fetched</span>
          <span>Status</span>
        </div>

        {sources.map((source) => (
          <button
            key={source.id}
            type="button"
            onClick={() => setSelectedId(source.id)}
            aria-haspopup="dialog"
            className="group grid w-full gap-3 border-b border-border/70 px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400/50 md:grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(0,1fr)_auto] md:items-center md:gap-4"
          >
            <div>
              <div className="flex items-center gap-1.5 font-medium">
                {source.title}
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{source.category}</div>
            </div>

            <div className="flex items-center justify-between gap-3 md:block">
              <span className="text-xs text-muted-foreground md:hidden">Method</span>
              <div>
                <div className="text-sm">{source.mode}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {source.sourceUrls[0]?.label}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 md:block">
              <span className="text-xs text-muted-foreground md:hidden">Last fetched</span>
              <div className="text-right md:text-left">
                <div className="text-sm">{formatTimestamp(source.lastFetchedAt)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {source.ageHours === null ? 'Age unknown' : `${formatHours(source.ageHours)} old`}
                  {' · '}
                  {timestampBasisLabel(source.timestampBasis)}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 md:justify-start">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles(source.freshnessStatus)}`}
              >
                {statusLabel(source.freshnessStatus)}
              </span>
            </div>
          </button>
        ))}
      </section>

      {selectedSource && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <button
            type="button"
            aria-label="Close data source details"
            className="absolute inset-0 cursor-default"
            onClick={closeDialog}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-source-dialog-title"
            tabIndex={-1}
            className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-2xl sm:max-h-[86vh] sm:rounded-3xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {selectedSource.category}
                </div>
                <h2 id="data-source-dialog-title" className="mt-1 text-xl font-semibold">
                  {selectedSource.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                aria-label="Close"
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="overflow-y-auto px-5 py-5 sm:px-6">
              <p className="text-sm leading-6 text-muted-foreground">{selectedSource.summary}</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="mt-1 font-medium">
                    {statusLabel(selectedSource.freshnessStatus)}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Last fetched</div>
                  <div className="mt-1 text-sm font-medium">
                    {formatTimestamp(selectedSource.lastFetchedAt)}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Max age</div>
                  <div className="mt-1 font-medium">
                    {selectedSource.freshnessHours === null
                      ? 'Manual'
                      : formatHours(selectedSource.freshnessHours)}
                  </div>
                </div>
              </div>

              <section className="mt-6">
                <h3 className="text-sm font-semibold">How it is scraped</h3>
                <p className="mt-2 text-sm leading-6 text-foreground/90">{selectedSource.method}</p>
              </section>

              <section className="mt-6">
                <h3 className="text-sm font-semibold">Data captured</h3>
                <ul className="mt-2 space-y-2 text-sm text-foreground/90">
                  {selectedSource.capturedData.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mt-6">
                <h3 className="text-sm font-semibold">Refresh</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {selectedSource.automation}
                </p>
                <div className="mt-3 space-y-2">
                  {selectedSource.commands.map((command) => (
                    <code
                      key={command}
                      className="block overflow-x-auto rounded-lg bg-muted/40 px-3 py-2 text-xs text-sky-200"
                    >
                      {command}
                    </code>
                  ))}
                </div>
              </section>

              <section className="mt-6">
                <h3 className="text-sm font-semibold">Official sources</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {selectedSource.sourceUrls.map((sourceUrl) => (
                    <a
                      key={sourceUrl.url}
                      href={sourceUrl.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-sky-300 transition-colors hover:bg-muted/40"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      <span>{sourceUrl.label}</span>
                    </a>
                  ))}
                </div>
              </section>

              {selectedSource.caveat && (
                <div className="mt-6 flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <p className="leading-6">{selectedSource.caveat}</p>
                </div>
              )}

              <section className="mt-6">
                <h3 className="text-sm font-semibold">Raw artifacts</h3>
                <div className="mt-2 overflow-hidden rounded-xl border border-border">
                  {selectedSource.artifacts.map((artifact) => (
                    <div
                      key={artifact.file}
                      className="border-b border-border/70 px-3 py-3 last:border-b-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-medium">{artifact.label}</div>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {artifact.role}
                        </span>
                      </div>
                      <code className="mt-1 block break-all text-[11px] text-muted-foreground">
                        {artifact.file}
                      </code>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {artifact.exists ? formatTimestamp(artifact.fetchedAt) : 'Missing'}
                        {' · '}
                        {artifact.timestampDetail}
                        {artifact.summary ? ` · ${artifact.summary}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
