'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  Database,
  ScrollText,
} from 'lucide-react';
import { usePathname } from 'next/navigation';

import Link from 'next/link';

const PAGES = [
  { href: '/', label: 'Chatbot', description: 'Talk with RockyGPT', icon: Bot },
  {
    href: '/data-sources',
    label: 'Data Sources',
    description: 'Review scrape status',
    icon: Database,
  },
  {
    href: '/data-explorer',
    label: 'Data Explorer',
    description: 'Browse campus records and releases',
    icon: ChartNoAxesCombined,
  },
  {
    href: '/capability-explorer',
    label: 'Capability Explorer',
    description: 'What Rocky can look up, and how',
    icon: Boxes,
  },
  {
    href: '/logs',
    label: 'Logs',
    description: 'Live chat logs and telemetry',
    icon: ScrollText,
  },
] as const;

interface DevPageMenuProps {
  title?: string;
  subtitle?: string;
}

export function DevPageMenu({ title, subtitle }: DevPageMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = PAGES.find((page) => page.href === pathname) || PAGES[0];
  const CurrentIcon = current.icon;

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <div ref={menuRef} className="relative isolate">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="dev-page-menu-trigger"
        className="group flex items-center gap-2 rounded-xl px-1.5 py-1 text-left focus:outline-none focus:ring-2 focus:ring-sky-400/40"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black text-white">
          <CurrentIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 pr-2">
          <span className="flex items-center gap-1.5 whitespace-nowrap text-lg font-semibold tracking-tight md:text-xl">
            {title || current.label}
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </span>
          {subtitle && (
            <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:block">
              {subtitle}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          data-testid="dev-page-menu"
          className="absolute left-0 top-full z-[200] mt-2 w-80 overflow-hidden rounded-xl border border-border bg-background p-1.5 text-foreground shadow-[0_20px_60px_rgba(0,0,0,0.65)]"
        >
          {PAGES.map((page) => {
            const Icon = page.icon;
            const active = page.href === pathname;
            return (
              <Link
                key={page.href}
                href={page.href}
                role="menuitem"
                onClick={(e) => {
                  if (active) {
                    e.preventDefault();
                  }
                  setOpen(false);
                }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted ${active ? 'bg-sky-500/10 text-sky-500' : ''}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block text-sm font-semibold">{page.label}</span>
                  <span className="block text-xs text-muted-foreground">{page.description}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
