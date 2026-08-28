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
