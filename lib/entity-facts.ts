/** The directory renders the shared backend fact contract; it never resolves source conflicts. */
export interface DirectoryEntry {
  id: string;
  canonical_entity_id: string;
  name: string;
  kind: string;
  bucket: 'Offices' | 'Staff & Faculty' | 'Others';
  searchText: string;
  /** What a person is part of (their school or office), when the registry links one. */
  context?: string;
}
export interface DirectoryIndex {
  dataset_version: string;
  identity_hash: string;
  allContacts: DirectoryEntry[];
}
export interface FactSource {
  id: string;
  collection: string;
  source_url: string | null;
  derived_from_source_id?: string | null;
  freshness: string;
  limitations: string[];
}
export interface CanonicalProperty {
  key: string;
  label: string;
  status: 'known' | 'unknown' | 'conflicting' | 'multiple';
  category: string;
  assertions: { id: string; source_id: string }[];
  values: { id: string; value: unknown; assertion_ids: string[]; evidence_count: number;
    valid_from: string | null; valid_until: string | null }[];
}
export interface CanonicalFacts {
  dataset_version: string;
  identity_hash: string;
  entity: { id: string; name: string };
  properties_complete: boolean;
  properties: CanonicalProperty[];
  sources: FactSource[];
}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string');

export function isDirectoryIndex(value: unknown): value is DirectoryIndex {
  return object(value) && typeof value.dataset_version === 'string' && typeof value.identity_hash === 'string'
    && Array.isArray(value.allContacts) && value.allContacts.every(entry => object(entry)
      && typeof entry.id === 'string' && entry.canonical_entity_id === entry.id
      && typeof entry.name === 'string' && typeof entry.kind === 'string'
      && typeof entry.searchText === 'string' && ['Offices', 'Staff & Faculty', 'Others'].includes(String(entry.bucket))
      && (entry.context === undefined || typeof entry.context === 'string'));
}

export function isCanonicalFacts(value: unknown): value is CanonicalFacts {
  return object(value) && typeof value.dataset_version === 'string' && typeof value.identity_hash === 'string'
    && object(value.entity) && typeof value.entity.id === 'string' && typeof value.entity.name === 'string'
    && typeof value.properties_complete === 'boolean'
    && Array.isArray(value.properties) && value.properties.every(prop => object(prop)
      && typeof prop.key === 'string' && typeof prop.label === 'string' && typeof prop.category === 'string'
      && ['known', 'unknown', 'conflicting', 'multiple'].includes(String(prop.status))
      && Array.isArray(prop.assertions) && prop.assertions.every(a => object(a) && typeof a.id === 'string' && typeof a.source_id === 'string')
      && Array.isArray(prop.values) && prop.values.every(v => object(v) && typeof v.id === 'string'
        && typeof v.evidence_count === 'number' && strings(v.assertion_ids)
        && (v.valid_from === null || typeof v.valid_from === 'string') && (v.valid_until === null || typeof v.valid_until === 'string')))
    && Array.isArray(value.sources) && value.sources.every(source => object(source) && typeof source.id === 'string'
      && typeof source.collection === 'string' && typeof source.freshness === 'string' && strings(source.limitations)
      && (source.source_url === null || typeof source.source_url === 'string'));
}

export function sourceLinks(property: CanonicalProperty, assertionIds: string[], sources: FactSource[]) {
  const ids = new Set(property.assertions.filter(a => assertionIds.includes(a.id)).map(a => a.source_id));
  return sources.filter(source => ids.has(source.id));
}

export function safeWebUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined; }
  catch { return; }
}
