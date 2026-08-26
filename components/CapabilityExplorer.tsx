'use client';

/**
 * @module components/CapabilityExplorer
 * The registry, and what each of its lookups actually returns.
 *
 * One table, and a row of capabilities above it that changes what is in the
 * table. The registry is the thing itself, fetched from the brain: every entry
 * here is one BRAIN #2 may name, and an entry exists only when there is code
 * behind it, so this doubles as the list of lookups that can run.
 *
 * The records come from the capability's own executor with nothing narrowing
 * it — the same request translation and the same field projection a real turn
 * gets. Reading the underlying data endpoint instead would show columns Rocky
 * cannot actually reach.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter as FilterIcon, ListOrdered } from 'lucide-react';

export interface Capability {
  capability: string;
  describes: string;
  filters: string[];
  fields: string[];
}

interface Records {
  returned: number;
  records: Record<string, unknown>[];
}

export function CapabilityExplorer({ capabilities }: { capabilities: Capability[] }) {
  const [chosen, setChosen] = useState(capabilities[0]?.capability ?? '');
  const [state, setState] = useState<Records | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const entry = useMemo(
    () => capabilities.find((one) => one.capability === chosen),
    [capabilities, chosen],
  );

  const load = useCallback(async () => {
    if (!chosen) return;
    // Cleared first, so the table never shows one capability's rows under
    // another's heading while the next lookup is in flight.
    setState(null);
    setFailed(null);
    try {
      const response = await fetch(`/api/capabilities/${chosen}`, {
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      setState(body as Records);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'The lookup did not answer.');
    }
  }, [chosen]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Capabilities</h1>
        <p className="mt-1 text-sm text-white/60">
          {capabilities.length} lookups the planner can choose from. Each has code behind it —
          the registry does not list anything Rocky cannot run.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {capabilities.map((one) => (
          <button
            key={one.capability}
            type="button"
            onClick={() => setChosen(one.capability)}
            aria-pressed={one.capability === chosen}
            className={`rounded-full border px-3 py-1.5 font-mono text-xs transition-colors ${
              one.capability === chosen
                ? 'border-sky-400/50 bg-sky-400/15 text-sky-200'
                : 'border-white/10 bg-white/5 text-white/60 hover:border-white/25 hover:text-white'
            }`}
          >
            {one.capability}
          </button>
        ))}
      </div>

      {entry && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-white/70">{entry.describes}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Chips
              icon={<FilterIcon aria-hidden="true" className="h-3 w-3" />}
              label="narrow by"
              names={entry.filters}
              tone="text-emerald-200 border-emerald-400/25 bg-emerald-400/10"
            />
            <Chips
              icon={<ListOrdered aria-hidden="true" className="h-3 w-3" />}
              label="sort, compare, read"
              names={entry.fields}
              tone="text-violet-200 border-violet-400/25 bg-violet-400/10"
            />
          </div>
        </div>
      )}

      <Table state={state} failed={failed} />
    </div>
  );
}

function Table({ state, failed }: { state: Records | null; failed: string | null }) {
  if (failed) {
    return (
      <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        {failed}
      </p>
    );
  }
  if (!state) {
    return <p className="px-1 text-sm text-white/40">Looking it up…</p>;
  }
  if (state.records.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
        The lookup ran and returned nothing. That is an answer rather than a failure — there
        is none of this right now.
      </p>
    );
  }

  const columns = [...new Set(state.records.flatMap((row) => Object.keys(row)))];

  return (
    <div className="min-w-0 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
        {state.returned.toLocaleString()} record{state.returned === 1 ? '' : 's'}
      </p>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-white/10">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-white/70"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.records.map((row, index) => (
              <tr key={index} className="border-t border-white/5 hover:bg-white/5">
                {columns.map((column) => (
                  <td key={column} className="max-w-[22rem] truncate px-3 py-2 text-white/70">
                    {format(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Chips({
  icon,
  label,
  names,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  names: string[];
  tone: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/40">
        {icon}
        {label}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {names.map((name) => (
          <li key={name} className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${tone}`}>
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function format(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
