/**
 * @module lib/campus-data
 * The one door campus data comes through.
 *
 * Every panel used to fetch for itself, and every one of them trusted the
 * body: `.then(r => r.json())` with no status check, straight into state. A
 * 503 answers with `{ "error": "..." }`, which is a perfectly good object and
 * nothing like a program list — so `if (!programs)` passed it, `programs
 * .schools` was undefined, and one unguarded read took the whole page down to
 * the browser's "This page couldn't load".
 *
 * The rule here is that a component never sees arbitrary JSON. It gets the
 * shape it asked for, or it gets a reason. Nothing in between reaches state.
 *
 * This is the whole boundary. Adding a panel means calling `loadCampusData`
 * with a guard for the shape that panel draws — not extending this file.
 */

/** Why there is no data. Distinct causes, because they need distinct fixes. */
export type UnavailableReason =
  /** This deployment has no address for the service. A deploy fixes it. */
  | 'misconfigured'
  /** The service was asked and could not answer. */
  | 'unreachable'
  /** The service answered, but not with a success. */
  | 'http'
  /** The service answered with something that is not the shape we draw. */
  | 'malformed';

export interface Unavailable {
  ok: false;
  reason: UnavailableReason;
  status?: number;
  message: string;
}

export type CampusData<T> = { ok: true; data: T } | Unavailable;

/** A value the caller can draw, or a reason it cannot. */
export type Guard<T> = (value: unknown) => value is T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The reason a failed response carries, when it named one.
 *
 * The data proxy distinguishes an unset address from a service that is down.
 * Reading it here is what lets a panel say "not configured" rather than
 * blaming a service that was never contacted.
 */
function statedReason(body: unknown): UnavailableReason | null {
  if (!isRecord(body)) return null;
  return body.reason === 'misconfigured' || body.reason === 'unreachable'
    ? body.reason
    : null;
}

async function bodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Fetch one campus-data path and return only what `expect` accepts.
 *
 * `expect` is the component's own shape guard: it decides what "valid" means
 * for the thing it is about to draw, which is the only place that knows.
 */
export async function loadCampusData<T>(
  path: string,
  expect: Guard<T>,
  init?: RequestInit
): Promise<CampusData<T>> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return { ok: false, reason: 'unreachable', message: `${path} could not be reached.` };
  }

  const body = await bodyOf(response);
  if (!response.ok) {
    return {
      ok: false,
      reason: statedReason(body) ?? 'http',
      status: response.status,
      message: `${path} answered ${response.status}.`,
    };
  }
  if (!expect(body)) {
    return {
      ok: false,
      reason: 'malformed',
      status: response.status,
      message: `${path} answered with an unexpected shape.`,
    };
  }
  return { ok: true, data: body };
}

// ─── Shape guards ─────────────────────────────────────────────────────────
// Small and generic on purpose. A panel composes these or writes its own; the
// point is that some guard runs, not that every shape lives in this file.

/** Any JSON object. The weakest useful guard — prefer `objectWith`. */
export const anyObject: Guard<Record<string, unknown>> = isRecord;

/** An array, with no claim about what is in it. */
export const anyArray: Guard<unknown[]> = (value): value is unknown[] => Array.isArray(value);

/** An object carrying an array at `key` — the shape most panels actually need. */
export function objectWithArray<K extends string>(
  key: K
): Guard<Record<string, unknown> & Record<K, unknown[]>> {
  return (value): value is Record<string, unknown> & Record<K, unknown[]> =>
    isRecord(value) && Array.isArray(value[key]);
}

/** An object carrying every one of `keys`. */
export function objectWith(...keys: string[]): Guard<Record<string, unknown>> {
  return (value): value is Record<string, unknown> =>
    isRecord(value) && keys.every((key) => key in value);
}
