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
    version: 'v2.3.5',
    released: '2026-09-29T02:47:00Z',
    summary:
      'Asking what you can eat right now between meals shows the next meal\'s menu in one answer, a few seconds faster. Late at night, "when is the last shuttle?" says today\'s last times have passed and gives tomorrow\'s first. The overnight guest policy answer gives the actual rule, "Common Grounds" finds the Starbucks there, and requests like "register me" or "show my grades" get an instant answer about what RockyGPT can\'t access.',
  },
  {
    version: 'v2.3.4',
    released: '2026-09-28T23:03:29Z',
    summary:
      'More answers come straight from the published records in about a second: who convenes a program ("who is the CS convener"), a day\'s events, the first, next or last shuttle (including the first one to a stop like Garden State Plaza), and contact details however you ask. If RockyGPT can\'t answer, it still shows emergency numbers.',
  },
  {
    version: 'v2.3.3',
    released: '2026-09-28T20:14:57Z',
    summary:
      'When one detail of an answer can\'t be checked, RockyGPT leaves out just that detail and keeps the rest. It understands names students use, like "Dunkin" and "Atrium", reads "tmrw" as tomorrow, and lists Birch\'s late night dishes without the toppings.',
  },
  {
    version: 'v2.3.2',
    released: '2026-09-28T17:39:51Z',
    summary:
      'Menu answers cover the whole meal, not just the first 12 items: RockyGPT lists the main dishes, says how many items there are, and shows the full menu when you ask. Plain questions like "what\'s for lunch at Birch?" or "library hours today" are answered faster, straight from the published menu and hours.',
  },
  {
    version: 'v2.3.1',
    released: '2026-09-28T14:39:43Z',
    summary:
      'Asking for Public Safety\'s number gives both the emergency and non-emergency lines. "Tonight\'s menu" means dinner, and when the directory doesn\'t list an office\'s phone or hours, RockyGPT checks the office\'s own pages.',
  },
  {
    version: 'v2.3.0',
    released: '2026-09-28T12:43:01Z',
    summary:
      'Simple contact questions, like an office\'s phone number or email, are answered in about a second. Questions with several parts, like hours, a phone number and the next shuttle, get every part looked up at once.',
  },
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
