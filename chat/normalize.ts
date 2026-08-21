/** Canonicalize user text once so guards, utilities, rules, and fallbacks see
 * the same apostrophes, dashes, and whitespace. */
export function normalizeMessage(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00a0\s]+/g, ' ')
    .trim();
}

/**
 * Shorten text to a maximum length without cutting a word in half.
 *
 * A bare `slice` shipped "...established careers in software development, project
 * management, re" to a student: the cut landed two characters into "research". Snap
 * back to the last word boundary and mark the cut, so shortened text reads as
 * deliberately abridged rather than broken.
 *
 * A single word longer than the budget has no boundary to snap back to, so it is cut
 * hard — the alternative is returning nothing.
 */
export function truncateAtWordBoundary(
  value: string,
  maxLength: number,
  ellipsis = '…'
): string {
  if (value.length <= maxLength) return value;
  const cut = value.slice(0, Math.max(0, maxLength - ellipsis.length));
  const lastSpace = cut.lastIndexOf(' ');
  const body = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${body.trimEnd().replace(/[,;:]+$/, '')}${ellipsis}`;
}
