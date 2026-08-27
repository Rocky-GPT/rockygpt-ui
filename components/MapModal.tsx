/**
 * @module components/MapModal
 * Interactive campus map modal with searchable building, office,
 * parking, and layer markers sourced from the campus-map-data dataset.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccessibleDialog } from '@/components/useAccessibleDialog';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { loadCampusData, objectWithArray } from '@/lib/campus-data';
import { MODAL_PANEL } from '@/components/modalShell';
import type { MapLocation } from '@/lib/data-types';

const CAMPUS_MAP_KEY = 'layer_campus_map';

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLocationKey?: string | null;
}

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim();
}

const STOP_WORDS = new Set(['where', 'is', 'the', 'a', 'an', 'of', 'for', 'to', 'map']);

function tokenize(input: string): string[] {
  return normalize(input)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => {
      if (!token) return false;
      if (/^\d+$/.test(token)) return true;
      return token.length >= 3 && !STOP_WORDS.has(token);
    });
}

function tokenHits(tokens: string[], location: MapLocation): number {
  if (tokens.length === 0) return 0;
  const searchable = [location.name, location.buildingName ?? '', ...location.aliases]
    .join(' ')
    .toLowerCase();

  let hits = 0;
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(searchable)) {
      hits += 1;
      continue;
    }
    if (token.endsWith('ing')) {
      const stem = token.slice(0, -3);
      if (stem.length >= 3 && new RegExp(`\\b${stem}`, 'i').test(searchable)) {
        hits += 1;
      }
    }
  }
  return hits;
}

function typeLabel(type: MapLocation['type']): string {
  if (type === 'building') return 'Building';
  if (type === 'office') return 'Office';
  if (type === 'parking') return 'Parking';
  return 'Layer';
}

const TYPE_SECTION_ORDER: MapLocation['type'][] = ['office', 'building', 'parking', 'layer'];

function createDefaultCollapsedState(): Record<MapLocation['type'], boolean> {
  return {
    office: false,
    building: false,
    parking: false,
    layer: false,
  };
}

function filterLocations(locations: MapLocation[], query: string): MapLocation[] {
  const normalizedQuery = normalize(query);
  const queryTokens = tokenize(query);

  if (!normalizedQuery) {
    return [...locations].sort((a, b) => a.name.localeCompare(b.name));
  }

  const ranked = locations
    .map((location) => {
      let score = 0;
      const normalizedName = normalize(location.name);
      if (normalizedName === normalizedQuery) score += 500;
      if (normalizedName.includes(normalizedQuery)) score += 300;
      if (normalizedQuery.includes(normalizedName) && normalizedName.length >= 4) score += 250;

      for (const alias of location.aliases) {
        const normalizedAlias = normalize(alias);
        if (!normalizedAlias) continue;
        if (normalizedAlias === normalizedQuery) score += 220;
        if (normalizedAlias.includes(normalizedQuery)) score += 140;
        if (normalizedQuery.includes(normalizedAlias) && normalizedAlias.length >= 4) score += 120;
      }

      const hits = tokenHits(queryTokens, location);
      if (hits > 0) score += hits * 90;
      if (queryTokens.length > 0 && hits === queryTokens.length) score += 100;

      if (location.buildingName) {
        const normalizedBuilding = normalize(location.buildingName);
        if (normalizedBuilding.includes(normalizedQuery)) score += 70;
      }

      return { location, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.location.name.localeCompare(b.location.name))
    .map((entry) => entry.location);

  return ranked;
}

function cleanMapEmbedUrl(rawUrl: string): string {
  if (!rawUrl) return 'https://map.concept3d.com/?id=2292&sb=0&tb=0&embed=true#!m/1133343';
  try {
    const url = new URL(rawUrl);
    const id = url.searchParams.get('id') || '2292';
    // Strip sidebar control query params embedded in hash
    let hash = url.hash.replace(/\?sbc\/?/, '').replace(/\?sbh\/?/, '');
    // If the hash only has broad categories (#!ct/...) or is empty, focus on central campus core (Student Center: 1133343)
    // so it starts directly in 3D close-up rather than zooming out to the highway and county
    if (!hash || hash === '#!' || hash.startsWith('#!ct/')) {
      hash = '#!m/1133343';
    }
    return `https://map.concept3d.com/?id=${id}&sb=0&tb=0&embed=true${hash}`;
  } catch {
    return rawUrl;
  }
}

/**
 * Modal for searching and opening campus map locations.
 */
export function MapModal({ isOpen, onClose, initialLocationKey }: MapModalProps) {
  const dialogRef = useAccessibleDialog(isOpen, onClose);
  const selectedItemRef = useRef<HTMLButtonElement | null>(null);
  const [search, setSearch] = useState('');
  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>(initialLocationKey ?? CAMPUS_MAP_KEY);
  const [collapsedSections, setCollapsedSections] = useState<Record<MapLocation['type'], boolean>>(
    () => createDefaultCollapsedState(),
  );

  const locationByKey = useMemo(
    () => new Map(locations.map((location) => [location.key, location])),
    [locations]
  );

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    void loadCampusData('/api/map', objectWithArray('locations'), {
      signal: controller.signal,
    })
      .then((result) => {
        if (!result.ok) {
          console.error('Unable to load campus map:', result.message);
          setLocations([]);
          return;
        }
        setLocations(result.data.locations as MapLocation[]);
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Unable to load campus map:', error);
        }
      });
    return () => controller.abort();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      if (initialLocationKey) {
        const resolved = locationByKey.get(initialLocationKey) ?? filterLocations(locations, initialLocationKey)[0];
        if (resolved) {
          setSelectedKey(resolved.key);
          setCollapsedSections((prev) => ({
            ...prev,
            [resolved.type]: false,
          }));
        }
      }
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, initialLocationKey, locationByKey, locations]);

  const filteredLocations = useMemo(() => filterLocations(locations, search), [locations, search]);
  const groupedLocations = useMemo(() => {
    const grouped: Record<MapLocation['type'], MapLocation[]> = {
      office: [],
      building: [],
      parking: [],
      layer: [],
    };

    for (const location of filteredLocations) {
      grouped[location.type].push(location);
    }

    return TYPE_SECTION_ORDER
      .map((type) => ({ type, locations: grouped[type] }))
      .filter((section) => section.locations.length > 0);
  }, [filteredLocations]);

  const visibleSelectedKey = filteredLocations.some((location) => location.key === selectedKey)
    ? selectedKey
    : (filteredLocations[0]?.key ?? CAMPUS_MAP_KEY);

  useEffect(() => {
    if (isOpen && visibleSelectedKey) {
      const selectedLoc = locationByKey.get(visibleSelectedKey);
      if (selectedLoc) {
        setCollapsedSections((prev) => ({
          ...prev,
          [selectedLoc.type]: false,
        }));
      }
      const timer = setTimeout(() => {
        selectedItemRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 180);
      return () => clearTimeout(timer);
    }
  }, [isOpen, visibleSelectedKey, locationByKey]);

  const selectedLocation = locationByKey.get(visibleSelectedKey) ?? locationByKey.get(CAMPUS_MAP_KEY);
  if (!isOpen || !selectedLocation) return null;
  const cleanEmbedUrl = cleanMapEmbedUrl(selectedLocation.mapUrl);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Campus map"
        tabIndex={-1}
        className={MODAL_PANEL}>
        <div className="flex-1 min-h-0 min-w-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden">
          <div className="min-h-0 min-w-0 bg-muted/20 overflow-hidden border-b border-border">
            <div className="relative h-full w-full min-w-0 overflow-hidden bg-background">
              <button
                onClick={onClose}
                className="absolute top-2 right-2 z-20 inline-flex items-center justify-center h-9 w-9 rounded-full bg-background/75 border border-border/70 backdrop-blur-sm text-foreground/80 hover:text-foreground hover:bg-background/90 transition-colors"
                aria-label="Close map"
              >
                <X className="w-5 h-5" />
              </button>
              <iframe
                title={`Ramapo map preview for ${selectedLocation.name}`}
                src={cleanEmbedUrl}
                allow="geolocation; fullscreen"
                className="w-full h-full border-0 bg-muted/10"
              />
            </div>
          </div>

          <div className="min-h-0 min-w-0 flex flex-col">
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto scrollbar-none">
              {filteredLocations.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No matches found. Try a different search term.</div>
              ) : (
                <div className="p-3 space-y-3">
                  {groupedLocations.map((section) => {
                    const isCollapsed = collapsedSections[section.type];
                    return (
                      <section key={section.type} className="rounded-xl border border-border/50 bg-muted/10">
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedSections((previous) => ({
                              ...previous,
                              [section.type]: !previous[section.type],
                            }))
                          }
                          className="w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted/20"
                          aria-expanded={!isCollapsed}
                          aria-controls={`map-type-section-${section.type}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {isCollapsed ? (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="text-xs font-semibold uppercase tracking-wide text-foreground/90">
                                {typeLabel(section.type)}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">{section.locations.length}</span>
                          </div>
                        </button>

                        {!isCollapsed && (
                          <div id={`map-type-section-${section.type}`} className="space-y-2 px-2 pb-2">
                            {section.locations.map((location) => {
                              const isSelected = location.key === visibleSelectedKey;
                              return (
                                <button
                                  key={location.key}
                                  ref={isSelected ? selectedItemRef : undefined}
                                  onClick={() => setSelectedKey(location.key)}
                                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all ${
                                    isSelected
                                      ? 'border-[#8E0A26] bg-[#8E0A26]/15 ring-2 ring-[#8E0A26]/50 shadow-md'
                                      : 'border-border/60 bg-muted/20 hover:bg-muted/40'
                                  }`}
                                >
                                  <p className="text-sm font-semibold leading-snug">{location.name}</p>
                                  <div className="mt-1 space-y-0.5">
                                    {location.type === 'office' ? (
                                      location.room ? (
                                        <p className="text-xs text-muted-foreground">Room: {location.room}</p>
                                      ) : (
                                        location.buildingName && (
                                          <p className="text-xs text-muted-foreground">In {location.buildingName}</p>
                                        )
                                      )
                                    ) : (
                                      location.buildingName && (
                                        <p className="text-xs text-muted-foreground">In {location.buildingName}</p>
                                      )
                                    )}
                                    {location.description && (
                                      <p className="text-xs text-muted-foreground">{location.description}</p>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="min-w-0 px-6 py-3 border-t border-border bg-background/80 backdrop-blur-sm">
              <div className="relative min-w-0">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  aria-label="Search campus map"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search buildings, offices, parking, or map layers"
                  className="w-full min-w-0 bg-muted/60 border border-border rounded-xl pl-9 pr-3 py-2.5 text-base md:text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
