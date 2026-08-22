/**
 * @module components/QuickAccessButtons
 * Horizontal quick-action bar rendered above the chat input.
 *
 * Provides one-tap access to dining menus, shuttle schedules, campus map,
 * directory, events, clubs, safety info, calendar, and majors. Each
 * button opens its corresponding modal or triggers a chat shortcut.
 */

'use client';

import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useAccessibleDialog } from '@/components/useAccessibleDialog';
import { createPortal } from 'react-dom';
import { X, Loader2, Bus, Clock, Phone, Shield, MapPin, ExternalLink, AlertTriangle, Calendar, Users, Mail, Instagram, MessageCircle, Utensils, ChevronDown, Facebook, Twitter, Linkedin, Globe, GraduationCap, BookOpen, ChevronRight, Monitor, Database, Activity, FlaskConical, Leaf, Calculator, HeartPulse, Briefcase, Landmark, Palette, Music, Camera, PenTool, Scale, Microscope } from 'lucide-react';
import Fuse from 'fuse.js';
import { Virtuoso } from 'react-virtuoso';
import { parseSemesterEventDate } from '@/lib/calendar-dates';
import { MODAL_PANEL, MODAL_PANEL_SHORT } from '@/components/modalShell';
import type {
  DirectoryApiResponse,
  FacultyStaffContact,
  NormalizedDirectoryContact,
} from '@/lib/data-types';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============================================
// EVENTS MODAL - Campus Events (Searchable)
// ============================================
interface EventItem {
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  location?: string;
  organizer?: string;
  description?: string;
  imageUrl?: string;
  tags?: string[];
  ticketStatus?: string;
  attendance?: string;
  url?: string;
  offersFreeFood?: boolean;
  foodCategory?: 'food' | 'snacks';
}

// Helper functions for time parsing
const parseTime = (timeStr: string): [number, number] => {
  const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*([AP]M)/i);
  if (!match) return [0, 0];
  const h = match[1];
  const m = match[2];
  const period = match[3];
  let hour = parseInt(h);
  const minute = m ? parseInt(m) : 0;
  if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
  return [hour, minute];
};

const parseEventDate = (dateString: string): Date | null => {
  if (!dateString) return null;
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getEventWindow = (event: EventItem): { start: Date; end: Date } | null => {
  const eventDate = parseEventDate(event.date);
  if (!eventDate) return null;

  const start = new Date(eventDate);
  const end = new Date(eventDate);

  if (event.time) {
    const [startHour, startMinute] = parseTime(event.time);
    start.setHours(startHour, startMinute, 0, 0);
  } else {
    start.setHours(0, 0, 0, 0);
  }

  if (event.endTime) {
    const [endHour, endMinute] = parseTime(event.endTime);
    end.setHours(endHour, endMinute, 0, 0);
    if (end < start) {
      // Handle overnight events (e.g., 10 PM - 1 AM).
      end.setDate(end.getDate() + 1);
    }
  } else if (event.time) {
    end.setTime(start.getTime() + 2 * 60 * 60 * 1000);
  } else {
    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
};

const isEventNow = (event: EventItem): boolean => {
  const window = getEventWindow(event);
  if (!window) return false;
  const now = new Date();
  return now >= window.start && now <= window.end;
};

const isEventUpcoming = (event: EventItem): boolean => {
  const window = getEventWindow(event);
  if (!window) return true;
  return window.end.getTime() >= Date.now();
};

const compareEventsByStart = (a: EventItem, b: EventItem): number => {
  const aw = getEventWindow(a);
  const bw = getEventWindow(b);
  if (!aw && !bw) return 0;
  if (!aw) return 1;
  if (!bw) return -1;
  return aw.start.getTime() - bw.start.getTime();
};

const classifyFoodCategory = (text: string): 'food' | 'snacks' | null => {
  const normalized = text.toLowerCase();
  if (!normalized) return null;

  if (
    /(?:do you plan on serving food\??|serving food\??)\s*[:\-]?\s*(true|yes)/i.test(normalized)
  ) {
    return 'food';
  }

  if (/\b(food insecurity|food drive|food pantry|not serving food|no food)\b/i.test(normalized)) {
    return null;
  }

  if (/\bfree\s+food\b/i.test(normalized)) {
    return 'food';
  }

  if (/\bfood\s+(?:will be|is|are)?\s*(?:provided|served|available)\b/i.test(normalized)) {
    return 'food';
  }

  if (/\b(cookies?|snacks?|treats?|donuts?|bagels?|cupcakes?|brownies?|boba|refreshments?)\b/i.test(normalized)) {
    return 'snacks';
  }

  if (/\b(pizza|\bza\b|ice\s*cream|breakfast|brunch|lunch|dinner|meal|catering)\b/i.test(normalized)) {
    return 'food';
  }

  return null;
};

const getFoodCategory = (event: EventItem): 'food' | 'snacks' | null => {
  const searchableText = [event.title, event.description]
    .filter((value): value is string => Boolean(value))
    .join(' ');

  if (
    /(?:do you plan on serving food\??|serving food\??)\s*[:\-]?\s*(true|yes)/i.test(searchableText)
  ) {
    return 'food';
  }

  if (event.foodCategory) return event.foodCategory;

  if (event.offersFreeFood) {
    return 'food';
  }

  if (event.tags?.some((tag) => /\bfood\b/i.test(tag))) {
    return 'food';
  }

  return classifyFoodCategory(searchableText);
};

/**
 * Modal for campus events, athletics, and student activity discovery.
 */
export function EventsModal({ isOpen, onClose }: ModalProps) {
  const dialogRef = useAccessibleDialog(isOpen, onClose);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<EventItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [foodFilter, setFoodFilter] = useState<'none' | 'food' | 'snacks'>('none');
  const [loading, setLoading] = useState(true);

  // Helper function to format date relative to today
  const formatRelativeDate = (dateString: string): string => {
    if (!dateString) return '';
    
    // Parse the date string (format: "Mon, Feb 9, 2026")
    const eventDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + (6 - today.getDay())); // Saturday
    
    const startOfNextWeek = new Date(endOfWeek);
    startOfNextWeek.setDate(startOfNextWeek.getDate() + 1); // Sunday
    
    const endOfNextWeek = new Date(startOfNextWeek);
    endOfNextWeek.setDate(endOfNextWeek.getDate() + 6); // Next Saturday
    
    eventDate.setHours(0, 0, 0, 0);
    
    // Check if today
    if (eventDate.getTime() === today.getTime()) {
      return 'Today';
    }
    
    // Check if tomorrow
    if (eventDate.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
    }
    
    // Check if this week (after tomorrow)
    if (eventDate > tomorrow && eventDate <= endOfWeek) {
      const dayName = eventDate.toLocaleDateString('en-US', { weekday: 'long' });
      return dayName;
    }
    
    // Check if next week
    if (eventDate >= startOfNextWeek && eventDate <= endOfNextWeek) {
      const dayName = eventDate.toLocaleDateString('en-US', { weekday: 'long' });
      return `Next ${dayName}`;
    }

    return dateString.replace(/, \d{4}/, '');
  };

  // Load events from JSON
  useEffect(() => {
    if (isOpen) {
      fetch('/api/data/events')
        .then(res => res.json())
        .then(data => {
          const list = Array.isArray(data) ? (data as EventItem[]) : [];
          const upcoming = list.filter(isEventUpcoming).sort(compareEventsByStart);
          setEvents(upcoming);
          setFilteredEvents(upcoming);
          setLoading(false);
        })
        .catch(err => {
          console.error('Error loading events:', err);
          setLoading(false);
        });
    }
  }, [isOpen]);

  // Get all unique tags
  const allTags = ['All', ...Array.from(new Set(events.flatMap(e => e.tags || [])))].slice(0, 20);

  // Filter events
  useEffect(() => {
    let filtered = events;

    if (foodFilter !== 'none') {
      filtered = filtered.filter((event) => getFoodCategory(event) === foodFilter);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        e.title.toLowerCase().includes(query) ||
        e.organizer?.toLowerCase().includes(query) ||
        e.location?.toLowerCase().includes(query) ||
        e.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Filter by tag
    if (selectedTag && selectedTag !== 'All') {
      filtered = filtered.filter(e => e.tags?.includes(selectedTag));
    }

    setFilteredEvents(filtered);
  }, [searchQuery, selectedTag, foodFilter, events]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Campus events"
        tabIndex={-1}
        className={MODAL_PANEL}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-none mb-1">Campus Events</h2>
              <p className="text-xs text-muted-foreground font-medium">
                {filteredEvents.length} of {events.length} events
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors opacity-70 hover:opacity-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-4 border-b border-border bg-muted/30">
          <input
            type="text"
            aria-label="Search campus events"
            placeholder="Search events by title, organizer, location, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Tag Filter */}
        <div className="px-6 py-3 border-b border-border bg-background">
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 mt-1">
            <button
              onClick={() => setFoodFilter((prev) => (prev === 'food' ? 'none' : 'food'))}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors inline-flex items-center gap-1.5 ${
                foodFilter === 'food'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
              }`}
            >
              <Utensils className="w-3 h-3" />
              Food
            </button>
            <button
              onClick={() => setFoodFilter((prev) => (prev === 'snacks' ? 'none' : 'snacks'))}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors inline-flex items-center gap-1.5 ${
                foodFilter === 'snacks'
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300'
              }`}
            >
              <Utensils className="w-3 h-3" />
              Snacks
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  selectedTag === tag
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/70 text-muted-foreground'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Events List */}

        <div className="flex-1 min-h-0 overflow-hidden bg-background">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-muted-foreground mb-2">No events found</p>
              <button
                onClick={() => { setSearchQuery(''); setSelectedTag('All'); setFoodFilter('none'); }}
                className="text-sm text-primary hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <Virtuoso
              style={{ height: '100%' }}
              data={filteredEvents}
              className=""
              components={{
                Header: () => <div className="h-4" />,
                Footer: () => <div className="h-4" />,
              }}
              itemContent={(index, event) => (
                <a
                  key={index}
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative h-auto min-h-[5rem] mx-4 mb-3 rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-all group cursor-pointer block"
                  style={{
                    backgroundImage: event.imageUrl ? `url(${event.imageUrl})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40 group-hover:from-black/70 group-hover:via-black/50 group-hover:to-black/30 transition-all" />
                  
                  {/* Content */}
                  <div className="relative h-full flex flex-col justify-between px-4 pt-3 pb-2.5">
                    <div>
                      {/* Title */}
                      <h3 className="font-bold text-white text-base leading-tight mb-2 line-clamp-1">
                        {event.title}
                      </h3>
                      
                      {/* Date & Time */}
                      <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
                        {(() => {
                          const foodCategory = getFoodCategory(event);
                          return (
                            <>
                        {isEventNow(event) ? (
                          <span className="bg-red-600 text-white px-2 py-1.5 rounded font-bold animate-pulse text-xs whitespace-nowrap flex items-center gap-1.5 shadow-md shadow-red-500/20 leading-none">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                            </span>
                            LIVE
                          </span>
                        ) : (
                          <span className="bg-primary/90 text-white px-2 py-1 rounded font-medium whitespace-nowrap">
                            {formatRelativeDate(event.date)}
                          </span>
                        )}
                        {foodCategory && (
                          <span
                            className={`text-white px-2 py-1 rounded font-semibold whitespace-nowrap inline-flex items-center gap-1 ${
                              foodCategory === 'snacks' ? 'bg-amber-500' : 'bg-emerald-600'
                            }`}
                          >
                            <Utensils className="w-3 h-3" />
                            {foodCategory === 'snacks' ? 'Snacks' : 'Food'}
                          </span>
                        )}
                        {event.time && (
                          <span className="text-white/90 whitespace-nowrap">
                            • {event.time}{event.endTime && ` - ${event.endTime}`}
                          </span>
                        )}
                            </>
                          );
                        })()}
                      </div>

                      {/* Location & Organizer */}
                      <div className="flex items-center gap-3 text-xs text-white/80">
                        {event.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate max-w-[200px]">{event.location}</span>
                          </div>
                        )}
                        {event.organizer && (
                          <span className="truncate">By: {event.organizer}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </a>
              )}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/30 text-center">
          <p className="text-xs text-muted-foreground">
            Data from Archway • Updated regularly
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// DIRECTORY MODAL - Key Phone Numbers
// ============================================

const toTelHref = (phone: string): string => phone.replace(/[^0-9+]/g, '');
const getInitials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

const uniqueNonEmpty = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
};

const inferFacultyHelpTags = (person: FacultyStaffContact): string[] => {
  const title = (person.title ?? '').toLowerCase();
  const school = (person.school ?? '').toLowerCase();
  const text = `${title} ${school}`;
  const tags: string[] = [];

  if (/library|librarian/.test(text)) {
    tags.push('Research help', 'Citation support');
  }
  if (/dean|director|chair|coordinator/.test(title)) {
    tags.push('Department guidance', 'Program oversight');
  }
  if (/advisor|advis/.test(title)) {
    tags.push('Academic advising');
  }
  if (/nursing|health/.test(text)) {
    tags.push('Health pathways');
  }
  if (/anisfield|business|finance|accounting|marketing|management|economics/.test(text)) {
    tags.push('Business coursework');
  }
  if (/theoretical and applied science|science|computer|physics|chemistry|biology|math|engineering/.test(text)) {
    tags.push('STEM coursework');
  }
  if (/social science|human services|psychology|social work|law and society|sociology/.test(text)) {
    tags.push('Social science guidance');
  }
  if (/contemporary arts|art|music|theatre|dance/.test(text)) {
    tags.push('Arts programs');
  }
  if (/humanities|global studies|history|literature|languages|philosophy/.test(text)) {
    tags.push('Humanities pathways');
  }

  const unique = uniqueNonEmpty(tags);
  if (unique.length > 0) return unique.slice(0, 3);

  if (/retired|emeritus/.test(text)) {
    return ['Department history', 'Program context'];
  }

  return ['Academic guidance', 'Course planning'];
};

/**
 * Modal for searching campus offices, faculty, staff, and other contacts.
 */
export function DirectoryModal({ isOpen, onClose }: ModalProps) {
  const dialogRef = useAccessibleDialog(isOpen, onClose);
  const [allContacts, setAllContacts] = useState<NormalizedDirectoryContact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [activeTab, setActiveTab] = useState<'People' | 'Offices'>('People');

  useEffect(() => {
    if (!isOpen) return;

    setLoadingDirectory(true);
    fetch('/api/directory')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Directory request failed with ${res.status}`);
        }
        const data = (await res.json()) as Partial<DirectoryApiResponse>;
        const contacts = Array.isArray(data?.allContacts)
          ? (data.allContacts as NormalizedDirectoryContact[])
          : [];

        setAllContacts(contacts);
      })
      .catch((error) => {
        console.error('Error loading directory contacts:', error);
        setAllContacts([]);
      })
      .finally(() => setLoadingDirectory(false));
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredContacts = normalizedQuery
    ? allContacts.filter((entry) => {
        if (entry.searchText.includes(normalizedQuery)) return true;
        if (entry.bucket === 'Offices') return false;
        const helpTags = inferFacultyHelpTags({
          name: entry.name,
          title: entry.title,
          school: entry.school,
          email: entry.email,
          phone: entry.phone,
          office: entry.office,
          profileUrl: entry.profileUrl,
          imageUrl: entry.imageUrl,
        }).join(' ');
        return helpTags.toLowerCase().includes(normalizedQuery);
      })
    : allContacts;

  const filteredOfficeContacts = filteredContacts.filter((entry) => entry.bucket === 'Offices');
  const filteredPeopleContacts = filteredContacts
    .filter((entry) => entry.bucket === 'Staff & Faculty' || entry.bucket === 'Others' || entry.kind === 'person')
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

  const categories = [
    ...new Set(filteredOfficeContacts.map((entry) => entry.category).filter((value): value is string => Boolean(value))),
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Campus directory"
        tabIndex={-1}
        className={MODAL_PANEL}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl shrink-0">
              <Phone className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-none mb-1">Directory</h2>
              <p className="text-xs text-muted-foreground font-medium">
                {loadingDirectory && allContacts.length === 0
                  ? 'Loading contacts...'
                  : `${allContacts.length.toLocaleString()} campus contacts`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors opacity-70 hover:opacity-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-border bg-muted/30">
          <input
            type="text"
            aria-label="Search campus directory"
            placeholder="Search name, office, email or phone"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full mb-3 px-4 py-2.5 bg-background border border-border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="grid grid-cols-2 gap-1 p-1 bg-muted/60 rounded-xl border border-border/50">
            {(['People', 'Offices'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-1.5 text-xs font-semibold rounded-lg text-center transition-all ${
                  activeTab === tab
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4">
          {loadingDirectory && allContacts.length === 0 ? (
            <div className="flex items-center justify-center h-full py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : activeTab === 'People' ? (
            filteredPeopleContacts.length === 0 ? (
              <div className="text-center py-12 px-4">
                <p className="text-muted-foreground mb-2">No people found</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-sm text-primary hover:underline"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredPeopleContacts.map((person) => {
                  const key = person.id;
                  const cardContent = (
                    <div className="flex items-stretch min-h-[76px] sm:min-h-[80px]">
                      {/* Full-Height Left Attached Picture */}
                      {person.imageUrl ? (
                        <div
                          className="w-20 shrink-0 bg-cover bg-center border-r border-border/60 self-stretch"
                          style={{ backgroundImage: `url("${person.imageUrl.replace(/"/g, '%22')}")` }}
                          aria-hidden
                        />
                      ) : (
                        <div className="w-20 shrink-0 bg-muted/80 border-r border-border/60 text-foreground/80 text-xs font-bold flex items-center justify-center self-stretch">
                          {getInitials(person.name)}
                        </div>
                      )}

                      {/* Right Content Area */}
                      <div className="flex-1 min-w-0 p-3 sm:p-3.5 flex flex-col justify-center">
                        <div className="min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-semibold text-foreground leading-tight truncate">{person.name}</p>
                            {person.office && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-medium shrink-0">
                                <MapPin className="w-3 h-3 shrink-0 text-[#f4a8b5]" />
                                <span>{person.office}</span>
                              </span>
                            )}
                          </div>
                          {person.title && <p className="text-xs text-muted-foreground mt-1 truncate leading-tight">{person.title}</p>}
                          {person.unit && <p className="text-xs text-muted-foreground mt-0.5 truncate leading-tight">{person.unit}</p>}
                        </div>

                        {(person.email || person.phone || person.profileUrl) && (
                          <div className="mt-2.5 flex items-center gap-1.5">
                            {person.email && (
                              <a
                                href={`mailto:${person.email}`}
                                className="inline-flex items-center justify-center gap-1 p-1.5 sm:px-2.5 sm:py-1 rounded-md border border-border bg-muted/60 hover:bg-muted text-foreground text-xs font-semibold transition-colors"
                                aria-label={`Email ${person.name} at ${person.email}`}
                                title={person.email}
                              >
                                <Mail className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                <span className="hidden sm:inline">Email</span>
                              </a>
                            )}
                            {person.phone && (
                              <a
                                href={`tel:${toTelHref(person.phone)}`}
                                className="inline-flex items-center justify-center gap-1 p-1.5 sm:px-2.5 sm:py-1 rounded-md border border-border bg-muted/60 hover:bg-muted text-foreground text-xs font-semibold transition-colors whitespace-nowrap"
                                aria-label={`Call ${person.name}`}
                                title={person.phone}
                              >
                                <Phone className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                <span className="hidden sm:inline">Call</span>
                              </a>
                            )}
                            {person.profileUrl && (
                              <a
                                href={person.profileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-1 p-1.5 sm:px-2.5 sm:py-1 rounded-md border border-border bg-muted/60 hover:bg-muted text-foreground text-xs font-semibold transition-colors"
                                aria-label={`Open website for ${person.name}`}
                                title="Open profile website"
                              >
                                <Globe className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                <span className="hidden sm:inline">Web</span>
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );

                  return (
                    <div key={key} className="rounded-xl border border-border/70 bg-card/40 overflow-hidden transition-colors hover:bg-card/70">
                      {cardContent}
                    </div>
                  );
                })}
              </div>
            )
          ) : categories.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-muted-foreground mb-2">No office contacts found</p>
              <button
                onClick={() => setSearchQuery('')}
                className="text-sm text-primary hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : (
            categories.map((cat) => (
              <div key={cat}>
                <h3 className="text-xs font-bold uppercase text-muted-foreground mb-2 px-2">{cat}</h3>
                <div className="space-y-2.5">
                  {filteredOfficeContacts
                    .filter((entry) => entry.category === cat)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-border/70 bg-card/40 px-3.5 py-3 transition-colors hover:bg-card/70"
                      >
                        <div className="min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-semibold text-foreground leading-tight truncate">{item.name}</p>
                            {item.office && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-medium shrink-0">
                                <MapPin className="w-3 h-3 shrink-0 text-[#f4a8b5]" />
                                <span>{item.office}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        {(item.email || item.phone) && (
                          <div className="mt-2.5 flex items-center gap-1.5">
                            {item.email && (
                              <a
                                href={`mailto:${item.email}`}
                                className="inline-flex items-center justify-center gap-1 p-1.5 sm:px-2.5 sm:py-1 rounded-md border border-border bg-muted/60 hover:bg-muted text-foreground text-xs font-semibold transition-colors"
                                aria-label={`Email ${item.name} at ${item.email}`}
                                title={item.email}
                              >
                                <Mail className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                <span className="hidden sm:inline">Email</span>
                              </a>
                            )}
                            {item.phone && (
                              <a
                                href={`tel:${toTelHref(item.phone)}`}
                                className="inline-flex items-center justify-center gap-1 p-1.5 sm:px-2.5 sm:py-1 rounded-md border border-border bg-muted/60 hover:bg-muted text-foreground text-xs font-semibold transition-colors whitespace-nowrap"
                                aria-label={`Call ${item.name}`}
                                title={item.phone}
                              >
                                <Phone className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                <span className="hidden sm:inline">Call</span>
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}

// ============================================
// SAFETY MODAL - Emergency Info
// ============================================
/**
 * Modal for public safety, emergency, and student support information.
 */
export function SafetyModal({ isOpen, onClose }: ModalProps) {
  const dialogRef = useAccessibleDialog(isOpen, onClose);
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Public Safety information"
        tabIndex={-1}
        className={MODAL_PANEL_SHORT}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500/10 rounded-xl">
              <Shield className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-none mb-1">Campus Safety</h2>
              <p className="text-xs text-muted-foreground font-medium">Emergency contacts</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors opacity-70 hover:opacity-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          {/* Emergency Call */}
          <a
            href="tel:2016846666"
            className="flex items-center gap-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-colors"
          >
            <div className="p-3 bg-red-500 rounded-full shrink-0">
              <Phone className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums whitespace-nowrap">
                201-684-6666
              </p>
              <p className="text-sm text-muted-foreground">Emergency · Public Safety 24/7</p>
            </div>
          </a>

          {/* Non-Emergency */}
          <a
            href="tel:2016847432"
            className="flex items-center gap-4 p-4 bg-muted/50 border border-border rounded-xl hover:bg-muted transition-colors"
          >
            <div className="p-3 bg-primary/10 rounded-full shrink-0">
              <Phone className="w-6 h-6 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold tabular-nums whitespace-nowrap">201-684-7432</p>
              <p className="text-sm text-muted-foreground">Non-emergency · Inquiries &amp; escorts</p>
            </div>
          </a>

          {/* Quick Links */}
          <div className="pt-2 space-y-2">
            <h3 className="text-xs font-bold uppercase text-muted-foreground">Quick Links</h3>
            <a
              href="https://www.ramapo.edu/publicsafety/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-sm"
            >
              <span>Public Safety Website</span>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </a>
            <a
              href="https://www.ramapo.edu/alert/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-sm"
            >
              <span>Emergency Alerts Sign-up</span>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </a>
          </div>

          {/* SafeWalk */}
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">SafeWalk Program</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Request a safety escort anywhere on campus. Call Public Safety at 201-684-7432.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// CLUBS MODAL - Student Organizations
// ============================================
interface ClubItem {
  name: string;
  category: string;
  bucket?: 'student_orgs' | 'honor_societies' | 'greek_life' | 'athletics' | 'departments' | 'other';
  logoUrl?: string;
  websiteUrl?: string;
  externalWebsiteUrl?: string;
  email?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  twitterUrl?: string;
  linkedinUrl?: string;
  groupmeUrls?: string[];
  groupmeGroups?: Array<{ name: string; url: string }>;
}

const CLUB_CATEGORIES = ['Student Orgs', 'Honor Societies', 'Greek Life', 'Athletics', 'Departments', 'Other'] as const;

const mapLabelToBucket = (label: string): NonNullable<ClubItem['bucket']> => {
  if (label === 'Honor Societies') return 'honor_societies';
  if (label === 'Greek Life') return 'greek_life';
  if (label === 'Athletics') return 'athletics';
  if (label === 'Departments') return 'departments';
  if (label === 'Other') return 'other';
  return 'student_orgs';
};

const inferBucketFromCategory = (category: string): NonNullable<ClubItem['bucket']> => {
  const cl = (category || '').toLowerCase();
  if (cl.includes('department')) return 'departments';
  if (cl.includes('honor society') || cl.includes('honour society')) return 'honor_societies';
  if (
    (cl.includes('greek life') ||
      cl.includes('fratern') ||
      cl.includes('sororit') ||
      cl.includes('greek letter')) &&
    !cl.includes('department')
  ) {
    return 'greek_life';
  }
  if (cl.includes('athletics') || cl.includes('sports / recreation')) return 'athletics';
  if (cl.includes('student organization')) return 'student_orgs';
  return 'other';
};

const getEffectiveClubBucket = (club: ClubItem): NonNullable<ClubItem['bucket']> => {
  const inferred = inferBucketFromCategory(club.category);
  // Prefer category-derived buckets when category explicitly identifies a type.
  // Fall back to provided bucket only when category is ambiguous.
  if (inferred !== 'other') return inferred;
  return club.bucket || 'other';
};

/**
 * Modal for browsing clubs and student organizations.
 */
export function ClubsModal({ isOpen, onClose }: ModalProps) {
  const dialogRef = useAccessibleDialog(isOpen, onClose);
  const [clubs, setClubs] = useState<ClubItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Student Orgs');
  const [loading, setLoading] = useState(true);
  const [contactMenu, setContactMenu] = useState<null | { club: ClubItem; rect: DOMRect; mode: 'popover' | 'sheet' }>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/data/clubs')
        .then(res => res.json())
        .then(data => {
          setClubs(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Error loading clubs:', err);
          setLoading(false);
        });
    }
  }, [isOpen]);

  const filteredClubs = useMemo(() => {
    let filtered = clubs;
    
    if (searchQuery) {
      const fuse = new Fuse(clubs, {
        keys: ['name', 'category'],
        threshold: 0.4, // Fuzzy match threshold
        distance: 100,
      });
      const result = fuse.search(searchQuery);
      filtered = result.map(r => r.item);
    }
    
    if (selectedCategory) {
      const bucket = mapLabelToBucket(selectedCategory);
      filtered = filtered.filter((c) => getEffectiveClubBucket(c) === bucket);
    }

    // Remove exact duplicate records from upstream data so rendering stays stable.
    const seen = new Set<string>();
    return filtered.filter((club) => {
      const signature = [
        club.websiteUrl || '',
        club.name || '',
        club.category || '',
        club.bucket || '',
      ].join('::');
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }, [searchQuery, selectedCategory, clubs]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setContactMenu(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!contactMenu) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContactMenu(null);
    };

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      setContactMenu(null);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [contactMenu]);

  const contactMenuPortal = useMemo(() => {
    if (!contactMenu) return null;
    if (typeof document === 'undefined') return null;

    const { club, rect, mode } = contactMenu;

    const groupmeItems =
      club.groupmeGroups && club.groupmeGroups.length > 0
        ? club.groupmeGroups
        : (club.groupmeUrls || []).map((url, idx) => ({
            name: (club.groupmeUrls || []).length > 1 ? `GroupMe ${idx + 1}` : 'GroupMe',
            url,
          }));

    const items: Array<
      | { kind: 'groupme'; name: string; url: string }
      | { kind: 'instagram'; url: string }
      | { kind: 'email'; email: string }
      | { kind: 'facebook'; url: string }
      | { kind: 'twitter'; url: string }
      | { kind: 'linkedin'; url: string }
      | { kind: 'website'; url: string }
    > = [];

    groupmeItems.forEach((g) => {
      if (!g?.url) return;
      items.push({ kind: 'groupme', name: g.name || 'GroupMe', url: g.url });
    });
    if (club.instagramUrl) items.push({ kind: 'instagram', url: club.instagramUrl });
    if (club.facebookUrl) items.push({ kind: 'facebook', url: club.facebookUrl });
    if (club.twitterUrl) items.push({ kind: 'twitter', url: club.twitterUrl });
    if (club.linkedinUrl) items.push({ kind: 'linkedin', url: club.linkedinUrl });
    if (club.externalWebsiteUrl) items.push({ kind: 'website', url: club.externalWebsiteUrl });
    if (club.email) items.push({ kind: 'email', email: club.email });

    const close = () => setContactMenu(null);
    const openLink = (url: string) => {
      window.open(url, '_blank');
      close();
    };
    const openEmail = (email: string) => {
      window.location.assign(`mailto:${email}`);
      close();
    };

    if (mode === 'sheet') {
      return createPortal(
        <div className="fixed inset-0 z-[200]">
          <div className="absolute inset-0 bg-black/60" onClick={close} />
          <div
            ref={menuRef}
            className="absolute inset-x-0 bottom-0 bg-background rounded-t-2xl border-t border-border shadow-2xl p-4 pb-6 animate-in slide-in-from-bottom duration-200"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Contact</p>
                <p className="text-sm font-bold truncate">{club.name}</p>
              </div>
              <button onClick={close} className="p-2 hover:bg-muted rounded-full transition-colors" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => {
                if (item.kind === 'groupme') {
                  return (
                    <button
                      key={`gm-${idx}`}
                      onClick={() => openLink(item.url)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#00AFF0] text-white flex items-center justify-center">
                        <MessageCircle className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">Opens GroupMe</p>
                      </div>
                    </button>
                  );
                }
                if (item.kind === 'instagram') {
                  return (
                    <button
                      key={`ig-${idx}`}
                      onClick={() => openLink(item.url)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white flex items-center justify-center">
                        <Instagram className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">Instagram</p>
                        <p className="text-xs text-muted-foreground truncate">{item.url}</p>
                      </div>
                    </button>
                  );
                }
                if (item.kind === 'facebook') {
                  return (
                    <button
                      key={`fb-${idx}`}
                      onClick={() => openLink(item.url)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#1877F2] text-white flex items-center justify-center">
                        <Facebook className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">Facebook</p>
                        <p className="text-xs text-muted-foreground truncate">{item.url}</p>
                      </div>
                    </button>
                  );
                }
                if (item.kind === 'twitter') {
                  return (
                    <button
                      key={`tw-${idx}`}
                      onClick={() => openLink(item.url)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center">
                        <Twitter className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">X</p>
                        <p className="text-xs text-muted-foreground truncate">{item.url}</p>
                      </div>
                    </button>
                  );
                }
                if (item.kind === 'linkedin') {
                  return (
                    <button
                      key={`li-${idx}`}
                      onClick={() => openLink(item.url)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#0A66C2] text-white flex items-center justify-center">
                        <Linkedin className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">LinkedIn</p>
                        <p className="text-xs text-muted-foreground truncate">{item.url}</p>
                      </div>
                    </button>
                  );
                }
                if (item.kind === 'website') {
                  return (
                    <button
                      key={`wb-${idx}`}
                      onClick={() => openLink(item.url)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-muted text-foreground flex items-center justify-center border border-border">
                        <Globe className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">Website</p>
                        <p className="text-xs text-muted-foreground truncate">{item.url}</p>
                      </div>
                    </button>
                  );
                }
                return (
                  <button
                    key={`em-${idx}`}
                    onClick={() => openEmail(item.email)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">Email</p>
                      <p className="text-xs text-muted-foreground truncate">{item.email}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      );
    }

    // Popover positioning
    const menuWidth = 280;
    const padding = 8;
    const left = Math.min(Math.max(padding, rect.left), window.innerWidth - menuWidth - padding);
    const top = Math.min(rect.bottom + 8, window.innerHeight - 320);

    return createPortal(
      <div className="fixed inset-0 z-[200]">
        <div className="absolute inset-0" onClick={close} />
        <div
          ref={menuRef}
          style={{ left, top, width: menuWidth }}
          className="absolute bg-background border border-border rounded-xl shadow-2xl overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Contact</p>
            <p className="text-sm font-bold truncate">{club.name}</p>
          </div>
          <div className="p-2 space-y-1 max-h-72 overflow-auto">
            {items.map((item, idx) => {
              if (item.kind === 'groupme') {
                return (
                  <button
                    key={`gm-${idx}`}
                    onClick={() => openLink(item.url)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-[#00AFF0] text-white flex items-center justify-center shrink-0">
                      <MessageCircle className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground">GroupMe</p>
                    </div>
                  </button>
                );
              }
              if (item.kind === 'instagram') {
                return (
                  <button
                    key={`ig-${idx}`}
                    onClick={() => openLink(item.url)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white flex items-center justify-center shrink-0">
                      <Instagram className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">Instagram</p>
                      <p className="text-[10px] text-muted-foreground truncate">{item.url}</p>
                    </div>
                  </button>
                );
              }
              if (item.kind === 'facebook') {
                return (
                  <button
                    key={`fb-${idx}`}
                    onClick={() => openLink(item.url)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-[#1877F2] text-white flex items-center justify-center shrink-0">
                      <Facebook className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">Facebook</p>
                      <p className="text-[10px] text-muted-foreground truncate">{item.url}</p>
                    </div>
                  </button>
                );
              }
              if (item.kind === 'twitter') {
                return (
                  <button
                    key={`tw-${idx}`}
                    onClick={() => openLink(item.url)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-black text-white flex items-center justify-center shrink-0">
                      <Twitter className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">X</p>
                      <p className="text-[10px] text-muted-foreground truncate">{item.url}</p>
                    </div>
                  </button>
                );
              }
              if (item.kind === 'linkedin') {
                return (
                  <button
                    key={`li-${idx}`}
                    onClick={() => openLink(item.url)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-[#0A66C2] text-white flex items-center justify-center shrink-0">
                      <Linkedin className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">LinkedIn</p>
                      <p className="text-[10px] text-muted-foreground truncate">{item.url}</p>
                    </div>
                  </button>
                );
              }
              if (item.kind === 'website') {
                return (
                  <button
                    key={`wb-${idx}`}
                    onClick={() => openLink(item.url)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-muted text-foreground flex items-center justify-center border border-border shrink-0">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">Website</p>
                      <p className="text-[10px] text-muted-foreground truncate">{item.url}</p>
                    </div>
                  </button>
                );
              }
              return (
                <button
                  key={`em-${idx}`}
                  onClick={() => openEmail(item.email)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">Email</p>
                    <p className="text-[10px] text-muted-foreground truncate">{item.email}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>,
      document.body
    );
  }, [contactMenu]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Student organizations"
        tabIndex={-1}
        className={MODAL_PANEL}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 rounded-xl">
              <Users className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-none mb-1">All Clubs & Orgs</h2>
              <p className="text-xs text-muted-foreground font-medium">
                {filteredClubs.length} organizations
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors opacity-70 hover:opacity-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-4 border-b border-border bg-muted/30">
          <input
            type="text"
            aria-label="Search student organizations"
            placeholder="Search organizations by name or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Categories */}
        <div className="px-6 py-3 border-b border-border bg-background">
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
            {CLUB_CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/70 text-muted-foreground'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none bg-background p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredClubs.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-muted-foreground mb-2">No organizations found</p>
              <button
                onClick={() => { setSearchQuery(''); setSelectedCategory('Student Orgs'); }}
                className="text-sm text-primary hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
              {filteredClubs.map((club) => (
                <div
                  key={[club.websiteUrl || '', club.name, club.category, club.bucket || ''].join('::')}
                  onClick={() => window.open(club.websiteUrl, '_blank')}
                  className="flex items-stretch overflow-hidden rounded-xl border border-border hover:border-primary/50 hover:bg-muted/30 transition-all group cursor-pointer h-full relative"
                >
                  <div className="w-24 shrink-0 bg-white flex items-center justify-center border-r border-border">
                    {club.logoUrl ? (
                      // Organization logos come from user-managed third-party hosts that cannot be
                      // safely enumerated for the Next.js image optimizer.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={club.logoUrl} alt={club.name} className="w-full h-full object-contain p-3" />
                    ) : (
                      <Users className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 p-3 flex flex-col justify-center">
                    <h3 className="font-bold text-sm truncate transition-colors">
                      {club.name}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">{club.category}</p>

                    {(club.email ||
                      club.instagramUrl ||
                      club.facebookUrl ||
                      club.twitterUrl ||
                      club.linkedinUrl ||
                      club.externalWebsiteUrl ||
                      (club.groupmeGroups && club.groupmeGroups.length > 0) ||
                      (club.groupmeUrls && club.groupmeUrls.length > 0)) && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const isMobile = window.matchMedia('(max-width: 640px)').matches;
                            setContactMenu({ club, rect, mode: isMobile ? 'sheet' : 'popover' });
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-foreground text-[9px] leading-none font-medium hover:bg-muted/70 transition-colors border border-border"
                          title="Contact"
                        >
                          Contact
                          <ChevronDown className="w-3 h-3 opacity-70" />
                        </button>
                      </div>
                    )}
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 absolute top-3 right-3" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/30 text-center">
          <p className="text-xs text-muted-foreground">
            Data from Archway • Discover your community
          </p>
        </div>
      </div>
      {contactMenuPortal}
    </div>
  );
}

// ============================================
// CALENDAR MODAL - Academic Calendar
// ============================================
interface CalendarEvent {
  date: string;
  title: string;
  description: string;
}

interface Semester {
  name: string;
  events: CalendarEvent[];
}

/**
 * Modal for academic calendar dates and deadline lookups.
 */
export function CalendarModal({ isOpen, onClose }: ModalProps) {
  const dialogRef = useAccessibleDialog(isOpen, onClose);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [activeSemester, setActiveSemester] = useState<string>('');
  const [activeHousingSemester, setActiveHousingSemester] = useState<string>('');
  const [calendarMode, setCalendarMode] = useState<'academics' | 'housing'>('academics');
  const [loading, setLoading] = useState(true);
  const upNextRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && isOpen && upNextRef.current) {
      setTimeout(() => {
        const prevElement = upNextRef.current?.previousElementSibling;
        if (prevElement) {
          prevElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          upNextRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [loading, activeSemester, activeHousingSemester, calendarMode, isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/data/calendar')
        .then((res) => res.json())
        .then((data: Semester[]) => {
          setSemesters(data);
          
          const academic = data.filter(s => !s.name.startsWith('Housing:'));
          const housing = data.filter(s => s.name.startsWith('Housing:'));
          
          if (academic.length > 0) setActiveSemester(academic[0].name);
          if (housing.length > 0) setActiveHousingSemester(housing[0].name);
          
          setLoading(false);
        })
        .catch((err) => {
          console.error('Error loading calendar:', err);
          setLoading(false);
        });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentTabName = calendarMode === 'academics' ? activeSemester : activeHousingSemester;
  const activeEvents = semesters.find(s => s.name === currentTabName)?.events || [];
  
  const displayedSemesters = semesters.filter(s => 
    calendarMode === 'housing' ? s.name.startsWith('Housing:') : !s.name.startsWith('Housing:')
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Important dates"
        tabIndex={-1}
        className={MODAL_PANEL}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500/10 rounded-xl">
              <Calendar className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-none mb-1">Important Dates</h2>
              <p className="text-xs text-muted-foreground font-medium">Academics & Residence Life</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors opacity-70 hover:opacity-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode & Semester Tabs */}
        {!loading && semesters.length > 0 && (
          <div className="px-6 py-3 border-b border-border bg-muted/30 flex flex-col gap-3">
            <div className="flex p-1 bg-background/50 border border-border rounded-xl">
               <button
                 onClick={() => setCalendarMode('academics')}
                 className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                   calendarMode === 'academics'
                     ? 'bg-background shadow-sm text-foreground'
                     : 'text-muted-foreground hover:text-foreground'
                 }`}
               >
                 Academics
               </button>
               <button
                 onClick={() => setCalendarMode('housing')}
                 className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                   calendarMode === 'housing'
                     ? 'bg-background shadow-sm text-foreground'
                     : 'text-muted-foreground hover:text-foreground'
                 }`}
               >
                 Housing & Res Life
               </button>
            </div>
            
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
              {displayedSemesters.map((semester) => {
                const displayName = semester.name.replace('Housing: ', '');
                const isActive = currentTabName === semester.name;
                
                return (
                  <button
                    key={semester.name}
                    onClick={() => {
                       if (calendarMode === 'academics') setActiveSemester(semester.name);
                       else setActiveHousingSemester(semester.name);
                    }}
                    className={`px-4 py-2 text-sm font-semibold rounded-full whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'bg-background border border-border hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    {displayName}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-2 bg-background scrollbar-none">
          {loading ? (
            <div className="flex items-center justify-center h-full py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : activeEvents.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-muted-foreground">No events found for this semester.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(() => {
                const now = new Date();
                let todayMarkerInserted = false;

                return activeEvents.map((event, idx) => {
                  const parts = event.date.split(' ');
                  const month = parts[0]?.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || '---';
                  const day = parts[1]?.replace(/[^0-9]/g, '') || '--';

                  // PROB-019: the displayed tab supplies the year. Housing
                  // events must never be classified with the academic
                  // semester's year (or vice versa).
                  const eventDate = parseSemesterEventDate(event.date, currentTabName);
                  // Consider an event "past" if it happened before yesterday
                  const isPast = eventDate.getTime() < now.getTime() - 86400000;
                  
                  // Check if this is the first future event to insert the Today marker
                  let renderMarker = false;
                  if (!isPast && !todayMarkerInserted) {
                    todayMarkerInserted = true;
                    // Only render if there's actually a past event before this one (idx > 0)
                    if (idx > 0) {
                      renderMarker = true;
                    }
                  }

                  return (
                    <React.Fragment key={idx}>
                      {renderMarker && (
                        <div ref={upNextRef} className="flex items-center gap-4 py-4 mt-2 mb-2 scroll-mt-24">
                          <div className="h-px bg-primary flex-1 opacity-50"></div>
                          <span className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10">
                            <Calendar className="w-3.5 h-3.5" />
                            Up Next
                          </span>
                          <div className="h-px bg-primary flex-1 opacity-50"></div>
                        </div>
                      )}
                      <div className={`flex gap-4 p-3 hover:bg-muted/40 rounded-xl transition-colors border border-transparent hover:border-border/50 ${isPast ? 'opacity-40 grayscale hover:opacity-100 hover:grayscale-0' : ''}`}>
                        <div className={`shrink-0 w-16 h-16 flex flex-col items-center justify-center bg-background border shadow-sm rounded-2xl relative overflow-hidden ${isPast ? 'border-border/40' : 'border-border/60'}`}>
                          <div className={`absolute top-0 inset-x-0 h-1.5 ${isPast ? 'bg-muted-foreground/30' : 'bg-primary/80'}`} />
                          <span className={`text-[11px] font-bold tracking-wider mt-1 ${isPast ? 'text-muted-foreground' : 'text-primary'}`}>{month}</span>
                          <span className="text-2xl font-black text-foreground leading-none">{day}</span>
                        </div>
                        <div className="flex-1 flex flex-col justify-center min-w-0">
                          <h3 className={`text-sm sm:text-base font-bold text-foreground leading-snug mb-1 ${isPast ? 'line-through decoration-muted-foreground/30' : ''}`}>{event.title}</h3>
                          {event.description && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                              <Clock className="w-3.5 h-3.5 shrink-0 opacity-70" />
                              <span className="truncate">{event.description.replace(' am', ' AM').replace(' pm', ' PM')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAJORS MODAL - Academic Programs Browser
// ============================================

interface MajorCourse {
  code: string;
  name: string;
  credits?: string;
}

/**
 * Academic requirement rule shown in the majors modal.
 */
export interface ReqRule {
  condition: string;
  count?: number;
  credits?: number;
  items?: { codes: MajorCourse[]; logic: string }[];
  subRules?: ReqRule[];
}

interface MajorRequirement {
  section: string;
  note?: string;
  selectCount?: number;
  courses?: MajorCourse[];
  rule?: ReqRule;
}

interface MajorEntry {
  name: string;
  degree: string;
  type: 'undergraduate' | 'graduate';
  url: string;
  description?: string;
  whatYoullLearn?: string;
  sampleCourses?: string[];
  careers?: string;
  // Catalog fields
  catalogCode?: string;
  catalogUrl?: string;
  totalCredits?: string;
  requirements?: MajorRequirement[];
  concentrations?: string[];
  learningOutcomes?: string[];
  programKind?: 'major' | 'minor' | 'certificate' | 'undeclared' | 'other' | 'special';
  status?: string;
  school?: string;
  faculty?: Array<{
    name: string;
    title?: string;
    email?: string;
    office?: string;
    phone?: string;
    profileUrl?: string;
    imageUrl?: string;
  }>;
  convener?: {
    name: string;
    title?: string;
    email?: string;
    office?: string;
    phone?: string;
    profileUrl?: string;
    imageUrl?: string;
  };
}

interface SchoolGroup {
  school: string;
  shortName: string;
  majors: MajorEntry[];
}

interface ProgramsData {
  generatedAt: string;
  totalSchools: number;
  totalMajors: number;
  totalPrograms?: number;
  schools: SchoolGroup[];
}

type ProgramKindFilter = 'major' | 'minor' | 'special';

function decodeHtmlEntities(text?: string): string {
  if (!text) return '';

  const named: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&hellip;': '...',
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&lsquo;': "'",
    '&rsquo;': "'",
    '&ndash;': '-',
    '&mdash;': '-',
  };

  let decoded = text;
  Object.entries(named).forEach(([entity, value]) => {
    decoded = decoded.replace(new RegExp(entity, 'gi'), value);
  });

  decoded = decoded.replace(/&#(\d+);/g, (_, dec: string) => {
    const cp = Number.parseInt(dec, 10);
    return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
  });

  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
    const cp = Number.parseInt(hex, 16);
    return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
  });

  decoded = decoded.replace(/\[\s*\.\.\.\s*\]/g, '...');
  return decoded.replace(/\s+/g, ' ').trim();
}

function normalizeCourseCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getCourseDetails(allCourses: Record<string, any> | null, code?: string): Record<string, any> | null {
  if (!allCourses || !code) return null;

  const normalized = normalizeCourseCode(code);
  if (allCourses[normalized]) return allCourses[normalized];

  const compact = normalized.replace(/\s+/g, '');
  const compactMatch = Object.keys(allCourses).find((key) => normalizeCourseCode(key).replace(/\s+/g, '') === compact);
  if (compactMatch) return allCourses[compactMatch];

  return null;
}

function formatCourseCredits(credits: unknown): string | null {
  if (credits === null || credits === undefined) return null;
  if (typeof credits === 'number' || typeof credits === 'string') {
    const value = String(credits).trim();
    return value ? `${value} credit${value === '1' ? '' : 's'}` : null;
  }
  if (typeof credits === 'object') {
    const typed = credits as { min?: number | string; max?: number | string };
    const min = typed.min !== undefined ? String(typed.min).trim() : '';
    const max = typed.max !== undefined ? String(typed.max).trim() : '';
    if (min && max && min !== max) return `${min}-${max} credits`;
    if (min || max) {
      const single = min || max;
      return `${single} credit${single === '1' ? '' : 's'}`;
    }
  }
  return null;
}

function ExpandableCourseRow({
  course,
  allCourses,
  expanded,
  onToggle,
}: {
  course: MajorCourse;
  allCourses: Record<string, any> | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const resolvedCourse = getCourseDetails(allCourses, course.code) || undefined;
  const displayCode = course.code || resolvedCourse?.code || '';
  const displayName = decodeHtmlEntities(course.name || resolvedCourse?.name || '');
  const displayTitle = displayName || course.code || resolvedCourse?.code || 'Course';
  const creditsLabel = formatCourseCredits(resolvedCourse?.credits ?? course.credits);
  const description = resolvedCourse?.description ? decodeHtmlEntities(String(resolvedCourse.description)) : '';
  const attributes = Array.isArray(resolvedCourse?.attributes)
    ? resolvedCourse.attributes.filter((attr: unknown) => typeof attr === 'string' && attr.trim())
    : [];

  return (
    <div className="rounded-md border border-border/50 bg-background overflow-hidden transition-colors">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2.5 px-2.5 py-1.5 text-left hover:bg-muted/10 transition-colors group"
      >
        <div className="min-w-0 flex items-center">
          <span className="text-[11px] text-muted-foreground font-medium truncate leading-none">{displayTitle}</span>
        </div>
        <ChevronRight className={`w-3 h-3 shrink-0 transition-all duration-200 ${expanded ? 'rotate-90 text-white' : 'text-muted-foreground'}`} />
      </button>
      {expanded && (
        <div className="px-2.5 pb-2.5 pt-1.5 border-t border-border/50 bg-muted/20 animate-in fade-in-0 slide-in-from-top-1 duration-200 space-y-1.5">
          {(displayCode || displayName) && (
            <div className="space-y-0.5">
              {displayCode && (
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {displayCode}
                </p>
              )}
              {displayName && (
                <p className="text-xs font-medium text-foreground leading-snug">
                  {displayName}
                </p>
              )}
            </div>
          )}
          {description ? (
            <p className="text-xs text-foreground/85 leading-relaxed">{description}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No additional course description is available yet.</p>
          )}
          {attributes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attributes.map((attr: string, index: number) => (
                <span key={`${attr}-${index}`} className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-background border border-border/70 text-muted-foreground">
                  {attr}
                </span>
              ))}
            </div>
          )}
          {creditsLabel && (
            <div className="inline-flex items-center px-2 py-0.5 rounded-md border border-border/70 bg-background text-foreground text-[10px] font-bold uppercase tracking-wide">
              {creditsLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function renderRule(
  rule: ReqRule,
  depth = 0,
  path = 'root',
  courseContext: {
    allCourses: Record<string, any> | null;
    expandedCourseId: string | null;
    onToggleCourse: (courseId: string) => void;
  }
): React.ReactNode {
  const isAll = rule.condition.toLowerCase().includes('allof');
  const isAny = rule.condition.toLowerCase().includes('anyof');
  const isAtLeast = rule.condition.toLowerCase().includes('atleast');
  
  let heading = '';
  if (rule.credits) heading = `Earn at least ${rule.credits} credits from the following:`;
  else if (isAll) heading = 'Complete all of the following:';
  else if (isAny) heading = 'Complete any of the following:';
  else if (isAtLeast && rule.count) heading = `Complete at least ${rule.count} of the following:`;
  else heading = 'Complete the following:';

  return (
    <div className={`flex flex-col gap-2.5 w-full ${depth > 0 ? 'pl-2.5' : ''}`}>
      <p className="text-[11px] font-medium text-muted-foreground">
        <span>{heading}</span>
      </p>
      
      {rule.items && rule.items.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1">
          {rule.items.map((item, idx) => (
            <React.Fragment key={idx}>
              <div className="flex flex-col gap-1.5">
                {item.codes.map((c, ci) => (
                  <React.Fragment key={ci}>
                    {(() => {
                      const courseId = `rule-${path}-${depth}-${idx}-${ci}-${normalizeCourseCode(c.code || '')}`;
                      return (
                        <ExpandableCourseRow
                          course={c}
                          allCourses={courseContext.allCourses}
                          expanded={courseContext.expandedCourseId === courseId}
                          onToggle={() => courseContext.onToggleCourse(courseId)}
                        />
                      );
                    })()}
                  </React.Fragment>
                ))}
              </div>
            </React.Fragment>
          ))}
        </div>
      )}

      {rule.subRules && rule.subRules.length > 0 && (
        <div className="flex flex-col gap-3 mt-1">
          {rule.subRules.map((sr, idx) => (
            <React.Fragment key={idx}>
              {renderRule(sr, depth + 1, `${path}-sub-${idx}`, courseContext)}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function RequirementAccordion({
  req,
  allCourses,
  defaultOpen = false,
}: {
  req: any;
  allCourses: Record<string, any> | null;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const [expandedCourseId, setExpandedCourseId] = React.useState<string | null>(null);

  const toggleCourse = React.useCallback((courseId: string) => {
    setExpandedCourseId((current) => (current === courseId ? null : courseId));
  }, []);

  React.useEffect(() => {
    if (!isOpen) {
      setExpandedCourseId(null);
    }
  }, [isOpen]);

  return (
    <div className="rounded-lg border border-border/80 overflow-hidden bg-background shadow-sm transition-all duration-200">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left group"
      >
        <div className="min-w-0 flex-1 pr-3">
          <p className="text-[13px] font-semibold text-foreground transition-colors leading-snug">
            {req.section.replace(/^General Education:\s*/i, '')}
          </p>
        </div>
        <ChevronRight
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-90 text-foreground' : 'text-muted-foreground'
          }`}
        />
      </button>
      {isOpen && (
        <div className="px-3 py-3 border-t border-border/50 bg-background flex flex-col gap-1.5 relative overflow-x-auto">
          {req.note && (
            <p className="text-[11px] text-muted-foreground leading-snug mb-1">
              {req.note}
            </p>
          )}
          {req.rule ? (
            renderRule(req.rule, 0, 'rule', {
              allCourses,
              expandedCourseId,
              onToggleCourse: toggleCourse,
            })
          ) : (
            <>
              {req.courses && req.courses.length > 0 && (
                <>
                  {req.selectCount ? (
                    <p className="text-xs font-medium text-foreground/80 mb-2">
                      <span>Complete {req.selectCount} of the following:</span>
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-1.5">
                    {req.courses.map((c: any, ci: number) => {
                      const courseId = `list-${ci}-${normalizeCourseCode(c.code || '')}`;
                      return (
                        <ExpandableCourseRow
                          key={ci}
                          course={c}
                          allCourses={allCourses}
                          expanded={expandedCourseId === courseId}
                          onToggle={() => toggleCourse(courseId)}
                        />
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function getProgramIcon(majorName: string, school: string) {
  const name = majorName.toLowerCase();
  
  // Tech/Computing
  if (name.includes('computer') || name.includes('software') || name.includes('tech') || name.includes('information')) return <Monitor className="w-5 h-5 opacity-90" />;
  if (name.includes('data') || name.includes('bioinformatics')) return <Database className="w-5 h-5 opacity-90" />;
  
  // Science/Math
  if (name.includes('biology') || name.includes('neuroscience') || name.includes('clinical')) return <Activity className="w-5 h-5 opacity-90" />;
  if (name.includes('chemistry') || name.includes('physics')) return <FlaskConical className="w-5 h-5 opacity-90" />;
  if (name.includes('environmental') || name.includes('sustainability') || name.includes('ecology')) return <Leaf className="w-5 h-5 opacity-90" />;
  if (name.includes('math')) return <Calculator className="w-5 h-5 opacity-90" />;
  if (name.includes('nursing') || name.includes('health') || name.includes('medical')) return <HeartPulse className="w-5 h-5 opacity-90" />;

  // Business
  if (name.includes('business') || name.includes('management') || name.includes('marketing') || name.includes('leadership')) return <Briefcase className="w-5 h-5 opacity-90" />;
  if (name.includes('accounting') || name.includes('finance') || name.includes('economics')) return <Landmark className="w-5 h-5 opacity-90" />;

  // Arts/Humanities
  if (name.includes('art') || name.includes('design') || name.includes('animation') || name.includes('theater') || name.includes('acting')) return <Palette className="w-5 h-5 opacity-90" />;
  if (name.includes('music')) return <Music className="w-5 h-5 opacity-90" />;
  if (name.includes('film') || name.includes('media') || name.includes('communication') || name.includes('journalism')) return <Camera className="w-5 h-5 opacity-90" />;
  if (name.includes('literature') || name.includes('english') || name.includes('writing') || name.includes('liberal')) return <PenTool className="w-5 h-5 opacity-90" />;
  
  // Social Science, Law, Edu
  if (name.includes('law') || name.includes('legal') || name.includes('criminal') || name.includes('justice')) return <Scale className="w-5 h-5 opacity-90" />;
  if (name.includes('history') || name.includes('political') || name.includes('global') || name.includes('international') || name.includes('span') || name.includes('french') || name.includes('language') || name.includes('anthropology') || name.includes('policy')) return <Globe className="w-5 h-5 opacity-90" />;
  if (name.includes('psychology') || name.includes('sociology') || name.includes('social work') || name.includes('education') || name.includes('teaching') || name.includes('services')) return <Users className="w-5 h-5 opacity-90" />;
  
  // Fallbacks by school
  if (school.includes('Business')) return <Briefcase className="w-5 h-5 opacity-90" />;
  if (school.includes('Arts')) return <Palette className="w-5 h-5 opacity-90" />;
  if (school.includes('Science')) return <Microscope className="w-5 h-5 opacity-90" />;
  if (school.includes('Humanities')) return <Globe className="w-5 h-5 opacity-90" />;
  if (school.includes('Social')) return <Users className="w-5 h-5 opacity-90" />;
  
  return <BookOpen className="w-5 h-5 opacity-90" />;
}

function getProgramBackgroundImage(name: string, school: string): string {
  const n = name.toLowerCase();
  
  // High Priority: Specific Programs
  if (n.includes('accounting')) return '/images/programs/accounting.png';
  if (n.includes('cyber') && n.includes('security')) return '/images/programs/cybersecurity.png';
  if (n.includes('data science') || n.includes('data analyst') || n.includes('data modeler')) return '/images/programs/data_science.png';
  if (n.includes('economics')) return '/images/programs/economics.png';
  if (n.includes('education') || (n.includes('teach') && !n.includes('technology'))) return '/images/programs/education.png';
  if (n.includes('engineering') || n.includes('physics')) return '/images/programs/engineering.png';
  if (n.includes('english') || n.includes('literature') || n.includes('creative writing')) return '/images/programs/english.png';
  if (n.includes('environmental') || n.includes('sustainability') || n.includes('ecology') || n.includes('earth')) return '/images/programs/environmental.png';

  // Specific Science Sub-categories
  if (n.includes('biology') || n.includes('neuroscience')) return '/images/programs/biology.png';
  if (n.includes('chemistry') || n.includes('biochemistry')) return '/images/programs/chemistry.png';
  
  // Generic Tech/CS
  if (n.includes('computer') || n.includes('software') || n.includes('tech') || n.includes('information')) {
    return '/images/programs/computer_science.png'; 
  }

  // Broad Sciences / Health
  if (n.includes('clinical') || n.includes('health') || n.includes('medical') || n.includes('nursing') || n.includes('natural science')) {
    return '/images/programs/science.png'; 
  }
  if (n.includes('math')) {
    return '/images/programs/engineering.png'; // Best fit for math
  }

  // Business
  if (n.includes('business') || n.includes('management') || n.includes('marketing') || n.includes('leadership') || n.includes('finance')) {
    return '/images/programs/business.png'; 
  }

  // Arts & Performance
  if (n.includes('art') || n.includes('design') || n.includes('animation') || n.includes('theater') || n.includes('acting') || n.includes('music') || n.includes('film') || n.includes('media') || n.includes('communication') || n.includes('journalism')) {
    return '/images/programs/arts.png'; 
  }
  
  // Social Science, Law, Humanities
  if (n.includes('law') || n.includes('legal') || n.includes('criminal') || n.includes('justice') || n.includes('philosophy') || n.includes('liberal')) {
    return '/images/programs/humanities.png'; 
  }
  if (n.includes('history') || n.includes('political') || n.includes('global') || n.includes('international') || n.includes('language') || n.includes('anthropology') || n.includes('policy')) {
    return '/images/programs/humanities.png'; 
  }
  if (n.includes('psychology') || n.includes('sociology') || n.includes('social work') || n.includes('services')) {
    return '/images/programs/social.png'; 
  }
  
  // Fallbacks by school
  const s = school.toLowerCase();
  if (s.includes('business')) return '/images/programs/business.png';
  if (s.includes('arts')) return '/images/programs/arts.png';
  if (s.includes('science')) return '/images/programs/science.png';
  if (s.includes('humanities')) return '/images/programs/humanities.png';
  if (s.includes('social')) return '/images/programs/social.png';
  
  // Campus / Abstract fallback
  return '/images/programs/humanities.png'; 
}

function normalizePersonKey(name?: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[\u2019']/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Modal for exploring majors, programs, and catalog requirements.
 */
export function MajorsModal({ isOpen, onClose }: ModalProps) {
  const dialogRef = useAccessibleDialog(isOpen, onClose);
  const [programs, setPrograms] = React.useState<ProgramsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [levelFilter, setLevelFilter] = React.useState<'undergraduate' | 'graduate'>('undergraduate');
  const [programKindFilter, setProgramKindFilter] = React.useState<ProgramKindFilter>('major');
  const [selectedMajor, setSelectedMajor] = React.useState<MajorEntry | null>(null);
  const [activeTab, setActiveTab] = React.useState<'overview' | 'curriculum' | 'faculty' | 'careers'>('overview');
  const [allCourses, setAllCourses] = React.useState<Record<string, any> | null>(null);
  const typeSegmentRef = React.useRef<HTMLDivElement | null>(null);
  const typeButtonRefs = React.useRef<Record<ProgramKindFilter, HTMLButtonElement | null>>({
    major: null,
    minor: null,
    special: null,
  });
  const [typeIndicator, setTypeIndicator] = React.useState({ left: 0, width: 0 });

  // Find which school a major belongs to
  const schoolForMajor = (major: MajorEntry) =>
    programs?.schools.find(s => s.majors.some(m => m.name === major.name));

  // PROB-018: opening the modal loads only the program index, exactly once.
  // The `allCourses` dependency previously re-ran this effect after courses
  // loaded, refetching the multi-megabyte programs file a second time.
  useEffect(() => {
    if (!isOpen) return;
    setLevelFilter('undergraduate');
    setProgramKindFilter('major');
    if (programs) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch('/api/data/programs')
      .then(r => r.json())
      .then((data: ProgramsData) => { setPrograms(data); setLoading(false); })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // PROB-018: the courses catalog is loaded lazily, only when a curriculum
  // view is actually requested.
  const coursesRequestedRef = React.useRef(false);
  useEffect(() => {
    if (activeTab !== 'curriculum' || !selectedMajor) return;
    if (allCourses || coursesRequestedRef.current) return;
    coursesRequestedRef.current = true;
    fetch('/api/data/courses')
      .then(r => r.json())
      .then(data => setAllCourses(data))
      .catch(err => {
        coursesRequestedRef.current = false;
        console.error('Failed to load courses:', err);
      });
  }, [activeTab, selectedMajor, allCourses]);

  useEffect(() => {
    if (levelFilter === 'undergraduate' && programKindFilter === 'special') {
      setProgramKindFilter('major');
      return;
    }
    if (levelFilter === 'graduate' && programKindFilter === 'minor') {
      setProgramKindFilter('major');
    }
  }, [levelFilter, programKindFilter]);

  const visibleProgramKindOptions: Array<{ value: ProgramKindFilter; label: string }> =
    levelFilter === 'undergraduate'
      ? [
          { value: 'major', label: 'Major' },
          { value: 'minor', label: 'Minor' },
        ]
      : [
          { value: 'major', label: 'Program' },
          { value: 'special', label: '4+1' },
        ];

  useLayoutEffect(() => {
    if (!isOpen) return;

    const updateIndicators = () => {
      const typeBtn = typeButtonRefs.current[programKindFilter];
      if (typeBtn) {
        setTypeIndicator({
          left: typeBtn.offsetLeft,
          width: typeBtn.offsetWidth,
        });
      }
    };

    updateIndicators();
    window.addEventListener('resize', updateIndicators);
    return () => window.removeEventListener('resize', updateIndicators);
  }, [isOpen, levelFilter, programKindFilter, visibleProgramKindOptions.length]);

  const filteredMajors = useMemo(() => {
    if (!programs) return [];
    return programs.schools
      .flatMap((school) => school.majors)
      .filter((m) => {
        const kind = m.programKind || 'other';
        const isSpecial = kind === 'special';
        const matchesLevel =
          levelFilter === 'undergraduate'
            ? m.type === 'undergraduate' && !isSpecial
            : m.type === 'graduate' || isSpecial;
        const matchesProgramKind = kind === programKindFilter;
        return matchesLevel && matchesProgramKind;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [programs, levelFilter, programKindFilter]);

  const openExternalUrl = (url?: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!isOpen) return null;

  // ── Detail panel (shown when a major is selected) ──
  if (selectedMajor) {
    const school = schoolForMajor(selectedMajor);
    const headerImage = getProgramBackgroundImage(selectedMajor.name, selectedMajor.school || school?.school || '');
    const requirements = selectedMajor.requirements || [];
    const genEdReqs = requirements.filter((req) => (req.section || '').toLowerCase().includes('general education'));
    const majorReqs = requirements.filter((req) => !(req.section || '').toLowerCase().includes('general education'));
    const hasGenEdReqs = genEdReqs.length > 0;
    const hasMajorReqs = majorReqs.length > 0;
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="absolute inset-0" onClick={onClose} />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Majors and programs"
          tabIndex={-1}
          className={MODAL_PANEL}>
          {/* Back header */}
          {/* Header with Tabs */}
          <div className="relative flex flex-col border-b border-border shrink-0 overflow-hidden">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${headerImage})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/75 pointer-events-none" />
            <div className="relative flex items-center gap-3 px-5 py-3">
              <button
                onClick={() => setSelectedMajor(null)}
                className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{school?.school}</p>
                <h2 className="text-sm font-bold text-foreground leading-tight truncate">{selectedMajor.name}</h2>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors" aria-label="Close">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="relative flex px-5 gap-6">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'curriculum', label: 'Curriculum' },
                { id: 'faculty', label: 'Faculty' },
                { id: 'careers', label: 'Careers' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as 'overview' | 'curriculum' | 'faculty' | 'careers')}
                  className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
                    activeTab === tab.id
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 p-6 space-y-5 overflow-y-auto">
            {activeTab === 'overview' && (
              <>
                {/* Description */}
                {selectedMajor.description ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">About this program</span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed">{decodeHtmlEntities(selectedMajor.description)}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">About this program</span>
                    </div>
                    <p className="text-sm text-foreground/60 italic">Visit the official program page for curriculum details, requirements, and career paths.</p>
                  </div>
                )}

                {/* What You'll Learn */}
                {selectedMajor.whatYoullLearn && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <GraduationCap className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What You&apos;ll Learn</span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed line-clamp-5">{decodeHtmlEntities(selectedMajor.whatYoullLearn)}</p>
                  </div>
                )}

                {/* Concentrations */}
                {selectedMajor.concentrations && selectedMajor.concentrations.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <GraduationCap className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Concentrations</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedMajor.concentrations.map((c, i) => (
                        <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">{c}</span>
                      ))}
                    </div>
                  </div>
                )}

              </>
            )}

            {activeTab === 'curriculum' && (
              <>
                {majorReqs.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-muted-foreground">Major Requirements</span>
                      {selectedMajor.totalCredits && (
                        <span className="ml-auto text-xs font-bold text-primary">{selectedMajor.totalCredits} credits</span>
                      )}
                    </div>
                    {majorReqs.map((req, ri) => (
                      <RequirementAccordion 
                        key={`major-${ri}`} 
                        req={req} 
                        allCourses={allCourses}
                        defaultOpen={ri === 0}
                      />
                    ))}
                  </div>
                )}

                {genEdReqs.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-muted-foreground">General Education</span>
                    </div>
                    {genEdReqs.map((req, ri) => (
                      <RequirementAccordion 
                        key={`gened-${ri}`} 
                        req={req} 
                        allCourses={allCourses}
                        defaultOpen={majorReqs.length === 0 && ri === 0}
                      />
                    ))}
                  </div>
                )}

                {/* Sample Courses */}
                {selectedMajor.sampleCourses && selectedMajor.sampleCourses.length > 0 && (
                  <div className="rounded-xl bg-background border border-border/60 overflow-hidden mt-4">
                    <div className="flex items-center gap-2 p-4 bg-muted/20 border-b border-border/50">
                      <BookOpen className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-bold text-foreground">Sample Courses</span>
                    </div>
                    <div className="p-4 flex flex-col gap-2 bg-background/50">
                      {selectedMajor.sampleCourses.map((course, i) => (
                        <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-background border border-border/50">
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary/60 mt-1.5" />
                          <span className="text-sm text-foreground/90 font-medium leading-snug">{course}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!hasMajorReqs && !hasGenEdReqs && (!selectedMajor.sampleCourses || selectedMajor.sampleCourses.length === 0) && (
                  <div className="rounded-xl bg-muted/20 border border-border/50 p-6 text-center shadow-sm">
                    <BookOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-foreground">No curriculum data</p>
                    <p className="text-xs text-muted-foreground mt-1 text-balance">Visit the official program page for full course requirements.</p>
                  </div>
                )}
              </>
            )}

            {activeTab === 'faculty' && (
              <>
                {(() => {
                  const convener = selectedMajor.convener;
                  const convenerKey = normalizePersonKey(convener?.name);
                  const facultyWithoutConvener = (selectedMajor.faculty || []).filter(
                    (faculty) => normalizePersonKey(faculty.name) !== convenerKey
                  );
                  const hasFacultyData = Boolean(convener) || facultyWithoutConvener.length > 0;
                  const renderFacultyCard = (
                    person: {
                      name: string;
                      title?: string;
                      email?: string;
                      imageUrl?: string;
                      profileUrl?: string;
                    },
                    key?: string
                  ) => {
                    const rowUrl = person.profileUrl || selectedMajor.url;
                    return (
                      <div
                        key={key ?? person.name}
                        className={`rounded-lg border border-border/50 bg-background/70 px-3 py-2.5 ${rowUrl ? 'cursor-pointer hover:bg-background transition-colors' : ''}`}
                        role={rowUrl ? 'button' : undefined}
                        tabIndex={rowUrl ? 0 : undefined}
                        onClick={() => openExternalUrl(rowUrl)}
                        onKeyDown={(event) => {
                          if (!rowUrl) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openExternalUrl(rowUrl);
                          }
                        }}
                      >
                        <div className="flex items-start gap-3">
                          {person.imageUrl ? (
                            <div
                              className="h-10 w-10 shrink-0 rounded-lg border border-border/60 bg-muted bg-cover bg-center"
                              style={{ backgroundImage: `url("${person.imageUrl.replace(/"/g, '%22')}")` }}
                              aria-hidden
                            />
                          ) : (
                            <div className="h-10 w-10 shrink-0 rounded-lg border border-border/60 bg-muted text-foreground/80 text-xs font-bold flex items-center justify-center">
                              {getInitials(person.name)}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground leading-tight truncate">
                              {person.name}
                            </p>
                            {person.title && (
                              <p className="text-xs text-muted-foreground mt-1 truncate">{person.title}</p>
                            )}
                          </div>
                          {person.email && (
                            <a
                              href={`mailto:${person.email}`}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-border/60 bg-muted/40 hover:bg-muted text-foreground shrink-0"
                              aria-label={`Email ${person.name}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  };

                  return hasFacultyData ? (
                  <div className="space-y-4">
                    {convener && (
                      <div className={facultyWithoutConvener.length > 0 ? 'space-y-3' : ''}>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Convener</span>
                        </div>
                        {renderFacultyCard(convener)}
                      </div>
                    )}
                    {facultyWithoutConvener.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Program Faculty</span>
                        </div>
                        <div className="space-y-2.5">
                          {facultyWithoutConvener.map((faculty, index) =>
                            renderFacultyCard(faculty, `${faculty.email || faculty.name}-${index}`)
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl bg-muted/20 border border-border/50 p-6 text-center shadow-sm">
                    <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-foreground">No faculty data available</p>
                    <p className="text-xs text-muted-foreground mt-1 text-balance">Visit the official program page for faculty and convener details.</p>
                  </div>
                );
                })()}
              </>
            )}

            {activeTab === 'careers' && (
              <>
                {/* Careers */}
                {selectedMajor.careers ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-3">
                      <ChevronRight className="w-4 h-4 text-primary" />
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Careers &amp; Outcomes</span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed font-medium">{decodeHtmlEntities(selectedMajor.careers)}</p>
                  </div>
                ) : (
                  <div className="py-10 text-center">
                    <GraduationCap className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-foreground">No career data available</p>
                    <p className="text-xs text-muted-foreground mt-1 text-balance">Visit the official program page for career outcome information.</p>
                  </div>
                )}
              </>
            )}

          </div>

          <a
            href={selectedMajor.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center justify-center gap-1 w-full h-8 bg-primary text-primary-foreground text-[11px] font-medium border-t border-primary/40 hover:opacity-90 transition-opacity"
            aria-label="Show Program Page"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            Show Program Page
          </a>

        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Majors and programs"
        tabIndex={-1}
        className={MODAL_PANEL}>

        {/* ─── Header ─── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <GraduationCap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Majors & Programs</h2>
              {programs && (
                <p className="text-xs text-muted-foreground">
                  {programs.totalMajors} programs across {programs.totalSchools} schools
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted/60 transition-colors" aria-label="Close">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* ─── Filters ─── */}
        <div className="px-6 py-2 border-b border-border bg-muted/20 shrink-0">
          <div className="flex min-w-0 items-center gap-2 pb-0.5">
            <div
              className="relative min-w-0 flex-1"
            >
              <button
                type="button"
                onClick={() => setLevelFilter((current) => (current === 'undergraduate' ? 'graduate' : 'undergraduate'))}
                className="relative w-full h-9 rounded-lg border border-border/60 bg-muted/20 px-3 text-[11px] font-semibold uppercase tracking-wide text-foreground transition-colors hover:bg-muted/35"
                aria-label={levelFilter === 'undergraduate' ? 'Show Grad' : 'Show Undergrad'}
                aria-pressed={levelFilter === 'graduate'}
              >
                <span className="relative z-10 flex h-full items-center justify-center">
                  {levelFilter === 'undergraduate' ? 'SHOW GRAD' : 'SHOW UNDERGRAD'}
                </span>
              </button>
            </div>
            <div
              ref={typeSegmentRef}
              className="relative min-w-0 flex-1 flex items-center gap-1 rounded-full border border-border/60 bg-muted/20 p-0.5"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute left-0 top-0.5 bottom-0.5 rounded-full bg-primary shadow-sm transition-[transform,width] duration-500 will-change-transform"
                style={{
                  width: `${typeIndicator.width}px`,
                  transform: `translateX(${typeIndicator.left}px)`,
                  transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
              {visibleProgramKindOptions.map(kind => (
                <button
                  key={kind.value}
                  ref={(el) => {
                    typeButtonRefs.current[kind.value] = el;
                  }}
                  onClick={() => setProgramKindFilter(kind.value)}
                  className={`relative z-10 min-w-0 flex-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold text-center transition-colors ${
                    programKindFilter === kind.value
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {kind.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Content ─── */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && filteredMajors.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12 px-6">
              <GraduationCap className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm font-semibold text-foreground">No programs found</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different filter</p>
            </div>
          )}
          {!loading && filteredMajors.length > 0 && (
            <div className="flex flex-col gap-2">
              {filteredMajors.map((major) => (
                <button
                  key={major.catalogCode || major.name}
                  onClick={() => {
                    setSelectedMajor(major);
                    setActiveTab('overview');
                  }}
                  className="relative block w-full text-left rounded-xl border border-border/50 overflow-hidden transition-all group shadow-sm hover:shadow"
                >
                  {/* Background Image */}
                  <div 
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                      style={{ backgroundImage: `url(${getProgramBackgroundImage(major.name, major.school || '')})` }}
                  />
                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/60 group-hover:to-background/40 transition-colors duration-300 pointer-events-none" />

                  {/* Content */}
                  <div className="relative flex items-center gap-3.5 p-3.5 w-full z-10">
                    <div className="p-2.5 rounded-lg shrink-0 bg-muted/60 text-muted-foreground backdrop-blur-sm">
                      {getProgramIcon(major.name, major.school || '')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground leading-snug drop-shadow-sm">
                        {major.name}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="px-6 py-3 border-t border-border bg-muted/20 shrink-0 text-center">
          <a
            href="https://www.ramapo.edu/majors-minors/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground transition-colors inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            View all programs at ramapo.edu/majors-minors
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}


interface QuickAccessButtonsProps {
  onMapClick: () => void;
  onBusClick: () => void;
  onHoursClick: () => void;
  onDirectoryClick: () => void;
  onSafetyClick: () => void;
  onEventsClick: () => void;
  onClubsClick: () => void;
  onCalendarClick: () => void;
  onMajorsClick: () => void;
}

/**
 * Renders the chat screen quick actions and coordinates their modal state.
 */
export function QuickAccessButtons({
  onMapClick,
  onBusClick,
  onHoursClick,
  onDirectoryClick,
  onSafetyClick,
  onEventsClick,
  onClubsClick,
  onCalendarClick,
  onMajorsClick,
}: QuickAccessButtonsProps) {
  const buttons = [
    { icon: MapPin, label: 'Map', onClick: onMapClick },
    { icon: Bus, label: 'Bus', onClick: onBusClick },
    { icon: Clock, label: 'Hours', onClick: onHoursClick },
    { icon: Calendar, label: 'Events', onClick: onEventsClick },
    { icon: Users, label: 'Clubs', onClick: onClubsClick },
    { icon: Calendar, label: 'Calendar', onClick: onCalendarClick },
    { icon: GraduationCap, label: 'Majors', onClick: onMajorsClick },
    { icon: Phone, label: 'Directory', onClick: onDirectoryClick },
    { icon: Shield, label: 'Safety', onClick: onSafetyClick },
  ];

  return (
    <div className="flex items-center gap-1">
      {buttons.map(({ icon: Icon, label, onClick }) => (
        <button
          key={label}
          onClick={onClick}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
          title={label}
        >
          <Icon className="w-4 h-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
