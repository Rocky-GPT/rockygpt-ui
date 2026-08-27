export type CspMode = 'enforce' | 'report-only';

export interface SecurityHeader {
  key: string;
  value: string;
}

interface SecurityHeaderOptions {
  nodeEnv?: string;
  cspMode?: string;
  cspReportUri?: string;
}

/**
 * CSP is enforced unless a deployment deliberately opts into a report-only
 * observation window. An invalid value fails the build instead of silently
 * weakening the production policy.
 */
export function resolveCspMode(value = process.env.ROCKY_CSP_MODE): CspMode {
  if (!value || value === 'enforce') return 'enforce';
  if (value === 'report-only') return 'report-only';

  throw new Error(
    `Invalid ROCKY_CSP_MODE "${value}". Expected "enforce" or "report-only".`
  );
}

function resolveReportUri(value = process.env.ROCKY_CSP_REPORT_URI): string | undefined {
  const reportUri = value?.trim();
  if (!reportUri) return undefined;

  if (/^\/[A-Za-z0-9/_?&=.%~-]*$/.test(reportUri)) return reportUri;

  let parsed: URL;
  try {
    parsed = new URL(reportUri);
  } catch {
    throw new Error('ROCKY_CSP_REPORT_URI must be a root-relative path or an HTTPS URL.');
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('ROCKY_CSP_REPORT_URI must be a root-relative path or an HTTPS URL.');
  }

  return parsed.toString();
}

/**
 * Builds the application CSP. The two unsafe-inline allowances are currently
 * required by Next.js bootstrap/style tags and the app's React style props.
 * Remote images are data-driven, while frames are limited to the campus map.
 */
export function buildContentSecurityPolicy(options: SecurityHeaderOptions = {}): string {
  const isDevelopment = (options.nodeEnv ?? process.env.NODE_ENV) !== 'production';
  const reportUri = resolveReportUri(options.cspReportUri);
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${isDevelopment ? ' ws: wss:' : ''}`,
    // Both campus-map hosts, because the college's own URL crosses between
    // them. `www.ramapo.edu/map/` is a stub whose whole body is a meta-refresh
    // to `map.ramapo.edu`, so allowing only the first framed a page that
    // immediately navigated somewhere blocked, and every map — all five layers
    // and all 207 locations, which still carry the old path — drew blank.
    // Named hosts, not a wildcard: this is the map and nothing else.
    "frame-src https://www.ramapo.edu https://map.ramapo.edu",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ];

  if (!isDevelopment) directives.push('upgrade-insecure-requests');
  if (reportUri) directives.push(`report-uri ${reportUri}`);

  return directives.join('; ');
}

/** Shared response headers for every page, asset, and API route. */
export function buildSecurityHeaders(options: SecurityHeaderOptions = {}): SecurityHeader[] {
  const cspMode = resolveCspMode(options.cspMode);
  return [
    {
      key: cspMode === 'report-only'
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy',
      value: buildContentSecurityPolicy(options),
    },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      // RockyGPT requests location only after a user presses "Where am I?" and
      // then delegates it only to Ramapo's embedded map for the live blue dot.
      value: 'camera=(), geolocation=(self "https://map.ramapo.edu"), microphone=(), payment=(), usb=()',
    },
    // CSP frame-ancestors is authoritative; X-Frame-Options protects legacy clients.
    { key: 'X-Frame-Options', value: 'DENY' },
  ];
}
