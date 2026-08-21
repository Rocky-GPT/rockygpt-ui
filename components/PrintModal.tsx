/**
 * @module components/PrintModal
 * Campus printing information modal showing Wepa printer locations,
 * instructions, and pricing for the Ramapo print system.
 */

'use client';

import { useEffect } from 'react';
import { useAccessibleDialog } from '@/components/useAccessibleDialog';
import { X, Printer, ExternalLink, Wifi, MapPin } from 'lucide-react';
import { MODAL_PANEL } from '@/components/modalShell';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PrintLocation {
  building: string;
  room: string;
  os: 'Windows' | 'Mac' | 'Library' | 'Reported';
  availability: string;
}

const libraryPrintStations = [
  {
    building: 'Potter Library',
    room: '1st-floor Print Counter',
    os: 'Library' as const,
    availability: 'Across from the computer lab/classroom',
  },
  {
    building: 'Potter Library',
    room: '2nd-floor Print Room (205)',
    os: 'Library' as const,
    availability: 'During Library Hours',
  },
  {
    building: 'Potter Library',
    room: '3rd-floor Print Room (311)',
    os: 'Library' as const,
    availability: 'During Library Hours',
  },
  {
    building: 'Potter Library',
    room: '4th-floor Room 408',
    os: 'Library' as const,
    availability: 'During Library Hours',
  },
  {
    building: 'Potter Library',
    room: '4th-floor Help Desk area',
    os: 'Library' as const,
    availability: 'During Library Hours',
  },
];

const labsWithPrinters: PrintLocation[] = [
  { building: 'ASB', room: 'ASB-219', os: 'Windows', availability: 'Class Use Only' },
  { building: 'ASB', room: 'ASB-220', os: 'Windows', availability: 'Class Use Only' },
  { building: 'ASB', room: 'ASB-423', os: 'Windows', availability: 'Class Use Only' },
  { building: 'ASB', room: 'ASB-426', os: 'Windows', availability: 'Class Use Only' },
  { building: 'ASB', room: 'ASB-429', os: 'Windows', availability: 'Class Use Only' },
  { building: 'ASB', room: 'ASB-527', os: 'Windows', availability: '9am-5pm, unless class is in session' },
  { building: 'B-Building', room: 'B-118', os: 'Mac', availability: 'Class Use Only' },
  { building: 'B-Building', room: 'B-127', os: 'Windows', availability: 'Class Use Only' },
  { building: 'Berrie Center', room: 'BC-142', os: 'Mac', availability: 'Class Use Only' },
  { building: 'Bradley Center', room: 'Bradley Ctr. 223', os: 'Windows', availability: 'During Bradley Center Hours' },
  { building: 'E-Building', room: 'E-112', os: 'Windows', availability: '24/7' },
  { building: 'E-Building', room: 'E-217', os: 'Windows', availability: '9am-6pm, unless class is in session' },
  { building: 'E-Building', room: 'E-233', os: 'Mac', availability: '9am-6pm, unless class is in session' },
  { building: 'G-Building', room: 'G-301', os: 'Windows', availability: 'Class Use Only' },
  { building: 'H-Building', room: 'H-105', os: 'Mac', availability: 'Class Use Only' },
  { building: 'H-Building', room: 'H-123', os: 'Mac', availability: 'Class Use Only' },
  { building: 'H-Building', room: 'H-Lobby', os: 'Mac', availability: '24/7' },
  { building: 'Laurel Hall', room: 'Laurel Hall 003', os: 'Windows', availability: 'Class Use Only' },
];

const communityReportedPrintLocations: PrintLocation[] = [
  {
    building: 'Academic Building C',
    room: 'Fishbowl (near C-220)',
    os: 'Reported',
    availability: 'Community-reported print location; verify on-site.',
  },
  {
    building: 'Academic Building A',
    room: 'College Honors Lounge',
    os: 'Reported',
    availability: 'Community-reported print location; verify on-site.',
  },
];

const printLocations: PrintLocation[] = [...libraryPrintStations, ...labsWithPrinters, ...communityReportedPrintLocations];

function WindowsLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M2 3.7 10.8 2.5v8.1H2V3.7Zm10 6.9V2.3L22 1v9.6H12Zm-10 1H10.8v8.1L2 18.4v-6.8Zm10 0H22V21l-10-1.3v-8.1Z" />
    </svg>
  );
}

function MacLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M16.5 12.2c0-2.4 2-3.6 2.1-3.7-1.2-1.7-3-2-3.6-2-1.5-.2-2.9.9-3.7.9s-2-.9-3.3-.9c-1.7 0-3.3 1-4.1 2.5-1.8 3.1-.4 7.7 1.3 10.1.8 1.2 1.8 2.5 3.2 2.4 1.3-.1 1.8-.8 3.4-.8 1.6 0 2.1.8 3.4.7 1.4 0 2.3-1.2 3.1-2.4.9-1.3 1.3-2.6 1.3-2.7-.1 0-3.1-1.2-3.1-4.1ZM14 4.9c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.6.7-1 1.6-.9 2.6 1 .1 2-.5 2.6-1.2Z" />
    </svg>
  );
}

function OsBadge({ os }: { os: PrintLocation['os'] }) {
  if (os === 'Reported') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-300">
        <MapPin className="h-3.5 w-3.5" />
        Reported
      </span>
    );
  }

  if (os === 'Library') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/20 px-2 py-1 text-[11px] font-medium">
        <Printer className="h-3.5 w-3.5 text-primary" />
        Library
      </span>
    );
  }

  if (os === 'Windows') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/20 px-2 py-1 text-[11px] font-medium">
        <WindowsLogo className="h-3.5 w-3.5 text-blue-400" />
        Windows
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/20 px-2 py-1 text-[11px] font-medium">
      <MacLogo className="h-3.5 w-3.5 text-slate-200" />
      Mac
    </span>
  );
}

/**
 * Modal that presents campus printing locations, policies, and support links.
 */
export function PrintModal({ isOpen, onClose }: ModalProps) {
  const dialogRef = useAccessibleDialog(isOpen, onClose);
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Campus printing locations"
        tabIndex={-1}
        className={MODAL_PANEL}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <Printer className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-none mb-1">Campus Print Locations</h2>
              <p className="text-xs text-muted-foreground font-medium">{printLocations.length} locations</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close campus printing locations"
            className="p-2 hover:bg-muted rounded-full transition-colors opacity-70 hover:opacity-100"
          >
            <X aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-none p-6 space-y-6">
          <section className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Includes official print locations plus community-reported spots labeled as <span className="font-medium">Reported</span>.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {printLocations.map((location) => (
                <article
                  key={`${location.building}-${location.room}`}
                  className="rounded-xl border border-border bg-muted/15 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold leading-tight">{location.room}</h4>
                    <OsBadge os={location.os} />
                  </div>
                  <p className="mt-0 text-xs leading-tight text-muted-foreground">{location.availability}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">Official Printing Links</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="https://www.ramapo.edu/library/printing-and-photocopying/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs font-medium"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Library Printing
              </a>
              <a
                href="https://www.ramapo.edu/its/computer-labs/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs font-medium"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                ITS Computer Labs
              </a>
              <a
                href="https://www.ramapo.edu/library/wp-content/uploads/sites/301/2024/01/mobileprintdoc.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs font-medium"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Wireless Printing (PDF)
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
