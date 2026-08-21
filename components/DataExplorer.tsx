'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Database,
  RefreshCw,
  Search,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import type {
  DataExplorerPayload,
  ExplorerDataset,
  ExplorerValue,
} from '../data-explorer/types';

const STRUCTURED_DATASET_KEYS = new Set([
  'critical-facts',
  'campus-contacts',
  'campus-hours',
  'dining-hours',
  'menu-items',
  'shuttle-trips',
  'academic-dates',
  'campus-events',
  'clubs',
  'programs',
]);

const GROUPS: ExplorerDataset['group'][] = [
  'Campus data',
  'Retrieval',
  'Releases',
  'Analytics',
  'Telemetry',
];

/**
 * Auto-refresh cadence. A poll is skipped whenever the previous one is still
 * running, so a slower response simply lowers the effective rate instead of
 * queueing overlapping requests against the database.
 */
const AUTO_REFRESH_INTERVAL_MS = 1000;

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function humanize(value: string): string {
  const words = value.replaceAll('_', ' ').replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not activated';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatConversationTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const dayDifference = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / (24 * 60 * 60 * 1000)
  );
  const time = parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (dayDifference === 0) return `Today, ${time}`;
  if (dayDifference === 1) return `Yesterday, ${time}`;

  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    ...(parsed.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  });
}

function looksLikeTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
}

function CellValue({ value }: { value: ExplorerValue }) {
  if (value === null || value === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value === 'boolean') {
    return (
      <span
        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
          value
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
            : 'border-border bg-muted/40 text-muted-foreground'
        }`}
      >
        {value ? 'Yes' : 'No'}
      </span>
    );
  }
  if (typeof value === 'number') {
    return <span className="font-mono text-xs">{formatNumber(value)}</span>;
  }
  if (/^https?:\/\//.test(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="block max-w-sm break-all text-sky-300 underline decoration-sky-500/30 underline-offset-2 hover:text-sky-200"
      >
        {value}
      </a>
    );
  }
  if (looksLikeTimestamp(value)) {
    return <span className="whitespace-nowrap text-xs">{formatTimestamp(value)}</span>;
  }
  const codeLike =
    value.startsWith('{') ||
    value.startsWith('[') ||
    /^[a-f0-9]{32,}$/i.test(value) ||
    /^[0-9a-f-]{36}$/i.test(value);
  return (
    <span
      className={`block max-w-lg whitespace-pre-wrap break-words ${
        codeLike ? 'font-mono text-[11px] leading-5 text-muted-foreground' : 'leading-5'
      }`}
    >
      {value}
    </span>
  );
}

function HorizontalBars({
  rows,
  emptyLabel,
  valueSuffix,
}: {
  rows: Array<{ label: string; count: number; detail?: string }>;
  emptyLabel: string;
  valueSuffix?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (!rows.length) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;

  return (
    <div
      className="space-y-3"
      role="img"
      aria-label={rows.map((row) => `${row.label}: ${row.count}`).join(', ')}
    >
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[minmax(8.5rem,1fr)_minmax(7rem,3fr)_auto] items-center gap-3"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{humanize(row.label)}</div>
            {row.detail && <div className="text-[10px] text-muted-foreground">{row.detail}</div>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full min-w-1 rounded-full bg-sky-400"
              style={{ width: `${Math.max(2, (row.count / max) * 100)}%` }}
            />
          </div>
          <div className="min-w-10 text-right font-mono text-xs text-muted-foreground">
            {formatNumber(row.count)}
            {valueSuffix || ''}
          </div>
        </div>
      ))}
    </div>
  );
}

function DailyRequests({ rows }: { rows: DataExplorerPayload['analytics']['dailyRequests'] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No requests recorded in this period.</p>;
  }

  return (
    <div
      className="overflow-x-auto pb-1"
      role="img"
      aria-label={rows.map((row) => `${row.date}: ${row.count} requests`).join(', ')}
    >
      <div className="flex h-40 min-w-[620px] items-end gap-1.5 border-b border-border px-1">
        {rows.map((row, index) => (
          <div
            key={row.date}
            className="group flex min-w-3 flex-1 flex-col items-center justify-end gap-1"
          >
            <div className="invisible whitespace-nowrap rounded bg-muted px-1.5 py-1 text-[10px] text-foreground group-hover:visible">
              {formatNumber(row.count)} · {row.averageLatencyMs ?? '—'}ms
            </div>
            <div
              className="w-full min-w-2 rounded-t bg-emerald-400"
              style={{
                height: `${row.count === 0 ? 0 : Math.max(4, (row.count / max) * 112)}px`,
              }}
            />
            <span className="text-[9px] text-muted-foreground">
              {index % 5 === 0 || index === rows.length - 1
                ? new Date(`${row.date}T12:00:00`).toLocaleDateString(undefined, {
                    month: 'numeric',
                    day: 'numeric',
                  })
                : '\u00a0'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/15 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span className="text-sky-400">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function rowText(row: Record<string, ExplorerValue>, key: string): string {
  const value = row[key];
  return value === null || value === undefined ? '' : String(value);
}

export function DataExplorer({
  initialData,
}: {
  initialData: DataExplorerPayload;
}) {
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState(initialData.records.search);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const requestSequence = useRef(0);
  const isRequestInFlight = useRef(false);

  const visibleDatasets = useMemo(() => data.datasets, [data.datasets]);

  const selectedDataset =
    visibleDatasets.find((dataset) => dataset.key === data.records.datasetKey) ||
    visibleDatasets[0] ||
    data.datasets[0];
  const totalPages = Math.max(1, Math.ceil(data.records.total / data.records.pageSize));
  const structuredCounts = useMemo(
    () =>
      data.datasets
        .filter((dataset) => STRUCTURED_DATASET_KEYS.has(dataset.key))
        .map((dataset) => ({ label: dataset.label, count: dataset.count }))
        .sort((left, right) => right.count - left.count),
    [data.datasets]
  );
  const positiveRate = data.analytics.feedbackCount
    ? Math.round((data.analytics.positiveFeedbackCount / data.analytics.feedbackCount) * 100)
    : null;

  const load = async (
    datasetKey: string,
    page: number,
    searchValue: string,
    options: {
      silent?: boolean;
    } = {}
  ) => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    isRequestInFlight.current = true;
    if (!options.silent) {
      setIsLoading(true);
      setError(undefined);
    }

    try {
      const parameters = new URLSearchParams({
        dataset: datasetKey,
        page: String(page),
      });
      if (searchValue.trim()) parameters.set('search', searchValue.trim());

      const response = await fetch(`/api/dev/data-explorer?${parameters.toString()}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Data Explorer returned HTTP ${response.status}.`);
      }

      const next = (await response.json()) as DataExplorerPayload;
      if (requestSequence.current === sequence) {
        setData(next);
        setSearch(next.records.search);
      }
    } catch (loadError) {
      if (options.silent) return;
      setError(
        loadError instanceof Error ? loadError.message : 'Could not query the data explorer.'
      );
    } finally {
      if (requestSequence.current === sequence) {
        isRequestInFlight.current = false;
        if (!options.silent) setIsLoading(false);
      }
    }
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void load(data.records.datasetKey, 1, search);
  };

  const changeDataset = (datasetKey: string) => {
    setSearch('');
    void load(datasetKey, 1, '');
  };

  return (
    <div className="min-w-0 max-w-full space-y-10" data-testid="data-explorer">
      <section className="min-w-0 space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Database overview</h1>
              <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                {humanize(data.release.status)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.release.version} · activated {formatTimestamp(data.release.activatedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(data.records.datasetKey, data.records.page, data.records.search)}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60 md:self-auto"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Active content"
            value={formatNumber(data.release.structuredRecordCount)}
            detail={`${formatNumber(data.release.sourceCount)} sources · ${formatNumber(data.release.documentCount)} documents · ${formatNumber(data.release.chunkCount)} chunks`}
            icon={<Database className="h-5 w-5" />}
          />
          <MetricCard
            label={`Requests · ${data.analytics.days}d`}
            value={formatNumber(data.analytics.requestCount)}
            detail={
              data.analytics.averageLatencyMs === null
                ? 'No traffic recorded yet'
                : `${formatNumber(data.analytics.averageLatencyMs)}ms avg · ${formatNumber(data.analytics.p50LatencyMs || 0)}ms p50 · ${formatNumber(data.analytics.p95LatencyMs || 0)}ms p95`
            }
            icon={<Activity className="h-5 w-5" />}
          />
          <MetricCard
            label="Quality gates"
            value={`${formatNumber(data.release.sourceStatuses.find((s) => s.status === 'ok')?.count || 0)} / ${formatNumber(data.release.sourceCount)}`}
            detail="Sources passing quality gates"
            icon={<ShieldCheck className="h-5 w-5" />}
          />
          <MetricCard
            label="Student feedback"
            value={positiveRate === null ? '—' : `${positiveRate}%`}
            detail={
              data.analytics.feedbackCount
                ? `${formatNumber(data.analytics.positiveFeedbackCount)} up · ${formatNumber(data.analytics.negativeFeedbackCount)} down (${formatNumber(data.analytics.feedbackCount)} total)`
                : 'No feedback submitted in last 30 days'
            }
            icon={
              <span className="flex gap-1">
                <ThumbsUp className="h-4 w-4" />
                <ThumbsDown className="h-4 w-4" />
              </span>
            }
          />
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-2">
          <section className="min-w-0 rounded-2xl border border-border bg-muted/10 p-5">
            <div className="mb-5 flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">Active campus records</h2>
              <span className="text-xs text-muted-foreground">
                {formatNumber(data.release.structuredRecordCount)} total
              </span>
            </div>
            <HorizontalBars rows={structuredCounts} emptyLabel="No active campus records." />
          </section>

          <section className="min-w-0 rounded-2xl border border-border bg-muted/10 p-5">
            <div className="mb-5 flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">Requests by day</h2>
              <span className="text-xs text-muted-foreground">
                Last {data.analytics.days} days
              </span>
            </div>
            <DailyRequests rows={data.analytics.dailyRequests} />
          </section>
        </div>
      </section>

      <section className="min-w-0 space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Record explorer</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Browse active campus data, retrieval records, release history, and operational analytics.
          </p>
        </div>

        <div className="grid gap-3 rounded-2xl border border-border bg-muted/10 p-4 lg:grid-cols-[minmax(15rem,.8fr)_minmax(20rem,1.2fr)] lg:items-end">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Dataset</span>
            <select
              value={data.records.datasetKey}
              onChange={(event) => changeDataset(event.target.value)}
              disabled={isLoading}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400/40"
            >
              {GROUPS.map((group) => {
                const groupedDatasets = visibleDatasets.filter(
                  (dataset) => dataset.group === group
                );
                if (!groupedDatasets.length) return null;
                return (
                  <optgroup key={group} label={group}>
                    {groupedDatasets.map((dataset) => (
                      <option key={dataset.key} value={dataset.key}>
                        {dataset.label} ({formatNumber(dataset.count)})
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>

          <form onSubmit={submitSearch} className="space-y-1.5">
            <label htmlFor="data-explorer-search" className="block text-sm font-medium">
              Search this dataset
            </label>
            <div className="flex gap-2">
              <input
                id="data-explorer-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${selectedDataset.label.toLowerCase()}…`}
                maxLength={120}
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-sky-400/40"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-400 disabled:opacity-60"
              >
                <Search className="h-4 w-4" />
                Search
              </button>
            </div>
          </form>
        </div>

        <div>
          <h3 className="font-semibold">{selectedDataset.label}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {selectedDataset.description}
          </p>
        </div>

        <div
          className={`min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-muted/5 ${isLoading ? 'opacity-60' : ''}`}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-left text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  {selectedDataset.columns.map((column) => (
                    <th key={column.key} className="whitespace-nowrap px-4 py-3 font-semibold">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {data.records.rows.map((row, index) => (
                  <tr
                    key={`${data.records.datasetKey}-${data.records.page}-${index}`}
                    className="align-top hover:bg-muted/20"
                  >
                    {selectedDataset.columns.map((column) => (
                      <td key={column.key} className="max-w-xl px-4 py-3">
                        <CellValue value={row[column.key] ?? null} />
                      </td>
                    ))}
                  </tr>
                ))}
                {!data.records.rows.length && (
                  <tr>
                    <td
                      colSpan={selectedDataset.columns.length}
                      className="px-4 py-12 text-center text-sm text-muted-foreground"
                    >
                      No rows match this search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {totalPages <= 1 ? (
          <div className="flex items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
            <span>
              Showing all <strong className="font-semibold text-foreground">{formatNumber(data.records.total)}</strong> records
            </span>
            <span className="hidden sm:inline">Updated {formatTimestamp(data.generatedAt)}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                void load(data.records.datasetKey, data.records.page - 1, data.records.search)
              }
              disabled={isLoading || data.records.page <= 1}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/20 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="text-center text-xs text-muted-foreground">
              Page {formatNumber(data.records.page)} of {formatNumber(totalPages)}
              <span className="hidden sm:inline"> · Updated {formatTimestamp(data.generatedAt)}</span>
            </span>
            <button
              type="button"
              onClick={() =>
                void load(data.records.datasetKey, data.records.page + 1, data.records.search)
              }
              disabled={isLoading || data.records.page >= totalPages}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/20 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
