/**
 * @module versions
 * RockyGPT's production releases, shown under "Versions" on the About page.
 *
 * Newest first: the first entry is the one labelled Latest. A release adds one
 * entry at the top. `released` is when the release was merged into main, as a
 * UTC time (GitHub's merged_at); the page shows it in campus (New York) time.
 * An entry whose exact time isn't known gives only its New York calendar day.
 */

export interface Version {
  version: string;
  /** A UTC time like 2026-09-27T16:43:37Z, or YYYY-MM-DD when only the day is known. */
  released: string;
  summary: string;
}

export const versions: Version[] = [
  {
    version: 'v2.2.0',
    released: '2026-09-28T03:37:44Z',
    summary:
      'More questions go straight to the answer: RockyGPT better understands which office, day, meal or detail you mean, so hours, menus, phone numbers, shuttle times and follow-ups like "and their email?" come back sooner.',
  },
  {
    version: 'v2.1.1',
    released: '2026-09-27T16:43:37Z',
    summary:
      'Answers can arrive a little sooner: RockyGPT does its behind-the-scenes checks in fewer steps.',
  },
  {
    version: 'v2.1.0',
    released: '2026-09-27T14:27:58Z',
    summary:
      'Library hours questions, like the Potter Library, get answered instead of "couldn\'t verify". Dining menus show every item, and meals already served are listed newest first.',
  },
  {
    version: 'v2.0.1',
    released: '2026-09-27T02:40:57Z',
    summary:
      'When only part of an answer can be checked, RockyGPT keeps that part and says what it could not verify instead of giving up.',
  },
  {
    version: 'v2.0.0',
    released: '2026-09-26',
    summary:
      'Rebuilt from the ground up. Answers come from official campus information, cite their sources and are checked before you see them.',
  },
  {
    version: 'v1.0.0',
    released: '2026-08-31',
    summary: 'The first RockyGPT, saved as version 1.0.0 before the rebuild began.',
  },
];

/**
 * "2026-09-27T16:43:37Z" → "Sep 27, 2026, 12:43 PM EDT", in campus time.
 * "2026-09-26" → "Sep 26, 2026", read as a calendar day so no timezone shifts it.
 */
export function formatVersionReleased(released: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(released)) {
    return new Date(`${released}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  return new Date(released).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  });
}
