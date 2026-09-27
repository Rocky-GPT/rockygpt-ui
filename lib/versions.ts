/**
 * @module versions
 * RockyGPT's production releases, shown under "Versions" on the About page.
 *
 * Newest first: the first entry is the one labelled Latest. A release adds one
 * line at the top. Dates are the day the release reached production, in
 * campus (New York) time.
 */

export interface Version {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  summary: string;
}

export const versions: Version[] = [
  {
    version: 'v2.1.0',
    date: '2026-09-27',
    summary:
      'Library hours questions, like the Potter Library, get answered instead of "couldn\'t verify". Dining menus show every item, and meals already served are listed newest first.',
  },
  {
    version: 'v2.0.1',
    date: '2026-09-26',
    summary:
      'When only part of an answer can be checked, RockyGPT keeps that part and says what it could not verify instead of giving up.',
  },
  {
    version: 'v2.0.0',
    date: '2026-09-26',
    summary:
      'Rebuilt from the ground up. Answers come from official campus information, cite their sources and are checked before you see them.',
  },
  {
    version: 'v1.0.0',
    date: '2026-08-31',
    summary: 'The first RockyGPT, saved as version 1.0.0 before the rebuild began.',
  },
];

/** "2026-09-27" → "Sep 27, 2026", read as a calendar day so no timezone shifts it. */
export function formatVersionDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
