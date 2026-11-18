/**
 * @module cant-read
 * What RockyGPT can't read, shown under "What Rocky can't read" on the About page.
 *
 * Copied by hand from rockygpt-data `src/reference/blocked-sources.json`, the reviewed list.
 * The nightly data run also writes every page a site's robots.txt turned away
 * (`data/review/blocked-pages.md`); when that shows something new, add it here and in the
 * reviewed list. A source leaves this list only when the site itself allows it.
 */

export type CantReadWhy = 'robots' | 'sign-in';

export interface CantReadSource {
  title: string;
  /** Where it lives, as a student would recognise it. */
  site: string;
  why: CantReadWhy;
  /** The plain effect on answers, led by a short bold label. */
  label: string;
  effect: string;
}

/** The day this list was last checked against the sites' own rules. */
export const cantReadCheckedAt = '2026-11-18';

export const cantRead: CantReadSource[] = [
  {
    title: 'Class search',
    site: 'myssb.ramapo.edu',
    why: 'robots',
    label: 'Not known:',
    effect:
      'open seats, meeting times, rooms, and who teaches a section. Rocky sends you to class search.',
  },
  {
    title: 'Your own records',
    site: 'Portal, Canvas, student email',
    why: 'sign-in',
    label: 'Not known:',
    effect:
      'your grades, schedule, bill, or financial aid status. Rocky tells you which office or page has it.',
  },
  {
    title: 'Sign-in-only Archway events',
    site: 'archway.ramapo.edu',
    why: 'sign-in',
    label: 'Not known:',
    effect:
      'the name and place of events that clubs show only to signed-in students. Public events are covered.',
  },
  {
    title: 'Files clubs upload to Archway',
    site: 'archway.ramapo.edu',
    why: 'robots',
    label: 'Not known:',
    effect: 'flyers and documents posted as files. Club pages and event listings are covered.',
  },
  {
    title: 'Athletics feeds and PDF guides',
    site: 'ramapoathletics.com',
    why: 'robots',
    label: 'Still covered:',
    effect:
      "game schedules, read from each team's schedule page instead, one page every 30 seconds as the site asks.",
  },
  {
    title: 'The 2005–06 online catalog',
    site: 'ramapo.edu/catalog_05_06',
    why: 'robots',
    label: 'Nothing lost:',
    effect: "today's catalog at catalog.ramapo.edu is fully readable.",
  },
];

/** The exact robots.txt rules behind the list, for the fold-away table. */
export const robotRules: { site: string; paths: string[]; wait: string }[] = [
  { site: 'www.ramapo.edu', paths: ['/catalog_05_06/'], wait: 'none' },
  {
    site: 'archway.ramapo.edu',
    paths: ['/mobile_ws/v17/', '/mobile_ws/v18/', '/upload/', '/student_docs/', '/downloads/', 'ajax_widget_new'],
    wait: 'none',
  },
  {
    site: 'ramapoathletics.com',
    paths: ['/services/', '/documents/', '/images/', '/common/', '/site/', '/hidden/', 'print views'],
    wait: '30 s',
  },
  { site: 'myssb.ramapo.edu', paths: ['the whole site'], wait: 'none' },
  { site: 'catalog.ramapo.edu', paths: ['nothing'], wait: 'none' },
];

export const whyLabel: Record<CantReadWhy, string> = {
  robots: 'Robots not allowed',
  'sign-in': 'Needs your sign-in',
};
