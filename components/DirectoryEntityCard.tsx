'use client';

import { useEffect, useState } from 'react';
import { loadCampusData } from '@/lib/campus-data';
import { isCanonicalFacts, safeWebUrl, sourceLinks, type CanonicalFacts, type DirectoryEntry } from '@/lib/entity-facts';

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
  return <article className="rounded-xl border border-border/70 bg-card/40 overflow-hidden">
    <button type="button" className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-muted/40"
      aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(!expanded)}>
      <span className="text-sm font-semibold">{entry.name}</span>
      <span className="text-xs text-primary">{expanded ? 'Hide details' : 'Contact details'}</span>
    </button>
    {expanded && <div id={contentId} className="border-t border-border px-4 py-3 space-y-3">
      {error ? <p role="alert" className="text-sm text-muted-foreground">{error}</p> : !facts
        ? <p role="status" className="text-sm text-muted-foreground">Loading published details…</p>
        : <>
          {!facts.properties_complete && <p role="status" className="text-sm text-amber-600">Some source records could not be read. These details may be incomplete.</p>}
          {properties.every(property => property.status === 'unknown') && <p className="text-sm text-muted-foreground">No contact details are published for this entry.</p>}
          {properties.filter(property => property.status !== 'unknown').map(property => <div key={property.key}>
            <p className="text-xs font-medium text-muted-foreground mb-1">{property.label}</p>
            {property.status === 'conflicting' && <p className="text-xs text-amber-600 mb-1">Sources disagree. No value has been selected.</p>}
            {property.values.filter(value => value.value !== null && value.value !== ''
              && (!Array.isArray(value.value) || value.value.length > 0)).map(value => {
              const sources = sourceLinks(property, value.assertion_ids, facts.sources);
              const links = [...new Set(sources.map(source => safeWebUrl(source.source_url)).filter((url): url is string => Boolean(url)))];
              const warnings = [...new Set(sources.flatMap(source => [...source.limitations, ...(source.freshness === 'stale' ? ['This source is outside its freshness window.'] : [])]))];
              return <div key={value.id} className="text-sm mb-2">
                <FactValue field={property.key} value={value.value} />
                {(value.valid_from || value.valid_until) && <p className="text-xs text-muted-foreground">Published validity: {value.valid_from ?? 'unspecified'} – {value.valid_until ?? 'unspecified'}</p>}
                <details className="text-xs text-muted-foreground mt-1">
                  <summary className="cursor-pointer">{value.evidence_count} supporting evidence {value.evidence_count === 1 ? 'record' : 'records'}</summary>
                  {sources.some(source => source.derived_from_source_id) && <p className="mt-1">Some records are derived from the same published source.</p>}
                  {links.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block text-primary underline break-all mt-1">Source {index + 1}: {url}</a>)}
                  {warnings.map(warning => <p className="mt-1" key={warning}>{warning}</p>)}
                </details>
              </div>;
            })}
          </div>)}
        </>}
    </div>}
  </article>;
}
