'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { EntityKind, EntityRegistry, EntityRow, RegistryEntity } from '@rockygpt/data/data-v2/entity-registry';

const KIND_LABELS: Record<EntityKind, string> = {
  campus_hours: 'Buildings',
  dining_hours: 'Dining venues',
  campus_contacts: 'Contacts',
  clubs: 'Clubs',
  programs: 'Programs',
};

/**
 * Sets small enough to hand to a model in full, which is what makes a
 * closed-set resolver possible for them and not for the others.
 */
const ENUMERABLE_LIMIT = 40;

function KindTile({
  kind,
  count,
  active,
  onSelect,
}: {
  kind: EntityKind;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  const enumerable = count <= ENUMERABLE_LIMIT;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-2xl border p-4 text-left transition-colors ${
        active
          ? 'border-sky-500/60 bg-sky-500/10'
          : 'border-border bg-muted/10 hover:border-border/80 hover:bg-muted/20'
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{KIND_LABELS[kind]}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{count}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {enumerable ? 'small enough to enumerate' : 'needs search'}
      </p>
    </button>
  );
}

type RowState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; rows: EntityRow[] };

/** Column names as stored; only the underscores are cosmetic. */
function columnLabel(key: string): string {
  return key.replaceAll('_', ' ');
}

function EntityRows({ state }: { state: RowState | undefined }) {
  if (!state || state.status === 'loading') {
    return <p className="pb-3 pl-1 text-xs text-muted-foreground">Loading rows…</p>;
  }
  if (state.status === 'error') {
    return <p className="pb-3 pl-1 text-xs text-red-300">{state.message}</p>;
  }
  if (!state.rows.length) {
    return <p className="pb-3 pl-1 text-xs text-muted-foreground">No rows.</p>;
  }

  const columns = Object.keys(state.rows[0]);
  return (
    <div className="overflow-x-auto pb-3">
      <table className="w-full min-w-[22rem] text-xs">
        <thead>
          <tr className="border-b border-border/60 text-muted-foreground">
            {columns.map((column) => (
              <th key={column} className="py-1.5 pr-4 text-left font-medium">
                {columnLabel(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state.rows.map((row, index) => (
            <tr key={index} className="border-b border-border/30 last:border-0">
              {columns.map((column) => (
                <td key={column} className="py-1.5 pr-4 align-top">
                  {row[column] ?? <span className="text-muted-foreground">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EntityRegistryView({ registry }: { registry: EntityRegistry }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const toggle = async (entity: RegistryEntity) => {
    const id = `${entity.kind}:${entity.key}`;
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    // Rows are fetched once and kept, so reopening an entity is instant.
    if (rows[id]?.status === 'loaded') return;

    setRows((previous) => ({ ...previous, [id]: { status: 'loading' } }));
    try {
      const response = await fetch(
        `/api/dev/entity-rows?kind=${encodeURIComponent(entity.kind)}&key=${encodeURIComponent(entity.key)}`,
        { cache: 'no-store' }
      );
      const payload = (await response.json()) as { rows?: EntityRow[]; error?: string };
      if (!response.ok || !payload.rows) throw new Error(payload.error || 'Rows could not load.');
      setRows((previous) => ({ ...previous, [id]: { status: 'loaded', rows: payload.rows! } }));
    } catch (error) {
      setRows((previous) => ({
        ...previous,
        [id]: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Rows could not load.',
        },
      }));
    }
  };

  const kinds = useMemo(() => {
    const counts = new Map<EntityKind, number>();
    for (const entity of registry.entities) {
      counts.set(entity.kind, (counts.get(entity.kind) || 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => left[1] - right[1]);
  }, [registry]);

  const [selected, setSelected] = useState<EntityKind>(kinds[0]?.[0] ?? 'campus_hours');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return registry.entities.filter((entity) => {
      if (entity.kind !== selected) return false;
      if (!needle) return true;
      return (
        entity.key.toLowerCase().includes(needle) ||
        entity.names.some((name) => name.toLowerCase().includes(needle))
      );
    });
  }, [registry, selected, query]);

  // A key answering to more than one name is the shape the library bug took,
  // so it is surfaced rather than merged away.
  const ambiguous = registry.entities.filter((entity) => entity.names.length > 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kinds.map(([kind, count]) => (
          <KindTile
            key={kind}
            kind={kind}
            count={count}
            active={kind === selected}
            onSelect={() => setSelected(kind)}
          />
        ))}
      </div>

      {ambiguous.length > 0 ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-200">
          <h2 className="font-semibold">
            {ambiguous.length} id{ambiguous.length === 1 ? '' : 's'} answer to more than one name.
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {ambiguous.map((entity) => (
              <li key={`${entity.kind}:${entity.key}`}>
                <code className="rounded bg-black/20 px-1.5 py-0.5 text-xs">{entity.key}</code>{' '}
                {entity.names.join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-emerald-200">
          <h2 className="font-semibold">Every id answers to exactly one name.</h2>
          <p className="mt-1 text-sm">
            An id carrying two names is how the vocabulary came to search “Potter Library” while the
            data stored “Library (Main Building)”. None currently do.
          </p>
        </div>
      )}

      <section className="min-w-0 rounded-2xl border border-border bg-muted/10 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            {KIND_LABELS[selected]}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({visible.length}
              {query.trim() ? ` of ${kinds.find(([kind]) => kind === selected)?.[1] ?? 0}` : ''})
            </span>
          </h2>
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by id or name…"
              aria-label="Filter entities"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-sky-400/40"
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing matches that filter.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {visible.map((entity: RegistryEntity) => {
              const id = `${entity.kind}:${entity.key}`;
              const isOpen = expanded === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => toggle(entity)}
                    aria-expanded={isOpen}
                    className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md py-2.5 text-left transition-colors hover:bg-muted/30"
                  >
                    <code className="min-w-0 break-all text-sm text-sky-300">{entity.key}</code>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {entity.names.length > 1 ? `${entity.names.length} names · ` : ''}
                      {entity.rowCount} row{entity.rowCount === 1 ? '' : 's'}
                      <span className="ml-2 text-sky-400">{isOpen ? 'hide' : 'show'}</span>
                    </span>
                  </button>
                  {isOpen && <EntityRows state={rows[id]} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
