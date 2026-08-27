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
  const [mobileTab, setMobileTab] = useState<'map' | 'list'>('map');

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Campus map"
        tabIndex={-1}
        className={`${MODAL_PANEL} max-w-5xl h-[90vh]`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-border bg-background shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-primary/10 rounded-xl shrink-0">
              <span className="text-primary font-bold text-base">3D</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold leading-tight truncate">
                {selectedLocation.name || 'Campus Map'}
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                {selectedLocation.buildingName ? `In ${selectedLocation.buildingName}` : 'Ramapo College 3D Campus Map'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={selectedLocation.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors border border-border"
              title="Open full interactive map in new tab"
            >
              <span>Open in New Tab</span>
              <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-full transition-colors opacity-70 hover:opacity-100"
              aria-label="Close map"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile View Toggle */}
        <div className="flex md:hidden border-b border-border bg-muted/40 p-1.5 shrink-0">
          <button
            onClick={() => setMobileTab('map')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              mobileTab === 'map' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
            }`}
          >
            3D Map View
          </button>
          <button
            onClick={() => setMobileTab('list')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              mobileTab === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
            }`}
          >
            Directory & Search ({filteredLocations.length})
          </button>
        </div>

        {/* Main Content Area: Side-by-side on desktop, Toggled on mobile */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left Panel: Search & Location Directory */}
          <div
            className={`w-full md:w-80 lg:w-96 border-r border-border flex flex-col bg-muted/10 shrink-0 ${
              mobileTab === 'list' ? 'flex' : 'hidden md:flex'
            }`}
          >
            {/* Search Input */}
            <div className="p-3 border-b border-border bg-background shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  aria-label="Search campus map"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search buildings, parking, offices..."
                  className="w-full bg-muted/50 border border-border rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 text-foreground"
                />
              </div>
            </div>

            {/* Categorized Location List */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2.5 scrollbar-none">
              {filteredLocations.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No matching locations found.
                </div>
              ) : (
                groupedLocations.map((section) => {
                  const isCollapsed = collapsedSections[section.type];
                  return (
                    <section key={section.type} className="rounded-xl border border-border/60 bg-background/60 overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedSections((prev) => ({
                            ...prev,
                            [section.type]: !prev[section.type],
                          }))
                        }
                        className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-muted/30 transition-colors"
                        aria-expanded={!isCollapsed}
                      >
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                            {typeLabel(section.type)}
                          </span>
                        </div>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {section.locations.length}
                        </span>
                      </button>

                      {!isCollapsed && (
                        <div className="p-1.5 space-y-1 border-t border-border/40">
                          {section.locations.map((location) => {
                            const isSelected = location.key === visibleSelectedKey;
                            return (
                              <button
                                key={location.key}
                                ref={isSelected ? selectedItemRef : undefined}
                                onClick={() => {
                                  setSelectedKey(location.key);
                                  setMobileTab('map');
                                }}
                                className={`w-full text-left rounded-lg px-2.5 py-2 transition-all ${
                                  isSelected
                                    ? 'bg-primary text-primary-foreground shadow-sm font-medium'
                                    : 'hover:bg-muted text-foreground'
                                }`}
                              >
                                <p className="text-xs font-semibold leading-tight">{location.name}</p>
                                {location.buildingName && (
                                  <p className={`text-[11px] mt-0.5 ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                                    {location.room ? `Room ${location.room} · ` : ''}{location.buildingName}
                                  </p>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel: Clean 3D Map Canvas */}
          <div
            className={`flex-1 min-h-0 min-w-0 bg-background relative overflow-hidden ${
              mobileTab === 'map' ? 'flex' : 'hidden md:flex'
            }`}
          >
            <iframe
              title={`Ramapo 3D map view for ${selectedLocation.name}`}
              src={cleanEmbedUrl}
              allow="geolocation; fullscreen"
              className="w-full h-full border-0 bg-muted/10"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
