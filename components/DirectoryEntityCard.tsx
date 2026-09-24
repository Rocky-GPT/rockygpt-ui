'use client';

import { useEffect, useState } from 'react';
import { loadCampusData } from '@/lib/campus-data';
import { isCanonicalFacts, safeWebUrl, sourceLinks, type CanonicalFacts, type DirectoryEntry } from '@/lib/entity-facts';

// Field keys are data names ("department", "profile_url"). Students read words.
const FIELD_LABELS: Record<string, string> = {
  email: 'Email', phones: 'Phone', phone: 'Phone', office: 'Office', department: 'Department',
  title: 'Title', school: 'School', status: 'Status', profile_url: 'Profile',
};

function fieldLabel(key: string, label: string): string {
  const known = FIELD_LABELS[key];
  if (known) return known;
  const words = label.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function FactValue({ field, value }: { field: string; value: unknown }) {
  if (field === 'email' && typeof value === 'string' && /^[^\s@]+@[^\s@]+$/.test(value)) {
    return <a className="text-primary underline break-all" href={`mailto:${value}`}>{value}</a>;
  }
  if (field === 'phones' && Array.isArray(value)) {
    return <ul className="space-y-1">{value.map((phone, index) => {
      if (!phone || typeof phone !== 'object') return null;
      const number = typeof phone.number === 'string' ? phone.number : undefined;
      const extension = typeof phone.extension === 'string' ? phone.extension : undefined;
      const text = [number, extension ? `Ext. ${extension}` : null, phone.type].filter(Boolean).join(' · ');
      const dial = number?.replace(/[\s().-]/g, '');
      return <li key={index}>{dial && /^\+?\d{10,15}$/.test(dial)
        ? <a className="text-primary underline" href={`tel:${dial}${extension && /^\d+$/.test(extension) ? `;ext=${extension}` : ''}`}>{text}</a>
        : text}</li>;
    })}</ul>;
  }
  const url = field.endsWith('_url') ? safeWebUrl(value) : undefined;
  if (url) return <a className="text-primary underline break-all" href={url} target="_blank" rel="noopener noreferrer">Open published profile</a>;
  return <span className="break-words">{Array.isArray(value) ? value.map(String).join(' · ') : String(value)}</span>;
}

export function DirectoryEntityCard({ entry, datasetVersion, identityHash }: {
  entry: DirectoryEntry; datasetVersion: string; identityHash: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [facts, setFacts] = useState<CanonicalFacts | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!expanded) return;
    const abort = new AbortController();
    const query = new URLSearchParams({ dataset_version: datasetVersion, identity_hash: identityHash });
    void loadCampusData(`/api/entities/${entry.canonical_entity_id}/facts?${query}`, isCanonicalFacts, { signal: abort.signal })
      .then(result => {
        if (abort.signal.aborted) return;
        if (!result.ok) {
          setError(result.status === 409 ? 'Campus data changed. Close and reopen the directory to refresh.' : 'Contact details are unavailable. Close and reopen this card to retry.');
          setFacts(null);
        } else if (result.data.entity.id !== entry.canonical_entity_id || result.data.dataset_version !== datasetVersion || result.data.identity_hash !== identityHash) {
          setError('Contact details do not match this directory. Reopen the directory to refresh.');
          setFacts(null);
        } else { setFacts(result.data); setError(null); }
      }).catch(error => { if (!abort.signal.aborted) setError(String(error)); });
    return () => abort.abort();
  }, [expanded, entry.canonical_entity_id, datasetVersion, identityHash]);
  const properties = facts?.properties.filter(property => property.category === 'contact'
    || ['title', 'department', 'school', 'status', 'profile_url'].includes(property.key)) ?? [];
  const contentId = `directory-${entry.id}`;
  // Every value used to carry its own "N supporting evidence records" toggle.
  // The sources are listed once per card instead, and each value keeps small
  // numbered marks to the sources behind it, so no evidence is dropped.
  const cardSources: string[] = [];
  // A source's standing notes ("derived from the linked profile") belong to
  // the source, not to each value, so they are listed once beside it.
  const sourceNotes = new Map<string, Set<string>>();
  let anyDerived = false;
  const shown = facts ? properties.filter(property => property.status !== 'unknown').map(property => ({
    property,
    values: property.values.filter(value => value.value !== null && value.value !== ''
      && (!Array.isArray(value.value) || value.value.length > 0)).map(value => {
      const sources = sourceLinks(property, value.assertion_ids, facts.sources);
      if (sources.some(source => source.derived_from_source_id)) anyDerived = true;
      const links = [...new Set(sources.map(source => safeWebUrl(source.source_url))
        .filter((url): url is string => Boolean(url)))];
      for (const url of links) if (!cardSources.includes(url)) cardSources.push(url);
      for (const source of sources) {
        const url = safeWebUrl(source.source_url);
        if (!url) continue;
        const notes = sourceNotes.get(url) ?? new Set<string>();
        source.limitations.forEach(note => notes.add(note));
        sourceNotes.set(url, notes);
      }
      // Staleness is about this value's evidence, so it stays beside the value.
      const warnings = sources.some(source => source.freshness === 'stale')
        ? ['This source is outside its freshness window.'] : [];
      return { value, links, warnings };
    }),
  })) : [];
  return <article className="rounded-xl border border-border/70 bg-card/40 overflow-hidden">
    <button type="button" className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-muted/40"
      aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(!expanded)}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{entry.name}</span>
        {entry.context && <span className="block text-xs text-muted-foreground">{entry.context}</span>}
      </span>
      <span className="shrink-0 text-xs text-primary">{expanded ? 'Hide details' : 'Contact details'}</span>
    </button>
    {expanded && <div id={contentId} className="border-t border-border px-4 py-3 space-y-3">
      {error ? <p role="alert" className="text-sm text-muted-foreground">{error}</p> : !facts
        ? <p role="status" className="text-sm text-muted-foreground">Loading published details…</p>
        : <>
          {!facts.properties_complete && <p role="status" className="text-sm text-amber-600">Some source records could not be read. These details may be incomplete.</p>}
          {properties.every(property => property.status === 'unknown') && <p className="text-sm text-muted-foreground">No contact details are published for this entry.</p>}
          {shown.map(({ property, values }) => <div key={property.key}>
            <p className="text-xs font-medium text-muted-foreground mb-1">{fieldLabel(property.key, property.label)}</p>
            {property.status === 'conflicting' && <p className="text-xs text-amber-600 mb-1">Sources disagree. No value has been selected.</p>}
            {values.map(({ value, links, warnings }) => <div key={value.id} className="text-sm mb-2">
              <FactValue field={property.key} value={value.value} />
              {links.map(url => {
                const number = cardSources.indexOf(url) + 1;
                return <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                  aria-label={`Source ${number}`} title={url}
                  className="ml-1 inline-flex min-h-6 min-w-6 items-center justify-center align-super text-[11px] text-muted-foreground hover:text-foreground">[{number}]</a>;
              })}
              {(value.valid_from || value.valid_until) && <p className="text-xs text-muted-foreground">Published validity: {value.valid_from ?? 'unspecified'} – {value.valid_until ?? 'unspecified'}</p>}
              {warnings.map(warning => <p className="mt-1 text-xs text-amber-600" key={warning}>{warning}</p>)}
            </div>)}
          </div>)}
          {cardSources.length > 0 && <div className="border-t border-border/60 pt-2 text-xs text-muted-foreground">
            <p className="font-medium mb-1">Sources</p>
            {anyDerived && <p className="mb-1">Some records are derived from the same published source.</p>}
            <ol className="space-y-1">
              {cardSources.map((url, index) => <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">Source {index + 1}: {url}</a>
                {[...(sourceNotes.get(url) ?? [])].map(note => <p key={note} className="mt-0.5">{note}</p>)}
              </li>)}
            </ol>
          </div>}
        </>}
    </div>}
  </article>;
}
