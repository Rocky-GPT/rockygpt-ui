/**
 * @module components/MapModal
 * Interactive campus map modal with searchable building, office,
 * parking, and layer markers sourced from the campus-map-data dataset.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccessibleDialog } from '@/components/useAccessibleDialog';
import { Loader2, LocateFixed, MapPin, Search, X } from 'lucide-react';
import { loadCampusData, objectWithArray } from '@/lib/campus-data';
import { MODAL_OVERLAY, MODAL_PANEL } from '@/components/modalShell';
import type { MapLocation } from '@/lib/data-types';

const CAMPUS_MAP_KEY = 'layer_campus_map';
const CAMPUS_MAP_ID = '2292';
const CAMPUS_MAP_ORIGIN = 'https://map.ramapo.edu';
const CAMPUS_OVERVIEW_HASH = '#!ct/99549,99550,99551';
const MAP_SELECTION_RESET_MS = 650;

type LocationStatus =
  | { state: 'idle'; message: '' }
  | { state: 'locating'; message: string }
  | { state: 'shown'; message: string }
  | { state: 'error'; message: string };

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

/**
 * Close enough to see the building you asked for.
 *
 * A marker on its own drops the pin but keeps the campus-wide framing, so
 * choosing "Birch Tree Inn Restaurant" answered with a pin somewhere in a
 * picture of the whole college — technically the right place and no use for
 * finding the door. At this level the building, its paths and its entrances
 * are all legible.
 *
 * Only a single place is zoomed. A category pins several at once — every
 * dining location, every lot — and framing one of them would cut the rest off
 * the map, so those keep the wider view that shows the set.
 */
const PLACE_ZOOM = 18;

function withPlaceZoom(hash: string): string {
  if (!/^#!m\/\d+/.test(hash)) return hash;
  if (/\?z\//.test(hash)) return hash;
  return `${hash}?z/${PLACE_ZOOM}`;
}

/**
 * The flags every embed of this map carries.
 *
 * `mbh` suppresses Concept3D's native marker panel so RockyGPT can own the
 * surrounding location UI. `sbh`, `tbh`, and `mch` hide the remaining map
 * chrome, including the home, layer, and zoom control stack.
 *
 * `cph` suppresses Concept3D's cookie prompt, and `gtagConsent` supplies the
 * answer it was asking for. It is `necessary`, never `granted`: the only thing
 * consented to is what the map needs to draw itself. RockyGPT is not in a
 * position to grant analytics or marketing consent for a student, so it does
 * not — and hiding the prompt while claiming more than that would be worse
 * than the prompt.
 *
 * Answering here rather than in the frame is also what makes the answer stick.
 * Concept3D records a consent it collects itself in a cookie on its own
 * origin, which Safari discards for a third-party frame, so a prompt accepted
 * on one open was asked again on the next. A url carries no such baggage.
 */
const EMBED_FLAGS = '&sbh&tbh&mbh&mch&cph&gtagConsent=necessary';

const embedUrl = (id: string, hash: string): string =>
  `${CAMPUS_MAP_ORIGIN}/?id=${id}${EMBED_FLAGS}${hash}`;

function cleanMapEmbedUrl(rawUrl: string): string {
  if (!rawUrl) return embedUrl(CAMPUS_MAP_ID, CAMPUS_OVERVIEW_HASH);
  try {
    const url = new URL(rawUrl);
    const requestedId = url.searchParams.get('id');
    const id = requestedId && /^\d+$/.test(requestedId) ? requestedId : CAMPUS_MAP_ID;
    // Strip sidebar control query params embedded in hash
    let hash = url.hash.replace(/\?sbc\/?/, '').replace(/\?sbh\/?/, '');
    if (!hash || hash === '#!') hash = CAMPUS_OVERVIEW_HASH;
    return embedUrl(id, withPlaceZoom(hash));
  } catch {
    return embedUrl(CAMPUS_MAP_ID, CAMPUS_OVERVIEW_HASH);
  }
}

function currentLocationMapUrl(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(6);
  const lng = longitude.toFixed(6);
  return embedUrl(CAMPUS_MAP_ID, `#!mc/${lat},${lng}?z/19?fls/`);
}

function markerIdFromMapUrl(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hash.match(/^#!m\/(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function geolocationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Location access was denied. Allow it in your browser settings and try again.';
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return 'Your location is unavailable right now. Check location services and try again.';
  }
  if (error.code === error.TIMEOUT) {
    return 'Finding your location took too long. Move somewhere with a clearer signal and try again.';
  }
  return 'Your location could not be found. Please try again.';
}

/**
 * Modal for searching and opening campus map locations.
 */
export function MapModal({ isOpen, onClose, initialLocationKey }: MapModalProps) {
  const dialogRef = useAccessibleDialog(isOpen, onClose);
  const selectedItemRef = useRef<HTMLButtonElement | null>(null);
  const resultsPanelRef = useRef<HTMLDivElement | null>(null);
  const mapFrameRef = useRef<HTMLIFrameElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mapTransitionTimerRef = useRef<number | null>(null);
  const [search, setSearch] = useState('');
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(false);
  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>(initialLocationKey ?? CAMPUS_MAP_KEY);
  const [selectedSummaryKey, setSelectedSummaryKey] = useState<string | null>(null);
  const [currentLocationUrl, setCurrentLocationUrl] = useState<string | null>(null);
  const [transitionMapUrl, setTransitionMapUrl] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>({ state: 'idle', message: '' });

  const locationByKey = useMemo(
    () => new Map(locations.map((location) => [location.key, location])),
    [locations]
  );
  const locationByMarkerId = useMemo(() => {
    const markerLocations = new Map<string, MapLocation>();
    for (const location of locations) {
      const markerId = markerIdFromMapUrl(location.mapUrl);
      if (!markerId) continue;
      const existing = markerLocations.get(markerId);
      // Offices can share their building's marker. Select the building entry
      // when the map itself reports that marker so the list stays intuitive.
      if (!existing || (location.type === 'building' && existing.type !== 'building')) {
        markerLocations.set(markerId, location);
      }
    }
    return markerLocations;
  }, [locations]);

  useEffect(() => {
    return () => {
      if (mapTransitionTimerRef.current !== null) {
        window.clearTimeout(mapTransitionTimerRef.current);
      }
    };
  }, []);

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
          setSelectedSummaryKey(resolved.key);
        }
      }
    } else {
      document.body.style.overflow = 'unset';
      if (mapTransitionTimerRef.current !== null) {
        window.clearTimeout(mapTransitionTimerRef.current);
        mapTransitionTimerRef.current = null;
      }
      setSearch('');
      setIsDirectoryOpen(false);
      setSelectedKey(CAMPUS_MAP_KEY);
      setSelectedSummaryKey(null);
      setCurrentLocationUrl(null);
      setTransitionMapUrl(null);
      setLocationStatus({ state: 'idle', message: '' });
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, initialLocationKey, locationByKey, locations]);

  useEffect(() => {
    if (!isOpen) return;

    const handleMapMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== CAMPUS_MAP_ORIGIN || event.source !== mapFrameRef.current?.contentWindow) {
        return;
      }
      if (!event.data || typeof event.data !== 'object') return;

      const message = event.data as { type?: unknown; id?: unknown };
      if (message.type !== 'c3dMarkerClick') return;
      if (typeof message.id !== 'string' && typeof message.id !== 'number') return;

      const location = locationByMarkerId.get(String(message.id));
      if (!location) return;

      if (mapTransitionTimerRef.current !== null) {
        window.clearTimeout(mapTransitionTimerRef.current);
        mapTransitionTimerRef.current = null;
      }
      setCurrentLocationUrl(null);
      setTransitionMapUrl(null);
      setLocationStatus({ state: 'idle', message: '' });
      setSearch('');
      setIsDirectoryOpen(false);
      searchInputRef.current?.blur();
      setSelectedKey(location.key);
      setSelectedSummaryKey(location.key);
    };

    window.addEventListener('message', handleMapMessage);
    return () => window.removeEventListener('message', handleMapMessage);
  }, [isOpen, locationByMarkerId]);

  // Tapping the box is not asking for all 204 places. It opened the whole
  // directory — every building, all 126 offices, parking and layers — and
  // buried the field you were about to type into under it. Results start when
  // there is something to match.
  const filteredLocations = useMemo(
    () => (isDirectoryOpen && search.trim() ? filterLocations(locations, search) : []),
    [isDirectoryOpen, locations, search]
  );
  const selectedSummaryLocation = selectedSummaryKey
    ? locationByKey.get(selectedSummaryKey)
    : undefined;
  const showResultPanel = isDirectoryOpen && search.trim().length > 0;
  const visibleSelectedKey = filteredLocations.some((location) => location.key === selectedKey)
    ? selectedKey
    : null;

  useEffect(() => {
    if (isOpen && visibleSelectedKey) {
      const frame = window.requestAnimationFrame(() => {
        selectedItemRef.current?.scrollIntoView({
          behavior: 'auto',
          block: 'center',
        });
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [isOpen, visibleSelectedKey]);

  // A list that grows upward starts at its own end. Ten matches for "birch"
  // overflow the panel, and the one worth reading is the last row, so an
  // untouched scroll position would open on the worst of them.
  useEffect(() => {
    const panel = resultsPanelRef.current;
    if (!panel || !filteredLocations.length) return;
    const frame = window.requestAnimationFrame(() => {
      panel.scrollTop = panel.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [filteredLocations]);

  const selectedLocation = locationByKey.get(selectedKey) ?? locationByKey.get(CAMPUS_MAP_KEY);
  if (!isOpen || !selectedLocation) return null;
  const cleanEmbedUrl = cleanMapEmbedUrl(selectedLocation.mapUrl);
  const mapEmbedUrl = currentLocationUrl ?? transitionMapUrl ?? cleanEmbedUrl;

  const showCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus({
        state: 'error',
        message: 'This browser does not support location services.',
      });
      return;
    }

    setIsDirectoryOpen(false);
    setSearch('');
    searchInputRef.current?.blur();
    if (mapTransitionTimerRef.current !== null) {
      window.clearTimeout(mapTransitionTimerRef.current);
      mapTransitionTimerRef.current = null;
    }
    setTransitionMapUrl(null);
    setLocationStatus({ state: 'locating', message: 'Finding your location…' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCurrentLocationUrl(currentLocationMapUrl(coords.latitude, coords.longitude));
        setSelectedSummaryKey(null);
        setLocationStatus({
          state: 'shown',
          message: 'Showing your current location on the campus map.',
        });
      },
      (error) => {
        setCurrentLocationUrl(null);
        setLocationStatus({ state: 'error', message: geolocationErrorMessage(error) });
      },
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 30_000,
      }
    );
  };

  const selectLocation = (key: string) => {
    const targetLocation = locationByKey.get(key);
    const overviewLocation = locationByKey.get(CAMPUS_MAP_KEY);
    if (mapTransitionTimerRef.current !== null) {
      window.clearTimeout(mapTransitionTimerRef.current);
    }
    if (targetLocation && overviewLocation) {
      setTransitionMapUrl(cleanMapEmbedUrl(overviewLocation.mapUrl));
      mapTransitionTimerRef.current = window.setTimeout(() => {
        setTransitionMapUrl(cleanMapEmbedUrl(targetLocation.mapUrl));
        mapTransitionTimerRef.current = null;
      }, MAP_SELECTION_RESET_MS);
    } else {
      mapTransitionTimerRef.current = null;
      setTransitionMapUrl(null);
    }
    setCurrentLocationUrl(null);
    setLocationStatus({ state: 'idle', message: '' });
    setSelectedKey(key);
    setSelectedSummaryKey(key);
    setSearch('');
    setIsDirectoryOpen(false);
    searchInputRef.current?.blur();
  };

  return (
    <div className={MODAL_OVERLAY}>
      <div className="absolute inset-0" onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Campus map"
        tabIndex={-1}
        className={MODAL_PANEL}>
        {/*
          While there is a query the map gives up its row entirely and the
          results take the card. Half a map and half a list left too little of
          either on a phone — four results visible above a map too small to
          read. The row collapses rather than unmounting, because tearing the
          iframe out would reload the whole Concept3D map and lose the pin you
          are searching from.
        */}
        <div
          className={`flex-1 min-h-0 min-w-0 grid overflow-hidden ${
            showResultPanel
              ? 'grid-rows-[0fr_minmax(0,1fr)]'
              : 'grid-rows-[minmax(0,1fr)_auto]'
          }`}
        >
          <div
            className={`min-h-0 min-w-0 bg-muted/20 overflow-hidden ${
              showResultPanel ? '' : 'border-b border-border'
            }`}
          >
            <div className="relative h-full w-full min-w-0 overflow-hidden bg-background">
              <div className="absolute bottom-2 left-2 z-20 flex max-w-[calc(100%-1rem)] flex-col items-start gap-2">
                {locationStatus.message && (
                  <p
                    id="campus-map-location-status"
                    role="status"
                    aria-live="polite"
                    className={`max-w-sm rounded-lg border px-3 py-2 text-xs shadow-md backdrop-blur-sm ${
                      locationStatus.state === 'error'
                        ? 'border-destructive/40 bg-destructive/90 text-destructive-foreground'
                        : 'border-border/70 bg-background/90 text-foreground'
                    }`}
                  >
                    {locationStatus.message}
                  </p>
                )}
                <button
                  type="button"
                  onClick={showCurrentLocation}
                  disabled={locationStatus.state === 'locating'}
                  aria-describedby={locationStatus.message ? 'campus-map-location-status' : undefined}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-border/70 bg-background/90 px-3 text-sm font-semibold text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-wait disabled:opacity-70"
                >
                  {locationStatus.state === 'locating' ? (
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  ) : (
                    <LocateFixed aria-hidden="true" className="h-4 w-4" />
                  )}
                  {locationStatus.state === 'locating' ? 'Locating…' : 'Where am I?'}
                </button>
              </div>
              <iframe
                ref={mapFrameRef}
                title={
                  currentLocationUrl
                    ? 'Ramapo map showing your current location'
                    : `Ramapo map preview for ${selectedLocation.name}`
                }
                src={mapEmbedUrl}
                // Do not delegate geolocation merely by opening the map. It is
                // enabled only after the explicit "Where am I?" action succeeds,
                // allowing Concept3D to render and update its native blue dot.
                allow={currentLocationUrl ? 'geolocation; fullscreen' : 'fullscreen'}
                className="w-full h-full border-0 bg-muted/10"
              />
            </div>
          </div>

          <div className="min-h-0 min-w-0 flex flex-col">
            {showResultPanel && (
              <div
                ref={resultsPanelRef}
                data-testid="campus-map-results"
                // Results stack up from the search field rather than down from
                // the top. One match against a full-height card left the answer
                // stranded at the far end of the panel, furthest from both the
                // field it came from and the thumb that has to reach it.
                // `mt-auto` on the list rather than `justify-end` here: an auto
                // margin collapses to nothing once the list is taller than the
                // panel, where `justify-end` would clip the first rows out of
                // scroll range instead.
                className="flex flex-1 min-h-0 min-w-0 flex-col overflow-y-auto scrollbar-none"
              >
                {filteredLocations.length === 0 ? (
                  <div className="mt-auto p-4 text-sm text-muted-foreground">
                    No matches found. Try a different search term.
                  </div>
                ) : (
                  /*
                    One flat list, in relevance order. It was grouped into
                    collapsible cards per type, which made sense when tapping
                    the box showed all 204 places and you needed somewhere to
                    start. Now the query has already narrowed it, and the best
                    match is what should be under your thumb — not the first
                    member of whichever section happened to sort first.
                  */
                  /*
                    Reversed in the DOM rather than with `flex-col-reverse`, so
                    what a screen reader reads and what the Tab key visits is
                    the order actually on screen. Shift-Tab out of the field
                    therefore reaches the best match first, which is also the
                    row directly above it.
                  */
                  <ul className="mt-auto">
                    {[...filteredLocations].reverse().map((location) => {
                      const isSelected = location.key === selectedKey;
                      const secondary =
                        location.type === 'office' && location.room
                          ? `Room: ${location.room}`
                          : location.buildingName
                            ? `In ${location.buildingName}`
                            : location.description || typeLabel(location.type);
                      return (
                        <li key={location.key} className="border-b border-border/40 last:border-b-0">
                          <button
                            ref={isSelected ? selectedItemRef : undefined}
                            onClick={() => selectLocation(location.key)}
                            className={`flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                              isSelected ? 'bg-[#8E0A26]/15' : 'hover:bg-muted/40'
                            }`}
                          >
                            <MapPin
                              aria-hidden="true"
                              className="h-4 w-4 shrink-0 text-muted-foreground"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] leading-snug text-foreground">
                                {location.name}
                              </span>
                              {secondary && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {secondary}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            <div className="min-w-0 border-t border-border bg-background/80 backdrop-blur-sm">
              <div className="min-w-0 px-4 py-3 md:px-6">
                <div className="relative min-w-0">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    aria-label="Search campus map"
                    value={search}
                    // Nothing is submitted from here: a place is chosen from
                    // the list or it is not chosen. Return therefore commits
                    // nothing and only puts the keyboard away, which is what
                    // the hint promises and what iOS draws its own Done button
                    // above the keys to do. The accessory bar cannot be hidden
                    // from a web page, so the least it can do is not lie.
                    enterKeyHint="done"
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      searchInputRef.current?.blur();
                    }}
                    onFocus={() => setIsDirectoryOpen(true)}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={selectedSummaryLocation?.name ?? 'Search the campus map'}
                    className="w-full min-w-0 bg-muted/60 border border-border rounded-xl pl-9 pr-10 py-2.5 text-base md:text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {search && (
                    <button
                      type="button"
                      aria-label="Close map search results"
                      onClick={() => {
                        setSearch('');
                        setIsDirectoryOpen(false);
                        searchInputRef.current?.blur();
                      }}
                      className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
